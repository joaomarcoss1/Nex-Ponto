export type ClockRiskInput = {
  deviceReview: boolean;
  gpsAccuracyMeters: number | null;
  maximumGpsAccuracyMeters: number;
  insideAllowedRadius: boolean;
  distanceMeters: number;
  previousEntry?: {
    latitude: number | null;
    longitude: number | null;
    timestamp: string;
  } | null;
  latitude: number;
  longitude: number;
  timestamp: string;
};

export type ClockRiskAssessment = {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  signals: string[];
  requiresReview: boolean;
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371;
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function assessClockRisk(input: ClockRiskInput): ClockRiskAssessment {
  let score = 0;
  const signals: string[] = [];

  if (input.deviceReview) {
    score += 25;
    signals.push("new_or_untrusted_device");
  }
  if (!input.insideAllowedRadius) {
    score += input.distanceMeters > 5_000 ? 45 : 30;
    signals.push("outside_geofence");
  }
  if (
    input.gpsAccuracyMeters !== null &&
    input.gpsAccuracyMeters > input.maximumGpsAccuracyMeters
  ) {
    score += 20;
    signals.push("poor_gps_accuracy");
  }

  const previous = input.previousEntry;
  if (
    previous &&
    Number.isFinite(previous.latitude) &&
    Number.isFinite(previous.longitude)
  ) {
    const elapsedHours = Math.max(
      1 / 60,
      (new Date(input.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 3_600_000,
    );
    const travelledKm = distanceKm(
      Number(previous.latitude),
      Number(previous.longitude),
      input.latitude,
      input.longitude,
    );
    const impliedSpeedKmh = travelledKm / elapsedHours;
    if (travelledKm >= 10 && impliedSpeedKmh > 180) {
      score += 55;
      signals.push("impossible_travel");
    }
  }

  const boundedScore = Math.min(100, score);
  const level =
    boundedScore >= 80
      ? "critical"
      : boundedScore >= 50
        ? "high"
        : boundedScore >= 25
          ? "medium"
          : "low";

  return {
    score: boundedScore,
    level,
    signals,
    requiresReview: boundedScore >= 25,
  };
}
