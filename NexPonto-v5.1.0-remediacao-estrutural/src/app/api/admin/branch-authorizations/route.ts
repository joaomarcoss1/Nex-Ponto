import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { assertAuthorizationInScope, assertEmployeeInScope, canAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const employeeId = params.get("employeeId");
  const branchId = params.get("branchId");
  if (branchId && !canAccessBranch(auth.context, branchId)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  if (employeeId) {
    const employeeScopeError = await assertEmployeeInScope({ supabase: auth.supabase, context: auth.context, employeeId });
    if (employeeScopeError) return employeeScopeError;
  }
  let query = scopeByBranch(auth.supabase
    .from("employee_branch_authorizations")
    .select("*, employees:employees!employee_branch_authorizations_employee_id_fkey(full_name), branches:branches!employee_branch_authorizations_branch_id_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(300), auth.context, "branch_id");
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) return fail("Erro ao listar autorizações.", 500, error.message);
  return ok({ authorizations: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await readJson<any>(request);
  const payload = {
    employee_id: body.employee_id,
    branch_id: body.branch_id,
    starts_on: body.starts_on,
    ends_on: body.ends_on,
    reason: String(body.reason || "").trim(),
    active: body.active ?? true,
    created_by: auth.context.userId
  };
  if (!payload.employee_id || !payload.branch_id || !payload.starts_on || !payload.ends_on || !payload.reason) return fail("Preencha funcionário, filial, período e motivo.", 400);
  const employeeScopeError = await assertEmployeeInScope({ supabase: auth.supabase, context: auth.context, employeeId: payload.employee_id });
  if (employeeScopeError) return employeeScopeError;
  if (!canAccessBranch(auth.context, payload.branch_id)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  const { data, error } = await auth.supabase.from("employee_branch_authorizations").insert(payload).select("*").single();
  if (error) return fail("Erro ao criar autorização.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "create", entity: "employee_branch_authorizations", entityId: data.id, newData: data });
  return ok({ authorization: data });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await readJson<any>(request);
  if (!body.id) return fail("ID obrigatório.", 400);
  const scopeError = await assertAuthorizationInScope({ supabase: auth.supabase, context: auth.context, authorizationId: body.id });
  if (scopeError) return scopeError;
  if (body.employee_id) {
    const employeeScopeError = await assertEmployeeInScope({ supabase: auth.supabase, context: auth.context, employeeId: body.employee_id });
    if (employeeScopeError) return employeeScopeError;
  }
  if (body.branch_id && !canAccessBranch(auth.context, body.branch_id)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  const { data: oldData } = await auth.supabase.from("employee_branch_authorizations").select("*").eq("id", body.id).maybeSingle();
  const payload = {
    employee_id: body.employee_id,
    branch_id: body.branch_id,
    starts_on: body.starts_on,
    ends_on: body.ends_on,
    reason: String(body.reason || "").trim(),
    active: body.active ?? true
  };
  const { data, error } = await auth.supabase.from("employee_branch_authorizations").update(payload).eq("id", body.id).select("*").single();
  if (error) return fail("Erro ao atualizar autorização.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "update", entity: "employee_branch_authorizations", entityId: data.id, oldData, newData: data });
  return ok({ authorization: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("ID obrigatório.", 400);
  const scopeError = await assertAuthorizationInScope({ supabase: auth.supabase, context: auth.context, authorizationId: id });
  if (scopeError) return scopeError;
  const { data: oldData } = await auth.supabase.from("employee_branch_authorizations").select("*").eq("id", id).maybeSingle();
  const { data, error } = await auth.supabase.from("employee_branch_authorizations").update({ active: false }).eq("id", id).select("*").single();
  if (error) return fail("Erro ao desativar autorização.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "deactivate", entity: "employee_branch_authorizations", entityId: id, oldData, newData: data });
  return ok({ authorization: data });
}
