import { NextRequest } from "next/server";
import { branchPayload, branchSchema } from "@/lib/contracts/branch";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { canAccessBranch, canManageBranches, scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";
import { enforceTenantLimit } from "@/lib/server/tenant-limits";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const status = request.nextUrl.searchParams.get("status");
  const q = request.nextUrl.searchParams.get("q");
  let query = auth.supabase.from("branches").select("*").order("name", { ascending: true });
  query = scopeByBranch(query, auth.context, "id");
  if (status === "active") query = query.eq("active", true);
  if (status === "inactive") query = query.eq("active", false);
  if (q) query = query.ilike("name", `%${q.replace(/[,%]/g, "")}%`);
  const [{ data, error }, employeesRes] = await Promise.all([
    query,
    scopeByBranch(auth.supabase.from("employees").select("id,branch_id").eq("active", true), auth.context, "branch_id")
  ]);
  if (error) return fail("Erro ao listar filiais.", 500, error.message);
  if (employeesRes.error) return fail("Erro ao calcular funcionários por filial.", 500, employeesRes.error.message);
  const employees = (employeesRes.data || []) as Array<{ id: string; branch_id: string }>;
  const branches = (data || []).map((branch) => ({
    ...branch,
    employee_count: employees.filter((employee) => employee.branch_id === branch.id).length
  }));
  return ok({ branches });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Você não tem permissão para criar unidades.", 403);
  const parsed = branchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Revise os dados da filial.", 400, parsed.error.flatten());
  try {
    await enforceTenantLimit({ supabase: auth.supabase, tenantId: auth.context.tenantId, limit: "branch_limit", currentTable: "branches" });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Limite de filiais atingido.", 409);
  }
  const payload = branchPayload(parsed.data);
  const { data, error } = await auth.supabase.from("branches").insert(payload).select("*").single();
  if (error) return fail("Erro ao criar filial.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "branch.create",
    entity: "branches",
    entityId: data.id,
    newData: data,
    headers: request.headers
  });
  return ok({ branch: data, gpsValidationRequired: true });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Você não tem permissão para editar unidades.", 403);
  const parsed = branchSchema.safeParse(await readJson(request));
  if (!parsed.success || !parsed.data.id) return fail("Revise os dados e informe o ID da filial.", 400, parsed.success ? undefined : parsed.error.flatten());
  if (!canAccessBranch(auth.context, parsed.data.id)) return fail("Você não tem acesso a esta filial.", 403);
  const { data: oldData, error: oldError } = await auth.supabase.from("branches").select("*").eq("id", parsed.data.id).maybeSingle();
  if (oldError) return fail("Erro ao consultar filial.", 500, oldError.message);
  if (!oldData) return fail("Filial não encontrada.", 404);
  const payload = branchPayload(parsed.data, oldData);
  const { data, error } = await auth.supabase.from("branches").update(payload).eq("id", parsed.data.id).select("*").single();
  if (error) return fail("Erro ao atualizar filial.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "branch.update",
    entity: "branches",
    entityId: data.id,
    oldData,
    newData: data,
    headers: request.headers
  });
  return ok({ branch: data, gpsValidationRequired: data.geolocation_status !== "confirmed" });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("ID da filial obrigatório.", 400);
  if (!canManageBranches(auth.context)) return fail("Você não tem permissão para desativar unidades.", 403);
  if (!canAccessBranch(auth.context, id)) return fail("Você não tem acesso a esta filial.", 403);
  const { data: oldData } = await auth.supabase.from("branches").select("*").eq("id", id).maybeSingle();
  const { data, error } = await auth.supabase.from("branches").update({ active: false }).eq("id", id).select("*").single();
  if (error) return fail("Erro ao desativar filial.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "branch.deactivate",
    entity: "branches",
    entityId: id,
    oldData,
    newData: data,
    headers: request.headers
  });
  return ok({ branch: data });
}
