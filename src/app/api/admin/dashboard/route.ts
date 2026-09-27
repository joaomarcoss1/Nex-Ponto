import { NextRequest } from "next/server";
import { dateKeyInTimezone, eachDateInclusive } from "@/lib/calculations";
import { fetchScheduleContext, resolveExpectedJourney } from "@/lib/services/schedule-engine";
import { requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { canViewFinancialData, scopeByBranch } from "@/lib/server/branch-permissions";
import { getSystemSettings } from "@/lib/server/settings";
import type { Employee } from "@/types/domain";

type DashboardEmployeeRow = Pick<
  Employee,
  "id" | "full_name" | "branch_id" | "monthly_salary" | "work_days" | "active" | "expected_start_time" | "expected_end_time" | "expected_daily_minutes" | "expected_lunch_minutes"
>;
type DashboardBranchRow = { id: string; name: string; active: boolean; timezone: string | null };
type TodayEntryRow = {
  id: string;
  employee_id: string;
  branch_id: string | null;
  action: string;
  status: string;
  late_minutes: number | null;
  inside_allowed_radius: boolean | null;
  occurrence_review_status: string | null;
  entry_timestamp: string;
};
type PeriodEntryRow = {
  employee_id: string;
  branch_id: string | null;
  entry_date: string;
  entry_timestamp: string;
  action: string;
  status: string;
  late_minutes: number | null;
  early_leave_minutes: number | null;
};
type PayrollItemWithPeriodRow = {
  employee_name: string | null;
  employee_id: string;
  branch_id: string | null;
  final_amount: number | null;
  overtime_minutes: number | null;
};


export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const today = dateKeyInTimezone();
    const periodStart = request.nextUrl.searchParams.get("startDate") || today.slice(0, 8) + "01";
    const periodEnd = request.nextUrl.searchParams.get("endDate") || today;

    const employeesQuery = scopeByBranch(auth.supabase
        .from("employees")
        .select("id, full_name, branch_id, monthly_salary, work_days, active, expected_start_time, expected_end_time, expected_daily_minutes, expected_lunch_minutes")
        .eq("active", true), auth.context, "branch_id");
    const branchesQuery = scopeByBranch(auth.supabase.from("branches").select("id,name,active,timezone").eq("active", true), auth.context, "id");
    const todayEntriesQuery = scopeByBranch(auth.supabase.from("time_entries").select("id, employee_id, branch_id, action, status, late_minutes, inside_allowed_radius, occurrence_review_status, entry_timestamp").eq("entry_date", today), auth.context, "branch_id");
    const pendingJustificationsQuery = scopeByBranch(auth.supabase.from("absence_justifications").select("id", { count: "exact", head: true }).eq("status", "pending"), auth.context, "branch_id");
    const lateTodayQuery = scopeByBranch(auth.supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("entry_date", today).gt("late_minutes", 0), auth.context, "branch_id");
    const earlyLeaveTodayQuery = scopeByBranch(auth.supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("entry_date", today).gt("early_leave_minutes", 0), auth.context, "branch_id");
    const pendingOvertimeQuery = scopeByBranch(auth.supabase.from("overtime_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"), auth.context, "branch_id");
    const openPayrollQuery = scopeByBranch(auth.supabase.from("payroll_periods").select("id", { count: "exact", head: true }).in("status", ["draft", "reviewed", "reopened"]), auth.context, "branch_id");
    const closedPayrollQuery = scopeByBranch(auth.supabase.from("payroll_periods").select("id", { count: "exact", head: true }).in("status", ["closed", "closed_with_exceptions", "paid"]), auth.context, "branch_id");
    const overtimeEntriesQuery = scopeByBranch(auth.supabase
        .from("time_entries")
        .select("employee_id, branch_id, entry_date, entry_timestamp, action, status, late_minutes, early_leave_minutes")
        .gte("entry_date", periodStart)
        .lte("entry_date", periodEnd), auth.context, "branch_id");
    const payrollItemsQuery = scopeByBranch(auth.supabase
        .from("payroll_items")
        .select("employee_id, employee_name, branch_id, final_amount, overtime_minutes, payroll_periods!inner(start_date,end_date,status)")
        .gte("payroll_periods.start_date", periodStart)
        .in("payroll_periods.status", ["reviewed", "closed", "closed_with_exceptions", "paid"]), auth.context, "branch_id");

    const [
      employeesRes,
      branchesRes,
      todayEntriesRes,
      pendingJustificationsRes,
      lateTodayRes,
      earlyLeaveTodayRes,
      pendingOvertimeRes,
      openPayrollRes,
      closedPayrollRes,
      overtimeEntriesRes,
      payrollItemsRes
    ] = await Promise.all([
      employeesQuery, branchesQuery, todayEntriesQuery, pendingJustificationsQuery, lateTodayQuery, earlyLeaveTodayQuery, pendingOvertimeQuery, openPayrollQuery, closedPayrollQuery, overtimeEntriesQuery, payrollItemsQuery
    ]);

    for (const response of [
      employeesRes,
      branchesRes,
      todayEntriesRes,
      pendingJustificationsRes,
      lateTodayRes,
      earlyLeaveTodayRes,
      pendingOvertimeRes,
      openPayrollRes,
      closedPayrollRes,
      overtimeEntriesRes,
      payrollItemsRes
    ]) {
      if (response.error) throw new Error(response.error.message);
    }

    const employees: DashboardEmployeeRow[] = employeesRes.data || [];
    const branches: DashboardBranchRow[] = branchesRes.data || [];
    const todayEntries: TodayEntryRow[] = todayEntriesRes.data || [];
    const settings = await getSystemSettings(auth.supabase);
    const { schedules, holidays: scheduleHolidays } = await fetchScheduleContext({
      supabase: auth.supabase,
      employeeIds: employees.map((employee) => employee.id),
      branchIds: [...new Set(employees.map((employee) => employee.branch_id))] as string[],
      startDate: periodStart,
      endDate: periodEnd
    });

    const validTodayEntries = todayEntries.filter((entry) => !["blocked", "canceled"].includes(entry.status));
    const startedToday = new Set(validTodayEntries.filter((entry) => entry.action === "start_shift").map((entry) => entry.employee_id));
    const latestActionByEmployee = new Map<string, TodayEntryRow>();
    for (const entry of [...validTodayEntries].sort((a, b) => String(a.entry_timestamp).localeCompare(String(b.entry_timestamp)))) {
      latestActionByEmployee.set(String(entry.employee_id), entry);
    }
    const presentToday = [...latestActionByEmployee.values()].filter((entry) => entry.action !== "end_shift").length;
    const onBreakToday = [...latestActionByEmployee.values()].filter((entry) => entry.action === "start_lunch").length;
    const missingBreakReturn = [...latestActionByEmployee.values()].filter((entry) => entry.action === "start_lunch" && Date.now() - new Date(entry.entry_timestamp).getTime() > 120 * 60 * 1000).length;
    const expectedToday = employees.filter((employee) =>
      resolveExpectedJourney({ employee, dateKey: today, schedules, holidays: scheduleHolidays }).expected
    );
    const absentToday = expectedToday.filter((employee) => !startedToday.has(employee.id)).length;

    const totalByBranch = branches.map((branch) => ({
      branch: branch.name,
      total: employees.filter((employee) => employee.branch_id === branch.id).length
    }));

    let branchOpen: boolean | null = null;
    if (branches.length === 1) {
      const branch = branches[0];
      // Previously called as dateKeyInTimezone(branch.timezone) — the timezone string was
      // landing in the `date` parameter slot instead of `timeZone`, silently accepted only
      // because `branch` was typed `any`. That made this always use the server's default
      // timezone instead of the branch's own, so "is this branch open today" could be
      // computed against the wrong calendar day for branches in a different timezone.
      const branchToday = dateKeyInTimezone(new Date(), branch.timezone || process.env.DEFAULT_TIMEZONE || "America/Fortaleza");
      const weekday = new Date(`${branchToday}T12:00:00Z`).getUTCDay();
      const { data: hours } = await auth.supabase
        .from("branch_operating_hours")
        .select("is_closed,opens_at,closes_at")
        .eq("branch_id", branch.id)
        .eq("weekday", weekday)
        .lte("effective_from", branchToday)
        .or(`effective_until.is.null,effective_until.gte.${branchToday}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hours) branchOpen = !hours.is_closed;
    }

    const financialAllowed = canViewFinancialData(auth.context);
    const estimatedPayroll = financialAllowed ? employees.reduce((sum, employee) => sum + Number(employee.monthly_salary || 0), 0) : 0;

    const lateByBranch = branches.map((branch) => ({
      label: branch.name,
      value: todayEntries.filter((entry) => entry.branch_id === branch.id && Number(entry.late_minutes || 0) > 0).length
    }));

    const periodEntries: PeriodEntryRow[] = overtimeEntriesRes.data || [];
    // Precompute once: with N employees and D days, the naive .some() scan below re-read the
    // whole period's time entries for every employee/day pair (O(days*employees*entries) —
    // tens of millions of comparisons once a tenant has real history). A Set lookup makes each
    // check O(1) instead.
    const startedShiftKeys = new Set(
      periodEntries
        .filter((entry) => entry.action === "start_shift")
        .map((entry) => `${entry.employee_id}|${entry.entry_date}`)
    );
    const days = eachDateInclusive(periodStart, periodEnd);
    const absencesByMonth = days.reduce((sum, date) => {
      return (
        sum +
        employees.filter((employee) => {
          const expected = resolveExpectedJourney({ employee, dateKey: date, schedules, holidays: scheduleHolidays }).expected;
          return expected && !startedShiftKeys.has(`${employee.id}|${date}`);
        }).length
      );
    }, 0);

    const payrollItems: PayrollItemWithPeriodRow[] = payrollItemsRes.data || [];

    return ok({
      cards: {
        activeEmployees: employees.length,
        branches: branches.length,
        punchesToday: todayEntries.length,
        presentToday,
        onBreakToday,
        missingBreakReturn,
        branchOpen,
        absentToday,
        pendingJustifications: pendingJustificationsRes.count || 0,
        lateToday: lateTodayRes.count || 0,
        earlyLeaveToday: earlyLeaveTodayRes.count || 0,
        pendingOvertime: pendingOvertimeRes.count || 0,
        overtimePeriod: payrollItems.reduce((sum, item) => sum + Number(item.overtime_minutes || 0), 0),
        estimatedPayroll,
        openPayrolls: openPayrollRes.count || 0,
        closedPayrolls: closedPayrollRes.count || 0,
        inconsistencyAlerts:
          todayEntries.filter((entry) => entry.status === "blocked" || entry.occurrence_review_status === "pending_review").length +
          (pendingOvertimeRes.count || 0)
      },
      totalByBranch,
      charts: {
        lateByBranch,
        absencesByMonth: [{ label: "Período", value: absencesByMonth }],
        payrollByBranch: financialAllowed ? branches.map((branch) => ({
          label: branch.name,
          value: payrollItems
            .filter((item) => item.branch_id === branch.id)
            .reduce((sum, item) => sum + Number(item.final_amount || 0), 0)
        })) : [],
        settings,
        overtimeByEmployee: payrollItems.slice(0, 8).map((item) => ({
          label: item.employee_name || item.employee_id || "Funcionário",
          value: Number(item.overtime_minutes || 0)
        }))
      },
      alerts: [
        absentToday > 0 ? `${absentToday} funcionário(s) sem início de expediente hoje.` : null,
        (pendingJustificationsRes.count || 0) > 0 ? `${pendingJustificationsRes.count} justificativa(s) aguardando análise.` : null,
        (lateTodayRes.count || 0) > 0 ? `${lateTodayRes.count} atraso(s) registrado(s) hoje.` : null,
        (pendingOvertimeRes.count || 0) > 0 ? `${pendingOvertimeRes.count} hora(s) extra(s) pendente(s) de revisão.` : null
      ].filter(Boolean)
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao carregar dashboard.", 500);
  }
}
