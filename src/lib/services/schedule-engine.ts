import type { SupabaseClient } from "@supabase/supabase-js";
import { isNonWorkingDay, parseTimeToMinutes, weekdayFromDateKey } from "@/lib/calculations";
import type { Employee, MinimalHoliday } from "@/types/domain";
import { fetchOperationalHolidays } from "@/lib/services/holiday-operations";

export type WorkScheduleRule = {
  id?: string;
  employee_id: string;
  branch_id?: string | null;
  work_days: number[];
  weekday?: number | null;
  specific_date?: string | null;
  expected_start_time: string;
  expected_end_time: string;
  expected_daily_minutes: number;
  expected_lunch_minutes: number;
  expected_lunch_start_time?: string | null;
  expected_lunch_end_time?: string | null;
  effective_from: string;
  effective_until?: string | null;
  active: boolean;
  priority?: number | null;
  source_type?: "exception" | "published" | "cycle" | "contract" | "fallback";
  is_day_off?: boolean;
  intervals?: Array<{ expected_minutes?: number; paid?: boolean; planned_start?: string | null }>;
};

export type ExpectedJourney = {
  date: string;
  branch_id: string;
  expected: boolean;
  source: "published_schedule" | "schedule" | "employee_default" | "non_working_day";
  schedule_id?: string;
  expected_start_time: string;
  expected_end_time: string;
  expected_daily_minutes: number;
  expected_lunch_minutes: number;
  expected_lunch_start_time?: string | null;
  expected_lunch_end_time?: string | null;
  weekday: number;
  reason?: string;
};

