import { eachDateInclusive, normalizeMoney, resolveDailyRate } from "@/lib/calculations";
import { resolveExpectedJourney, type WorkScheduleRule } from "@/lib/services/schedule-engine";
import type { Employee, MinimalHoliday, SystemSettings, TimeEntry } from "@/types/domain";

export type AbsenceReportRow = {
  employee_id: string;
  employee_name: string;
  branch_id: string;
  branch_name: string;
  role: string;
  date: string;
  weekday: number;
  expected_work_day: boolean;
  has_start_entry: boolean;
  absence_status: "not_absent" | "without_justification" | "pending" | "approved" | "rejected";
  justification_text: string | null;
  attachment_url: string | null;
  admin_observation: string | null;
  generates_discount: boolean;
  discount_amount: number;
  payroll_status: string;
};

export function buildAbsenceReport(params: {
  employees: Array<Employee & { branches?: { name?: string } }>;
  entries: TimeEntry[];
  justifications: any[];
  schedules: WorkScheduleRule[];
  holidays: MinimalHoliday[];
  settings: SystemSettings;
  startDate: string;
  endDate: string;
}) {
  const { employees, entries, justifications, schedules, holidays, settings, startDate, endDate } = params;
  const dates = eachDateInclusive(startDate, endDate);
  const rows: AbsenceReportRow[] = [];

  // Grouping once by "employee|date" avoids re-scanning the whole period's entries/justifications
  // for every employee/day pair (O(employees*days*entries) with real data — the same class of
  // slowdown fixed in the dashboard endpoint). Map lookups below are O(1) instead.
  const entriesByEmployeeDate = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const key = `${entry.employee_id}|${entry.entry_date}`;
    const existing = entriesByEmployeeDate.get(key);
    if (existing) existing.push(entry);
    else entriesByEmployeeDate.set(key, [entry]);
  }
  // .find() keeps the first match on duplicates; only set a key once to preserve that.
  const justificationByEmployeeDate = new Map<string, any>();
  for (const item of justifications) {
    const key = `${item.employee_id}|${item.absence_date}`;
    if (!justificationByEmployeeDate.has(key)) justificationByEmployeeDate.set(key, item);
  }

  for (const employee of employees) {
    const expectedDays = dates.filter((date) => resolveExpectedJourney({ employee, dateKey: date, schedules, holidays }).expected).length;
    const dailyRate = resolveDailyRate(employee, expectedDays, settings.daily_rate_calculation);

    for (const date of dates) {
      const journey = resolveExpectedJourney({ employee, dateKey: date, schedules, holidays });
      const dayEntries = entriesByEmployeeDate.get(`${employee.id}|${date}`) || [];
      const hasStart = dayEntries.some((entry) => entry.action === "start_shift" && ["valid", "pending_review", "adjusted"].includes(entry.status));
      const justification = justificationByEmployeeDate.get(`${employee.id}|${date}`);
      let absenceStatus: AbsenceReportRow["absence_status"] = "not_absent";
      if (journey.expected && !hasStart) {
        absenceStatus = justification?.status || "without_justification";
      }
      const generatesDiscount = absenceStatus === "without_justification" || absenceStatus === "rejected";
      rows.push({
        employee_id: employee.id,
        employee_name: employee.full_name,
        branch_id: employee.branch_id,
        branch_name: employee.branches?.name || "",
        role: employee.role,
        date,
        weekday: journey.weekday,
        expected_work_day: journey.expected,
        has_start_entry: hasStart,
        absence_status: absenceStatus,
        justification_text: justification?.justification_text || null,
        attachment_url: justification?.attachment_url || null,
        admin_observation: justification?.admin_observation || null,
        generates_discount: generatesDiscount,
        discount_amount: generatesDiscount ? normalizeMoney(dailyRate) : 0,
        payroll_status: absenceStatus === "pending" ? "pendente_na_folha" : generatesDiscount ? "desconta" : "sem_desconto"
      });
    }
  }

  return rows;
}
