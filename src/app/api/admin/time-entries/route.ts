import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { hasClosedPayrollForDate } from "@/lib/server/closed-periods";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { assertEmployeeInScope, canAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";

const timeActionSchema = z.enum(["start_shift", "start_lunch", "end_lunch", "end_shift"]);

const manualEntrySchema = z.object({
  employee_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  action: timeActionSchema,
  entry_timestamp: z.string().datetime({ offset: true }),
  entry_date: z.string().date().optional(),
  adjustment_reason: z.string().trim().min(5).max(500),
  late_minutes: z.coerce.number().int().min(0).max(1440).default(0),
  early_leave_minutes: z.coerce.number().int().min(0).max(1440).default(0),
  justification_text: z.string().trim().max(2000).nullable().optional(),
  idempotency_key: z.string().min(12).max(200).optional()
});


export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  let query = scopeByBranch(auth.supabase
    .from("time_entries")
    .select("*, employees(full_name, role), branches:branches!time_entries_branch_id_fkey(name, timezone)")
    .order("entry_timestamp", { ascending: false })
    .limit(600), auth.context, "branch_id");
  if (params.get("branchId")) {
    if (!canAccessBranch(auth.context, params.get("branchId"))) return fail("Você não tem acesso a esta filial.", 403);
    query = query.eq("branch_id", params.get("branchId"));
  }
  if (params.get("employeeId")) {
    const employeeScopeError = await assertEmployeeInScope({ supabase: auth.supabase, context: auth.context, employeeId: params.get("employeeId") || "" });
    if (employeeScopeError) return employeeScopeError;
    query = query.eq("employee_id", params.get("employeeId"));
  }
  if (params.get("status")) query = query.eq("status", params.get("status"));
  if (params.get("action")) query = query.eq("action", params.get("action"));
  if (params.get("startDate")) query = query.gte("entry_date", params.get("startDate"));
  if (params.get("endDate")) query = query.lte("entry_date", params.get("endDate"));
  if (params.get("occurrenceType") === "late") query = query.gt("late_minutes", 0);
  if (params.get("occurrenceType") === "early_leave") query = query.gt("early_leave_minutes", 0);
  if (params.get("occurrenceType") === "outside_radius") query = query.eq("inside_allowed_radius", false);
  const { data, error } = await query;
  if (error) return fail("Erro ao listar pontos.", 500, error.message);
  return ok({ entries: data || [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await readJson<any>(request);
  if (!body.id) return fail("ID do ponto obrigatório.", 400);

  const { data: oldData, error: oldError } = await auth.supabase.from("time_entries").select("*").eq("id", body.id).maybeSingle();
  if (oldError || !oldData) return fail("Ponto não encontrado.", 404, oldError?.message);

  if (!canAccessBranch(auth.context, oldData.branch_id)) return fail("Você não tem acesso a este ponto.", 403);

  const closed = await hasClosedPayrollForDate({
    supabase: auth.supabase,
    employeeId: oldData.employee_id,
    branchId: oldData.branch_id,
    date: oldData.entry_date
  });
  if (closed) {
    return fail(`Este ponto pertence à pré-folha fechada "${closed.title}". Reabra ou gere revisão antes de alterar.`, 409);
  }

  if (!body.adjustment_reason || String(body.adjustment_reason).trim().length < 5) {
    return fail("Todo ajuste manual exige um motivo claro.", 400);
  }

  const allowedActions = new Set(["start_shift", "start_lunch", "end_lunch", "end_shift"]);
  const allowedStatuses = new Set(["valid", "pending_review", "adjusted", "blocked", "canceled"]);
  const action = allowedActions.has(body.action) ? body.action : oldData.action;
  const status = allowedStatuses.has(body.status) ? body.status : "adjusted";
  const entryTimestamp = body.entry_timestamp || oldData.entry_timestamp;
  const entryDate = body.entry_date || String(entryTimestamp).slice(0, 10);

  const { data, error } = await auth.supabase.rpc("adjust_time_entry_transactional", {
    p_entry_id: oldData.id,
    p_adjusted_by: auth.context.userId,
    p_entry_timestamp: entryTimestamp,
    p_entry_date: entryDate,
    p_action: action,
    p_status: status,
    p_reason: String(body.adjustment_reason).trim(),
    p_late_minutes: Number(body.late_minutes ?? oldData.late_minutes ?? 0),
    p_early_leave_minutes: Number(body.early_leave_minutes ?? oldData.early_leave_minutes ?? 0),
    p_justification_text: body.justification_text ?? oldData.justification_text ?? null,
    p_review_flags: Array.isArray(body.review_flags) ? body.review_flags : oldData.review_flags || []
  });
  if (error) return fail("Erro ao ajustar ponto.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "manual_adjustment", entity: "time_entries", entityId: data.id, oldData, newData: data });
  return ok({ entry: data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const parsed = manualEntrySchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) {
    return fail("Revise os dados da marcação manual.", 400, parsed.error.flatten().fieldErrors);
  }
  const body = parsed.data;
  const scopeError = await assertEmployeeInScope({
    supabase: auth.supabase,
    context: auth.context,
    employeeId: body.employee_id
  });
  if (scopeError) return scopeError;
  if (!canAccessBranch(auth.context, body.branch_id)) return fail("Você não tem acesso à filial informada.", 403);

  const entryDate = body.entry_date || body.entry_timestamp.slice(0, 10);
  const closed = await hasClosedPayrollForDate({
    supabase: auth.supabase,
    employeeId: body.employee_id,
    branchId: body.branch_id,
    date: entryDate
  });
  if (closed) return fail(`Este dia pertence à pré-pré-folha fechada "${closed.title}". Reabra antes de adicionar a marcação.`, 409);

  const requestId = request.headers.get("x-request-id") || randomUUID();
  const idempotencyKey = body.idempotency_key || `manual:${auth.context.tenantId}:${randomUUID()}`;
  const { data, error } = await auth.rawSupabase.rpc("create_manual_time_entry_v4", {
    p_tenant_id: auth.context.tenantId,
    p_membership_id: auth.context.membershipId,
    p_user_id: auth.context.userId,
    p_user_email: auth.context.email,
    p_employee_id: body.employee_id,
    p_branch_id: body.branch_id,
    p_action: body.action,
    p_entry_timestamp: body.entry_timestamp,
    p_entry_date: entryDate,
    p_reason: body.adjustment_reason,
    p_idempotency_key: idempotencyKey,
    p_late_minutes: body.late_minutes,
    p_early_leave_minutes: body.early_leave_minutes,
    p_justification_text: body.justification_text || null,
    p_request_id: requestId
  });
  if (error) {
    const known = error.message.includes("PAYROLL_PERIOD_CLOSED")
      ? "A competência está fechada e não permite novas marcações."
      : error.message.includes("MANUAL_REASON_REQUIRED")
        ? "Informe um motivo com pelo menos cinco caracteres."
        : "Erro ao adicionar marcação manual.";
    return fail(known, error.message.includes("PAYROLL_PERIOD_CLOSED") ? 409 : 500, error.message);
  }
  return ok({ entry: data, requestId });
}
