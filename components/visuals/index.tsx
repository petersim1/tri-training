import type { PlannedWorkoutWithCompleted } from "@/lib/db/schema.server";
import { plannedDistanceToKm } from "@/lib/plans/cardio-targets";
import {
  completedWorkoutAverageHeartrateBpm,
  completedWorkoutDistanceM,
  completedWorkoutHevyLiftVolumeKgReps,
  completedWorkoutMovingSeconds,
} from "@/lib/plans/completed-workout-data";
import type { StravaActivitySummary } from "@/lib/strava/types";

export type ActivityPlotKind = "run" | "bike" | "swim" | "lift";

export type ActivityPlotPoint = {
  id: string;
  dayKey: string;
  /** km; null for lift or missing */
  distanceKm: number | null;
  /** minutes from moving time; null if missing */
  timeMin: number | null;
  /**
   * Strava: Σ (avg HR BPM × minutes per session) ≈ total heartbeats for the day;
   * efficiency chart plots `distanceKm×1000 / this` ⇒ m/beat.
   */
  hrBpmMinProduct: number | null;
  /** Lift Hevy: Σ (effective kg × reps) from `exercises[].sets[]`; null otherwise. */
  liftVolumeKgReps: number | null;
};

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
    {
      ids: string[];
      distanceKm: number;
      timeMin: number;
      liftVolumeKgReps: number;
    }
  >();
  for (const p of points) {
    let cur = map.get(p.dayKey);
    if (!cur) {
      cur = {
        ids: [],
        distanceKm: 0,
        timeMin: 0,
        liftVolumeKgReps: 0,
      };
      map.set(p.dayKey, cur);
    }
    cur.ids.push(p.id);
    if (p.distanceKm != null && Number.isFinite(p.distanceKm)) {
      cur.distanceKm += p.distanceKm;
    }
    if (p.timeMin != null && Number.isFinite(p.timeMin)) {
      cur.timeMin += p.timeMin;
    }
    if (p.liftVolumeKgReps != null && Number.isFinite(p.liftVolumeKgReps)) {
      cur.liftVolumeKgReps += p.liftVolumeKgReps;
    }
  }
  const out: ActivityPlotPoint[] = [];
  for (const [dayKey, v] of map) {
    const distanceKm =
      v.distanceKm > 0 && Number.isFinite(v.distanceKm) ? v.distanceKm : null;
    const timeMin =
      v.timeMin > 0 && Number.isFinite(v.timeMin) ? v.timeMin : null;
    const liftVolumeKgReps =
      v.liftVolumeKgReps > 0 && Number.isFinite(v.liftVolumeKgReps)
        ? v.liftVolumeKgReps
        : null;
    if (distanceKm == null && timeMin == null && liftVolumeKgReps == null) {
      continue;
    }
    out.push({
      id: v.ids.join("+"),
      dayKey,
      distanceKm,
      timeMin,
      hrBpmMinProduct: null,
      liftVolumeKgReps,
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
  opts?: { surrogateBodyWeightKg?: number | null },
): ActivityPlotPoint[] {
  const surrogateKg = opts?.surrogateBodyWeightKg ?? null;
  const rows = plans
    .filter((p) => {
      if (p.status !== "completed") {
        return false;
      }
      if (p.kind !== kind) {
        return false;
      }
      const dk = p.dayKey;
      if (from && dk < from) {
        return false;
      }
      if (to && dk > to) {
        return false;
      }
      return true;
    })
    .map((p): ActivityPlotPoint | null => {
      const { distanceKm, timeMin } = metricsForPlan(p, kind);
      if (kind === "lift") {
        const cw = p.completedWorkout;
        const vol =
          cw && cw.vendor === "hevy"
            ? completedWorkoutHevyLiftVolumeKgReps(cw, surrogateKg)
            : null;
        const hasTime = timeMin != null && Number.isFinite(timeMin);
        const hasVol = vol != null && Number.isFinite(vol) && vol > 0;
        if (!hasTime && !hasVol) {
          return null;
        }
        return {
          id: p.id,
          dayKey: p.dayKey,
          distanceKm: null,
          timeMin: hasTime ? timeMin : null,
          hrBpmMinProduct: null,
          liftVolumeKgReps: hasVol ? vol : null,
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
        dayKey: p.dayKey,
        distanceKm,
        timeMin,
        hrBpmMinProduct: null,
        liftVolumeKgReps: null,
      };
    })
    .filter((row): row is ActivityPlotPoint => row != null);

  return aggregateActivityPlotPointsByDay(rows);
}

/** Sum Strava-linked points on the same day (distance, time, Σ(HR×min)). */
function aggregateStravaEfficiencyByDay(
  points: ActivityPlotPoint[],
): ActivityPlotPoint[] {
  const map = new Map<
    string,
    {
      ids: string[];
      distanceKm: number;
      timeMin: number;
      hrBpmMinProduct: number;
    }
  >();
  for (const p of points) {
    let cur = map.get(p.dayKey);
    if (!cur) {
      cur = { ids: [], distanceKm: 0, timeMin: 0, hrBpmMinProduct: 0 };
      map.set(p.dayKey, cur);
    }
    cur.ids.push(p.id);
    if (p.distanceKm != null && Number.isFinite(p.distanceKm)) {
      cur.distanceKm += p.distanceKm;
    }
    if (p.timeMin != null && Number.isFinite(p.timeMin)) {
      cur.timeMin += p.timeMin;
    }
    if (
      p.hrBpmMinProduct != null &&
      Number.isFinite(p.hrBpmMinProduct) &&
      p.hrBpmMinProduct > 0
    ) {
      cur.hrBpmMinProduct += p.hrBpmMinProduct;
    }
  }
  const out: ActivityPlotPoint[] = [];
  for (const [dayKey, v] of map) {
    const distanceKm =
      v.distanceKm > 0 && Number.isFinite(v.distanceKm) ? v.distanceKm : null;
    const timeMin =
      v.timeMin > 0 && Number.isFinite(v.timeMin) ? v.timeMin : null;
    const hrBpmMinProduct =
      v.hrBpmMinProduct > 0 && Number.isFinite(v.hrBpmMinProduct)
        ? v.hrBpmMinProduct
        : null;
    if (distanceKm == null && timeMin == null) {
      continue;
    }
    out.push({
      id: v.ids.join("+"),
      dayKey,
      distanceKm,
      timeMin,
      hrBpmMinProduct,
      liftVolumeKgReps: null,
    });
  }
  return out.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

/**
 * Strava-linked completed cardio only (no planned fallbacks).
 * `efficiency`: distance (m) divided by estimated total beats, Σ(avg BPM × moving min) per day.
 */
export function buildStravaEfficiencyPlotPoints(
  plans: PlannedWorkoutWithCompleted[],
  kind: ActivityPlotKind,
  from: string | undefined,
  to: string | undefined,
): ActivityPlotPoint[] {
  if (kind === "lift") {
    return [];
  }
  const rows = plans
    .filter((p) => {
      if (p.status !== "completed" || p.kind !== kind) {
        return false;
      }
      if (p.completedWorkout?.vendor !== "strava") {
        return false;
      }
      const dk = p.dayKey;
      if (from && dk < from) {
        return false;
      }
      if (to && dk > to) {
        return false;
      }
      return true;
    })
    .map((p): ActivityPlotPoint | null => {
      const cw = p.completedWorkout;
      if (!cw) {
        return null;
      }
      const strava = cw.data as StravaActivitySummary;
      if (strava.has_heartrate === false) {
        return null;
      }
      const dm = completedWorkoutDistanceM(cw);
      const mov = completedWorkoutMovingSeconds(cw);
      const hr = completedWorkoutAverageHeartrateBpm(cw);
      const distanceKm = dm != null && Number.isFinite(dm) ? dm / 1000 : null;
      const timeMin = mov != null && Number.isFinite(mov) ? mov / 60 : null;
      if (
        (distanceKm == null || !Number.isFinite(distanceKm)) &&
        (timeMin == null || !Number.isFinite(timeMin))
      ) {
        return null;
      }
      const hrBpmMinProduct =
        hr != null && timeMin != null && Number.isFinite(timeMin) && timeMin > 0
          ? hr * timeMin
          : null;
      return {
        id: p.id,
        dayKey: p.dayKey,
        distanceKm,
        timeMin,
        hrBpmMinProduct,
        liftVolumeKgReps: null,
      };
    })
    .filter((row): row is ActivityPlotPoint => row != null);

  return aggregateStravaEfficiencyByDay(rows);
}
