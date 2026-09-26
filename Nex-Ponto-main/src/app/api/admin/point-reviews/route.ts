import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { canAccessBranch, scopeByBranch, assertEmployeeInScope } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

const allowedStatuses = ["approved", "rejected", "adjusted", "cancelled", "pending_review"];

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["time_entry.review"] });
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(200, Math.max(25, Number(params.get("pageSize") || 100)));
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize) || !Number.isSafeInteger(page * pageSize)) {
    return fail("Informe uma página e um tamanho de página válidos.", 400);
  }
  const branchId = params.get("branchId");
  const employeeId = params.get("employeeId");

  if (branchId && !canAccessBranch(auth.context, branchId)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  if (employeeId) {
    const employeeScopeError = await assertEmployeeInScope({ supabase: auth.supabase, context: auth.context, employeeId });
    if (employeeScopeError) return employeeScopeError;
  }

  let query = scopeByBranch(auth.supabase
    .from("time_entries")
    .select("*, employees(full_name, role), branches:branches!time_entries_branch_id_fkey(name,address,latitude,longitude)", { count: "exact" })
    .or("late_minutes.gt.0,early_leave_minutes.gt.0,required_justification.eq.true")
    .order("entry_timestamp", { ascending: false })
    .order("id", { ascending: false }), auth.context, "branch_id");
  if (params.get("status")) query = query.eq("occurrence_review_status", params.get("status"));
  if (branchId) query = query.eq("branch_id", branchId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (params.get("startDate")) query = query.gte("entry_date", params.get("startDate"));
  if (params.get("endDate")) query = query.lte("entry_date", params.get("endDate"));
  query = query.range((page - 1) * pageSize, page * pageSize - 1);
  const { data, error, count } = await query;
  if (error) return fail("Erro ao listar revisões de ponto.", 500, error.message);
  return ok({ reviews: data || [], pagination: { page, pageSize, total: count || 0 } });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["time_entry.review"] });
  if ("error" in auth) return auth.error;
  const body = await readJson<any>(request);
  if (!body.id || !allowedStatuses.includes(body.status)) {
    return fail("Informe a ocorrência e um status válido.", 400);
  }
  const { data: oldData, error: oldError } = await auth.supabase.from("time_entries").select("*").eq("id", body.id).maybeSingle();
  if (oldError || !oldData) return fail("Registro não encontrado ou fora do seu escopo de acesso.", 404, oldError?.message);
  if (!canAccessBranch(auth.context, oldData.branch_id)) return fail("Você não tem permissão para acessar dados desta filial.", 403);

  const payload: Record<string, unknown> = {
    occurrence_review_status: body.status,
    occurrence_review_observation: body.observation || null,
    occurrence_reviewed_by: auth.context.userId,
    occurrence_reviewed_at: new Date().toISOString()
  };
  if (body.status === "approved") payload.status = oldData.status === "pending_review" ? "valid" : oldData.status;
  if (body.status === "cancelled") payload.status = "canceled";
  if (body.status === "adjusted") payload.status = "adjusted";

  const { data, error } = await auth.supabase.from("time_entries").update(payload).eq("id", body.id).select("*").single();
  if (error) return fail("Erro ao revisar ocorrência.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: `point_occurrence_${body.status}`,
    entity: "time_entries",
    entityId: data.id,
    oldData,
    newData: data
  });
  return ok({ review: data });
}
