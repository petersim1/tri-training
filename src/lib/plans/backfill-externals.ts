import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { HevyWorkoutSummary } from "~/lib/activities/types";
import { getDb } from "~/lib/db";
import { completedWorkouts, plannedWorkouts } from "~/lib/db/schema";
import {
  fetchAllHevyWorkoutsForBackfill,
  fetchAllStravaActivitiesForBackfill,
  linkedSessionExcludeKeys,
  localDayKeyFromIso,
  type StravaFetchJson,
} from "~/lib/plans/link-candidates-fetch";
import type { LinkedSessionPayload } from "~/lib/plans/linked-session";
import {
  linkedSessionFromHevyWorkout,
  linkedSessionFromStravaActivity,
} from "~/lib/plans/linked-session";
import { normalizeCompletedInsert } from "~/lib/plans/server-fns";
import {
  inferPlanKindFromStravaSport,
  stravaSportMatchesPlanKind,
} from "~/lib/plans/strava-kind-match";
import type { StravaActivitySummary } from "~/lib/strava/types";

const LOG = "[backfill-links]";

export type BackfillReport = {
  /** New calendar rows from Strava (planned_workout + completed_workout when missing). */
  importedStrava: number;
  /** New calendar rows from Hevy. */
  importedHevy: number;
  linked: number;
  skipped: number;
  errors: string[];
  details: { planId: string; action: string }[];
};

/** Local calendar day bounds for `scheduledAt` (same idea as the day modal). */
function dayBoundsLocalFromScheduledAt(iso: string): {
  startMs: number;
  endMs: number;
} {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const startMs = new Date(y, m, day, 0, 0, 0, 0).getTime();
  const endMs = new Date(y, m, day, 23, 59, 59, 999).getTime();
  return { startMs, endMs };
}

function pickClosestByStartTime<T>(
  items: T[],
  scheduledMs: number,
  getIso: (t: T) => string | undefined,
): T | null {
  if (items.length === 0) {
    return null;
  }
  let best: T | null = null;
  let bestDelta = Infinity;
  for (const item of items) {
    const iso = getIso(item);
    if (!iso) {
      continue;
    }
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) {
      continue;
    }
    const d = Math.abs(t - scheduledMs);
    if (d < bestDelta) {
      bestDelta = d;
      best = item;
    }
  }
  return best ?? items[0] ?? null;
}

const KINDS = new Set(["lift", "run", "bike", "swim"]);

function planExistsForCompletedWorkoutId(
  db: ReturnType<typeof getDb>,
  completedId: string,
): boolean {
  const row = db
    .select({ id: plannedWorkouts.id })
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.completedWorkoutId, completedId))
    .get();
  return row != null;
}

/** Reuse an existing row or insert; returns `completed_workouts.id`. */
function findOrCreateCompletedWorkoutId(
  db: ReturnType<typeof getDb>,
  link: { vendor: "strava" | "hevy"; externalId: string },
  payload: LinkedSessionPayload,
  now: Date,
): string {
  const row = db
    .select({ id: completedWorkouts.id })
    .from(completedWorkouts)
    .where(
      and(
        eq(completedWorkouts.vendor, link.vendor),
        eq(completedWorkouts.externalId, link.externalId.trim()),
      ),
    )
    .get();
  if (row) {
    return row.id;
  }
  const ins = normalizeCompletedInsert(link, payload, now);
  db.insert(completedWorkouts).values(ins).run();
  return ins.id;
}

/**
 * Insert `completed_workouts` + `planned_workouts` so the session appears on the calendar.
 * Skips if this external id already has a plan. Returns true if a new plan row was created.
 */
