import { describe, expect, it } from "vitest";
import { resolveExpectedJourney } from "@/lib/services/schedule-engine";
import type { Employee } from "@/types/domain";

const employee = {
  id: "11111111-1111-4111-8111-111111111111",
  branch_id: "22222222-2222-4222-8222-222222222222",
  work_days: [1, 2, 3, 4, 5],
  expected_start_time: "08:00",
  expected_end_time: "17:00",
  expected_daily_minutes: 480,
  expected_lunch_minutes: 60,
  expected_lunch_start_time: "12:00",
  expected_lunch_end_time: "13:00"
} satisfies Pick<Employee, "id" | "branch_id" | "work_days" | "expected_start_time" | "expected_end_time" | "expected_daily_minutes" | "expected_lunch_minutes" | "expected_lunch_start_time" | "expected_lunch_end_time">;

describe("schedule engine v4", () => {
  it("prioriza ocorrência publicada sobre feriado genérico", () => {
    const result = resolveExpectedJourney({
      employee,
      dateKey: "2026-07-27",
      holidays: [{ holiday_date: "2026-07-27", branch_id: null, type: "holiday", active: true, operation_status: "closed" }],
      schedules: [{
        id: "33333333-3333-4333-8333-333333333333",
        employee_id: employee.id,
        branch_id: employee.branch_id,
        work_days: [1],
        weekday: 1,
        specific_date: "2026-07-27",
        expected_start_time: "09:00",
        expected_end_time: "18:00",
        expected_daily_minutes: 480,
        expected_lunch_minutes: 60,
        effective_from: "2026-07-27",
        effective_until: "2026-07-27",
        active: true,
        priority: -1000,
        source_type: "published"
      }]
    });

    expect(result.expected).toBe(true);
    expect(result.source).toBe("published_schedule");
    expect(result.expected_start_time).toBe("09:00");
  });

  it("permite folga publicada como decisão operacional explícita", () => {
    const result = resolveExpectedJourney({
      employee,
      dateKey: "2026-07-28",
      schedules: [{
        id: "44444444-4444-4444-8444-444444444444",
        employee_id: employee.id,
        branch_id: employee.branch_id,
        work_days: [2],
        weekday: 2,
        specific_date: "2026-07-28",
        expected_start_time: "00:00",
        expected_end_time: "00:00",
        expected_daily_minutes: 0,
        expected_lunch_minutes: 0,
        effective_from: "2026-07-28",
        effective_until: "2026-07-28",
        active: true,
        priority: -1000,
        source_type: "published",
        is_day_off: true
      }]
    });

    expect(result.expected).toBe(false);
    expect(result.source).toBe("published_schedule");
  });
});
