import type { HevyWorkoutSummary } from "~/lib/activities/types";
import type { CompletedWorkoutRow, JsonValue } from "~/lib/db/schema";
import type { LinkedSessionPayload } from "~/lib/plans/linked-session";
import { durationSecondsFromIsoRange } from "~/lib/plans/linked-session";
import type { StravaActivitySummary } from "~/lib/strava/types";

/** Full vendor payload as stored in `completed_workouts.data` (JSON). */
export type CompletedWorkoutJson =
  | StravaActivitySummary
  | HevyWorkoutSummary
  | Record<string, unknown>;

function stravaSportFromPlanKind(kind: string): string {
  switch (kind) {
    case "run":
      return "Run";
    case "bike":
      return "Ride";
    case "swim":
      return "Swim";
    default:
      return "Workout";
  }
}

export function stravaDataFromActivitySummary(
  a: StravaActivitySummary,
): JsonValue {
  return JSON.parse(JSON.stringify(a)) as JsonValue;
}

export function hevyDataFromWorkoutSummary(w: HevyWorkoutSummary): JsonValue {
  return JSON.parse(JSON.stringify(w)) as JsonValue;
}

/** When linking from UI we only have `LinkedSessionPayload` — store Strava-shaped JSON. */
export function stravaDataFromLinkedPayload(
  p: LinkedSessionPayload,
  ctx: { planKind: string; scheduledAtIso: string },
): JsonValue {
  return {
    id: Number(p.externalId),
    name: p.title ?? "",
    sport_type: stravaSportFromPlanKind(ctx.planKind),
    start_date: ctx.scheduledAtIso,
    distance: p.distanceM ?? 0,
    moving_time: p.movingTimeSeconds ?? 0,
    elapsed_time: p.elapsedTimeSeconds ?? p.movingTimeSeconds ?? 0,
    calories: p.calories ?? 0,
  };
}

export function hevyDataFromLinkedPayload(p: LinkedSessionPayload): JsonValue {
  return {
    id: p.externalId,
    title: p.title ?? "",
    start_time: p.startTimeIso ?? null,
    end_time: p.endTimeIso ?? null,
  };
}

function asStravaData(data: unknown): StravaActivitySummary | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== "number" && typeof id !== "string") {
    return null;
  }
  return data as StravaActivitySummary;
}

function asHevyData(data: unknown): HevyWorkoutSummary | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  return data as HevyWorkoutSummary;
}

export function completedWorkoutTitle(c: CompletedWorkoutRow): string | null {
  const data = c.data;
  if (c.vendor === "strava") {
    const a = asStravaData(data);
    const n = a?.name?.trim();
    return n ? n : null;
  }
  const w = asHevyData(data);
  const t = w?.title?.trim();
  return t ? t : null;
}

export function completedWorkoutDistanceM(
  c: CompletedWorkoutRow,
): number | null {
  if (c.vendor !== "strava") {
    return null;
  }
  const a = asStravaData(c.data);
  const d = a?.distance;
  return d != null && Number.isFinite(d) ? d : null;
}

export function completedWorkoutMovingSeconds(
  c: CompletedWorkoutRow,
): number | null {
  if (c.vendor === "strava") {
    const a = asStravaData(c.data);
    const m = a?.moving_time;
    return m != null && Number.isFinite(m) ? Math.floor(Number(m)) : null;
  }
  const w = asHevyData(c.data);
  const fromRange = durationSecondsFromIsoRange(w?.start_time, w?.end_time);
  if (fromRange != null) {
    return fromRange;
  }
  return null;
}

export function completedWorkoutCalories(
  c: CompletedWorkoutRow,
): number | null {
  if (c.vendor !== "strava") {
    return null;
  }
  const a = asStravaData(c.data);
  const cal = a?.calories;
  return cal != null && Number.isFinite(cal) ? cal : null;
}
