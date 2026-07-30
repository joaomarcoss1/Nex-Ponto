import { NextRequest } from "next/server";
import { dateKeyInTimezone } from "@/lib/calculations";
import { fetchOperationalHolidays, pendingHolidayDecisions } from "@/lib/services/holiday-operations";
import { requireAdmin } from "@/lib/server/auth";
import { getAllowedBranchIds, scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const today = dateKeyInTimezone();
    const employeesQuery = scopeByBranch(auth.supabase.from("employees").select("id", { count: "exact", head: true }).eq("active", true), auth.context, "branch_id");
    const branchesQuery = scopeByBranch(auth.supabase.from("branches").select("id", { count: "exact", head: true }).eq("active", true), auth.context, "id");
    const pointsQuery = scopeByBranch(auth.supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("entry_date", today), auth.context, "branch_id");
    const pendingQuery = scopeByBranch(auth.supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("entry_date", today).eq("status", "pending_review"), auth.context, "branch_id");
    const outsideQuery = scopeByBranch(auth.supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("entry_date", today).eq("inside_allowed_radius", false), auth.context, "branch_id");
    const [employees, branches, points, pending, outside] = await Promise.all([employeesQuery, branchesQuery, pointsQuery, pendingQuery, outsideQuery]);
    const error = employees.error || branches.error || points.error || pending.error || outside.error;
    if (error) return fail("Erro ao carregar resumo do dashboard.", 500, error.message);

    let pendingHolidayCount = 0;
    try {
      const { data: setting } = await auth.supabase
        .from("system_settings")
        .select("value")
        .eq("key", "holiday_decision_notification_days")
        .maybeSingle();
      const days = Math.min(60, Math.max(1, Number(setting?.value ?? 7)));
      const untilDate = new Date(`${today}T12:00:00Z`);
      untilDate.setUTCDate(untilDate.getUTCDate() + days);
      const until = untilDate.toISOString().slice(0, 10);
      let branchIds = getAllowedBranchIds(auth.context);
      if (branchIds === null) {
        const { data: activeBranches, error: activeBranchError } = await auth.supabase.from("branches").select("id").eq("active", true);
        if (activeBranchError) throw new Error(activeBranchError.message);
        branchIds = (activeBranches || []).map((branch) => branch.id);
      }
      const holidays = await fetchOperationalHolidays({
        supabase: auth.supabase,
        startDate: today,
        endDate: until,
        branchIds
      });
      pendingHolidayCount = pendingHolidayDecisions(holidays).length;
    } catch (holidayError) {
      console.error("[dashboard] não foi possível consultar feriados", holidayError);
    }

    return ok({ summary: { activeEmployees: employees.count || 0, activeBranches: branches.count || 0, pointsToday: points.count || 0, pendingReview: pending.count || 0, outsideRadius: outside.count || 0, pendingHolidays: pendingHolidayCount } });
  } catch (error) {
    return fail("Erro ao carregar resumo do dashboard.", 500, error instanceof Error ? error.message : error);
  }
}
