import { desc } from "drizzle-orm";
import type { PlanKind } from "@/lib/constants/activities";
import { getDb } from "@/lib/db/index.server";
import { completedWorkouts } from "@/lib/db/schema.server";
import {
  activityKindToPlanKind,
  completedWorkoutAverageHeartrateBpm,
  completedWorkoutDistanceM,
  completedWorkoutHevyLiftExerciseLinesPlanner,
  completedWorkoutLocalDayKeyInTimeZone,
  completedWorkoutMovingSeconds,
  completedWorkoutStartIso,
} from "@/lib/plans/completed-workout-data";
import { activityActions } from "@/server-fcts";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import type { PlannerCompletedBrief } from "@/types/responses/chats";

const NOTE_CAP = 400;

function clampLimit(
  raw: unknown,
  fallback: number,
  maxAllowed: number,
): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return Math.min(maxAllowed, fallback);
  }
  return Math.min(maxAllowed, Math.max(1, Math.floor(raw)));
}

export async function plannerListCompletedWorkouts(input: {
  timeZone: string;
  /** Inclusive ISO day `YYYY-MM-DD` in given time zone filter. */
  sinceDay?: string;
  /** Inclusive */
  untilDay?: string;
  limit?: number;
  kind?: "lift" | "run" | "bike" | "swim" | "recovery" | "all" | undefined;
  vendor?: "strava" | "hevy" | "all" | undefined;
}): Promise<{ workouts: PlannerCompletedBrief[] }> {
  const limit = clampLimit(input.limit, 24, 80);
  const tz = input.timeZone.trim();
  const db = await getDb();

  const since = input.sinceDay?.trim();
  const until = input.untilDay?.trim();
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  if (since && !DAY.test(since)) {
    throw new Error("invalid sinceDay");
  }
  if (until && !DAY.test(until)) {
    throw new Error("invalid untilDay");
  }

  const kindFilter = input.kind === undefined ? "all" : input.kind;
  const vendorFilter = input.vendor === undefined ? "all" : input.vendor;
  const hasDayWindow = Boolean(since) || Boolean(until);
  const batch =
    kindFilter !== "all" && !hasDayWindow
      ? Math.min(5000, Math.max(limit * 40, 300))
      : Math.min(220, Math.max(limit * 4, 48));

  const rows = await db
    .select()
    .from(completedWorkouts)
    .orderBy(desc(completedWorkouts.createdAt))
    .limit(batch)
    .all();

  const sorted = [...rows].sort((a, b) => {
    const ia = completedWorkoutStartIso(a);
    const ib = completedWorkoutStartIso(b);
    const ta = ia ? Date.parse(ia) : 0;
    const tb = ib ? Date.parse(ib) : 0;
    return tb - ta;
  });

  const list: PlannerCompletedBrief[] = [];
  for (const r of sorted) {
    if (vendorFilter !== "all" && r.vendor !== vendorFilter) {
      continue;
    }
    const dk = tz ? completedWorkoutLocalDayKeyInTimeZone(r, tz) : null;
    const inferredPlanKind = activityKindToPlanKind(r.activityKind);
    if (kindFilter !== "all" && inferredPlanKind !== kindFilter) {
      continue;
    }
    if (since && dk && dk < since) {
      continue;
    }
    if (until && dk && dk > until) {
      continue;
    }
    list.push({
      id: r.id,
      vendor: r.vendor,
      activityKind: r.activityKind,
      inferredPlanKind,
      localDayKey: dk,
      isoStart: completedWorkoutStartIso(r),
      isResolved: r.isResolved,
      distanceM: completedWorkoutDistanceM(r),
      movingSeconds: completedWorkoutMovingSeconds(r),
      avgHeartRateBpm: completedWorkoutAverageHeartrateBpm(r),
      liftExerciseLines: completedWorkoutHevyLiftExerciseLinesPlanner(r),
    });
    if (list.length >= limit) {
      break;
    }
  }
  return { workouts: list };
}

export type PlannerPlannedBrief = {
  id: string;
  dayKey: string;
  kind: PlanKind;
  status: string;
  notes: string | null;
  distance: number | null;
  distanceUnits: string | null;
  timeSeconds: number | null;
  hasLinkedSession: boolean;
};

export async function plannerListPlannedWorkouts(input: {
  filters: ActivityListSchemaValues;
  limit?: number;
}): Promise<{ plans: PlannerPlannedBrief[] }> {
  const limit = clampLimit(input.limit, 30, 80);
  const rows = await activityActions.list({ data: input.filters });

  const plans: PlannerPlannedBrief[] = [];
  let n = 0;
  for (const p of rows.rows) {
    plans.push({
      id: p.id,
      dayKey: p.dayKey,
      kind: p.kind,
      status: p.status,
      notes: p.notes
        ? p.notes.length > NOTE_CAP
          ? `${p.notes.slice(0, NOTE_CAP - 1)}…`
          : p.notes
        : null,
      distance: p.distance,
      distanceUnits: p.distanceUnits,
      timeSeconds: p.timeSeconds,
      hasLinkedSession: Boolean(p.completedWorkoutId),
    });
    n++;
    if (n >= limit) {
      break;
    }
  }
  return { plans };
}
