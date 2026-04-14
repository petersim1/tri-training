import type { PlannedWorkoutWithCompleted } from "~/lib/db/schema";
import { plannedDistanceToKm } from "~/lib/plans/cardio-targets";

export type ActivityPlotKind = "run" | "bike" | "swim" | "lift";

export type ActivityPlotPoint = {
  id: string;
  dayKey: string;
  /** km; null for lift or missing */
  distanceKm: number | null;
  /** minutes from moving time; null if missing */
  timeMin: number | null;
};

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function metricsForPlan(
  p: PlannedWorkoutWithCompleted,
  kind: ActivityPlotKind,
): { distanceKm: number | null; timeMin: number | null } {
  const cw = p.completedWorkout;

  if (kind === "lift") {
    let timeMin: number | null = null;
    if (
      cw &&
      cw.movingTimeSeconds != null &&
      Number.isFinite(cw.movingTimeSeconds)
    ) {
      timeMin = cw.movingTimeSeconds / 60;
    } else if (
      p.timeSeconds != null &&
      Number.isFinite(p.timeSeconds) &&
      p.timeSeconds > 0
    ) {
      timeMin = p.timeSeconds / 60;
    }
    return { distanceKm: null, timeMin };
  }

  let distanceKm: number | null = null;
  let timeMin: number | null = null;

  if (cw) {
    if (cw.distanceM != null && Number.isFinite(cw.distanceM)) {
      distanceKm = cw.distanceM / 1000;
    }
    if (cw.movingTimeSeconds != null && Number.isFinite(cw.movingTimeSeconds)) {
      timeMin = cw.movingTimeSeconds / 60;
    }
  }
  if (distanceKm == null) {
    distanceKm = plannedDistanceToKm(p.distance, p.distanceUnits);
  }
  if (
    timeMin == null &&
    p.timeSeconds != null &&
    Number.isFinite(p.timeSeconds) &&
    p.timeSeconds > 0
  ) {
    timeMin = p.timeSeconds / 60;
  }

  return { distanceKm, timeMin };
}

/** Completed plans with metrics from linked session or planned targets when not linked. */
export function buildActivityPlotPoints(
  plans: PlannedWorkoutWithCompleted[],
  kind: ActivityPlotKind,
  from: string | undefined,
  to: string | undefined,
): ActivityPlotPoint[] {
  return plans
    .filter((p) => {
      if (p.status !== "completed") {
        return false;
      }
      if (p.kind !== kind) {
        return false;
      }
      const dk = localDayKey(p.scheduledAt);
      if (from && dk < from) {
        return false;
      }
      if (to && dk > to) {
        return false;
      }
      return true;
    })
    .map((p) => {
      const { distanceKm, timeMin } = metricsForPlan(p, kind);
      if (kind === "lift") {
        if (timeMin == null || !Number.isFinite(timeMin)) {
          return null;
        }
        return {
          id: p.id,
          dayKey: localDayKey(p.scheduledAt),
          distanceKm: null,
          timeMin,
        };
      }
      if (
        (distanceKm == null || !Number.isFinite(distanceKm)) &&
        (timeMin == null || !Number.isFinite(timeMin))
      ) {
        return null;
      }
      return {
        id: p.id,
        dayKey: localDayKey(p.scheduledAt),
        distanceKm,
        timeMin,
      };
    })
    .filter((row): row is ActivityPlotPoint => row != null);
}
