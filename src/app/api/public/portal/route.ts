import { NextRequest } from "next/server";
import { dateKeyInTimezone, getNextActions } from "@/lib/calculations";
import { actionLabels } from "@/lib/constants";
import { readEmployeeSession } from "@/lib/server/employee-session";
import { fail, ok } from "@/lib/server/http";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { addDaysToDateKey, resolveOperationalTimezone } from "@/lib/time/operational-time";
import {
  signedHourBankMinutes,
  type HourBankMovementType,
} from "@/lib/services/hour-bank-v51";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { tenant, supabase } = await requirePublicTenant(request);
    const session = readEmployeeSession(request);
    if (!session || session.tenantId !== tenant.id) return fail("Valide sua matrícula e PIN na tela de ponto para acessar o portal.", 401);

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id,full_name,registration_code,role,sector,branch_id,admission_date,branches(id,name,timezone,address)")
      .eq("id", session.employeeId)
      .eq("active", true)
      .maybeSingle();
    if (employeeError) return fail("Erro ao carregar seu perfil.", 500, employeeError.message);
    if (!employee) return fail("Perfil de funcionário indisponível.", 404);
    const branch = Array.isArray(employee.branches) ? employee.branches[0] : employee.branches;
    const timezone = resolveOperationalTimezone({
      branchTimezone: branch?.timezone,
      tenantTimezone: tenant.defaultTimezone,
    });
    const today = dateKeyInTimezone(new Date(), timezone);
    const endDateKey = addDaysToDateKey(today, 21);

    const [openSessionRes, todayEntriesRes, occurrencesRes, fallbackSchedulesRes, movementsRes, requestsRes, notificationsRes] = await Promise.all([
      supabase.from("work_sessions").select("id,work_date,status,started_at,ended_at,schedule_snapshot,timezone").eq("employee_id", employee.id).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("time_entries").select("id,action,entry_timestamp,status,branch_id,work_session_id,offline_status").eq("employee_id", employee.id).eq("entry_date", today).neq("status", "canceled").order("entry_timestamp", { ascending: true }),
      supabase.from("schedule_occurrences").select("id,work_date,starts_at,ends_at,is_day_off,intervals,status,branch_id,branches(name)").eq("employee_id", employee.id).gte("work_date", today).lte("work_date", endDateKey).in("status", ["published", "planned"]).order("work_date", { ascending: true }),
      supabase.from("work_schedules").select("id,title,work_days,expected_start_time,expected_end_time,expected_lunch_minutes,breaks,crosses_midnight,effective_from,effective_until,source_type").eq("employee_id", employee.id).eq("active", true).lte("effective_from", today).or(`effective_until.is.null,effective_until.gte.${today}`).order("priority", { ascending: false }).limit(3),
      supabase.from("hour_bank_movements").select("movement_type,minutes,status,expires_on").eq("employee_id", employee.id).in("status", ["approved", "pending"]),
      supabase.from("shift_requests").select("id,request_date,request_type,reason,status,workflow_status,admin_observation,created_at,updated_at").eq("employee_id", employee.id).order("created_at", { ascending: false }).limit(12),
      supabase.from("employee_portal_notifications").select("id,title,message,notification_type,payload,read_at,created_at").eq("employee_id", employee.id).order("created_at", { ascending: false }).limit(20),
    ]);
    const firstError = [openSessionRes, todayEntriesRes, occurrencesRes, fallbackSchedulesRes, movementsRes, requestsRes, notificationsRes].find((result) => result.error)?.error;
    if (firstError) return fail("Erro ao carregar o portal do funcionário.", 500, firstError.message);

    let entries = todayEntriesRes.data || [];
    if (openSessionRes.data?.id) {
      const { data: sessionEntries } = await supabase.from("time_entries").select("id,action,entry_timestamp,status,branch_id,work_session_id,offline_status").eq("work_session_id", openSessionRes.data.id).neq("status", "canceled").order("entry_timestamp", { ascending: true });
      entries = sessionEntries || entries;
    }
    const next = getNextActions(entries);
    const balanceMinutes = (movementsRes.data || []).reduce(
      (total, movement) => total + signedHourBankMinutes(movement.movement_type as HourBankMovementType, Number(movement.minutes)),
      0,
    );
    return ok({
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.displayName },
      employee: {
        id: employee.id,
        fullName: employee.full_name,
        registrationCode: employee.registration_code,
        role: employee.role,
        sector: employee.sector,
        admissionDate: employee.admission_date,
      },
      branch: branch ? { id: branch.id, name: branch.name, address: branch.address, timezone } : null,
      today,
      workSession: openSessionRes.data || null,
      entries,
      nextAction: next.recommended,
      nextActionLabel: next.recommended ? actionLabels[next.recommended] : "Jornada concluída",
      hourBank: { balanceMinutes },
      schedule: {
        occurrences: occurrencesRes.data || [],
        fallback: fallbackSchedulesRes.data || [],
      },
      requests: requestsRes.data || [],
      notifications: notificationsRes.data || [],
      unreadNotifications: (notificationsRes.data || []).filter((notification) => !notification.read_at).length,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao carregar portal.", 500);
  }
}
