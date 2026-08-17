import { NextRequest } from "next/server";
import { dateKeyInTimezone } from "@/lib/calculations";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { fail, ok, readJson } from "@/lib/server/http";
import { assertPin, getClientIp, isPinTemporarilyBlocked, recordPinAttempt, verifyPin } from "@/lib/server/pin";
import { consumeRateLimit, rateLimitBucket } from "@/lib/server/rate-limit";


export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ employeeId?: string; pin?: string; deviceInfo?: string }>(request);
    const employeeId = String(body.employeeId || "");
    const pin = assertPin(body.pin);
    if (!employeeId) return fail("Selecione um funcionário.", 400);

    const { supabase, tenant } = await requirePublicTenant(request);
    const rate = await consumeRateLimit({ supabase, bucket: rateLimitBucket([tenant.id, "history", getClientIp(request.headers)]), limit: 15, windowSeconds: 60, blockSeconds: 180 });
    if (!rate.allowed) return fail("Muitas consultas. Aguarde antes de tentar novamente.", 429);
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, full_name, role, branch_id, pin_hash, branches:branches!employees_branch_id_fkey(name,timezone)")
      .eq("id", employeeId)
      .eq("active", true)
      .maybeSingle();

    if (employeeError) return fail("Erro ao validar funcionário.", 500, employeeError.message);
    if (!employee) return fail("Funcionário ativo não encontrado.", 404);
    if (await isPinTemporarilyBlocked({ supabase, employeeId: employee.id })) {
      return fail("Muitas tentativas de PIN. Aguarde alguns minutos e tente novamente.", 429);
    }

    const validPin = await verifyPin(pin, employee.pin_hash);
    await recordPinAttempt({
      supabase,
      employeeId: employee.id,
      headers: request.headers,
      deviceInfo: body.deviceInfo || request.headers.get("user-agent"),
      success: validPin,
      reason: validPin ? "history_access" : "invalid_pin_history"
    });
    if (!validPin) return fail("PIN inválido.", 401);

    const branchRelation = Array.isArray(employee.branches) ? employee.branches[0] : employee.branches;
    const branchTimezone = branchRelation?.timezone || process.env.DEFAULT_TIMEZONE || "America/Sao_Paulo";
    const today = dateKeyInTimezone(new Date(), branchTimezone);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [todayEntriesRes, recentEntriesRes, justificationsRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, action, entry_timestamp, entry_date, distance_meters, inside_allowed_radius, late_minutes, early_leave_minutes, required_justification, justification_text, status, occurrence_review_status, occurrence_review_observation, branches:branches!time_entries_branch_id_fkey(name)")
        .eq("employee_id", employee.id)
        .eq("entry_date", today)
        .order("entry_timestamp", { ascending: true }),
      supabase
        .from("time_entries")
        .select("id, action, entry_timestamp, entry_date, distance_meters, inside_allowed_radius, late_minutes, early_leave_minutes, required_justification, justification_text, status, occurrence_review_status, occurrence_review_observation, branches:branches!time_entries_branch_id_fkey(name)")
        .eq("employee_id", employee.id)
        .gte("entry_date", thirtyDaysAgo)
        .order("entry_timestamp", { ascending: false })
        .limit(20),
      supabase
        .from("absence_justifications")
        .select("id, absence_date, justification_text, attachment_url, status, admin_observation, reviewed_at, created_at")
        .eq("employee_id", employee.id)
        .gte("absence_date", thirtyDaysAgo)
        .order("absence_date", { ascending: false })
        .limit(20)
    ]);

    if (todayEntriesRes.error) return fail("Erro ao buscar pontos de hoje.", 500, todayEntriesRes.error.message);
    if (recentEntriesRes.error) return fail("Erro ao buscar últimos pontos.", 500, recentEntriesRes.error.message);
    if (justificationsRes.error) return fail("Erro ao buscar justificativas.", 500, justificationsRes.error.message);

    const normalizeEntry = (entry: any) => ({
      id: entry.id,
      action: entry.action,
      entry_timestamp: entry.entry_timestamp,
      entry_date: entry.entry_date,
      distance_meters: entry.distance_meters,
      inside_allowed_radius: entry.inside_allowed_radius,
      late_minutes: entry.late_minutes,
      early_leave_minutes: entry.early_leave_minutes,
      required_justification: entry.required_justification,
      justification_text: entry.justification_text,
      status: entry.status,
      occurrence_review_status: entry.occurrence_review_status,
      occurrence_review_observation: entry.occurrence_review_observation,
      branch_name: entry.branches?.name
    });
    const recentEntries = (recentEntriesRes.data || []).map(normalizeEntry);
    const justifications = justificationsRes.data || [];

    return ok({
      employee: {
        id: employee.id,
        full_name: employee.full_name,
        role: employee.role,
        branch_name: branchRelation?.name
      },
      today,
      entriesToday: (todayEntriesRes.data || []).map(normalizeEntry),
      recentEntries,
      justifications,
      summary: {
        totalEntries: recentEntries.length,
        pendingReviews: recentEntries.filter((entry) => entry.status === "pending_review" || entry.occurrence_review_status === "pending_review").length,
        lateOccurrences: recentEntries.filter((entry) => Number(entry.late_minutes || 0) > 0).length,
        earlyLeaveOccurrences: recentEntries.filter((entry) => Number(entry.early_leave_minutes || 0) > 0).length,
        pendingJustifications: justifications.filter((item: any) => item.status === "pending").length
      }
    });
  } catch (error) {
    return fail("Não foi possível carregar o histórico agora. Tente novamente.", 503, error instanceof Error ? error.message : error);
  }
}
