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

/** Human-readable duration for planned cardio `time_seconds`. */
export function formatTargetDurationSec(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${sec}s`;
}

export type PlannedCardioTargetsShape = {
  kind: string;
  distance: number | null;
  distanceUnits: string | null;
  timeSeconds: number | null;
};

/** Distance + duration targets for display (run / bike / swim plans). */
export function formatPlannedCardioTargets(
  p: PlannedCardioTargetsShape,
): string | null {
  if (!isCardioKind(p.kind)) {
    return null;
  }
  const parts: string[] = [];
  if (p.distance != null && Number.isFinite(p.distance)) {
    const u = (p.distanceUnits ?? "").trim();
    parts.push(u !== "" ? `${p.distance} ${u}` : String(p.distance));
  }
  if (p.timeSeconds != null && p.timeSeconds > 0) {
    parts.push(formatTargetDurationSec(p.timeSeconds));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
