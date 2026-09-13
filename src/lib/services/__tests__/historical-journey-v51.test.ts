import { describe, expect, it } from "vitest";
import { groupEntriesByWorkSessionV51, resolveHistoricalJourneyV51 } from "@/lib/services/historical-journey-v51";

describe("historical journey v5.1", () => {
  it("prioritizes immutable session snapshot", () => {
    const result = resolveHistoricalJourneyV51({
      session: { id: "s1", workDate: "2026-07-31", timezone: "America/Fortaleza", scheduleSnapshotChecksum: "abc", scheduleSnapshot: { source: "published_occurrence", expectedDailyMinutes: 480, timezone: "America/Fortaleza" } },
      contract: { source: "contract", expectedDailyMinutes: 360, timezone: "America/Fortaleza" },
    });
    expect(result.source).toBe("session_snapshot");
    expect(result.journey?.expectedDailyMinutes).toBe(480);
  });

  it("normalizes locked legacy snapshot without reinterpreting current schedule", () => {
    const result = resolveHistoricalJourneyV51({
      session: { id: "legacy", workDate: "2026-06-30", timezone: "America/Fortaleza", scheduleSnapshotChecksum: "legacy-checksum", scheduleSnapshot: { expected_daily_minutes: 420, expected_start_time: "14:00", expected_end_time: "22:00" } as never },
    });
    expect(result.source).toBe("session_snapshot");
    expect(result.journey?.expectedDailyMinutes).toBe(420);
    expect(result.journey?.checksum).toBe("legacy-checksum");
  });

  it("returns critical divergence without historical source", () => {
    const result = resolveHistoricalJourneyV51({ session: { id: "s1", workDate: "2026-07-10", timezone: "America/Fortaleza" } });
    expect(result.source).toBe("divergence");
    expect(result.divergence?.critical).toBe(true);
  });

  it("groups entries by session even when clock-out is in next month", () => {
    const grouped = groupEntriesByWorkSessionV51(["s1"], [
      { id: "e2", workSessionId: "s1", occurredAt: "2026-08-01T06:00:00Z", action: "end_shift", status: "valid" },
      { id: "e1", workSessionId: "s1", occurredAt: "2026-07-31T22:00:00Z", action: "start_shift", status: "valid" },
    ]);
    expect(grouped.get("s1")?.map((entry) => entry.id)).toEqual(["e1", "e2"]);
  });
});
