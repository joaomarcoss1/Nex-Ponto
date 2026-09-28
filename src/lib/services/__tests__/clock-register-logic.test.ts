import { beforeAll, describe, expect, it } from "vitest";
import {
  blockReasonMessage,
  buildDuplicateResponse,
  evaluateBlockingConditions,
  evaluateScheduleCompliance
} from "@/lib/services/clock-register-logic";

beforeAll(() => {
  process.env.RECEIPT_TOKEN_SECRET ||= "test-only-receipt-token-secret-0123456789";
});

describe("buildDuplicateResponse", () => {
  it("exposes a receipt link derived from the entry id", () => {
    const response = buildDuplicateResponse({
      id: "entry-1",
      distance_meters: 12,
      validation_radius_meters: 100,
      gps_accuracy_meters: 8,
      inside_allowed_radius: true,
      status: "valid"
    });
    expect(response.receiptAvailable).toBe(true);
    expect(response.receiptUrl).toContain("entryId=entry-1");
    expect(response.status).toBe("valid");
  });
});

describe("evaluateBlockingConditions", () => {
  const baseInput = {
    devicePolicy: { review: false },
    poorAccuracy: false,
    blockPoorGpsAccuracy: false,
    inside: true,
    allowOutsideRadiusReview: false,
    action: "start_shift" as const,
    sessionEntries: [],
    branchOpen: true,
    outsideHoursPolicy: "justify"
  };

  it("has no block reason and no flags on a clean attempt", () => {
    const result = evaluateBlockingConditions(baseInput);
    expect(result.blockReason).toBeNull();
    expect(result.reviewFlags).toEqual([]);
  });

  it("blocks outside_radius when outside the radius and reviews are not allowed", () => {
    const result = evaluateBlockingConditions({ ...baseInput, inside: false, allowOutsideRadiusReview: false });
    expect(result.blockReason).toBe("outside_radius");
  });

  it("flags (does not block) outside_radius when reviews are allowed", () => {
    const result = evaluateBlockingConditions({ ...baseInput, inside: false, allowOutsideRadiusReview: true });
    expect(result.blockReason).toBeNull();
  });

  it("flags new_or_untrusted_device without blocking", () => {
    const result = evaluateBlockingConditions({ ...baseInput, devicePolicy: { review: true } });
    expect(result.blockReason).toBeNull();
    expect(result.reviewFlags).toContain("new_or_untrusted_device");
  });

  it("blocks outside_operating_hours on start_shift when the policy is 'block'", () => {
    const result = evaluateBlockingConditions({ ...baseInput, branchOpen: false, outsideHoursPolicy: "block" });
    expect(result.blockReason).toBe("outside_operating_hours");
  });

  it("only flags (does not block) outside_operating_hours when the policy is 'justify'", () => {
    const result = evaluateBlockingConditions({ ...baseInput, branchOpen: false, outsideHoursPolicy: "justify" });
    expect(result.blockReason).toBeNull();
    expect(result.reviewFlags).toContain("outside_operating_hours");
  });

  it("does not apply the outside_operating_hours check on actions other than start_shift", () => {
    const inProgressEntries = [{ action: "start_shift" as const, entry_timestamp: "2026-01-01T09:00:00Z", status: "valid" as const }];
    const result = evaluateBlockingConditions({
      ...baseInput,
      action: "end_shift",
      sessionEntries: inProgressEntries,
      branchOpen: false,
      outsideHoursPolicy: "block"
    });
    expect(result.blockReason).toBeNull();
  });

  it("blocks out_of_order when the action is not the next allowed one", () => {
    const entries = [
      { action: "start_shift" as const, entry_timestamp: "2026-01-01T12:00:00Z", status: "valid" as const },
      { action: "end_shift" as const, entry_timestamp: "2026-01-01T20:00:00Z", status: "valid" as const }
    ];
    const result = evaluateBlockingConditions({ ...baseInput, action: "start_shift", sessionEntries: entries });
    expect(result.blockReason).toBe("out_of_order");
  });
});

describe("blockReasonMessage", () => {
  const context = { gpsAccuracy: 150, maxAccuracy: 100, distance: 500, allowedRadius: 200, sessionEntries: [] };

  it("mentions both accuracy values for poor_gps_accuracy", () => {
    expect(blockReasonMessage("poor_gps_accuracy", context)).toContain("150m > 100m");
  });

  it("mentions distance and radius for outside_radius", () => {
    const message = blockReasonMessage("outside_radius", context);
    expect(message).toContain("500m");
    expect(message).toContain("200m");
  });

  it("falls back to a generic message for an unknown reason", () => {
    expect(blockReasonMessage("something_else", context)).toBe("Tentativa de ponto bloqueada.");
  });
});

describe("evaluateScheduleCompliance", () => {
  const baseInput = {
    action: "start_shift" as const,
    registeredMinutes: 9 * 60,
    timestamp: "2026-01-01T12:00:00Z",
    journey: {},
    lunchTolerance: 15,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    sessionEntries: []
  };

  it("reports ok with no lateness/early-leave", () => {
    const result = evaluateScheduleCompliance(baseInput);
    expect(result.scheduleComplianceStatus).toBe("ok");
    expect(result.lunchVariationMinutes).toBe(0);
    expect(result.reviewFlags).toEqual([]);
  });

  it("reports late when lateMinutes > 0 on start_shift", () => {
    const result = evaluateScheduleCompliance({ ...baseInput, lateMinutes: 20 });
    expect(result.scheduleComplianceStatus).toBe("late");
  });

  it("reports early_leave when earlyLeaveMinutes > 0 on end_shift", () => {
    const result = evaluateScheduleCompliance({ ...baseInput, action: "end_shift", earlyLeaveMinutes: 10 });
    expect(result.scheduleComplianceStatus).toBe("early_leave");
  });

  it("flags break_early when starting lunch well before the expected time", () => {
    const result = evaluateScheduleCompliance({
      ...baseInput,
      action: "start_lunch",
      registeredMinutes: 11 * 60,
      journey: { expected_lunch_start_time: "12:00" }
    });
    expect(result.scheduleComplianceStatus).toBe("break_early");
    expect(result.lunchVariationMinutes).toBe(60);
    expect(result.reviewFlags).toContain("break_early");
  });

  it("flags break_long when the lunch break overruns the expected duration", () => {
    const result = evaluateScheduleCompliance({
      ...baseInput,
      action: "end_lunch",
      timestamp: "2026-01-01T13:30:00Z",
      journey: { expected_lunch_minutes: 60 },
      sessionEntries: [{ action: "start_lunch", entry_timestamp: "2026-01-01T12:00:00Z", status: "valid" }]
    });
    expect(result.scheduleComplianceStatus).toBe("break_long");
    expect(result.lunchVariationMinutes).toBe(30);
    expect(result.reviewFlags).toContain("break_long");
  });
});
