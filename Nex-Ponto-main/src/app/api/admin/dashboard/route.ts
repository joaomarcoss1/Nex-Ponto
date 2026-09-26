import { NextRequest } from "next/server";
import { dateKeyInTimezone, eachDateInclusive } from "@/lib/calculations";
import { fetchScheduleContext, resolveExpectedJourney } from "@/lib/services/schedule-engine";
import { requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { canViewFinancialData, scopeByBranch } from "@/lib/server/branch-permissions";
import { getSystemSettings } from "@/lib/server/settings";


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
        .select("employee_name, branch_id, final_amount, overtime_minutes, payroll_periods!inner(start_date,end_date,status)")
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

    const employees = employeesRes.data || [];
    const branches = branchesRes.data || [];
    const todayEntries = todayEntriesRes.data || [];
    const settings = await getSystemSettings(auth.supabase);
    const { schedules, holidays: scheduleHolidays } = await fetchScheduleContext({
      supabase: auth.supabase,
      employeeIds: employees.map((employee: any) => employee.id),
      branchIds: [...new Set(employees.map((employee: any) => employee.branch_id))] as string[],
      startDate: periodStart,
      endDate: periodEnd
    });

    const validTodayEntries = todayEntries.filter((entry: any) => !["blocked", "canceled"].includes(entry.status));
    const startedToday = new Set(validTodayEntries.filter((entry: any) => entry.action === "start_shift").map((entry: any) => entry.employee_id));
    const latestActionByEmployee = new Map<string, any>();
    for (const entry of [...validTodayEntries].sort((a: any, b: any) => String(a.entry_timestamp).localeCompare(String(b.entry_timestamp)))) {
      latestActionByEmployee.set(String(entry.employee_id), entry);
    }
    const presentToday = [...latestActionByEmployee.values()].filter((entry: any) => entry.action !== "end_shift").length;
    const onBreakToday = [...latestActionByEmployee.values()].filter((entry: any) => entry.action === "start_lunch").length;
    const missingBreakReturn = [...latestActionByEmployee.values()].filter((entry: any) => entry.action === "start_lunch" && Date.now() - new Date(entry.entry_timestamp).getTime() > 120 * 60 * 1000).length;
    const expectedToday = employees.filter((employee: any) =>
      resolveExpectedJourney({ employee, dateKey: today, schedules, holidays: scheduleHolidays as any }).expected
    );
    const absentToday = expectedToday.filter((employee: any) => !startedToday.has(employee.id)).length;

    const totalByBranch = branches.map((branch: any) => ({
      branch: branch.name,
      total: employees.filter((employee: any) => employee.branch_id === branch.id).length
    }));

    let branchOpen: boolean | null = null;
    if (branches.length === 1) {
      const branch = branches[0] as any;
      const branchToday = dateKeyInTimezone(branch.timezone || process.env.DEFAULT_TIMEZONE || "America/Fortaleza");
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
    const estimatedPayroll = financialAllowed ? employees.reduce((sum: number, employee: any) => sum + Number(employee.monthly_salary || 0), 0) : 0;

    const lateByBranch = branches.map((branch: any) => ({
      label: branch.name,
      value: todayEntries.filter((entry: any) => entry.branch_id === branch.id && entry.late_minutes > 0).length
    }));

    const periodEntries = overtimeEntriesRes.data || [];
    const days = eachDateInclusive(periodStart, periodEnd);
    const absencesByMonth = days.reduce((sum, date) => {
      return (
        sum +
        employees.filter((employee: any) => {
          const expected = resolveExpectedJourney({ employee, dateKey: date, schedules, holidays: scheduleHolidays as any }).expected;
          const started = periodEntries.some(
            (entry: any) => entry.employee_id === employee.id && entry.entry_date === date && entry.action === "start_shift"
          );
          return expected && !started;
        }).length
      );
    }, 0);

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
        overtimePeriod: (payrollItemsRes.data || []).reduce((sum: number, item: any) => sum + Number(item.overtime_minutes || 0), 0),
        estimatedPayroll,
        openPayrolls: openPayrollRes.count || 0,
        closedPayrolls: closedPayrollRes.count || 0,
        inconsistencyAlerts:
          todayEntries.filter((entry: any) => entry.status === "blocked" || entry.occurrence_review_status === "pending_review").length +
          (pendingOvertimeRes.count || 0)
      },
      totalByBranch,
      charts: {
        lateByBranch,
        absencesByMonth: [{ label: "Período", value: absencesByMonth }],
        payrollByBranch: financialAllowed ? branches.map((branch: any) => ({
          label: branch.name,
          value: (payrollItemsRes.data || [])
            .filter((item: any) => item.branch_id === branch.id)
            .reduce((sum: number, item: any) => sum + Number(item.final_amount || 0), 0)
        })) : [],
        settings,
        overtimeByEmployee: (payrollItemsRes.data || []).slice(0, 8).map((item: any) => ({
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
