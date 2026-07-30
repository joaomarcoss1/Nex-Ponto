const FALLBACK_TIMEZONE = "America/Sao_Paulo";

export type TimezoneSource = {
  branchTimezone?: string | null;
  tenantTimezone?: string | null;
  fallbackTimezone?: string | null;
};

function isValidTimezone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date("2026-01-01T12:00:00Z"));
    return true;
  } catch {
    return false;
  }
}

export function configuredFallbackTimezone() {
  const configured = process.env.DEFAULT_TIMEZONE?.trim();
  return configured && isValidTimezone(configured) ? configured : FALLBACK_TIMEZONE;
}

export function resolveOperationalTimezone(source: TimezoneSource = {}) {
  const candidates = [
    source.branchTimezone,
    source.tenantTimezone,
    source.fallbackTimezone,
    configuredFallbackTimezone(),
  ];
  return candidates.find((candidate) => candidate && isValidTimezone(candidate)) || FALLBACK_TIMEZONE;
}

export function dateKeyInOperationalTimezone(date = new Date(), source: TimezoneSource | string = {}) {
  const timeZone = typeof source === "string" ? source : resolveOperationalTimezone(source);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function timeKeyInOperationalTimezone(date = new Date(), source: TimezoneSource | string = {}) {
  const timeZone = typeof source === "string" ? source : resolveOperationalTimezone(source);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function minutesSinceOperationalMidnight(date = new Date(), source: TimezoneSource | string = {}) {
  const time = timeKeyInOperationalTimezone(date, source);
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function operationalMonthKey(date = new Date(), source: TimezoneSource | string = {}) {
  return dateKeyInOperationalTimezone(date, source).slice(0, 7);
}

export function operationalDayBounds(date = new Date(), source: TimezoneSource | string = {}) {
  const dateKey = dateKeyInOperationalTimezone(date, source);
  return {
    dateKey,
    startsAtLocal: `${dateKey}T00:00:00`,
    endsAtLocal: `${dateKey}T23:59:59.999`,
    timezone: typeof source === "string" ? source : resolveOperationalTimezone(source),
  };
}

export function eachOperationalDateInclusive(startDate: string, endDate: string) {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const cursor = new Date(`${dateKey}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}