function normalizeTime(time: string) {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function timeInTimezone(timestamp: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function minutesBetween(startTimestamp: string, endTimestamp: string) {
  return Math.max(0, Math.round((new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()) / 60000));
}

function activeForDate(schedule: WorkScheduleRule, dateKey: string) {
  if (!schedule.active) return false;
  if (schedule.effective_from && schedule.effective_from > dateKey) return false;
  if (schedule.effective_until && schedule.effective_until < dateKey) return false;
  return true;
}

function scheduleMatches(schedule: WorkScheduleRule, employee: Pick<Employee, "id" | "branch_id">, dateKey: string, weekday: number) {
  if (schedule.employee_id !== employee.id) return false;
  if (schedule.branch_id && schedule.branch_id !== employee.branch_id) return false;
  if (!activeForDate(schedule, dateKey)) return false;
  if (schedule.specific_date && schedule.specific_date !== dateKey) return false;
  if (schedule.weekday !== null && schedule.weekday !== undefined && schedule.weekday !== weekday) return false;
  if (!schedule.specific_date && (schedule.weekday === null || schedule.weekday === undefined) && !schedule.work_days.includes(weekday)) return false;
  return true;
}

export function resolveExpectedJourney(params: {
  employee: Pick<
    Employee,
    | "id"
    | "branch_id"
    | "work_days"
    | "expected_start_time"
    | "expected_end_time"
    | "expected_daily_minutes"
    | "expected_lunch_minutes"
    | "expected_lunch_start_time"
    | "expected_lunch_end_time"
  >;
  dateKey: string;
  schedules?: WorkScheduleRule[];
  holidays?: MinimalHoliday[];
}): ExpectedJourney {
  const { employee, dateKey, schedules = [], holidays = [] } = params;
  const weekday = weekdayFromDateKey(dateKey);

  const match = schedules
    .filter((schedule) => scheduleMatches(schedule, employee, dateKey, weekday))
    .sort((a, b) => {
      const dateScore = Number(Boolean(b.specific_date)) - Number(Boolean(a.specific_date));
      if (dateScore !== 0) return dateScore;
      const weekdayScore = Number(b.weekday !== null && b.weekday !== undefined) - Number(a.weekday !== null && a.weekday !== undefined);
      if (weekdayScore !== 0) return weekdayScore;
      return Number(a.priority ?? 10) - Number(b.priority ?? 10);
    })[0];

  // Uma ocorrência publicada é uma decisão operacional explícita e prevalece
  // sobre o calendário genérico. Folga publicada também prevalece.
  if (!match && isNonWorkingDay(dateKey, employee.branch_id, holidays)) {
    return {
      date: dateKey,
      branch_id: employee.branch_id,
      expected: false,
      source: "non_working_day",
      expected_start_time: normalizeTime(employee.expected_start_time),
      expected_end_time: normalizeTime(employee.expected_end_time),
      expected_daily_minutes: Number(employee.expected_daily_minutes ?? 0),
      expected_lunch_minutes: Number(employee.expected_lunch_minutes ?? 0),
      expected_lunch_start_time: employee.expected_lunch_start_time ? normalizeTime(employee.expected_lunch_start_time) : null,
      expected_lunch_end_time: employee.expected_lunch_end_time ? normalizeTime(employee.expected_lunch_end_time) : null,
      weekday,
      reason: "Feriado, folga ou dia sem expediente"
    };
  }

  if (match) {
    const workDays = match.weekday !== null && match.weekday !== undefined ? [match.weekday] : match.work_days;
    return {
      date: dateKey,
      branch_id: match.branch_id || employee.branch_id,
      expected: !match.is_day_off && workDays.includes(weekday),
      source: match.source_type === "published" ? "published_schedule" : "schedule",
      schedule_id: match.id,
      expected_start_time: normalizeTime(match.expected_start_time),
      expected_end_time: normalizeTime(match.expected_end_time),
      expected_daily_minutes: Number(match.expected_daily_minutes ?? 0),
      expected_lunch_minutes: Number(match.expected_lunch_minutes ?? 0),
      expected_lunch_start_time: match.expected_lunch_start_time ? normalizeTime(match.expected_lunch_start_time) : null,
      expected_lunch_end_time: match.expected_lunch_end_time ? normalizeTime(match.expected_lunch_end_time) : null,
      weekday
    };
  }

  return {
    date: dateKey,
    branch_id: employee.branch_id,
    expected: employee.work_days.includes(weekday),
    source: "employee_default",
    expected_start_time: normalizeTime(employee.expected_start_time),
    expected_end_time: normalizeTime(employee.expected_end_time),
    expected_daily_minutes: Number(employee.expected_daily_minutes ?? 0),
    expected_lunch_minutes: Number(employee.expected_lunch_minutes ?? 0),
    expected_lunch_start_time: employee.expected_lunch_start_time ? normalizeTime(employee.expected_lunch_start_time) : null,
    expected_lunch_end_time: employee.expected_lunch_end_time ? normalizeTime(employee.expected_lunch_end_time) : null,
    weekday
  };
}

export function computeLateFromJourney(journey: ExpectedJourney, registeredAtMinutes: number, tolerance: number) {
  if (!journey.expected) return 0;
  const diff = registeredAtMinutes - parseTimeToMinutes(journey.expected_start_time);
  return diff > tolerance ? diff : 0;
}

export function computeEarlyLeaveFromJourney(journey: ExpectedJourney, registeredAtMinutes: number, tolerance: number) {
  if (!journey.expected) return 0;
  const diff = parseTimeToMinutes(journey.expected_end_time) - registeredAtMinutes;
  return diff > tolerance ? diff : 0;
}

export async function fetchScheduleContext(params: {
  supabase: SupabaseClient;
  employeeIds: string[];
  branchIds?: string[];
  startDate: string;
  endDate: string;
}) {
  const { supabase, employeeIds, branchIds, startDate, endDate } = params;
  const schedulesQuery = supabase
    .from("work_schedules")
    .select("*")
    .in("employee_id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("active", true)
    .lte("effective_from", endDate)
    .or(`effective_until.is.null,effective_until.gte.${startDate}`);

  let occurrencesQuery = supabase
    .from("schedule_occurrences")
    .select("id,employee_id,branch_id,work_date,starts_at,ends_at,is_day_off,intervals,status,shift_template_id,branches(timezone)")
    .in("employee_id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "published")
    .gte("work_date", startDate)
    .lte("work_date", endDate);
  if (branchIds?.length) occurrencesQuery = occurrencesQuery.in("branch_id", branchIds);

  const [{ data: schedules, error: schedulesError }, { data: occurrences, error: occurrencesError }, holidays] = await Promise.all([
    schedulesQuery,
    occurrencesQuery,
    fetchOperationalHolidays({ supabase, startDate, endDate, branchIds })
  ]);
  if (schedulesError) throw new Error(schedulesError.message);
  if (occurrencesError) throw new Error(occurrencesError.message);

  const publishedRules: WorkScheduleRule[] = ((occurrences || []) as Array<Record<string, unknown>>).map((row) => {
    const branchRelation = Array.isArray(row.branches) ? row.branches[0] : row.branches;
    const timezone = branchRelation && typeof branchRelation === "object" && "timezone" in branchRelation
      ? String((branchRelation as { timezone?: string }).timezone || process.env.DEFAULT_TIMEZONE || "America/Sao_Paulo")
      : process.env.DEFAULT_TIMEZONE || "America/Sao_Paulo";
    const intervals = Array.isArray(row.intervals) ? row.intervals as Array<{ expected_minutes?: number; paid?: boolean; planned_start?: string | null }> : [];
    const unpaidMinutes = intervals.filter((item) => !item.paid).reduce((sum, item) => sum + Number(item.expected_minutes ?? 0), 0);
    const startTimestamp = row.starts_at ? String(row.starts_at) : "";
    const endTimestamp = row.ends_at ? String(row.ends_at) : "";
    const plannedLunch = intervals.find((item) => !item.paid);
    return {
      id: String(row.id),
      employee_id: String(row.employee_id),
      branch_id: String(row.branch_id),
      work_days: [weekdayFromDateKey(String(row.work_date))],
      weekday: weekdayFromDateKey(String(row.work_date)),
      specific_date: String(row.work_date),
      expected_start_time: startTimestamp ? timeInTimezone(startTimestamp, timezone) : "00:00",
      expected_end_time: endTimestamp ? timeInTimezone(endTimestamp, timezone) : "00:00",
      expected_daily_minutes: startTimestamp && endTimestamp ? Math.max(0, minutesBetween(startTimestamp, endTimestamp) - unpaidMinutes) : 0,
      expected_lunch_minutes: unpaidMinutes,
      expected_lunch_start_time: plannedLunch?.planned_start || null,
      expected_lunch_end_time: null,
      effective_from: String(row.work_date),
      effective_until: String(row.work_date),
      active: true,
      priority: -1000,
      source_type: "published",
      is_day_off: Boolean(row.is_day_off),
      intervals
    };
  });

  return {
    schedules: [...publishedRules, ...((schedules || []) as WorkScheduleRule[])],
    holidays
  };
}
