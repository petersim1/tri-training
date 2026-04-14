/** Allowed values for `planned_workouts.distance_units`. */
export const CARDIO_DISTANCE_UNITS = ["km", "mi", "m", "yd"] as const;
export type CardioDistanceUnit = (typeof CARDIO_DISTANCE_UNITS)[number];

export function isCardioKind(kind: string): boolean {
  return kind === "run" || kind === "bike" || kind === "swim";
}

/** Convert stored planned distance + units to kilometers (for charts). */
export function plannedDistanceToKm(
  distance: number | null,
  distanceUnits: string | null,
): number | null {
  if (distance == null || !Number.isFinite(distance) || distance < 0) {
    return null;
  }
  const u = (distanceUnits ?? "").trim().toLowerCase();
  if (u === "" || u === "km") {
    return distance;
  }
  if (u === "mi") {
    return distance * 1.609344;
  }
  if (u === "m") {
    return distance / 1000;
  }
  if (u === "yd") {
    return distance * 0.0009144;
  }
  return null;
}
