import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { actionLabels } from "@/lib/constants";
import {
  calculateDistanceMeters,
  dateKeyInTimezone,
  getNextActions,
  isOutOfOrder,
  minutesSinceMidnight,
  nowIso,
  parseTimeToMinutes,
  weekdayFromDateKey
} from "@/lib/calculations";
import { computeEarlyLeaveFromJourney, computeLateFromJourney, fetchScheduleContext, resolveExpectedJourney } from "@/lib/services/schedule-engine";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { fail, ok, readJson } from "@/lib/server/http";
import {
  assertPin,
  getClientIp,
  getGenericPinErrorMessage,
  getPinBlockMessage,
  isPinTemporarilyBlocked,
  recordPinAttempt,
  verifyPin
} from "@/lib/server/pin";
import { consumeRateLimit, rateLimitBucket } from "@/lib/server/rate-limit";
import { getSystemSettings } from "@/lib/server/settings";
import { assessClockRisk } from "@/lib/security/antifraud";
import {
  evaluateDevicePolicy,
  readDeviceIdentity,
  type DevicePolicyMode,
  type DeviceStatus,
} from "@/lib/security/device-identity";
import { createReceiptToken } from "@/lib/security/receipt-token";
import { structuredLog } from "@/lib/observability/logger";
import { resolveOperationalTimezone } from "@/lib/time/operational-time";
import type { TimeAction, TimeEntryStatus } from "@/types/domain";

const actions: TimeAction[] = ["start_shift", "start_lunch", "end_lunch", "end_shift"];

type ClockBody = {
  employeeId?: string;
  branchId?: string;
  pin?: string;
  action?: TimeAction;
  latitude?: number;
  longitude?: number;
  justificationText?: string;
  deviceInfo?: string;
  gpsAccuracyMeters?: number;
  idempotencyKey?: string;
  qrToken?: string;
  attemptId?: string;
  clientTimestamp?: string;
  offlineStatus?: "online" | "pending_sync" | "synced" | "review";
};

type BranchRow = {
  id: string;
  name: string;
  active: boolean;
  latitude: number | string | null;
  longitude: number | string | null;
  allowed_radius_meters: number | null;
  geofence_enabled: boolean | null;
  gps_ready: boolean | null;
  geolocation_status: string | null;
  timezone: string | null;
};

type AttemptRow = {
  id: string;
  attempted_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  distance_meters: number | null;
  branch_id: string | null;
  requested_action: string | null;
  evidence: Record<string, unknown> | null;
  resolved_time_entry_id: string | null;
};

function oneRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function validIdempotency(value: string | undefined) {
  return value && /^[a-zA-Z0-9:_-]{12,160}$/.test(value) ? value : randomUUID();
}

function localTimeWithinHours(nowMinutes: number, opensAt: string, closesAt: string) {
  const opens = parseTimeToMinutes(opensAt);
  const closes = parseTimeToMinutes(closesAt);
  if (closes > opens) return nowMinutes >= opens && nowMinutes <= closes;
  return nowMinutes >= opens || nowMinutes <= closes;
}

