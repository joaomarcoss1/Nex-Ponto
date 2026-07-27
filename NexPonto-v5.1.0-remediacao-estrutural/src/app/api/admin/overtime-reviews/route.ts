import { NextRequest } from "next/server";
import { z } from "zod";
import { eachDateInclusive, normalizeMoney, resolveDailyRate } from "@/lib/calculations";
import { detectOvertimeCandidates, type OvertimeCandidate } from "@/lib/services/overtime-engine";
import { fetchScheduleContext, resolveExpectedJourney } from "@/lib/services/schedule-engine";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { getSystemSettings } from "@/lib/server/settings";
import { canAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";
import type { Employee, TimeEntry } from "@/types/domain";


type ExistingOvertimeKey = {
  employee_id: string;
  entry_date: string;
};

const detectionSchemaV51 = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  branchId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, ["master_admin", "rh_financeiro"]);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  let query = scopeByBranch(auth.supabase
    .from("overtime_reviews")
    .select("*, employees(full_name, role), branches:branches!overtime_reviews_branch_id_fkey(name)")
    .order("entry_date", { ascending: false })
    .limit(600), auth.context, "branch_id");
  if (params.get("status")) query = query.eq("status", params.get("status"));
  if (params.get("branchId")) {
    if (!canAccessBranch(auth.context, params.get("branchId"))) return fail("Você não tem acesso a esta filial.", 403);
    query = query.eq("branch_id", params.get("branchId"));
  }
  if (params.get("employeeId")) query = query.eq("employee_id", params.get("employeeId"));
  if (params.get("startDate")) query = query.gte("entry_date", params.get("startDate"));
  if (params.get("endDate")) query = query.lte("entry_date", params.get("endDate"));
  const { data, error } = await query;
  if (error) return fail("Erro ao listar horas extras.", 500, error.message);
  return ok({ reviews: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, ["master_admin", "rh_financeiro"]);
  if ("error" in auth) return auth.error;
  const parsed = detectionSchemaV51.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise os filtros da apuração de horas extras.", 422, parsed.error.flatten());
  const body = parsed.data;
  const startDate = body.startDate || new Date().toISOString().slice(0, 8) + "01";
  const endDate = body.endDate || new Date().toISOString().slice(0, 10);
  if (startDate > endDate) return fail("A data inicial deve ser anterior à data final.", 422);
  try {
    let employeesQuery = scopeByBranch(auth.supabase.from("employees").select("*, branches:branches!employees_branch_id_fkey(name)").eq("active", true), auth.context, "branch_id");
    if (body.branchId) {
      if (!canAccessBranch(auth.context, body.branchId)) return fail("Você não tem acesso a esta filial.", 403);
      employeesQuery = employeesQuery.eq("branch_id", body.branchId);
    }
    if (body.employeeId) employeesQuery = employeesQuery.eq("id", body.employeeId);
    const { data: employees, error: employeesError } = await employeesQuery;
    if (employeesError) throw new Error(employeesError.message);
    const typedEmployees = (employees || []) as Employee[];
    const employeeIds = typedEmployees.map((employee) => employee.id);
    const { schedules, holidays } = await fetchScheduleContext({ supabase: auth.supabase, employeeIds, startDate, endDate });
    const [{ data: entries, error: entriesError }, { data: existing, error: existingError }] = await Promise.all([
      auth.supabase.from("time_entries").select("*").in("employee_id", employeeIds).gte("entry_date", startDate).lte("entry_date", endDate),
      auth.supabase.from("overtime_reviews").select("employee_id,entry_date").in("employee_id", employeeIds).gte("entry_date", startDate).lte("entry_date", endDate)
    ]);
    if (entriesError) throw new Error(entriesError.message);
    if (existingError) throw new Error(existingError.message);
    const settings = await getSystemSettings(auth.supabase);
    const typedEntries = (entries || []) as TimeEntry[];
    const typedExisting = (existing || []) as ExistingOvertimeKey[];
    const rows: OvertimeCandidate[] = typedEmployees.flatMap((employee) => {
      const expectedDays = eachDateInclusive(startDate, endDate).filter(
        (dateKey) => resolveExpectedJourney({ employee, dateKey, schedules, holidays }).expected
      ).length;
      const dailyRate = resolveDailyRate(employee, expectedDays, settings.daily_rate_calculation);
      return detectOvertimeCandidates({
        employee,
        entries: typedEntries.filter((entry) => entry.employee_id === employee.id),
        schedules,
        holidays,
        settings,
        dailyRate
      });
    });
    const toInsert = rows.filter(
      (row) => !typedExisting.some((item) => item.employee_id === row.employee_id && item.entry_date === row.entry_date)
    );
    if (toInsert.length) {
      const { error } = await auth.supabase.from("overtime_reviews").insert(
        toInsert.map((row) => ({
          employee_id: row.employee_id,
          branch_id: row.branch_id,
          entry_date: row.entry_date,
          worked_minutes: row.worked_minutes,
          expected_minutes: row.expected_minutes,
          calculated_overtime_minutes: row.calculated_overtime_minutes,
          overtime_minutes: row.calculated_overtime_minutes,
          approved_overtime_minutes: row.approved_overtime_minutes,
          overtime_amount: row.estimated_amount,
          status: settings.auto_approve_overtime ? "approved" : "pending"
        }))
      );
      if (error) throw new Error(error.message);
    }
    await writeAuditLog({
      supabase: auth.supabase,
      context: auth.context,
      action: "detect_overtime",
      entity: "overtime_reviews",
      newData: { startDate, endDate, created: toInsert.length }
    });
    return ok({ created: toInsert.length, detected: rows.length });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao detectar horas extras.", 500);
  }
}

