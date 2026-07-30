import { NextRequest } from "next/server";
import { actionLabels } from "@/lib/constants";
import { dateKeyInTimezone, getNextActions } from "@/lib/calculations";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { fail, ok, readJson } from "@/lib/server/http";
import { setEmployeeSession } from "@/lib/server/employee-session";
import { resolveOperationalTimezone } from "@/lib/time/operational-time";
import {
  assertPin,
  getGenericPinErrorMessage,
  getPinBlockMessage,
  isPinTemporarilyBlocked,
  recordPinAttempt,
  verifyPin
} from "@/lib/server/pin";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ employeeId?: string; pin?: string }>(request);
    const employeeId = body.employeeId;
    const pin = assertPin(body.pin);
    if (!employeeId) return fail("Selecione um funcionário.", 400);

    const { tenant, supabase } = await requirePublicTenant(request);
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id,full_name,role,pin_hash,branch_id,branches(id,name,timezone)")
      .eq("id", employeeId)
      .eq("active", true)
      .maybeSingle();

    if (employeeError) return fail("Erro ao validar funcionário.", 500, employeeError.message);
    if (!employee) return fail("Funcionário ativo não encontrado.", 404);
    if (await isPinTemporarilyBlocked({ supabase, employeeId: employee.id })) {
      return fail(getPinBlockMessage(), 429);
    }
    const validPin = await verifyPin(pin, employee.pin_hash);
    await recordPinAttempt({
      supabase,
      employeeId: employee.id,
      headers: request.headers,
      deviceInfo: request.headers.get("user-agent"),
      success: validPin,
      reason: validPin ? "clock_state" : "invalid_pin_state"
    });
    if (!validPin) return fail(getGenericPinErrorMessage(), 401);

    const branchRelation = Array.isArray(employee.branches) ? employee.branches[0] : employee.branches;
    const timezone = resolveOperationalTimezone({
      branchTimezone: branchRelation?.timezone,
      tenantTimezone: tenant.defaultTimezone,
    });
    const today = dateKeyInTimezone(new Date(), timezone);
    const { data: openSession, error: sessionError } = await supabase
      .from("work_sessions")
      .select("id,work_date,status,timezone,started_at,schedule_snapshot")
      .eq("employee_id", employeeId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError) return fail("Erro ao consultar a jornada atual.", 500, sessionError.message);

    let entriesQuery = supabase.from("time_entries").select("*").eq("employee_id", employeeId);
    entriesQuery = openSession
      ? entriesQuery.eq("work_session_id", openSession.id)
      : entriesQuery.eq("entry_date", today);
    const { data: entries, error: entriesError } = await entriesQuery.order("entry_timestamp", { ascending: true });
    if (entriesError) return fail("Erro ao buscar pontos da jornada.", 500, entriesError.message);

    const next = getNextActions(entries || []);
    const response = ok({
      employee: {
        id: employee.id,
        full_name: employee.full_name,
        role: employee.role,
        branch_id: employee.branch_id,
        branch_name: branchRelation?.name
      },
      today,
      timezone,
      workSession: openSession || null,
      entries: entries || [],
      next,
      nextLabel: next.recommended ? actionLabels[next.recommended] : "Jornada finalizada"
    });
    setEmployeeSession(response, tenant.id, employee.id);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro inesperado.", 500);
  }
}
