import { describe, expect, it } from "vitest";
import { cycleDayIndexV51, evaluateCoverageV51, resolveCycleDayV51 } from "@/lib/services/schedule-v51";

describe("schedule v5.1", () => {
  it("resolves a 12x36 cycle", () => {
    const cycle = { cycleType: "12x36" as const, cycleLengthDays: 2, days: [
      { dayIndex: 0, shiftTemplateId: "night", isDayOff: false },
      { dayIndex: 1, shiftTemplateId: null, isDayOff: true },
    ] };
    expect(cycleDayIndexV51("2026-07-01", "2026-07-02", 2)).toBe(1);
    expect(resolveCycleDayV51(cycle, "2026-07-01", "2026-07-03").shiftTemplateId).toBe("night");
  });

  it("blocks publication when required coverage is missing", () => {
    expect(evaluateCoverageV51({ id: "r1", minimumPeople: 3, policy: "block" }, 2)).toEqual({ requirementId: "r1", actual: 2, minimum: 3, maximum: null, status: "deficit", blocking: true });
  });
});
