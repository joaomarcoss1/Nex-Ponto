import { describe, expect, it } from "vitest";
import { assessClockRisk } from "@/lib/security/antifraud";

const base = {
  deviceReview: false,
  gpsAccuracyMeters: 10,
  maximumGpsAccuracyMeters: 100,
  insideAllowedRadius: true,
  distanceMeters: 20,
  latitude: -3.73,
  longitude: -38.52,
  timestamp: "2026-07-29T12:00:00.000Z",
};

describe("assessClockRisk", () => {
  it("classifica uma marcação normal como baixo risco", () => {
    expect(assessClockRisk(base)).toEqual({
      score: 0,
      level: "low",
      signals: [],
      requiresReview: false,
    });
  });

  it("sinaliza dispositivo novo e geofence", () => {
    const result = assessClockRisk({
      ...base,
      deviceReview: true,
      insideAllowedRadius: false,
      distanceMeters: 6_000,
    });
    expect(result.level).toBe("high");
    expect(result.signals).toEqual(["new_or_untrusted_device", "outside_geofence"]);
  });

  it("detecta deslocamento fisicamente incompatível", () => {
    const result = assessClockRisk({
      ...base,
      previousEntry: {
        latitude: -23.55,
        longitude: -46.63,
        timestamp: "2026-07-29T11:45:00.000Z",
      },
    });
    expect(result.signals).toContain("impossible_travel");
    expect(result.requiresReview).toBe(true);
  });
});
