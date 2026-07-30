import { configuredFallbackTimezone } from "@/lib/time/operational-time";

export function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(`${value}`) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: configuredFallbackTimezone() }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: configuredFallbackTimezone()
  }).format(date);
}

export function formatDateTimeInput(value: string | Date | null | undefined, timeZone = configuredFallbackTimezone()) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function localDateTimeToIso(value: string, timeZone = configuredFallbackTimezone()) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Data e hora inválidas.");
  const [, year, month, day, hour, minute] = match.map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = localAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const zonedParts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(candidate));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(zonedParts.find((part) => part.type === type)?.value || 0);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    candidate += localAsUtc - represented;
  }
  return new Date(candidate).toISOString();
}

export function minutesToHourText(minutes: number | null | undefined) {
  const safe = Math.max(0, Number(minutes || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}
