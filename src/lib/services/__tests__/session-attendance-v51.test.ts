import { describe, expect, it } from "vitest";
import { calculateSessionAttendanceV51 } from "@/lib/services/session-attendance-v51";

describe("session attendance v5.1", () => {
  it("inclui saída ocorrida no mês seguinte quando pertence à sessão", () => {
    const result = calculateSessionAttendanceV51(
      [{ id: "session-1", workDate: "2026-07-31", status: "completed", scheduleSnapshot: { expectedDailyMinutes: 420 } }],
      [
        { id: "in", workSessionId: "session-1", action: "start_shift", occurredAt: "2026-08-01T01:00:00.000Z", status: "valid" },
        { id: "break-start", workSessionId: "session-1", action: "start_lunch", occurredAt: "2026-08-01T05:00:00.000Z", status: "valid" },
        { id: "break-end", workSessionId: "session-1", action: "end_lunch", occurredAt: "2026-08-01T06:00:00.000Z", status: "valid" },
        { id: "out", workSessionId: "session-1", action: "end_shift", occurredAt: "2026-08-01T09:00:00.000Z", status: "valid" },
      ],
    );
    expect(result.workedMinutes).toBe(420);
    expect(result.incompleteSessions).toBe(0);
  });

  it("gera divergência crítica para jornada incompleta", () => {
    const result = calculateSessionAttendanceV51(
      [{ id: "session-2", workDate: "2026-07-10", status: "open", scheduleSnapshot: { expectedDailyMinutes: 480 } }],
      [{ id: "in", workSessionId: "session-2", action: "start_shift", occurredAt: "2026-07-10T11:00:00.000Z", status: "valid" }],
    );
    expect(result.incompleteSessions).toBe(1);
    expect(result.divergences[0]?.code).toBe("INCOMPLETE_WORK_SESSION");
  });
});
