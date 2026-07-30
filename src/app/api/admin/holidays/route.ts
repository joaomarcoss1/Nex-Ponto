import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { assertHolidayInScope, canAccessBranch, canAccessAllBranches, scopeHolidayQuery } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";
import { holidaySchema, zodErrorMessage } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const branchId = request.nextUrl.searchParams.get("branchId");
  if (branchId && !canAccessBranch(auth.context, branchId)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  let query = auth.supabase.from("holidays").select("*, branches:branches!holidays_branch_id_fkey(name)").order("holiday_date", { ascending: false }).limit(300);
  query = scopeHolidayQuery(query, auth.context, branchId);
  const { data, error } = await query;
  if (error) return fail("Erro ao listar feriados e folgas.", 500, error.message);
  return ok({ holidays: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const rawBody = await readJson<unknown>(request);
  const parsedBody = holidaySchema.safeParse(rawBody);
  if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
  const body = parsedBody.data;
  const branchId = body.branch_id || null;
  if (branchId && !canAccessBranch(auth.context, branchId)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  if (!branchId && !canAccessAllBranches(auth.context)) return fail("Feriados globais são restritos à administração geral.", 403);
  const payload = {
    branch_id: branchId,
    holiday_date: body.holiday_date,
    title: String(body.title || "").trim(),
    type: body.type || "holiday",
    active: body.active ?? true,
    created_by: auth.context.userId
  };
  if (!payload.holiday_date || !payload.title) return fail("Informe data e título.", 400);
  const { data, error } = await auth.supabase.from("holidays").insert(payload).select("*").single();
  if (error) return fail("Erro ao criar feriado/folga.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "create", entity: "holidays", entityId: data.id, newData: data });
  return ok({ holiday: data });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const rawBody = await readJson<unknown>(request);
  const parsedBody = holidaySchema.safeParse(rawBody);
  if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
  const body = parsedBody.data;
  if (!body.id) return fail("ID obrigatório.", 400);
  const scopeError = await assertHolidayInScope({ supabase: auth.supabase, context: auth.context, holidayId: body.id });
  if (scopeError) return scopeError;
  const branchId = body.branch_id || null;
  if (branchId && !canAccessBranch(auth.context, branchId)) return fail("Você não tem permissão para acessar dados desta filial.", 403);
  if (!branchId && !canAccessAllBranches(auth.context)) return fail("Feriados globais são restritos à administração geral.", 403);
  const { data: oldData } = await auth.supabase.from("holidays").select("*").eq("id", body.id).maybeSingle();
  const payload = {
    branch_id: branchId,
    holiday_date: body.holiday_date,
    title: String(body.title || "").trim(),
    type: body.type || "holiday",
    active: body.active ?? true
  };
  const { data, error } = await auth.supabase.from("holidays").update(payload).eq("id", body.id).select("*").single();
  if (error) return fail("Erro ao atualizar feriado/folga.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "update", entity: "holidays", entityId: data.id, oldData, newData: data });
  return ok({ holiday: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("ID obrigatório.", 400);
  const scopeError = await assertHolidayInScope({ supabase: auth.supabase, context: auth.context, holidayId: id });
  if (scopeError) return scopeError;
  const { data: oldData } = await auth.supabase.from("holidays").select("*").eq("id", id).maybeSingle();
  const { data, error } = await auth.supabase.from("holidays").update({ active: false }).eq("id", id).select("*").single();
  if (error) return fail("Erro ao desativar feriado/folga.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "deactivate", entity: "holidays", entityId: id, oldData, newData: data });
  return ok({ holiday: data });
}
