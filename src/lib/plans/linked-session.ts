import type { HevyWorkoutSummary } from "~/lib/activities/types";
import type { CompletedWorkoutRow, WorkoutVendor } from "~/lib/db/schema";
import type { StravaActivitySummary } from "~/lib/strava/types";

/** Sent when linking — mirrors the candidate row; server attaches existing `completed_workouts` by vendor + id. */
export type LinkedSessionPayload = {
  vendor: WorkoutVendor;
  externalId: string;
  title?: string | null;
  distanceM?: number | null;
  movingTimeSeconds?: number | null;
  elapsedTimeSeconds?: number | null;
  calories?: number | null;
  /** Hevy: optional; server can derive duration when times are missing */
  startTimeIso?: string | null;
  endTimeIso?: string | null;
};

export function durationSecondsFromIsoRange(
  startIso: string | undefined,
  endIso: string | undefined,
): number | null {
  if (!startIso?.trim() || !endIso?.trim()) {
    return null;
  }
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return Math.max(0, Math.floor((b - a) / 1000));
}

export function linkedSessionFromStravaActivity(
  a: StravaActivitySummary,
): LinkedSessionPayload {
  const id = String(a.id);
  const distanceM =
    a.distance != null && Number.isFinite(a.distance) ? a.distance : null;
  const moving =
    a.moving_time != null && Number.isFinite(a.moving_time)
      ? Math.floor(a.moving_time)
      : null;
  const elapsed =
    a.elapsed_time != null && Number.isFinite(a.elapsed_time)
      ? Math.floor(a.elapsed_time)
      : null;
  const calories =
    a.calories != null && Number.isFinite(a.calories) ? a.calories : null;
  return {
    vendor: "strava",
    externalId: id,
    title: a.name?.trim() ? a.name : null,
    distanceM,
    movingTimeSeconds: moving,
    elapsedTimeSeconds: elapsed,
    calories,
  };
}

export function linkedSessionFromHevyWorkout(
  w: HevyWorkoutSummary,
): LinkedSessionPayload {
  const id = w.id?.trim();
  if (!id) {
    throw new Error("Hevy workout id required");
  }
  const fromRange = durationSecondsFromIsoRange(w.start_time, w.end_time);
  return {
    vendor: "hevy",
    externalId: id,
    title: w.title?.trim() ? w.title : null,
    distanceM: null,
    movingTimeSeconds: fromRange,
    elapsedTimeSeconds: fromRange,
    calories: null,
    startTimeIso: w.start_time ?? null,
    endTimeIso: w.end_time ?? null,
  };
}

/**
 * Build `linkedSession` for `updatePlanFn` from a stored `completed_workouts` row
 * (same shape as linking from Strava/Hevy candidate lists).
 */
export function linkedSessionFromCompletedRow(
  c: CompletedWorkoutRow,
): LinkedSessionPayload {
  if (c.vendor === "strava") {
    const raw = c.data as unknown;
    if (raw && typeof raw === "object" && raw !== null && "id" in raw) {
      return linkedSessionFromStravaActivity(raw as StravaActivitySummary);
    }
    return {
      vendor: "strava",
      externalId: c.vendorId.trim(),
      title: null,
    };
  }
  const raw = c.data as unknown;
  if (raw && typeof raw === "object" && raw !== null) {
    const w = raw as HevyWorkoutSummary;
    const id = w.id?.trim() || c.vendorId.trim();
    if (id) {
      return linkedSessionFromHevyWorkout({ ...w, id });
    }
  }
  return {
    vendor: "hevy",
    externalId: c.vendorId.trim(),
    title: null,
  };
}
