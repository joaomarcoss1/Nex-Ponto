import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminContext } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";

const ALL_BRANCH_ROLES = new Set(["tenant_owner", "tenant_admin", "hr_manager", "payroll_manager", "regional_manager", "master_admin", "admin", "admin_geral", "rh_financeiro"]);
const FINANCIAL_ROLES = new Set(["tenant_owner", "payroll_manager", "master_admin", "rh_financeiro"]);
const BRANCH_MANAGEMENT_ROLES = new Set(["tenant_owner", "tenant_admin", "regional_manager", "master_admin", "admin", "admin_geral"]);
const PAYROLL_ROLES = new Set(["tenant_owner", "payroll_manager", "master_admin", "rh_financeiro"]);

export function canAccessAllBranches(context: AdminContext) {
  if (context.supportSessionId) return true;
  // O master enxerga todas as unidades mesmo que um vínculo legado tenha sido preenchido.
  if (context.role === "master_admin" || context.role === "tenant_owner" || context.role === "tenant_admin") return true;
  return ALL_BRANCH_ROLES.has(context.role) && (!context.allowedBranchIds || context.allowedBranchIds.length === 0) && !context.branchId;
}

export function canViewFinancialData(context: AdminContext) {
  if (context.supportSessionId) return hasPermission(context, "financial.view");
  return FINANCIAL_ROLES.has(context.role) || Boolean(context.canViewFinancialData);
}

export function canManagePayroll(context: AdminContext) {
  if (context.supportSessionId) {
    return hasPermission(context, "payroll.calculate") || hasPermission(context, "payroll.resolve_divergence");
  }
  return PAYROLL_ROLES.has(context.role) || hasPermission(context, "payroll.calculate") || hasPermission(context, "payroll.approve");
}

export function canManageHourBank(context: AdminContext) {
  return canManagePayroll(context) || hasPermission(context, "time_bank.manage");
}

export function canExportFinancialReports(context: AdminContext) {
  return PAYROLL_ROLES.has(context.role) || hasPermission(context, "reports.export") || hasPermission(context, "payroll.export");
}

export function canManageBranches(context: AdminContext) {
  if (context.supportSessionId) return hasPermission(context, "branch.manage");
  return BRANCH_MANAGEMENT_ROLES.has(context.role);
}

export function canManageAdmins(context: AdminContext) {
  if (context.supportSessionId) return hasPermission(context, "administrators.manage");
  return context.role === "master_admin" || context.role === "tenant_owner";
}

export function isMasterAdmin(context: AdminContext) {
  if (context.supportSessionId) return hasPermission(context, "tenant.manage");
  return context.role === "master_admin" || context.role === "tenant_owner";
}

export function isFinancialField(field: string) {
  return new Set([
    "monthly_salary",
    "daily_rate",
    "daily_rate_mode",
    "salary_type",
    "pix_key",
    "bank_name",
    "bank_agency",
    "bank_account",
    "bank_account_type",
    "payment_day",
    "financial_notes"
  ]).has(field);
}

export function financialFieldsInPayload(payload: Record<string, unknown>) {
  return Object.keys(payload || {}).filter((key) => isFinancialField(key));
}

export function allowedBranchIds(context: AdminContext) {
  if (canAccessAllBranches(context)) return null;
  const ids = new Set<string>();
  if (context.branchId) ids.add(context.branchId);
  (context.allowedBranchIds || []).forEach((id) => id && ids.add(id));
  return [...ids];
}

export function canAccessBranch(context: AdminContext, branchId?: string | null) {
  if (!branchId) return canAccessAllBranches(context);
  const ids = allowedBranchIds(context);
  return ids === null || ids.includes(branchId);
}

export function assertCanAccessBranch(context: AdminContext, branchId?: string | null) {
  if (!canAccessBranch(context, branchId)) {
    return fail("Você não tem acesso a esta filial.", 403);
  }
  return null;
}

export function assertCanViewFinancial(context: AdminContext) {
  if (!canViewFinancialData(context)) {
    return fail("Você não tem permissão para acessar dados financeiros.", 403);
  }
  return null;
}

export function assertCanEditFinancial(context: AdminContext) {
  if (!canManagePayroll(context)) {
    return fail("Você não tem permissão para alterar dados financeiros.", 403);
  }
  return null;
}

export function scopeByBranch(query: any, context: AdminContext, column = "branch_id") {
  const ids = allowedBranchIds(context);
  if (ids === null) return query;
  if (!ids.length) return query.eq(column, "00000000-0000-0000-0000-000000000000");
  return query.in(column, ids);
}

export function scopeNullableBranchQuery(query: any, context: AdminContext, column = "branch_id") {
  const ids = allowedBranchIds(context);
  if (ids === null) return query;
  if (!ids.length) return query.is(column, null);
  return query.or(`${column}.is.null,${column}.in.(${ids.join(",")})`);
}

export function scopeRowsByBranch<T extends Record<string, any>>(rows: T[], context: AdminContext, key = "branch_id") {
  const ids = allowedBranchIds(context);
  if (ids === null) return rows;
  return rows.filter((row) => ids.includes(String(row[key] || "")));
}

