import { describe, expect, it } from "vitest";
import {
  dateKeyInOperationalTimezone,
  addDaysToDateKey,
  minutesSinceOperationalMidnight,
  operationalMonthKey,
  resolveOperationalTimezone,
} from "@/lib/time/operational-time";

describe("operational timezone", () => {
  it("prefers branch timezone over tenant timezone", () => {
    expect(resolveOperationalTimezone({
      branchTimezone: "America/Manaus",
      tenantTimezone: "America/Sao_Paulo",
    })).toBe("America/Manaus");
  });

  it("uses tenant timezone when branch timezone is absent", () => {
    expect(resolveOperationalTimezone({
      tenantTimezone: "America/Rio_Branco",
    })).toBe("America/Rio_Branco");
  });

  it.each([
    ["America/Fortaleza", "2026-07-30"],
    ["America/Sao_Paulo", "2026-07-30"],
    ["America/Manaus", "2026-07-29"],
    ["America/Rio_Branco", "2026-07-29"],
  ])("calculates local date for UTC midnight edge in %s", (timezone, expected) => {
    expect(dateKeyInOperationalTimezone(new Date("2026-07-30T03:30:00Z"), timezone)).toBe(expected);
  });

  it("calculates minutes since local midnight", () => {
    expect(minutesSinceOperationalMidnight(new Date("2026-07-30T12:30:00Z"), "America/Sao_Paulo")).toBe(570);
  });

  it("calculates operational month in local timezone", () => {
    expect(operationalMonthKey(new Date("2026-08-01T02:30:00Z"), "America/Sao_Paulo")).toBe("2026-07");
  });

  it("adds days from an operational date key without depending on current UTC date", () => {
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});
