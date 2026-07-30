import {
  calculateWorkedMinutes,
  eachDateInclusive,
  normalizeMoney,
  resolveDailyRate,
  weekdayFromDateKey
} from "@/lib/calculations";
import { approvedOvertimeForDate } from "@/lib/services/overtime-engine";
import { resolveExpectedJourney, type WorkScheduleRule } from "@/lib/services/schedule-engine";
import type { Employee, MinimalHoliday, PayrollPeriodType, SystemSettings, TimeEntry } from "@/types/domain";

export function calculatePayrollItemWithEngines(params: {
  employee: Employee;
  entries: TimeEntry[];
  justifications: any[];
  holidays: MinimalHoliday[];
  schedules: WorkScheduleRule[];
  overtimeReviews: any[];
  settings: SystemSettings;
  startDate: string;
  endDate: string;
  periodType: PayrollPeriodType;
}) {
  const { employee, entries, justifications, holidays, schedules, overtimeReviews, settings, startDate, endDate, periodType } = params;
  const periodDates = eachDateInclusive(startDate, endDate);
  const dates = periodDates.filter((date) =>
    (!employee.admission_date || date >= employee.admission_date) &&
    (!employee.termination_date || date <= employee.termination_date)
  );
  const eligibilityRatio = periodDates.length ? dates.length / periodDates.length : 0;
  const expectedDays = dates.filter((date) => resolveExpectedJourney({ employee, dateKey: date, schedules, holidays }).expected).length;
  const paidHolidayDays = dates.filter((date) => {
    if (!employee.work_days.includes(weekdayFromDateKey(date))) return false;
    return holidays.some((holiday) =>
      holiday.active && holiday.type === "holiday" && holiday.holiday_date === date &&
      (!holiday.branch_id || holiday.branch_id === employee.branch_id) &&
      holiday.operation_status !== "open"
    );
  }).length;
  const businessDays = dates.filter((date) => {
    const weekday = weekdayFromDateKey(date);
    return weekday !== 0 && weekday !== 6;
  }).length;

  const isSalaried = employee.employment_type === "mensalista" || employee.employment_type === "quinzenal";
  const dailyRate = isSalaried
    ? employee.daily_rate_mode === "manual" && employee.daily_rate
      ? normalizeMoney(employee.daily_rate)
      : normalizeMoney(Number(employee.monthly_salary || 0) / 30)
    : resolveDailyRate(employee, Math.max(1, expectedDays + paidHolidayDays), settings.daily_rate_calculation);
  const dailyRateBaseDays = isSalaried ? 30 : Math.max(1, expectedDays + paidHolidayDays);

  let workedDays = 0;
  let approvedAbsences = 0;
  let pendingAbsences = 0;
  let rejectedAbsences = 0;
  let discountedAbsences = 0;
  let identifiedAbsences = 0;
  let extraDays = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let calculatedOvertimeMinutes = 0;
  let approvedOvertimeMinutes = 0;

  for (const date of dates) {
    const journey = resolveExpectedJourney({ employee, dateKey: date, schedules, holidays });
    const dayEntries = entries.filter((entry) => entry.entry_date === date);
    const hasStart = dayEntries.some((entry) => entry.action === "start_shift" && ["valid", "pending_review", "adjusted"].includes(entry.status));

    lateMinutes += dayEntries
      .filter((entry) => entry.occurrence_review_status !== "approved")
      .reduce((sum, entry) => sum + Number(entry.late_minutes || 0), 0);
    earlyLeaveMinutes += dayEntries
      .filter((entry) => entry.occurrence_review_status !== "approved")
      .reduce((sum, entry) => sum + Number(entry.early_leave_minutes || 0), 0);

    if (hasStart) {
      workedDays += journey.expected ? 1 : 0;
      extraDays += journey.expected ? 0 : 1;
      const workedMinutes = calculateWorkedMinutes(dayEntries);
      calculatedOvertimeMinutes += Math.max(0, workedMinutes - (journey.expected ? journey.expected_daily_minutes : 0));
      approvedOvertimeMinutes += approvedOvertimeForDate(overtimeReviews, employee.id, date);
      continue;
    }

    if (!journey.expected) continue;
    identifiedAbsences += 1;
    const justification = justifications.find((item) => item.employee_id === employee.id && item.absence_date === date);
    if (justification?.status === "approved") approvedAbsences += 1;
    else if (justification?.status === "pending") {
      pendingAbsences += 1;
      discountedAbsences += 1;
    } else {
      if (justification?.status === "rejected") rejectedAbsences += 1;
      discountedAbsences += 1;
    }
  }

  let baseSalary = 0;
  let baseRule = "daily_worked";
  if (employee.employment_type === "diarista") {
    baseSalary = normalizeMoney(dailyRate * (workedDays + paidHolidayDays));
    baseRule = "diarista_worked_plus_paid_holidays";
  } else if (periodType === "monthly") {
    baseSalary = normalizeMoney(Number(employee.monthly_salary || 0) * eligibilityRatio);
    baseRule = eligibilityRatio < 1 ? "monthly_prorated_employment_period" : "monthly_100_percent";
  } else if (periodType === "biweekly") {
    baseSalary = normalizeMoney(Number(employee.monthly_salary || 0) * 0.5 * eligibilityRatio);
    baseRule = eligibilityRatio < 1 ? "biweekly_50_percent_prorated" : "biweekly_50_percent";
  } else {
    baseSalary = normalizeMoney(dailyRate * expectedDays);
    baseRule = "custom_expected_days";
  }

  const expectedDailyMinutes = Number(employee.expected_daily_minutes || 480);
  const minuteValue = expectedDailyMinutes > 0 ? dailyRate / expectedDailyMinutes : 0;
  const absenceDiscount = employee.employment_type === "diarista" ? 0 : normalizeMoney(discountedAbsences * dailyRate);
  const overtimeAmount = normalizeMoney(approvedOvertimeMinutes * minuteValue * Number(settings.overtime_multiplier ?? 1));
  const extraDayAmount = normalizeMoney(extraDays * dailyRate);
  const finalAmount = normalizeMoney(Math.max(0, baseSalary - absenceDiscount + overtimeAmount + extraDayAmount));

  return {
    base_salary: baseSalary,
    base_calculation_rule: baseRule,
    daily_rate: dailyRate,
    daily_rate_base_days: dailyRateBaseDays,
    business_days: businessDays,
    eligible_calendar_days: dates.length,
    period_calendar_days: periodDates.length,
    eligibility_ratio: eligibilityRatio,
    expected_work_days: expectedDays,
    paid_holiday_days: paidHolidayDays,
    worked_days: workedDays,
    approved_absences: approvedAbsences,
    pending_absences: pendingAbsences,
    rejected_absences: rejectedAbsences,
    discounted_absences: discountedAbsences,
    identified_absences: identifiedAbsences,
    total_late_minutes: lateMinutes,
    total_early_leave_minutes: earlyLeaveMinutes,
    calculated_overtime_minutes: calculatedOvertimeMinutes,
    overtime_minutes: approvedOvertimeMinutes,
    approved_overtime_minutes: approvedOvertimeMinutes,
    extra_days: extraDays,
    absence_discount_amount: absenceDiscount,
    overtime_amount: overtimeAmount,
    extra_day_amount: extraDayAmount,
    final_amount: finalAmount
  };
}
