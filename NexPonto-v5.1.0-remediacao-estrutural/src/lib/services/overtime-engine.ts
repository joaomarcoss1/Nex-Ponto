import { calculateWorkedMinutes, normalizeMoney } from "@/lib/calculations";
import { resolveExpectedJourney, type WorkScheduleRule } from "@/lib/services/schedule-engine";
import type { Employee, MinimalHoliday, SystemSettings, TimeEntry } from "@/types/domain";

export type OvertimeCandidate = {
  employee_id: string;
  branch_id: string;
  entry_date: string;
  worked_minutes: number;
  expected_minutes: number;
  calculated_overtime_minutes: number;
  approved_overtime_minutes: number;
  estimated_amount: number;
};

export function detectOvertimeCandidates(params: {
  employee: Employee;
  entries: TimeEntry[];
  schedules: WorkScheduleRule[];
  holidays: MinimalHoliday[];
  settings: SystemSettings;
  dailyRate: number;
}) {
  const { employee, entries, schedules, holidays, settings, dailyRate } = params;
  const dates = [...new Set(entries.map((entry) => entry.entry_date))];
  const rows: OvertimeCandidate[] = [];

  for (const date of dates) {
    const dayEntries = entries.filter((entry) => entry.entry_date === date);
    const journey = resolveExpectedJourney({ employee, dateKey: date, schedules, holidays });
    const worked = calculateWorkedMinutes(dayEntries);
    const expected = journey.expected ? journey.expected_daily_minutes : 0;
    const extra = Math.max(0, worked - expected);
    if (!employee.allow_overtime || extra <= 0) continue;
    const hourValue = journey.expected_daily_minutes > 0 ? dailyRate / journey.expected_daily_minutes : 0;
    rows.push({
      employee_id: employee.id,
      branch_id: employee.branch_id,
      entry_date: date,
      worked_minutes: worked,
      expected_minutes: expected,
      calculated_overtime_minutes: extra,
      approved_overtime_minutes: settings.auto_approve_overtime ? extra : 0,
      estimated_amount: normalizeMoney(extra * hourValue * Number(settings.overtime_multiplier ?? 1))
    });
  }

  return rows;
}

export function approvedOvertimeForDate(reviews: any[], employeeId: string, date: string) {
  const valid = reviews.filter((item) =>
    item.employee_id === employeeId &&
    item.entry_date === date &&
    (item.status === "approved" || item.status === "adjusted")
  );
  const seen = new Set<string>();
  return valid.reduce((total, review) => {
    const sourceKey = String(review.idempotency_key || review.source_entry_id || review.time_entry_id || review.id || "");
    if (sourceKey && seen.has(sourceKey)) return total;
    if (sourceKey) seen.add(sourceKey);
    return total + Number(review.approved_overtime_minutes ?? review.overtime_minutes ?? 0);
  }, 0);
}
