import { defaultSettings, TIMEZONE } from "@/lib/constants";
import type {
  DailyRateMode,
  Employee,
  HolidayOperationStatus,
  HolidayType,
  PayrollPeriodType,
  SystemSettings,
  TimeAction,
  TimeEntry
} from "@/types/domain";

export type MinimalHoliday = {
  id?: string;
  holiday_date: string;
  branch_id: string | null;
  type: HolidayType;
  active: boolean;
  operation_status?: HolidayOperationStatus;
  decision_id?: string | null;
};

export type MinimalJustification = {
  employee_id: string;
  absence_date: string;
  status: "pending" | "approved" | "rejected";
};

export type PayrollCalculation = {
  base_salary: number;
  daily_rate: number;
  expected_work_days: number;
  worked_days: number;
  approved_absences: number;
  discounted_absences: number;
  total_late_minutes: number;
  total_early_leave_minutes: number;
  overtime_minutes: number;
  extra_days: number;
  absence_discount_amount: number;
  overtime_amount: number;
  extra_day_amount: number;
  final_amount: number;
};

export function dateKeyInTimezone(date = new Date(), timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseTimeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesSinceMidnight(date = new Date(), timeZone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

export function eachDateInclusive(startDate: string, endDate: string) {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function weekdayFromDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

export function normalizeMoney(value: unknown) {
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMeters = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

export function getNextActions(entries: Pick<TimeEntry, "action" | "status" | "entry_timestamp">[]) {
  const usable = entries
    .filter((entry) => ["valid", "pending_review", "adjusted"].includes(entry.status))
    .sort((a, b) => new Date(a.entry_timestamp).getTime() - new Date(b.entry_timestamp).getTime());

  if (!usable.length) {
    return { recommended: "start_shift" as TimeAction, allowed: ["start_shift"] as TimeAction[] };
  }
  if (usable.some((entry) => entry.action === "end_shift")) {
    return { recommended: null, allowed: [] as TimeAction[] };
  }

  const hasStart = usable.some((entry) => entry.action === "start_shift");
  if (!hasStart) return { recommended: "start_shift" as TimeAction, allowed: ["start_shift"] as TimeAction[] };

  const openBreaks = usable.reduce((balance, entry) => {
    if (entry.action === "start_lunch") return balance + 1;
    if (entry.action === "end_lunch") return Math.max(0, balance - 1);
    return balance;
  }, 0);

  if (openBreaks > 0) {
    return { recommended: "end_lunch" as TimeAction, allowed: ["end_lunch"] as TimeAction[] };
  }

  // Supports one or more intervals: after each return the employee may start
  // another configured interval or close the shift.
  return { recommended: "start_lunch" as TimeAction, allowed: ["start_lunch", "end_shift"] as TimeAction[] };
}

export function isOutOfOrder(action: TimeAction, entries: Pick<TimeEntry, "action" | "status" | "entry_timestamp">[]) {
  return !getNextActions(entries).allowed.includes(action);
}

export function computeLateMinutes(employee: Pick<Employee, "expected_start_time">, now = new Date(), tolerance = 15) {
  const diff = minutesSinceMidnight(now) - parseTimeToMinutes(employee.expected_start_time);
  return diff > tolerance ? diff : 0;
}

export function computeEarlyLeaveMinutes(employee: Pick<Employee, "expected_end_time">, now = new Date(), tolerance = 15) {
  const diff = parseTimeToMinutes(employee.expected_end_time) - minutesSinceMidnight(now);
  return diff > tolerance ? diff : 0;
}

export function calculateWorkedMinutes(entries: Pick<TimeEntry, "action" | "entry_timestamp" | "status">[]) {
  const usable = entries
    .filter((entry) => ["valid", "pending_review", "adjusted"].includes(entry.status))
    .sort((a, b) => new Date(a.entry_timestamp).getTime() - new Date(b.entry_timestamp).getTime());
  const start = usable.find((entry) => entry.action === "start_shift");
  const end = [...usable].reverse().find((entry) => entry.action === "end_shift");
  if (!start || !end) return 0;

  let worked = Math.max(0, Math.round((new Date(end.entry_timestamp).getTime() - new Date(start.entry_timestamp).getTime()) / 60000));
  let lunchStart: Date | null = null;
  for (const entry of usable) {
    if (entry.action === "start_lunch") lunchStart = new Date(entry.entry_timestamp);
    if (entry.action === "end_lunch" && lunchStart) {
      worked -= Math.max(0, Math.round((new Date(entry.entry_timestamp).getTime() - lunchStart.getTime()) / 60000));
      lunchStart = null;
    }
  }
  return Math.max(0, worked);
}

export function isNonWorkingDay(dateKey: string, branchId: string, holidays: MinimalHoliday[]) {
  return holidays.some((holiday) => {
    if (!holiday.active || holiday.holiday_date !== dateKey) return false;
    if (holiday.branch_id && holiday.branch_id !== branchId) return false;
    if (holiday.type === "holiday") {
      // Feriado aberto é um dia normal. Pendente é tratado como dispensa provisória
      // para nunca criar desconto antes da decisão administrativa.
      return holiday.operation_status !== "open";
    }
    return ["day_off", "no_work"].includes(holiday.type);
  });
}

export function hasPendingHolidayDecision(dateKey: string, branchId: string, holidays: MinimalHoliday[]) {
  return holidays.some((holiday) =>
    holiday.active &&
    holiday.type === "holiday" &&
    holiday.operation_status === "pending" &&
    holiday.holiday_date === dateKey &&
    (!holiday.branch_id || holiday.branch_id === branchId)
  );
}

export function expectedWorkDaysForPeriod(
  employee: Pick<Employee, "work_days" | "branch_id">,
  startDate: string,
  endDate: string,
  holidays: MinimalHoliday[]
) {
  return eachDateInclusive(startDate, endDate).filter(
    (dateKey) => employee.work_days.includes(weekdayFromDateKey(dateKey)) && !isNonWorkingDay(dateKey, employee.branch_id, holidays)
  ).length;
}

export function resolveDailyRate(
  employee: Pick<Employee, "daily_rate" | "daily_rate_mode" | "monthly_salary">,
  expectedWorkDays: number,
  mode: SystemSettings["daily_rate_calculation"] = defaultSettings.daily_rate_calculation
) {
  if ((employee.daily_rate_mode as DailyRateMode) === "manual" && employee.daily_rate) {
    return normalizeMoney(employee.daily_rate);
  }
  if (mode === "fixed_30") return normalizeMoney(employee.monthly_salary / 30);
  return normalizeMoney(employee.monthly_salary / Math.max(1, expectedWorkDays));
}

export function calculatePayrollItem(params: {
  employee: Employee;
  entries: TimeEntry[];
  justifications: MinimalJustification[];
  holidays: MinimalHoliday[];
  settings: SystemSettings;
  startDate: string;
  endDate: string;
  periodType: PayrollPeriodType;
}): PayrollCalculation {
  const { employee, entries, justifications, holidays, settings, startDate, endDate, periodType } = params;
  const dates = eachDateInclusive(startDate, endDate);
  const expectedDays = expectedWorkDaysForPeriod(employee, startDate, endDate, holidays);
  const dailyRate = resolveDailyRate(employee, expectedDays, settings.daily_rate_calculation);
  const byDate = new Map<string, TimeEntry[]>();

  entries.forEach((entry) => {
    if (!byDate.has(entry.entry_date)) byDate.set(entry.entry_date, []);
    byDate.get(entry.entry_date)?.push(entry);
  });

  let workedDays = 0;
  let approvedAbsences = 0;
  let discountedAbsences = 0;
  let extraDays = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;

  for (const dateKey of dates) {
    const expected =
      employee.work_days.includes(weekdayFromDateKey(dateKey)) && !isNonWorkingDay(dateKey, employee.branch_id, holidays);
    const dayEntries = byDate.get(dateKey) || [];
    const hasStart = dayEntries.some((entry) => entry.action === "start_shift" && ["valid", "pending_review", "adjusted"].includes(entry.status));

    lateMinutes += dayEntries.reduce((sum, entry) => sum + Number(entry.late_minutes || 0), 0);
    earlyLeaveMinutes += dayEntries.reduce((sum, entry) => sum + Number(entry.early_leave_minutes || 0), 0);

    if (hasStart) {
      workedDays += expected ? 1 : 0;
      extraDays += expected ? 0 : 1;
      const workedMinutes = calculateWorkedMinutes(dayEntries);
      if (employee.allow_overtime && workedMinutes > employee.expected_daily_minutes) {
        overtimeMinutes += workedMinutes - employee.expected_daily_minutes;
      }
      continue;
    }

    if (!expected) continue;
    const approved = justifications.some(
      (justification) =>
        justification.employee_id === employee.id && justification.absence_date === dateKey && justification.status === "approved"
    );
    if (approved) approvedAbsences += 1;
    else discountedAbsences += 1;
  }

  const baseSalary =
    employee.employment_type === "mensalista" && periodType === "monthly"
      ? normalizeMoney(employee.monthly_salary)
      : normalizeMoney(dailyRate * expectedDays);
  const hourValue = employee.expected_daily_minutes > 0 ? dailyRate / employee.expected_daily_minutes : 0;
  const absenceDiscount = normalizeMoney(discountedAbsences * dailyRate);
  const overtimeAmount = normalizeMoney(overtimeMinutes * hourValue * Number(settings.overtime_multiplier ?? 1));
  const extraDayAmount = normalizeMoney(extraDays * dailyRate);
  const finalAmount = normalizeMoney(baseSalary - absenceDiscount + overtimeAmount + extraDayAmount);

  return {
    base_salary: baseSalary,
    daily_rate: dailyRate,
    expected_work_days: expectedDays,
    worked_days: workedDays,
    approved_absences: approvedAbsences,
    discounted_absences: discountedAbsences,
    total_late_minutes: lateMinutes,
    total_early_leave_minutes: earlyLeaveMinutes,
    overtime_minutes: overtimeMinutes,
    extra_days: extraDays,
    absence_discount_amount: absenceDiscount,
    overtime_amount: overtimeAmount,
    extra_day_amount: extraDayAmount,
    final_amount: finalAmount
  };
}

export function analyzeInconsistencies(entries: TimeEntry[]) {
  const result: Array<{ date: string; employee_id: string; type: string; message: string; entry_id?: string }> = [];
  const byEmployeeDate = new Map<string, TimeEntry[]>();

  entries.forEach((entry) => {
    if (!["valid", "pending_review", "adjusted"].includes(entry.status)) return;
    const key = `${entry.employee_id}:${entry.entry_date}`;
    if (!byEmployeeDate.has(key)) byEmployeeDate.set(key, []);
    byEmployeeDate.get(key)?.push(entry);

    if (Number(entry.gps_accuracy_meters || 0) > Number(entry.validation_radius_meters || 100)) {
      result.push({
        date: entry.entry_date,
        employee_id: entry.employee_id,
        type: "gps_impreciso",
        message: "Ponto registrado com precisão de GPS acima do limite configurado",
        entry_id: entry.id
      });
    }
    if (entry.inside_allowed_radius === false) {
      result.push({
        date: entry.entry_date,
        employee_id: entry.employee_id,
        type: "ponto_fora_do_raio",
        message: "Ponto registrado fora do raio permitido",
        entry_id: entry.id
      });
    }
    if (entry.late_minutes > 0 && entry.justification_text) {
      result.push({
        date: entry.entry_date,
        employee_id: entry.employee_id,
        type: "atraso_com_justificativa",
        message: "Atraso com justificativa pendente de revisão",
        entry_id: entry.id
      });
    }
    if (entry.early_leave_minutes > 0 && entry.justification_text) {
      result.push({
        date: entry.entry_date,
        employee_id: entry.employee_id,
        type: "saida_antecipada_com_justificativa",
        message: "Saída antecipada com justificativa pendente de revisão",
        entry_id: entry.id
      });
    }
  });

  byEmployeeDate.forEach((dayEntries) => {
    const ordered = [...dayEntries].sort((a, b) => new Date(a.entry_timestamp).getTime() - new Date(b.entry_timestamp).getTime());
    const actions = ordered.map((entry) => entry.action);
    const first = ordered[0];
    let shiftStarted = false;
    let shiftEnded = false;
    let openBreak = false;
    ordered.forEach((entry) => {
      let valid = true;
      if (shiftEnded) valid = false;
      else if (!shiftStarted) {
        valid = entry.action === "start_shift";
        shiftStarted = valid;
      } else if (openBreak) {
        valid = entry.action === "end_lunch";
        if (valid) openBreak = false;
      } else if (entry.action === "start_lunch") {
        openBreak = true;
      } else if (entry.action === "end_shift") {
        shiftEnded = true;
      } else {
        valid = false;
      }
      if (!valid) {
        result.push({
          date: first.entry_date,
          employee_id: first.employee_id,
          type: "ponto_fora_de_ordem",
          message: "Há ações de ponto fora da sequência válida da jornada",
          entry_id: entry.id
        });
      }
    });
    ordered.forEach((entry, index) => {
      if (index === 0) return;
      const previous = ordered[index - 1];
      const delta = Math.abs(new Date(entry.entry_timestamp).getTime() - new Date(previous.entry_timestamp).getTime()) / 60000;
      if (delta < 3) {
        result.push({
          date: entry.entry_date,
          employee_id: entry.employee_id,
          type: "batidas_muito_proximas",
          message: "Há batidas de ponto em intervalo inferior a 3 minutos",
          entry_id: entry.id
        });
      }
    });
    if (actions.filter((action) => action === "start_shift").length > 1 || actions.filter((action) => action === "end_shift").length > 1) {
      result.push({
        date: first.entry_date,
        employee_id: first.employee_id,
        type: "ponto_duplicado",
        message: "Há abertura ou encerramento duplicado na mesma jornada",
        entry_id: first.id
      });
    }
    if (actions.includes("start_shift") && !actions.includes("end_shift")) {
      result.push({
        date: first.entry_date,
        employee_id: first.employee_id,
        type: "falta_encerramento",
        message: "Expediente iniciado sem encerramento",
        entry_id: first.id
      });
    }
    const breakStarts = actions.filter((action) => action === "start_lunch").length;
    const breakEnds = actions.filter((action) => action === "end_lunch").length;
    if (breakStarts !== breakEnds) {
      result.push({
        date: first.entry_date,
        employee_id: first.employee_id,
        type: "intervalo_incompleto",
        message: "Há intervalo iniciado sem retorno correspondente",
        entry_id: first.id
      });
    }
  });

  return result;
}
