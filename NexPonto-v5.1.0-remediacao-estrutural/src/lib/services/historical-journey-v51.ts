export type HistoricalScheduleSnapshot = {
  source: "published_occurrence" | "cycle" | "contract" | "clock_registration" | "legacy_fallback";
  version?: number | string | null;
  expectedDailyMinutes: number;
  startsAt?: string | null;
  endsAt?: string | null;
  intervals?: Array<{ type: string; minutes: number; paid?: boolean }>;
  timezone: string;
  checksum?: string | null;
};

export type WorkSessionFactV51 = {
  id: string;
  workDate: string;
  timezone: string;
  scheduleSnapshot?: Partial<HistoricalScheduleSnapshot> | null;
  scheduleSnapshotChecksum?: string | null;
};

export type HistoricalJourneyFallback = Omit<HistoricalScheduleSnapshot, "checksum">;

export type JourneyResolutionV51 = {
  journey: HistoricalScheduleSnapshot | null;
  source: "session_snapshot" | "published_occurrence" | "cycle" | "contract" | "divergence";
  divergence?: { code: string; message: string; critical: true };
};

function normalizeSnapshot(session: WorkSessionFactV51): HistoricalScheduleSnapshot | null {
  const raw = session.scheduleSnapshot as (Partial<HistoricalScheduleSnapshot> & Record<string, unknown>) | null | undefined;
  if (!raw) return null;
  const expected = Number(raw.expectedDailyMinutes ?? raw.expected_daily_minutes ?? Number.NaN);
  const timezone = typeof raw.timezone === "string" && raw.timezone ? raw.timezone : session.timezone;
  const source = typeof raw.source === "string" && raw.source ? raw.source as HistoricalScheduleSnapshot["source"] : "clock_registration";
  if (!Number.isFinite(expected) || expected < 0 || !timezone) return null;
  return {
    source,
    version: raw.version as number | string | null | undefined,
    expectedDailyMinutes: Math.round(expected),
    startsAt: (raw.startsAt ?? raw.expected_start_time ?? null) as string | null,
    endsAt: (raw.endsAt ?? raw.expected_end_time ?? null) as string | null,
    intervals: Array.isArray(raw.intervals) ? raw.intervals : [],
    timezone,
    checksum: session.scheduleSnapshotChecksum || raw.checksum || null,
  };
}

export function resolveHistoricalJourneyV51(params: {
  session: WorkSessionFactV51;
  publishedOccurrence?: HistoricalJourneyFallback | null;
  cycle?: HistoricalJourneyFallback | null;
  contract?: HistoricalJourneyFallback | null;
}): JourneyResolutionV51 {
  const { session, publishedOccurrence, cycle, contract } = params;
  const normalizedSnapshot = normalizeSnapshot(session);
  if (normalizedSnapshot) return { journey: normalizedSnapshot, source: "session_snapshot" };
  if (publishedOccurrence) return { journey: publishedOccurrence, source: "published_occurrence" };
  if (cycle) return { journey: cycle, source: "cycle" };
  if (contract) return { journey: contract, source: "contract" };
  return {
    journey: null,
    source: "divergence",
    divergence: { code: "HISTORICAL_JOURNEY_MISSING", message: `Não há fonte histórica confiável para a jornada de ${session.workDate}.`, critical: true },
  };
}

export type SessionEntryV51 = { id: string; workSessionId: string | null; occurredAt: string; action: string; status: string };

export function groupEntriesByWorkSessionV51(sessionIds: string[], entries: SessionEntryV51[]): Map<string, SessionEntryV51[]> {
  const allowed = new Set(sessionIds);
  const grouped = new Map<string, SessionEntryV51[]>();
  for (const entry of entries) {
    if (!entry.workSessionId || !allowed.has(entry.workSessionId)) continue;
    const bucket = grouped.get(entry.workSessionId) || [];
    bucket.push(entry);
    grouped.set(entry.workSessionId, bucket);
  }
  for (const bucket of grouped.values()) bucket.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return grouped;
}
