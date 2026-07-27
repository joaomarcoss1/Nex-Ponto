import { describe, expect, it } from "vitest";
import { analyzeInconsistencies, calculateWorkedMinutes, getNextActions } from "@/lib/calculations";
import type { TimeEntry } from "@/types/domain";

function entry(id: string, action: TimeEntry["action"], timestamp: string, overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id,
    employee_id: "11111111-1111-4111-8111-111111111111",
    branch_id: "22222222-2222-4222-8222-222222222222",
    action,
    entry_timestamp: timestamp,
    entry_date: "2026-07-27",
    latitude: null,
    longitude: null,
    distance_meters: null,
    inside_allowed_radius: true,
    late_minutes: 0,
    early_leave_minutes: 0,
    required_justification: false,
    justification_text: null,
    device_info: null,
    status: "valid",
    review_flags: [],
    expected_start_time: "08:00",
    expected_end_time: "18:00",
    expected_daily_minutes: 480,
    expected_lunch_minutes: 90,
    ...overrides,
    occurrence_review_status: overrides.occurrence_review_status ?? "pending_review",
    occurrence_review_observation: overrides.occurrence_review_observation ?? null,
    occurrence_reviewed_by: overrides.occurrence_reviewed_by ?? null,
    occurrence_reviewed_at: overrides.occurrence_reviewed_at ?? null,
    original_entry_id: overrides.original_entry_id ?? null,
    adjusted_by: overrides.adjusted_by ?? null,
    adjusted_at: overrides.adjusted_at ?? null,
    adjustment_reason: overrides.adjustment_reason ?? null,
    created_at: overrides.created_at ?? timestamp
  };
}

const completeJourney = [
  entry("1", "start_shift", "2026-07-27T11:00:00.000Z"),
  entry("2", "start_lunch", "2026-07-27T15:00:00.000Z"),
  entry("3", "end_lunch", "2026-07-27T16:00:00.000Z"),
  entry("4", "start_lunch", "2026-07-27T18:00:00.000Z"),
  entry("5", "end_lunch", "2026-07-27T18:30:00.000Z"),
  entry("6", "end_shift", "2026-07-27T21:00:00.000Z")
];

describe("ponto v4 com múltiplos intervalos", () => {
  it("calcula o tempo trabalhado descontando todos os intervalos", () => {
    expect(calculateWorkedMinutes(completeJourney)).toBe(510);
  });

  it("permite iniciar outro intervalo depois de um retorno", () => {
    expect(getNextActions(completeJourney.slice(0, 3)).allowed).toEqual(["start_lunch", "end_shift"]);
    expect(getNextActions(completeJourney.slice(0, 4)).recommended).toBe("end_lunch");
  });

  it("não classifica intervalos repetidos e completos como duplicidade", () => {
    const inconsistencies = analyzeInconsistencies(completeJourney);
    expect(inconsistencies.some((item) => item.type === "ponto_duplicado")).toBe(false);
    expect(inconsistencies.some((item) => item.type === "ponto_fora_de_ordem")).toBe(false);
    expect(inconsistencies.some((item) => item.type === "intervalo_incompleto")).toBe(false);
  });

  it("ignora marcação cancelada na análise operacional", () => {
    const entries = [...completeJourney, entry("7", "start_shift", "2026-07-27T11:01:00.000Z", { status: "canceled" })];
    expect(analyzeInconsistencies(entries).some((item) => item.type === "ponto_duplicado")).toBe(false);
  });
});
