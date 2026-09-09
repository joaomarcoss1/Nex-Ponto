import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOperationalHolidays, pendingHolidayDecisions } from "@/lib/services/holiday-operations";

type Check = {
  check_type: string;
  severity: "critical" | "warning" | "info";
  label: string;
  count: number;
  details?: any[];
};

function check(check_type: string, severity: Check["severity"], label: string, rows: any[]): Check {
  return { check_type, severity, label, count: rows.length, details: rows.slice(0, 25) };
}

export async function buildPayrollClosureChecklist(supabase: SupabaseClient, payrollPeriodId: string) {
  const { data: period, error: periodError } = await supabase.from("payroll_periods").select("*").eq("id", payrollPeriodId).maybeSingle();
  if (periodError) throw new Error(periodError.message);
  if (!period) throw new Error("Folha não encontrada.");

  const startDate = period.start_date;
  const endDate = period.end_date;
  const branchId = period.branch_id;

  let employeesQuery = supabase.from("employees").select("id, full_name, branch_id, role, monthly_salary, daily_rate, pix_key, bank_name, bank_account, payment_day, expected_start_time, expected_lunch_start_time, expected_lunch_end_time, expected_end_time, work_days, active").eq("active", true);
  if (branchId) employeesQuery = employeesQuery.eq("branch_id", branchId);

  const [employeesRes, justificationsRes, overtimeRes, entriesRes, itemsRes, branchesRes] = await Promise.all([
    employeesQuery,
    supabase.from("absence_justifications").select("id, employee_id, branch_id, absence_date, status").gte("absence_date", startDate).lte("absence_date", endDate),
    supabase.from("overtime_reviews").select("id, employee_id, branch_id, entry_date, status").gte("entry_date", startDate).lte("entry_date", endDate),
    supabase.from("time_entries").select("id, employee_id, branch_id, entry_date, action, status, occurrence_review_status, inside_allowed_radius, gps_accuracy_meters, validation_radius_meters").gte("entry_date", startDate).lte("entry_date", endDate),
    supabase.from("payroll_items").select("id, employee_id, employee_name, branch_id, final_amount").eq("payroll_period_id", payrollPeriodId),
    supabase.from("branches").select("id,name,latitude,longitude,allowed_radius_meters,geofence_enabled,geolocation_status,gps_ready,active")
  ]);
  for (const response of [employeesRes, justificationsRes, overtimeRes, entriesRes, itemsRes, branchesRes]) {
    if (response.error) throw new Error(response.error.message);
  }

  const employees = employeesRes.data || [];
  const entries = entriesRes.data || [];
  const justifications = justificationsRes.data || [];
  const overtime = overtimeRes.data || [];
  const items = itemsRes.data || [];
  const branches = branchesRes.data || [];
  const employeeBranchIds = [...new Set(employees.map((employee: any) => employee.branch_id).filter(Boolean))] as string[];
  const operationalHolidays = await fetchOperationalHolidays({
    supabase,
    startDate,
    endDate,
    branchIds: branchId ? [branchId] : employeeBranchIds
  });
  const pendingHolidays = pendingHolidayDecisions(operationalHolidays);

  const byEmployeeDate = new Map<string, any[]>();
  entries.forEach((entry: any) => {
    const key = `${entry.employee_id}:${entry.entry_date}`;
    byEmployeeDate.set(key, [...(byEmployeeDate.get(key) || []), entry]);
  });

  const missingEnd = [...byEmployeeDate.values()].filter((rows) => rows.some((entry) => entry.action === "start_shift") && !rows.some((entry) => entry.action === "end_shift"));
  const missingLunchReturn = [...byEmployeeDate.values()].filter((rows) => rows.some((entry) => entry.action === "start_lunch") && !rows.some((entry) => entry.action === "end_lunch"));
  const outsideRadius = entries.filter((entry: any) => entry.status === "pending_review" && entry.inside_allowed_radius === false);
  const badGps = entries.filter((entry: any) => entry.status === "pending_review" && Number(entry.gps_accuracy_meters || 0) > 0);
  const pendingOccurrence = entries.filter((entry: any) => entry.occurrence_review_status === "pending_review");
  const pendingJustifications = justifications.filter((item: any) => item.status === "pending");
  const pendingOvertime = overtime.filter((item: any) => item.status === "pending");
  const employeesWithoutSalary = employees.filter((employee: any) => !Number(employee.monthly_salary || employee.daily_rate || 0));
  const employeesWithoutRole = employees.filter((employee: any) => !employee.role || String(employee.role).toLowerCase().includes("a definir"));
  const employeesWithoutSchedule = employees.filter((employee: any) => !employee.work_days?.length || !employee.expected_start_time || !employee.expected_end_time || employee.schedule_confirmed === false);
  const employeesWithoutLunchSchedule = employees.filter((employee: any) => !employee.expected_lunch_start_time || !employee.expected_lunch_end_time);
  const employeesWithoutPaymentDay = employees.filter((employee: any) => !employee.payment_day);
  const incompleteEmployees = employees.filter((employee: any) => !employee.branch_id || !Number(employee.monthly_salary || employee.daily_rate || 0) || !employee.work_days?.length || !employee.expected_start_time || !employee.expected_end_time);
  const missingPayment = employees.filter((employee: any) => !employee.pix_key && !employee.bank_account);
  const branchSet = new Set(employees.map((employee: any) => employee.branch_id).filter(Boolean));
  const branchesNotReady = branches.filter((branch: any) => branchSet.has(branch.id) && (!branch.active || branch.geofence_enabled === false || !branch.latitude || !branch.longitude || !Number(branch.allowed_radius_meters || 0) || !(branch.gps_ready || branch.geolocation_status === "confirmed")));
  const employeesWithoutPayroll = employees.filter((employee: any) => !items.some((item: any) => item.employee_id === employee.id));
  const employeesWithoutAnyPoint = employees.filter((employee: any) => !entries.some((entry: any) => entry.employee_id === employee.id));

  const checks: Check[] = [
    check("pending_justifications", "critical", "Justificativas de falta pendentes", pendingJustifications),
    check("pending_overtime", "critical", "Horas extras pendentes de revisão", pendingOvertime),
    check("pending_holiday_decisions", "critical", "Feriados sem decisão de funcionamento", pendingHolidays),
    check("outside_radius_pending", "critical", "Pontos fora do raio pendentes", outsideRadius),
    check("pending_occurrences", "critical", "Ocorrências de ponto pendentes", pendingOccurrence),
    check("missing_end_shift", "critical", "Expedientes sem encerramento", missingEnd),
    check("missing_lunch_return", "warning", "Almoços sem retorno registrado", missingLunchReturn),
    check("poor_gps_accuracy", "warning", "Pontos com GPS impreciso", badGps),
    check("employees_without_salary", "critical", "Funcionários ativos sem salário/diária", employeesWithoutSalary),
    check("employees_without_role", "critical", "Funcionários ativos sem cargo definido", employeesWithoutRole),
    check("employees_without_schedule", "critical", "Funcionários sem escala/horário confirmado", employeesWithoutSchedule),
    check("employees_without_lunch_schedule", "warning", "Funcionários sem horário de almoço", employeesWithoutLunchSchedule),
    check("employees_without_payment_day", "warning", "Funcionários sem dia de pagamento", employeesWithoutPaymentDay),
    check("employees_without_points", "critical", "Funcionários sem pontos no período", employeesWithoutAnyPoint),
    check("branches_gps_not_ready", "critical", "Filiais com GPS não confirmado", branchesNotReady),
    check("incomplete_employee_records", "warning", "Funcionários com cadastro incompleto", incompleteEmployees),
    check("missing_payment_data", "warning", "Funcionários sem Pix ou conta bancária", missingPayment),
    check("missing_payroll_items", "critical", "Funcionários ativos sem item na folha", employeesWithoutPayroll)
  ];

  return {
    period,
    checks,
    hasCritical: checks.some((item) => item.severity === "critical" && item.count > 0),
    summary: {
      employees: employees.length,
      items: items.length,
      totalAmount: items.reduce((sum: number, item: any) => sum + Number(item.final_amount || 0), 0),
      critical: checks.filter((item) => item.severity === "critical" && item.count > 0).length,
      warnings: checks.filter((item) => item.severity === "warning" && item.count > 0).length
    }
  };
}