const approvalSchemaV51 = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "adjusted", "rejected"]),
  approved_overtime_minutes: z.coerce.number().int().min(0),
  approved_percentage: z.coerce.number().min(0).max(500).default(50),
  approved_amount: z.coerce.number().min(0).default(0),
  destination: z.enum(["payment", "hour_bank", "split"]).default("payment"),
  payment_minutes: z.coerce.number().int().min(0).default(0),
  bank_minutes: z.coerce.number().int().min(0).default(0),
  category: z.string().trim().min(2).max(80).default("overtime_50"),
  reason: z.string().trim().max(500).optional().default(""),
  idempotency_key: z.string().trim().min(8).max(180).optional()
});

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, ["master_admin", "rh_financeiro"]);
  if ("error" in auth) return auth.error;
  const parsed = approvalSchemaV51.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise a aprovação da hora extra.", 422, parsed.error.flatten());
  const body = parsed.data;
  if (body.approved_overtime_minutes !== body.payment_minutes + body.bank_minutes && body.status !== "rejected") {
    return fail("Os minutos para pagamento e banco devem totalizar os minutos aprovados.", 422);
  }
  if (body.destination === "payment" && body.bank_minutes !== 0) return fail("Destino pagamento não pode possuir minutos de banco.", 422);
  if (body.destination === "hour_bank" && body.payment_minutes !== 0) return fail("Destino banco não pode possuir minutos para pagamento.", 422);
  if (body.status === "adjusted" && body.reason.length < 5) return fail("Informe o motivo do ajuste.", 422);

  const { data: oldData, error: oldError } = await auth.supabase.from("overtime_reviews").select("*").eq("id", body.id).maybeSingle();
  if (oldError || !oldData) return fail("Revisão de hora extra não encontrada.", 404, oldError?.message);
  if (oldData.branch_id && !canAccessBranch(auth.context, oldData.branch_id)) return fail("Você não tem acesso a esta revisão.", 403);
  const idempotencyKey = body.idempotency_key || `${auth.context.tenantId}:overtime:${body.id}:${body.status}:${crypto.randomUUID()}`;
  const { data, error } = await auth.rawSupabase.rpc("approve_overtime_v51", {
    p_tenant_id: auth.context.tenantId,
    p_review_id: body.id,
    p_status: body.status,
    p_minutes: body.status === "rejected" ? 0 : body.approved_overtime_minutes,
    p_percentage: body.approved_percentage,
    p_approved_amount: body.status === "rejected" ? 0 : normalizeMoney(body.approved_amount),
    p_destination: body.destination,
    p_payment_minutes: body.status === "rejected" ? 0 : body.payment_minutes,
    p_bank_minutes: body.status === "rejected" ? 0 : body.bank_minutes,
    p_category: body.category,
    p_reason: body.reason || (body.status === "approved" ? "Aprovação conforme apuração" : "Rejeição conforme conferência"),
    p_actor: auth.context.userId,
    p_idempotency_key: idempotencyKey
  });
  if (error) return fail("Erro ao revisar hora extra.", 422, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: `overtime_${body.status}_v51`,
    entity: "overtime_reviews",
    entityId: body.id,
    oldData,
    newData: data
  });
  return ok({ review: data });
}