export async function assertEmployeeInScope(params: { supabase: SupabaseClient; context: AdminContext; employeeId: string }) {
  const { data, error } = await params.supabase.from("employees").select("id, branch_id").eq("id", params.employeeId).maybeSingle();
  if (error) return fail("Erro ao validar funcionário.", 500, error.message);
  if (!data) return fail("Funcionário não encontrado.", 404);
  if (!canAccessBranch(params.context, data.branch_id)) return fail("Você não tem acesso a este funcionário.", 403);
  return null;
}

export function getAllowedBranchIds(context: AdminContext) {
  return allowedBranchIds(context);
}

export function requireFinancialPermission(context: AdminContext) {
  return assertCanViewFinancial(context);
}

export function requireMasterAdminContext(context: AdminContext) {
  if (!["master_admin", "tenant_owner"].includes(context.role)) return fail("Ação exclusiva do proprietário da empresa.", 403);
  return null;
}

export async function assertPayrollInScope(params: { supabase: SupabaseClient; context: AdminContext; payrollId: string }) {
  const { data, error } = await params.supabase.from("payroll_periods").select("id, branch_id").eq("id", params.payrollId).maybeSingle();
  if (error) return fail("Erro ao validar folha.", 500, error.message);
  if (!data) return fail("Folha não encontrada.", 404);
  if (!canAccessBranch(params.context, data.branch_id)) return fail("Você não tem acesso a esta folha.", 403);
  return null;
}

export function maskSensitiveEmployeeFields<T extends Record<string, any>>(employee: T, context: AdminContext): T {
  const safe: Record<string, any> = { ...employee };
  delete safe.pin_hash;
  delete safe.pin;
  if (!canViewFinancialData(context)) {
    safe.monthly_salary = null;
    safe.daily_rate = null;
    safe.pix_key = null;
    safe.bank_name = null;
    safe.bank_agency = null;
    safe.bank_account = null;
    safe.bank_account_type = null;
    if (Array.isArray(safe.employee_salary_history)) safe.employee_salary_history = [];
  }
  return safe as T;
}

export function maskSensitiveRows<T extends Record<string, any>>(rows: T[], context: AdminContext) {
  return rows.map((row) => maskSensitiveEmployeeFields(row, context));
}

export async function assertTimeEntryInScope(params: { supabase: SupabaseClient; context: AdminContext; entryId: string }) {
  const { data, error } = await params.supabase.from("time_entries").select("id, branch_id, employee_id").eq("id", params.entryId).maybeSingle();
  if (error) return fail("Erro ao validar ponto.", 500, error.message);
  if (!data) return fail("Registro não encontrado ou fora do seu escopo de acesso.", 404);
  if (!canAccessBranch(params.context, data.branch_id)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  return null;
}

export async function assertAuthorizationInScope(params: { supabase: SupabaseClient; context: AdminContext; authorizationId: string }) {
  const { data, error } = await params.supabase
    .from("employee_branch_authorizations")
    .select("id, branch_id, employee_id")
    .eq("id", params.authorizationId)
    .maybeSingle();
  if (error) return fail("Erro ao validar autorização.", 500, error.message);
  if (!data) return fail("Registro não encontrado ou fora do seu escopo de acesso.", 404);
  if (!canAccessBranch(params.context, data.branch_id)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  return null;
}

export async function assertHolidayInScope(params: { supabase: SupabaseClient; context: AdminContext; holidayId: string }) {
  const { data, error } = await params.supabase.from("holidays").select("id, branch_id").eq("id", params.holidayId).maybeSingle();
  if (error) return fail("Erro ao validar feriado/folga.", 500, error.message);
  if (!data) return fail("Registro não encontrado ou fora do seu escopo de acesso.", 404);
  if (data.branch_id && !canAccessBranch(params.context, data.branch_id)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  if (!data.branch_id && !canAccessAllBranches(params.context)) return fail("Feriados globais são restritos à administração geral.", 403);
  return null;
}

export function scopeHolidayQuery(query: any, context: AdminContext, requestedBranchId?: string | null) {
  if (canAccessAllBranches(context)) {
    if (requestedBranchId) return query.or(`branch_id.is.null,branch_id.eq.${requestedBranchId}`);
    return query;
  }
  const ids = allowedBranchIds(context);
  if (!ids?.length) return query.eq("branch_id", "00000000-0000-0000-0000-000000000000");
  if (requestedBranchId) {
    if (!ids.includes(requestedBranchId)) return query.eq("branch_id", "00000000-0000-0000-0000-000000000000");
    return query.or(`branch_id.is.null,branch_id.eq.${requestedBranchId}`);
  }
  return query.or(`branch_id.is.null,branch_id.in.(${ids.join(",")})`);
}


export function hasPermission(context: AdminContext, permission: string) {
  return context.permissions.includes("*") || context.permissions.includes(permission);
}

export function assertPermission(context: AdminContext, permission: string) {
  if (!hasPermission(context, permission)) return fail("Permissão insuficiente para esta ação.", 403);
  return null;
}

export function scopeByTenant(query: any, context: AdminContext, column = "tenant_id") {
  return query.eq(column, context.tenantId);
}