function upsertCalendarFromHevyWorkout(
  db: ReturnType<typeof getDb>,
  w: HevyWorkoutSummary,
  calendarExternalKeys: Set<string>,
  now: Date,
): boolean {
  const id = w.id?.trim();
  if (!id || !w.start_time) {
    return false;
  }
  const key = `hevy:${id}`;
  if (calendarExternalKeys.has(key)) {
    return false;
  }
  let payload: LinkedSessionPayload;
  try {
    payload = linkedSessionFromHevyWorkout(w);
  } catch {
    return false;
  }
  const link = { vendor: "hevy" as const, externalId: id };
  const completedId = findOrCreateCompletedWorkoutId(db, link, payload, now);
  if (planExistsForCompletedWorkoutId(db, completedId)) {
    calendarExternalKeys.add(key);
    return false;
  }
  const planId = crypto.randomUUID();
  const routineId =
    w.routine_id?.trim() && w.routine_id.trim() !== ""
      ? w.routine_id.trim()
      : null;
  db.insert(plannedWorkouts)
    .values({
      id: planId,
      kind: "lift",
      scheduledAt: new Date(w.start_time).toISOString(),
      notes: null,
      status: "completed",
      routineVendor: "hevy",
      routineId,
      completedWorkoutId: completedId,
      distance: null,
      distanceUnits: null,
      timeSeconds: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  calendarExternalKeys.add(key);
  return true;
}

function upsertCalendarFromStravaActivity(
  db: ReturnType<typeof getDb>,
  a: StravaActivitySummary,
  calendarExternalKeys: Set<string>,
  now: Date,
): boolean {
  if (!a.start_date) {
    return false;
  }
  const sid = String(a.id);
  const key = `strava:${sid}`;
  if (calendarExternalKeys.has(key)) {
    return false;
  }
  const kind = inferPlanKindFromStravaSport(a.sport_type);
  if (!kind) {
    return false;
  }
  const link = { vendor: "strava" as const, externalId: sid };
  const payload = linkedSessionFromStravaActivity(a);
  const completedId = findOrCreateCompletedWorkoutId(db, link, payload, now);
  if (planExistsForCompletedWorkoutId(db, completedId)) {
    calendarExternalKeys.add(key);
    return false;
  }
  const planId = crypto.randomUUID();
  db.insert(plannedWorkouts)
    .values({
      id: planId,
      kind,
      scheduledAt: new Date(a.start_date).toISOString(),
      notes: null,
      status: "completed",
      routineVendor: "strava",
      routineId: null,
      completedWorkoutId: completedId,
      distance: null,
      distanceUnits: null,
      timeSeconds: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  calendarExternalKeys.add(key);
  return true;
}

/**
 * 1) Paginate all Strava + Hevy; for each session not already on the calendar, insert
 *    `completed_workouts` and `planned_workouts` (same pattern as `createPlanFromActivityFn`).
 * 2) Link remaining unlinked plans to same-day matches.
 */
export async function backfillLinkedWorkouts(
  stravaFetchJsonImpl: StravaFetchJson,
): Promise<BackfillReport> {
  const db = getDb();
  const rows = db
    .select()
    .from(plannedWorkouts)
    .where(
      and(
        isNull(plannedWorkouts.completedWorkoutId),
        ne(plannedWorkouts.status, "skipped"),
      ),
    )
    .orderBy(asc(plannedWorkouts.scheduledAt))
    .all();

  const report: BackfillReport = {
    importedStrava: 0,
    importedHevy: 0,
    linked: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  const hasHevy = Boolean(process.env.HEVY_API_KEY?.trim());
  const now = new Date();
  /** Vendor:externalId that already have a plan row (completed_workouts only exist through plans). */
  const calendarExternalKeys = linkedSessionExcludeKeys(db);

  const hevyByDay = new Map<string, HevyWorkoutSummary[]>();
  let hevyPreloadError: string | undefined;
  let hevyWorkoutsFetched = 0;

  if (hasHevy) {
    const block = await fetchAllHevyWorkoutsForBackfill();
    if (block.error) {
      hevyPreloadError = block.error;
      report.errors.push(`Hevy: ${block.error}`);
    } else {
      hevyWorkoutsFetched = block.workouts.length;
      for (const w of block.workouts) {
        const id = w.id?.trim();
        if (!id || !w.start_time) {
          continue;
        }
        const dk = localDayKeyFromIso(w.start_time);
        let arr = hevyByDay.get(dk);
        if (!arr) {
          arr = [];
          hevyByDay.set(dk, arr);
        }
        arr.push(w);
        if (upsertCalendarFromHevyWorkout(db, w, calendarExternalKeys, now)) {
          report.importedHevy++;
        }
      }
    }
  }

  const stravaByDay = new Map<string, StravaActivitySummary[]>();
  let stravaPreloadError: string | undefined;

  const stravaBlock =
    await fetchAllStravaActivitiesForBackfill(stravaFetchJsonImpl);
  if (stravaBlock.error) {
    stravaPreloadError = stravaBlock.error;
    report.errors.push(`Strava: ${stravaBlock.error}`);
  } else {
    for (const a of stravaBlock.list) {
      if (!a.start_date) {
        continue;
      }
      const dk = localDayKeyFromIso(a.start_date);
      let arr = stravaByDay.get(dk);
      if (!arr) {
        arr = [];
        stravaByDay.set(dk, arr);
      }
      arr.push(a);
      if (upsertCalendarFromStravaActivity(db, a, calendarExternalKeys, now)) {
        report.importedStrava++;
      }
    }
  }

  const excludeKeys = linkedSessionExcludeKeys(db);

  console.log(LOG, "backfill sync + preload done", {
    unlinkedPlans: rows.length,
    plansWithLinkedExternals: excludeKeys.size,
    hasHevyKey: hasHevy,
    stravaActivitiesFetched: stravaBlock.list.length,
    hevyWorkoutsFetched,
    importedStrava: report.importedStrava,
    importedHevy: report.importedHevy,
    hevyDaysIndexed: hevyByDay.size,
    stravaDaysIndexed: stravaByDay.size,
  });

  for (const plan of rows) {
    if (!KINDS.has(plan.kind)) {
      report.skipped++;
      report.details.push({
        planId: plan.id,
        action: `skip: unknown kind ${plan.kind}`,
      });
      continue;
    }

    const { startMs, endMs } = dayBoundsLocalFromScheduledAt(plan.scheduledAt);
    const scheduledMs = new Date(plan.scheduledAt).getTime();

    console.log(LOG, "plan", {
      id: plan.id,
      kind: plan.kind,
      scheduledAt: plan.scheduledAt,
      dayWindow: {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
      },
    });

    try {
      const dayKey = localDayKeyFromIso(plan.scheduledAt);
      const linkNow = new Date();

      if (plan.kind === "lift") {
        if (!hasHevy) {
          report.skipped++;
          report.details.push({
            planId: plan.id,
            action: "skip: HEVY_API_KEY not set on server",
          });
          continue;
        }
        if (hevyPreloadError) {
          report.skipped++;
          report.details.push({
            planId: plan.id,
            action: "skip: Hevy preload failed",
          });
          continue;
        }
        const candidates: HevyWorkoutSummary[] = (
          hevyByDay.get(dayKey) ?? []
        ).filter((w) => {
          const id = w.id?.trim();
          return Boolean(id && !excludeKeys.has(`hevy:${id}`));
        });
        if (candidates.length === 0) {
          report.skipped++;
          report.details.push({
            planId: plan.id,
            action: "skip: no Hevy workout that day",
          });
          continue;
        }
        const best = pickClosestByStartTime(
          candidates,
          scheduledMs,
          (w) => w.start_time,
        );
        if (!best?.id?.trim()) {
          report.skipped++;
          report.details.push({
            planId: plan.id,
            action: "skip: could not pick Hevy workout",
          });
          continue;
        }
        const link = { vendor: "hevy" as const, externalId: best.id.trim() };
        const payload = linkedSessionFromHevyWorkout(best);
        const completedId = findOrCreateCompletedWorkoutId(
          db,
          link,
          payload,
          linkNow,
        );
        db.update(plannedWorkouts)
          .set({
            completedWorkoutId: completedId,
            status: "completed",
            updatedAt: linkNow,
          })
          .where(eq(plannedWorkouts.id, plan.id))
          .run();
        excludeKeys.add(`hevy:${link.externalId}`);
        report.linked++;
        report.details.push({
          planId: plan.id,
          action: `linked hevy:${link.externalId}`,
        });
        continue;
      }

      const stravaErr = stravaPreloadError;
      if (stravaErr === "Strava not connected") {
        report.skipped++;
        report.details.push({
          planId: plan.id,
          action: "skip: Strava not connected",
        });
        continue;
      }

      const raw: StravaActivitySummary[] = (
        stravaByDay.get(dayKey) ?? []
      ).filter((a) => !excludeKeys.has(`strava:${String(a.id)}`));
      const kind = plan.kind as "run" | "bike" | "swim";
      const filtered = raw.filter((a) =>
        stravaSportMatchesPlanKind(kind, a.sport_type),
      );
      if (filtered.length === 0) {
        report.skipped++;
        report.details.push({
          planId: plan.id,
          action: "skip: no Strava activity matching kind that day",
        });
        continue;
      }
      const best = pickClosestByStartTime(
        filtered,
        scheduledMs,
        (a) => a.start_date,
      );
      if (!best) {
        report.skipped++;
        continue;
      }
      const id = String(best.id);
      const link = { vendor: "strava" as const, externalId: id };
      const payload = linkedSessionFromStravaActivity(best);
      const completedId = findOrCreateCompletedWorkoutId(
        db,
        link,
        payload,
        linkNow,
      );
      db.update(plannedWorkouts)
        .set({
          completedWorkoutId: completedId,
          status: "completed",
          updatedAt: linkNow,
        })
        .where(eq(plannedWorkouts.id, plan.id))
        .run();
      excludeKeys.add(`strava:${id}`);
      report.linked++;
      report.details.push({
        planId: plan.id,
        action: `linked strava:${id}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.errors.push(`Plan ${plan.id}: ${msg}`);
    }
  }

  console.log(LOG, "backfill done", {
    importedStrava: report.importedStrava,
    importedHevy: report.importedHevy,
    linked: report.linked,
    skipped: report.skipped,
    errorLines: report.errors.length,
    details: report.details.length,
  });
  if (report.errors.length > 0) {
    console.warn(LOG, "errors", report.errors);
  }

  return report;
}
