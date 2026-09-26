export type SessionAttendanceEntryV51 = {
  id: string;
  workSessionId: string;
  action: "start_shift" | "start_lunch" | "end_lunch" | "end_shift";
  occurredAt: string;
  status: string;
  lateMinutes?: number | null;
  earlyLeaveMinutes?: number | null;
};

export type SessionAttendanceInputV51 = {
  id: string;
  workDate: string;
  status: string;
  scheduleSnapshot: Record<string, unknown> | null;
};

export type SessionAttendanceResultV51 = {
  expectedMinutes: number;
  workedMinutes: number;
  unpaidBreakMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  completedSessions: number;
  incompleteSessions: number;
  divergences: Array<{ code: string; severity: "warning" | "critical"; message: string; sessionId: string }>;
};

function timestampMinutes(start: string, end: string): number {
  const startValue = Date.parse(start);
  const endValue = Date.parse(end);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || endValue < startValue) return 0;
  return Math.floor((endValue - startValue) / 60_000);
}

function snapshotExpectedMinutes(snapshot: Record<string, unknown> | null): number {
  if (!snapshot) return 0;
  const value = snapshot.expectedDailyMinutes ?? snapshot.expected_daily_minutes;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

export function calculateSessionAttendanceV51(
  sessions: SessionAttendanceInputV51[],
  entries: SessionAttendanceEntryV51[],
): SessionAttendanceResultV51 {
  const entriesBySession = new Map<string, SessionAttendanceEntryV51[]>();
  for (const entry of entries) {
    const list = entriesBySession.get(entry.workSessionId) ?? [];
    list.push(entry);
    entriesBySession.set(entry.workSessionId, list);
  }

  let expectedMinutes = 0;
  let workedMinutes = 0;
  let unpaidBreakMinutes = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let completedSessions = 0;
  let incompleteSessions = 0;
  const divergences: SessionAttendanceResultV51["divergences"] = [];

  for (const session of sessions) {
    expectedMinutes += snapshotExpectedMinutes(session.scheduleSnapshot);
    const sessionEntries = (entriesBySession.get(session.id) ?? []).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const clockIn = sessionEntries.find((entry) => entry.action === "start_shift");
    const clockOut = [...sessionEntries].reverse().find((entry) => entry.action === "end_shift");
    lateMinutes += Math.max(0, Number(clockIn?.lateMinutes ?? 0));
    earlyLeaveMinutes += Math.max(0, Number(clockOut?.earlyLeaveMinutes ?? 0));

    if (!clockIn || !clockOut) {
      incompleteSessions += 1;
      divergences.push({ code: "INCOMPLETE_WORK_SESSION", severity: "critical", message: `A jornada de ${session.workDate} não possui entrada e saída completas.`, sessionId: session.id });
      continue;
    }

    let breakStart: SessionAttendanceEntryV51 | null = null;
    let sessionBreakMinutes = 0;
    for (const entry of sessionEntries) {
      if (entry.action === "start_lunch") {
        if (breakStart) divergences.push({ code: "DUPLICATE_BREAK_START", severity: "warning", message: `A jornada de ${session.workDate} possui duas saídas de intervalo consecutivas.`, sessionId: session.id });
        breakStart = entry;
      } else if (entry.action === "end_lunch") {
        if (!breakStart) {
          divergences.push({ code: "BREAK_END_WITHOUT_START", severity: "warning", message: `A jornada de ${session.workDate} possui retorno sem saída de intervalo.`, sessionId: session.id });
        } else {
          sessionBreakMinutes += timestampMinutes(breakStart.occurredAt, entry.occurredAt);
          breakStart = null;
        }
      }
    }
    if (breakStart) divergences.push({ code: "OPEN_BREAK", severity: "critical", message: `A jornada de ${session.workDate} possui intervalo sem retorno.`, sessionId: session.id });

    const grossMinutes = timestampMinutes(clockIn.occurredAt, clockOut.occurredAt);
    unpaidBreakMinutes += sessionBreakMinutes;
    workedMinutes += Math.max(0, grossMinutes - sessionBreakMinutes);
    completedSessions += 1;
  }

  return { expectedMinutes, workedMinutes, unpaidBreakMinutes, lateMinutes, earlyLeaveMinutes, completedSessions, incompleteSessions, divergences };
}
