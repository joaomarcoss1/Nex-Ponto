import { NextRequest } from "next/server";
import { analyzeInconsistencies } from "@/lib/calculations";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { canAccessBranch, scopeByBranch, assertEmployeeInScope } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const branchId = params.get("branchId");
  const employeeId = params.get("employeeId");
  if (branchId && !canAccessBranch(auth.context, branchId)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  if (employeeId) {
    const employeeScopeError = await assertEmployeeInScope({ supabase: auth.supabase, context: auth.context, employeeId });
    if (employeeScopeError) return employeeScopeError;
  }

  let query = scopeByBranch(auth.supabase
    .from("time_entries")
    .select("*, employees(full_name, role), branches:branches!time_entries_branch_id_fkey(name)")
    .order("entry_timestamp", { ascending: true })
    .limit(1000), auth.context, "branch_id");
  if (branchId) query = query.eq("branch_id", branchId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (params.get("status")) query = query.eq("status", params.get("status"));
  if (params.get("startDate")) query = query.gte("entry_date", params.get("startDate"));
  if (params.get("endDate")) query = query.lte("entry_date", params.get("endDate"));
  const { data, error } = await query;
  if (error) return fail("Erro ao buscar inconsistências.", 500, error.message);
  const inconsistencies = analyzeInconsistencies((data || []) as any).map((item) => {
    const entry = (data || []).find((candidate: any) => candidate.id === item.entry_id);
    return {
      ...item,
      employee_name: entry?.employees?.full_name || "Funcionário",
      branch_name: entry?.branches?.name || "Filial"
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const employeesQuery = scopeByBranch(auth.supabase.from("employees").select("id, full_name, role, branch_id, monthly_salary, daily_rate, pin_hash, work_days, branches:branches!employees_branch_id_fkey(name)").eq("active", true), auth.context, "branch_id");
  const overtimeQuery = scopeByBranch(auth.supabase.from("overtime_reviews").select("id, employee_id, branch_id, entry_date, status, employees(full_name), branches:branches!overtime_reviews_branch_id_fkey(name)").eq("status", "pending").limit(200), auth.context, "branch_id");
  const justificationsQuery = scopeByBranch(auth.supabase.from("absence_justifications").select("id, employee_id, branch_id, absence_date, status, employees(full_name), branches:branches!absence_justifications_branch_id_fkey(name)").eq("status", "pending").limit(200), auth.context, "branch_id");
  if (branchId) {
    employeesQuery.eq("branch_id", branchId);
    overtimeQuery.eq("branch_id", branchId);
    justificationsQuery.eq("branch_id", branchId);
  }
  const [employeesRes, overtimeRes, justificationsRes] = await Promise.all([employeesQuery, overtimeQuery, justificationsQuery]);
  for (const response of [employeesRes, overtimeRes, justificationsRes]) {
    if (response.error) return fail("Erro ao consolidar inconsistências.", 500, response.error.message);
  }

  const cadastroAlerts = (employeesRes.data || []).flatMap((employee: any) => {
    const alerts: any[] = [];
    if (!employee.branch_id) alerts.push({ type: "funcionario_sem_filial", message: "Funcionário ativo sem filial vinculada." });
    if (!Number(employee.monthly_salary || employee.daily_rate || 0)) alerts.push({ type: "funcionario_sem_salario", message: "Funcionário ativo sem salário ou diária configurada." });
    if (!employee.pin_hash) alerts.push({ type: "funcionario_sem_pin", message: "Funcionário ativo sem PIN configurado." });
    if (!employee.work_days?.length) alerts.push({ type: "funcionario_sem_escala", message: "Funcionário ativo sem dias de trabalho/escala básica." });
    return alerts.map((alert) => ({ ...alert, entry_id: null, employee_id: employee.id, employee_name: employee.full_name, branch_name: employee.branches?.name || "-", date: today }));
  });

  const overtimeAlerts = (overtimeRes.data || []).map((item: any) => ({
    type: "hora_extra_pendente",
    entry_id: null,
    employee_id: item.employee_id,
    employee_name: item.employees?.full_name || "Funcionário",
    branch_name: item.branches?.name || "Filial",
    date: item.entry_date,
    message: "Hora extra pendente de aprovação/ajuste pelo RH."
  }));

  const justificationAlerts = (justificationsRes.data || []).map((item: any) => ({
    type: "falta_com_justificativa_pendente",
    entry_id: null,
    employee_id: item.employee_id,
    employee_name: item.employees?.full_name || "Funcionário",
    branch_name: item.branches?.name || "Filial",
    date: item.absence_date,
    message: "Justificativa de falta pendente de análise administrativa."
  }));

  return ok({ inconsistencies: [...inconsistencies, ...cadastroAlerts, ...overtimeAlerts, ...justificationAlerts] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await readJson<{ entryId?: string; status?: string; reason?: string }>(request);
  if (!body.entryId) return fail("Informe a ocorrência vinculada ao ponto.", 400);
  if (!body.reason || body.reason.trim().length < 5) return fail("Informe um motivo para resolver a inconsistência.", 400);
  if (!["approved", "rejected", "adjusted", "cancelled", "pending_review"].includes(body.status || "")) return fail("Status de resolução inválido.", 400);

  const { data: oldData, error: oldError } = await auth.supabase.from("time_entries").select("*").eq("id", body.entryId).maybeSingle();
  if (oldError || !oldData) return fail("Registro não encontrado ou fora do seu escopo de acesso.", 404, oldError?.message);
  if (!canAccessBranch(auth.context, oldData.branch_id)) return fail("Você não tem permissão para acessar dados desta filial.", 403);

  const payload: Record<string, unknown> = {
    occurrence_review_status: body.status,
    occurrence_review_observation: body.reason.trim(),
    occurrence_reviewed_by: auth.context.userId,
    occurrence_reviewed_at: new Date().toISOString()
  };
  if (body.status === "approved" && oldData.status === "pending_review") payload.status = "valid";
  if (body.status === "rejected") payload.status = "blocked";
  if (body.status === "cancelled") payload.status = "canceled";

  const { data, error } = await auth.supabase.from("time_entries").update(payload).eq("id", body.entryId).select("*").single();
  if (error) return fail("Não foi possível resolver a inconsistência.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: `resolve_inconsistency_${body.status}`, entity: "time_entries", entityId: data.id, oldData, newData: data });
  return ok({ entry: data });
}
