import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { assertCanAccessBranch, assertEmployeeInScope, scopeByBranch } from "@/lib/server/branch-permissions";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  let query = scopeByBranch(auth.supabase.from("shift_requests").select("*, employees(full_name,registration_code), branches:branches!shift_requests_branch_id_fkey(name)").order("request_date", { ascending: false }).limit(1000), auth.context, "branch_id");
  if (request.nextUrl.searchParams.get("status")) query = query.eq("status", request.nextUrl.searchParams.get("status"));
  if (request.nextUrl.searchParams.get("branchId")) query = query.eq("branch_id", request.nextUrl.searchParams.get("branchId"));
  const { data, error } = await query;
  if (error) return fail("Erro ao listar solicitações.", 500, error.message);
  return ok({ requests: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await readJson<any>(request);
  const employeeCheck = await assertEmployeeInScope({ supabase: auth.supabase, context: auth.context, employeeId: body.employee_id });
  if (employeeCheck) return employeeCheck;
  const branchCheck = assertCanAccessBranch(auth.context, body.branch_id);
  if (branchCheck) return branchCheck;
  const payload = {
    employee_id: body.employee_id,
    branch_id: body.branch_id,
    request_date: body.request_date || new Date().toISOString().slice(0, 10),
    request_type: body.request_type || "troca_turno",
    target_branch_id: body.target_branch_id || null,
    end_date: body.end_date || body.request_date || new Date().toISOString().slice(0, 10),
    requested_start_time: body.requested_start_time || null,
    requested_end_time: body.requested_end_time || null,
    requested_lunch_start_time: body.requested_lunch_start_time || null,
    requested_lunch_end_time: body.requested_lunch_end_time || null,
    requested_minutes: Number(body.requested_minutes || 0),
    reason: body.reason || "Solicitação administrativa",
    status: body.status || "pending",
    created_by: auth.context.id
  };
  const { data, error } = await auth.supabase.from("shift_requests").insert(payload).select("*").single();
  if (error) return fail("Erro ao criar solicitação.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "create_shift_request", entity: "shift_requests", entityId: data.id, newData: data });
  return ok({ request: data });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await readJson<any>(request);
  if (!body.id) return fail("ID obrigatório.", 400);
  const { data: oldData } = await auth.supabase.from("shift_requests").select("*").eq("id", body.id).maybeSingle();
  if (!oldData) return fail("Solicitação não encontrada.", 404);
  const branchCheck = assertCanAccessBranch(auth.context, oldData.branch_id);
  if (branchCheck) return branchCheck;
  const { data, error } = await auth.supabase.rpc("review_shift_request_transactional", {
    p_request_id: body.id,
    p_status: body.status,
    p_observation: body.admin_observation || null,
    p_reviewer_id: auth.context.id
  });
  if (error) return fail("Erro ao atualizar solicitação.", 500, error.message);
  const reviewed = Array.isArray(data) ? data[0] : data;
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "review_shift_request", entity: "shift_requests", entityId: reviewed.id, oldData, newData: reviewed });
  return ok({ request: reviewed });
}
