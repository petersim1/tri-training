import type { PlannedWorkoutWithCompleted } from "~/lib/db/schema";
import { plannedDistanceToKm } from "~/lib/plans/cardio-targets";
import {
  completedWorkoutDistanceM,
  completedWorkoutMovingSeconds,
} from "~/lib/plans/completed-workout-data";

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
    const mov = cw ? completedWorkoutMovingSeconds(cw) : null;
    if (cw && mov != null && Number.isFinite(mov)) {
      timeMin = mov / 60;
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
    const dm = completedWorkoutDistanceM(cw);
    if (dm != null && Number.isFinite(dm)) {
      distanceKm = dm / 1000;
    }
    const mov = completedWorkoutMovingSeconds(cw);
    if (mov != null && Number.isFinite(mov)) {
      timeMin = mov / 60;
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

/** Sum multiple completed workouts on the same calendar day into one point. */
function aggregateActivityPlotPointsByDay(
  points: ActivityPlotPoint[],
): ActivityPlotPoint[] {
  const map = new Map<
    string,
    { ids: string[]; distanceKm: number; timeMin: number }
  >();
  for (const p of points) {
    let cur = map.get(p.dayKey);
    if (!cur) {
      cur = { ids: [], distanceKm: 0, timeMin: 0 };
      map.set(p.dayKey, cur);
    }
    cur.ids.push(p.id);
    if (p.distanceKm != null && Number.isFinite(p.distanceKm)) {
      cur.distanceKm += p.distanceKm;
    }
    if (p.timeMin != null && Number.isFinite(p.timeMin)) {
      cur.timeMin += p.timeMin;
    }
  }
  const out: ActivityPlotPoint[] = [];
  for (const [dayKey, v] of map) {
    const distanceKm =
      v.distanceKm > 0 && Number.isFinite(v.distanceKm) ? v.distanceKm : null;
    const timeMin =
      v.timeMin > 0 && Number.isFinite(v.timeMin) ? v.timeMin : null;
    if (distanceKm == null && timeMin == null) {
      continue;
    }
    out.push({
      id: v.ids.join("+"),
      dayKey,
      distanceKm,
      timeMin,
    });
  }
  return out.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

/** Completed plans with metrics from linked session or planned targets when not linked. */
export function buildActivityPlotPoints(
  plans: PlannedWorkoutWithCompleted[],
  kind: ActivityPlotKind,
  from: string | undefined,
  to: string | undefined,
): ActivityPlotPoint[] {
  const rows = plans
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

  return aggregateActivityPlotPointsByDay(rows);
}