function latestOpenBreak(entries: Array<{ action: TimeAction; entry_timestamp: string; status: TimeEntryStatus }>) {
  const stack: Date[] = [];
  const usable = entries
    .filter((entry) => ["valid", "pending_review", "adjusted"].includes(entry.status))
    .sort((a, b) => new Date(a.entry_timestamp).getTime() - new Date(b.entry_timestamp).getTime());
  for (const entry of usable) {
    if (entry.action === "start_lunch") stack.push(new Date(entry.entry_timestamp));
    if (entry.action === "end_lunch") stack.pop();
  }
  return stack.at(-1) || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<ClockBody>(request);
    const employeeId = body.employeeId;
    const action = body.action;
    const pin = assertPin(body.pin);
    if (!employeeId) return fail("Selecione um funcionário.", 400);
    if (!action || !actions.includes(action)) return fail("Ação de ponto inválida.", 400);

    const { supabase, tenant } = await requirePublicTenant(request);
    const idempotencyKey = validIdempotency(body.idempotencyKey);
    const deviceInfo = body.deviceInfo || request.headers.get("user-agent") || "dispositivo não identificado";
    const rate = await consumeRateLimit({
      supabase,
      bucket: rateLimitBucket([tenant.id, "clock", employeeId, getClientIp(request.headers), deviceInfo]),
      limit: 8,
      windowSeconds: 120,
      blockSeconds: 300
    });
    if (!rate.allowed) return fail(`Muitas tentativas de registro. Tente novamente em ${rate.retryAfterSeconds}s.`, 429);

    const { data: repeatedEntry, error: repeatedError } = await supabase
      .from("time_entries")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (repeatedError) return fail("Erro ao verificar tentativa de ponto.", 500, repeatedError.message);
    if (repeatedEntry) {
      return ok({
        entry: repeatedEntry,
        confirmation: "Este ponto já havia sido recebido. Mantivemos o primeiro registro para evitar duplicidade.",
        distanceMeters: repeatedEntry.distance_meters,
        radiusMeters: repeatedEntry.validation_radius_meters,
        accuracyMeters: repeatedEntry.gps_accuracy_meters,
        insideAllowedRadius: repeatedEntry.inside_allowed_radius,
        status: repeatedEntry.status
      });
    }

    const settings = await getSystemSettings(supabase);
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("*,branches(*)")
      .eq("id", employeeId)
      .eq("active", true)
      .maybeSingle();
    if (employeeError) return fail("Erro ao validar funcionário.", 500, employeeError.message);
    if (!employee) return fail("Funcionário ativo não encontrado.", 404);

    if (await isPinTemporarilyBlocked({ supabase, employeeId: employee.id, maxFailures: 5 })) {
      return fail(getPinBlockMessage(), 429);
    }
    const validPin = await verifyPin(pin, employee.pin_hash);
    await recordPinAttempt({
      supabase,
      employeeId: employee.id,
      headers: request.headers,
      deviceInfo,
      success: validPin,
      reason: validPin ? "clock_register" : "invalid_pin_register"
    });
    if (!validPin) return fail(getGenericPinErrorMessage(), 401);

    const deviceIdentity = readDeviceIdentity(request);
    const { data: authorizedDevice, error: deviceError } = deviceIdentity
      ? await supabase
          .from("authorized_devices")
          .select("id,status,employee_id,branch_id")
          .eq("device_key_hash", deviceIdentity.keyHash)
          .maybeSingle()
      : { data: null, error: null };
    if (deviceError) return fail("Erro ao validar o dispositivo.", 500, deviceError.message);
    const deviceMode = String(
      (settings as Record<string, unknown>).authorized_device_mode || "monitored",
    ) as DevicePolicyMode;
    const devicePolicy = evaluateDevicePolicy(
      deviceMode,
      (authorizedDevice?.status as DeviceStatus | undefined) || null,
    );
    if (!devicePolicy.allowed) {
      return fail(
        "Este dispositivo não está autorizado para registrar ponto. Solicite a liberação ao RH.",
        403,
        { code: "DEVICE_NOT_AUTHORIZED" },
      );
    }
    if (
      authorizedDevice?.employee_id &&
      authorizedDevice.employee_id !== employee.id
    ) {
      return fail(
        "Este dispositivo está vinculado a outro funcionário.",
        403,
        { code: "DEVICE_NOT_AUTHORIZED" },
      );
    }

    const selectedBranchId = body.branchId || employee.branch_id;
    let branch = oneRelation<BranchRow>(employee.branches as BranchRow | BranchRow[] | null);
    const defaultTimezone = resolveOperationalTimezone({
      branchTimezone: branch?.timezone,
      tenantTimezone: tenant.defaultTimezone,
    });
    let today = dateKeyInTimezone(new Date(), defaultTimezone);

    if (selectedBranchId !== employee.branch_id) {
      if (settings.allow_different_branch_with_authorization === false) {
        return fail("Ponto em filial diferente está desativado nas configurações.", 403);
      }
      const { data: authorization, error: authorizationError } = await supabase
        .from("employee_branch_authorizations")
        .select("id")
        .eq("employee_id", employee.id)
        .eq("branch_id", selectedBranchId)
        .eq("active", true)
        .lte("starts_on", today)
        .gte("ends_on", today)
        .maybeSingle();
      if (authorizationError) return fail("Erro ao validar autorização temporária de filial.", 500, authorizationError.message);
      if (!authorization) return fail("Você não está autorizado a registrar ponto nesta filial hoje.", 403);
      const { data: authorizedBranch, error: branchError } = await supabase
        .from("branches")
        .select("*")
        .eq("id", selectedBranchId)
        .eq("active", true)
        .maybeSingle();
      if (branchError) return fail("Erro ao buscar filial autorizada.", 500, branchError.message);
      branch = authorizedBranch as BranchRow | null;
    }

    if (!branch?.active) return fail("Filial inativa ou não encontrada.", 404);
    const timezone = resolveOperationalTimezone({
      branchTimezone: branch.timezone,
      tenantTimezone: tenant.defaultTimezone,
    });
    today = dateKeyInTimezone(new Date(), timezone);

    const { data: openSession, error: sessionError } = await supabase
      .from("work_sessions")
      .select("id,work_date,status,timezone")
      .eq("employee_id", employee.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError) return fail("Erro ao consultar a jornada atual.", 500, sessionError.message);
    const workDate = openSession?.work_date || today;

    let originalAttempt: AttemptRow | null = null;
    if (body.attemptId) {
      const { data, error } = await supabase
        .from("clock_attempts")
        .select("id,attempted_at,latitude,longitude,accuracy_meters,distance_meters,branch_id,requested_action,evidence,resolved_time_entry_id")
        .eq("id", body.attemptId)
        .eq("employee_id", employee.id)
        .maybeSingle();
      if (error) return fail("Erro ao recuperar a tentativa original.", 500, error.message);
      if (!data || data.resolved_time_entry_id || data.requested_action !== action || data.branch_id !== branch.id) {
        return fail("A tentativa original não é válida ou já foi utilizada.", 409);
      }
      originalAttempt = data as AttemptRow;
    }

    const suppliedLatitude = originalAttempt?.latitude ?? body.latitude;
    const suppliedLongitude = originalAttempt?.longitude ?? body.longitude;
    if (!Number.isFinite(suppliedLatitude) || !Number.isFinite(suppliedLongitude)) {
      return fail("Não foi possível capturar sua localização. Ative o GPS e tente novamente.", 400);
    }

    const timestamp = originalAttempt?.attempted_at || nowIso();
    const latitude = Number(suppliedLatitude);
    const longitude = Number(suppliedLongitude);
    const gpsAccuracy = originalAttempt?.accuracy_meters ?? (Number.isFinite(Number(body.gpsAccuracyMeters)) ? Math.round(Number(body.gpsAccuracyMeters)) : null);

    let qrTokenId: string | null = null;
    const suppliedQrToken = String(body.qrToken || "").trim();
    if (settings.require_qr_for_clock || suppliedQrToken) {
      if (!suppliedQrToken) return fail("Escaneie o QR ativo desta filial para registrar o ponto.", 403);
      const tokenHash = createHash("sha256").update(suppliedQrToken).digest("hex");
      const { data: qr, error: qrError } = await supabase
        .from("branch_qr_tokens")
        .select("id,branch_id,valid_until,active,revoked_at,replay_window_seconds")
        .eq("token_hash", tokenHash)
        .eq("branch_id", branch.id)
        .eq("active", true)
        .is("revoked_at", null)
        .maybeSingle();
      if (qrError) return fail("Erro ao validar o QR da filial.", 500, qrError.message);
      if (!qr || new Date(qr.valid_until).getTime() < Date.now()) return fail("QR inválido, revogado ou expirado.", 403);
      const replaySince = new Date(Date.now() - Number(qr.replay_window_seconds || 30) * 1000).toISOString();
      const { data: recentUse } = await supabase
        .from("qr_token_uses")
        .select("id")
        .eq("qr_token_id", qr.id)
        .eq("employee_id", employee.id)
        .gte("used_at", replaySince)
        .limit(1)
        .maybeSingle();
      if (recentUse) return fail("Este QR acabou de ser utilizado. Aguarde alguns segundos para uma nova ação.", 409);
      qrTokenId = qr.id;
    }

    if (branch.geofence_enabled === false) return fail("Esta filial está sem geofence ativa. Procure o RH.", 409);
    if (!Number.isFinite(Number(branch.latitude)) || !Number.isFinite(Number(branch.longitude))) {
      return fail("Filial sem geolocalização configurada.", 409);
    }
    if (settings.block_clock_without_confirmed_branch_gps !== false) {
      const branchGpsReady = Boolean(branch.gps_ready) || branch.geolocation_status === "confirmed";
      if (!branchGpsReady) return fail("A localização desta filial ainda não foi confirmada presencialmente.", 409);
    }

    const distance = originalAttempt?.distance_meters ?? calculateDistanceMeters(latitude, longitude, Number(branch.latitude), Number(branch.longitude));
    const allowedRadius = Number(branch.allowed_radius_meters ?? settings.default_radius_meters ?? 900);
    const inside = distance <= allowedRadius;
    const maxAccuracy = Number(settings.max_gps_accuracy_meters ?? 100);
    const poorAccuracy = gpsAccuracy !== null && gpsAccuracy > maxAccuracy;

    const scheduleContext = await fetchScheduleContext({
      supabase,
      employeeIds: [employee.id],
      branchIds: [selectedBranchId],
      startDate: workDate,
      endDate: workDate
    });
    const journey = resolveExpectedJourney({
      employee: { ...employee, branch_id: selectedBranchId },
      dateKey: workDate,
      schedules: scheduleContext.schedules,
      holidays: scheduleContext.holidays
    });

    let entriesQuery = supabase.from("time_entries").select("*").eq("employee_id", employee.id);
    entriesQuery = openSession ? entriesQuery.eq("work_session_id", openSession.id) : entriesQuery.eq("entry_date", workDate);
    const { data: sessionEntries, error: entriesError } = await entriesQuery.order("entry_timestamp", { ascending: true });
    if (entriesError) return fail("Erro ao buscar registros da jornada.", 500, entriesError.message);

    const registeredMinutes = minutesSinceMidnight(new Date(timestamp), timezone);
    const { data: operatingHour } = await supabase
      .from("branch_operating_hours")
      .select("is_closed,opens_at,closes_at,effective_from")
      .eq("branch_id", branch.id)
      .eq("weekday", weekdayFromDateKey(today))
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    const branchOpen = !operatingHour || (!operatingHour.is_closed && operatingHour.opens_at && operatingHour.closes_at
      ? localTimeWithinHours(registeredMinutes, operatingHour.opens_at, operatingHour.closes_at)
      : !operatingHour.is_closed);

    const reviewFlags: string[] = [];
    let blockReason: string | null = null;
    if (devicePolicy.review) reviewFlags.push("new_or_untrusted_device");
    if (poorAccuracy && settings.block_poor_gps_accuracy === true) blockReason = "poor_gps_accuracy";
    if (!inside && !settings.allow_outside_radius_review) blockReason = "outside_radius";
    if (isOutOfOrder(action, sessionEntries || [])) blockReason = "out_of_order";

    const outsideHoursPolicy = String((settings as Record<string, unknown>).outside_operating_hours_policy || "justify");
    if (action === "start_shift" && !branchOpen) {
      if (outsideHoursPolicy === "block") blockReason = "outside_operating_hours";
      else reviewFlags.push("outside_operating_hours");
    }

    const lastLocatedEntry = [...(sessionEntries || [])]
      .reverse()
      .find((item) => item.latitude !== null && item.longitude !== null);
    const risk = assessClockRisk({
      deviceReview: devicePolicy.review,
      gpsAccuracyMeters: gpsAccuracy,
      maximumGpsAccuracyMeters: maxAccuracy,
      insideAllowedRadius: inside,
      distanceMeters: distance,
      previousEntry: lastLocatedEntry
        ? {
            latitude: Number(lastLocatedEntry.latitude),
            longitude: Number(lastLocatedEntry.longitude),
            timestamp: lastLocatedEntry.entry_timestamp,
          }
        : null,
      latitude,
      longitude,
      timestamp,
    });
    for (const signal of risk.signals) {
      if (!reviewFlags.includes(signal)) reviewFlags.push(signal);
    }

    const evidence = {
      branch_id: branch.id,
      branch_name: branch.name,
      branch_latitude: Number(branch.latitude),
      branch_longitude: Number(branch.longitude),
      radius_meters: allowedRadius,
      distance_meters: distance,
      gps_accuracy_meters: gpsAccuracy,
      inside_allowed_radius: inside,
      max_accuracy_meters: maxAccuracy,
      gps_ready: Boolean(branch.gps_ready) || branch.geolocation_status === "confirmed",
      timezone,
      branch_open: branchOpen,
      operating_hours: operatingHour || null,
      device_id: authorizedDevice?.id || null,
      device_mode: deviceMode,
      device_status: authorizedDevice?.status || "unregistered",
      risk
    };

    const { data: attempt, error: attemptError } = originalAttempt
      ? { data: originalAttempt, error: null }
      : await supabase
          .from("clock_attempts")
          .upsert({
            employee_id: employee.id,
            branch_id: branch.id,
            requested_action: action,
            attempted_at: timestamp,
            latitude,
            longitude,
            accuracy_meters: gpsAccuracy,
            distance_meters: distance,
            block_reason: blockReason,
            idempotency_key: idempotencyKey,
            device_info: deviceInfo,
            evidence
          }, { onConflict: "tenant_id,idempotency_key" })
          .select("id,attempted_at,latitude,longitude,accuracy_meters,distance_meters,branch_id,requested_action,evidence,resolved_time_entry_id")
          .single();
    if (attemptError) return fail("Não foi possível preservar a evidência da tentativa.", 500, attemptError.message);

    if (blockReason) {
      const messages: Record<string, string> = {
        poor_gps_accuracy: `A precisão do GPS está acima do limite permitido (${gpsAccuracy}m > ${maxAccuracy}m).`,
        outside_radius: `Você está a ${distance}m da filial. O raio permitido é ${allowedRadius}m.`,
        out_of_order: getNextActions(sessionEntries || []).recommended
          ? `Ação fora de ordem. Próximo ponto esperado: ${actionLabels[getNextActions(sessionEntries || []).recommended as TimeAction]}.`
          : "A jornada já foi encerrada.",
        outside_operating_hours: "A filial está fora do horário de funcionamento configurado."
      };
      return fail(messages[blockReason] || "Tentativa de ponto bloqueada.", blockReason === "out_of_order" ? 409 : 403, { attemptId: attempt.id });
    }

    if (!inside) reviewFlags.push("outside_radius");
    if (poorAccuracy) reviewFlags.push("poor_gps_accuracy");

    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    if (action === "start_shift") {
      lateMinutes = computeLateFromJourney(journey, registeredMinutes, Number(settings.late_tolerance_minutes ?? 15));
      if (lateMinutes > 0) reviewFlags.push("late");
    }
    if (action === "end_shift") {
      earlyLeaveMinutes = computeEarlyLeaveFromJourney(journey, registeredMinutes, Number(settings.early_leave_tolerance_minutes ?? 15));
      if (earlyLeaveMinutes > 0) reviewFlags.push("early_leave");
    }

    let lunchVariationMinutes = 0;
    let scheduleComplianceStatus = "ok";
    const lunchTolerance = Number(settings.lunch_tolerance_minutes ?? settings.late_tolerance_minutes ?? 15);
    if (action === "start_shift" && lateMinutes > 0) scheduleComplianceStatus = "late";
    if (action === "end_shift" && earlyLeaveMinutes > 0) scheduleComplianceStatus = "early_leave";
    if (action === "start_lunch" && journey.expected_lunch_start_time) {
      const earlyBreak = parseTimeToMinutes(journey.expected_lunch_start_time) - registeredMinutes;
      if (earlyBreak > lunchTolerance) {
        lunchVariationMinutes = earlyBreak;
        scheduleComplianceStatus = "break_early";
        reviewFlags.push("break_early");
      }
    }
    if (action === "end_lunch") {
      const openBreak = latestOpenBreak((sessionEntries || []) as Array<{ action: TimeAction; entry_timestamp: string; status: TimeEntryStatus }>);
      if (openBreak && journey.expected_lunch_minutes) {
        const duration = Math.max(0, Math.round((new Date(timestamp).getTime() - openBreak.getTime()) / 60000));
        const over = duration - Number(journey.expected_lunch_minutes || 0);
        if (over > lunchTolerance) {
          lunchVariationMinutes = over;
          scheduleComplianceStatus = "break_long";
          reviewFlags.push("break_long");
        }
      }
    }

    const needsJustification = lateMinutes > 0 || earlyLeaveMinutes > 0 || lunchVariationMinutes > 0 || reviewFlags.includes("outside_operating_hours");
    if (needsJustification && !body.justificationText?.trim()) {
      return ok({
        requiresJustification: true,
        attemptId: attempt.id,
        reason: scheduleComplianceStatus,
        lateMinutes,
        earlyLeaveMinutes,
        lunchVariationMinutes,
        message: lateMinutes > 0
          ? `Atraso de ${lateMinutes} minutos. Informe uma justificativa para continuar.`
          : earlyLeaveMinutes > 0
            ? `Saída antecipada de ${earlyLeaveMinutes} minutos. Informe uma justificativa para continuar.`
            : "Esta marcação exige justificativa antes do envio."
      }, { status: 202 });
    }

    const needsReview = needsJustification || !inside || poorAccuracy || reviewFlags.length > 0;
    const { data: entry, error: insertError } = await supabase.rpc("register_time_entry_v4", {
      p_tenant_id: tenant.id,
      p_employee_id: employee.id,
      p_branch_id: branch.id,
      p_action: action,
      p_entry_timestamp: timestamp,
      p_entry_date: workDate,
      p_timezone: timezone,
      p_latitude: latitude,
      p_longitude: longitude,
      p_distance_meters: distance,
      p_inside_allowed_radius: inside,
      p_device_info: deviceInfo,
      p_idempotency_key: idempotencyKey,
      p_qr_token_id: qrTokenId,
      p_gps_accuracy_meters: gpsAccuracy,
      p_validation_radius_meters: allowedRadius,
      p_expected_start_time: journey.expected_start_time,
      p_expected_end_time: journey.expected_end_time,
      p_expected_daily_minutes: journey.expected_daily_minutes,
      p_expected_lunch_minutes: journey.expected_lunch_minutes,
      p_expected_lunch_start_time: journey.expected_lunch_start_time || null,
      p_expected_lunch_end_time: journey.expected_lunch_end_time || null,
      p_late_minutes: lateMinutes,
      p_early_leave_minutes: earlyLeaveMinutes,
      p_lunch_variation_minutes: lunchVariationMinutes,
      p_schedule_compliance_status: scheduleComplianceStatus,
      p_required_justification: needsJustification,
      p_justification_text: body.justificationText?.trim() || null,
      p_status: needsReview ? "pending_review" : "valid",
      p_occurrence_review_status: needsReview ? "pending_review" : "approved",
      p_review_flags: reviewFlags,
      p_gps_snapshot: evidence,
      p_attempt_id: attempt.id,
      p_client_timestamp: body.clientTimestamp || null,
      p_offline_status: body.offlineStatus || "online"
    });
    if (insertError) {
      const code = String((insertError as { code?: string }).code || "");
      const message = insertError.message || "";
      if (code === "23505") return fail("Este ponto já foi recebido.", 409);
      if (message.includes("CLOSED_PERIOD")) return fail("Esta competência está fechada e não aceita novas marcações.", 409);
      if (message.includes("OPEN_SESSION_EXISTS")) return fail("Já existe uma jornada aberta para este funcionário.", 409);
      if (message.includes("OPEN_SESSION_NOT_FOUND")) return fail("Não existe uma jornada aberta. Registre a entrada primeiro.", 409);
      return fail("Não foi possível registrar o ponto.", 500, insertError.message);
    }

    const entryRow = Array.isArray(entry) ? entry[0] : entry;
    if (authorizedDevice?.id) {
      await supabase
        .from("authorized_devices")
        .update({
          employee_id: authorizedDevice.employee_id || employee.id,
          branch_id: authorizedDevice.branch_id || branch.id,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", authorizedDevice.id);
      await supabase
        .from("time_entries")
        .update({ device_id: authorizedDevice.id })
        .eq("id", entryRow.id);
    }
    if (risk.score > 0) {
      await supabase.from("clock_risk_events").insert({
        time_entry_id: entryRow.id,
        employee_id: employee.id,
        branch_id: branch.id,
        device_id: authorizedDevice?.id || null,
        risk_score: risk.score,
        risk_level: risk.level,
        signals: risk.signals,
        evidence,
      });
    }
    const { data: regulatoryEntry } = await supabase
      .from("time_entries")
      .select("*")
      .eq("id", entryRow.id)
      .single();
    const confirmedEntry = regulatoryEntry || entryRow;
    structuredLog("info", "clock_registered", {
      requestId: request.headers.get("x-request-id"),
      tenantId: tenant.id,
      branchId: branch.id,
      timeEntryId: confirmedEntry.id,
      nsr: confirmedEntry.nsr,
      riskLevel: risk.level,
      pendingReview: confirmedEntry.status === "pending_review",
    });
    const { data: refreshedEntries } = await supabase
      .from("time_entries")
      .select("*")
      .eq("work_session_id", entryRow.work_session_id)
      .order("entry_timestamp", { ascending: true });

    return ok({
      entry: confirmedEntry,
      confirmation: needsReview ? `${actionLabels[action]} registrado e enviado para revisão.` : `${actionLabels[action]} registrado com sucesso.`,
      distanceMeters: distance,
      radiusMeters: allowedRadius,
      accuracyMeters: gpsAccuracy,
      insideAllowedRadius: inside,
      status: confirmedEntry.status,
      workSessionId: confirmedEntry.work_session_id,
      receiptUrl: `/api/public/clock/receipt?entryId=${confirmedEntry.id}&token=${createReceiptToken(confirmedEntry.id)}`,
      risk: { level: risk.level, requiresReview: risk.requiresReview },
      next: getNextActions(refreshedEntries || [])
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro inesperado.", 500);
  }
}
