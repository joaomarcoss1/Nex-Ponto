import { NextRequest } from "next/server";
import { addDays, formatISO } from "date-fns";
import { dateKeyInTimezone } from "@/lib/calculations";
import { saveHolidayOperationDecision } from "@/lib/services/holiday-operations";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { canAccessAllBranches, canAccessBranch, getAllowedBranchIds, scopeByBranch, scopeHolidayQuery } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";
import { holidayDecisionSchema, zodErrorMessage } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const start = request.nextUrl.searchParams.get("start") || dateKeyInTimezone();
    const end = request.nextUrl.searchParams.get("end") || formatISO(addDays(new Date(`${start}T12:00:00Z`), 120), { representation: "date" });
    let holidayQuery = auth.supabase
      .from("holidays")
      .select("id,title,holiday_date,branch_id,type,active,branches:branches!holidays_branch_id_fkey(name)")
      .eq("active", true)
      .eq("type", "holiday")
      .gte("holiday_date", start)
      .lte("holiday_date", end)
      .order("holiday_date", { ascending: true });
    holidayQuery = scopeHolidayQuery(holidayQuery, auth.context);
    const branchIds = getAllowedBranchIds(auth.context);
    let decisionsQuery = auth.supabase
      .from("holiday_operation_decisions")
      .select("*, branches:branches!holiday_operation_decisions_branch_id_fkey(name)")
      .order("updated_at", { ascending: false });
    if (branchIds !== null) {
      decisionsQuery = branchIds.length
        ? decisionsQuery.or(`branch_id.is.null,branch_id.in.(${branchIds.join(",")})`)
        : decisionsQuery.eq("branch_id", "00000000-0000-0000-0000-000000000000");
    }
    const [holidaysRes, decisionsRes, branchesRes] = await Promise.all([
      holidayQuery,
      decisionsQuery,
      scopeByBranch(auth.supabase.from("branches").select("id,name,type,active").eq("active", true).order("name"), auth.context, "id")
    ]);
    if (holidaysRes.error || decisionsRes.error || branchesRes.error) throw new Error(holidaysRes.error?.message || decisionsRes.error?.message || branchesRes.error?.message);
    return ok({
      holidays: holidaysRes.data || [],
      decisions: decisionsRes.data || [],
      branches: branchesRes.data || [],
      canDecideGlobally: canAccessAllBranches(auth.context)
    });
  } catch (error) {
    return fail("Não foi possível carregar as decisões de feriados.", 500, error instanceof Error ? error.message : error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["schedule.manage"] });
  if ("error" in auth) return auth.error;
  try {
    const rawBody = await readJson<unknown>(request);
    const parsedBody = holidayDecisionSchema.safeParse(rawBody);
    if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
    const body = parsedBody.data;
    const { data: holiday, error: holidayError } = await auth.supabase
      .from("holidays")
      .select("id,title,holiday_date,branch_id,type,active")
      .eq("id", body.holiday_id)
      .maybeSingle();
    if (holidayError) throw new Error(holidayError.message);
    if (!holiday || !holiday.active || holiday.type !== "holiday") return fail("Feriado não encontrado ou inativo.", 404);
    if (holiday.branch_id && !canAccessBranch(auth.context, holiday.branch_id)) return fail("Você não tem acesso ao feriado desta filial.", 403);

    const requestedScopes = body.branch_ids?.length ? body.branch_ids : [body.branch_id || null];
    const scopes = holiday.branch_id ? [holiday.branch_id] : requestedScopes;
    if (scopes.includes(null) && !canAccessAllBranches(auth.context)) return fail("Somente administração geral pode definir decisão global.", 403);
    for (const branchId of scopes) if (branchId && !canAccessBranch(auth.context, branchId)) return fail("Você não tem acesso a uma das filiais selecionadas.", 403);

    const rows = scopes.map((branchId) => ({
      holiday_id: body.holiday_id,
      branch_id: branchId,
      operation_status: body.operation_status,
      decided_by: auth.context.id,
      decided_at: body.operation_status === "pending" ? null : new Date().toISOString(),
      notes: String(body.notes || "").trim() || null
    }));
    const data = [];
    for (const row of rows) {
      data.push(await saveHolidayOperationDecision({ supabase: auth.supabase, decision: row }));
    }

    let hasPendingScope = body.operation_status === "pending";
    if (!holiday.branch_id && body.operation_status !== "pending") {
      const [{ data: activeBranches, error: activeBranchesError }, { data: allDecisions, error: allDecisionsError }] = await Promise.all([
        auth.supabase.from("branches").select("id").eq("active", true),
        auth.supabase.from("holiday_operation_decisions").select("branch_id,operation_status").eq("holiday_id", holiday.id)
      ]);
      if (activeBranchesError || allDecisionsError) throw new Error(activeBranchesError?.message || allDecisionsError?.message);
      const globalDecision = (allDecisions || []).find((item) => item.branch_id === null);
      hasPendingScope = (activeBranches || []).some((branch) => {
        const branchDecision = (allDecisions || []).find((item) => item.branch_id === branch.id);
        return (branchDecision?.operation_status || globalDecision?.operation_status || "pending") === "pending";
      });
    }
    const sourceKey = `holiday-decision:${holiday.id}:${holiday.branch_id || "global"}`;
    const notificationUpdate = await auth.supabase
      .from("admin_notifications")
      .update({
        read_at: hasPendingScope ? null : new Date().toISOString(),
        payload: {
          holiday_id: holiday.id,
          holiday_date: holiday.holiday_date,
          requires_decision: hasPendingScope,
          resolved_by: hasPendingScope ? null : auth.context.id
        }
      })
      .eq("source_key", sourceKey);
    if (notificationUpdate.error) throw new Error(notificationUpdate.error.message);
    await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "holiday_operation_decision", entity: "holiday_operation_decisions", entityId: body.holiday_id, newData: data });
    return ok({ decisions: data || [], message: body.operation_status === "open" ? "Funcionamento normal confirmado." : body.operation_status === "closed" ? "Fechamento remunerado confirmado." : "Decisão marcada como pendente." });
  } catch (error) {
    return fail("Não foi possível salvar a decisão do feriado.", 500, error instanceof Error ? error.message : error);
  }
}
