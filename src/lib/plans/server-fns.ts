import { createServerFn } from "@tanstack/react-start";
import { eq, getTableColumns } from "drizzle-orm";
import type { HevyWorkoutSummary } from "~/lib/activities/types";
import { getSessionOk } from "~/lib/auth/session-server";
import { getDb } from "~/lib/db";
import {
  type CompletedWorkoutRow,
  completedWorkouts,
  type JsonValue,
  type PlannedWorkoutWithCompleted,
  plannedWorkouts,
} from "~/lib/db/schema";
import {
  CARDIO_DISTANCE_UNITS,
  isCardioKind,
} from "~/lib/plans/cardio-targets";
import {
  hevyDataFromLinkedPayload,
  hevyDataFromWorkoutSummary,
  stravaDataFromActivitySummary,
  stravaDataFromLinkedPayload,
} from "~/lib/plans/completed-workout-data";
import type { LinkedSessionPayload } from "~/lib/plans/linked-session";
import type { StravaActivitySummary } from "~/lib/strava/types";

async function requireAuth() {
  if (!(await getSessionOk())) {
    throw new Error("Unauthorized");
  }
}

function resolveWorkoutLink(
  stravaActivityId: string | null | undefined,
  hevyWorkoutId: string | null | undefined,
): { vendor: "strava" | "hevy"; externalId: string } | null {
  const s = stravaActivityId?.trim() ?? "";
  const h = hevyWorkoutId?.trim() ?? "";
  if (s.length > 0) {
    return { vendor: "strava", externalId: s };
  }
  if (h.length > 0) {
    return { vendor: "hevy", externalId: h };
  }
  return null;
}

async function deleteCompletedIfOrphaned(
  db: ReturnType<typeof getDb>,
  id: string,
) {
  const stillUsed = await db
    .select({ id: plannedWorkouts.id })
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.completedWorkoutId, id))
    .get();
  if (!stillUsed) {
    await db
      .delete(completedWorkouts)
      .where(eq(completedWorkouts.id, id))
      .run();
  }
}

export function normalizeCompletedInsert(
  link: { vendor: "strava" | "hevy"; externalId: string },
  p: LinkedSessionPayload,
  now: Date,
  opts?: {
    stravaActivity?: StravaActivitySummary;
    hevyWorkout?: HevyWorkoutSummary;
    planKind?: string;
    scheduledAtIso?: string;
  },
): typeof completedWorkouts.$inferInsert {
  if (p.vendor !== link.vendor || p.externalId.trim() !== link.externalId) {
    throw new Error("Linked session does not match selected activity");
  }
  const id = crypto.randomUUID();
  let data: JsonValue;
  if (link.vendor === "strava") {
    if (opts?.stravaActivity) {
      data = stravaDataFromActivitySummary(opts.stravaActivity);
    } else {
      data = stravaDataFromLinkedPayload(p, {
        planKind: opts?.planKind ?? "run",
        scheduledAtIso: opts?.scheduledAtIso ?? new Date().toISOString(),
      });
    }
  } else if (opts?.hevyWorkout) {
    data = hevyDataFromWorkoutSummary(opts.hevyWorkout);
  } else {
    data = hevyDataFromLinkedPayload(p);
  }
  return {
    id,
    vendor: link.vendor,
    vendorId: link.externalId.trim(),
    data,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeDistanceUnit(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (s === "") {
    return null;
  }
  if (
    !CARDIO_DISTANCE_UNITS.includes(s as (typeof CARDIO_DISTANCE_UNITS)[number])
  ) {
    throw new Error(
      `Invalid distance unit (use ${CARDIO_DISTANCE_UNITS.join(", ")})`,
    );
  }
  return s;
}

function normalizeOptionalDistance(
  raw: number | null | undefined,
): number | null {
  if (raw === undefined || raw === null || Number.isNaN(raw)) {
    return null;
  }
  if (raw < 0) {
    throw new Error("Distance must be non-negative");
  }
  return raw;
}

function normalizeOptionalTimeSeconds(
  raw: number | null | undefined,
): number | null {
  if (raw === undefined || raw === null || Number.isNaN(raw)) {
    return null;
  }
  const t = Math.floor(Number(raw));
  if (t < 0) {
    throw new Error("Time must be non-negative");
  }
  return t;
}

export const getPlanFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<PlannedWorkoutWithCompleted | null> => {
    await requireAuth();
    const db = getDb();
    const row = await db
      .select({
        ...getTableColumns(plannedWorkouts),
        cw: completedWorkouts,
      })
      .from(plannedWorkouts)
      .leftJoin(
        completedWorkouts,
        eq(plannedWorkouts.completedWorkoutId, completedWorkouts.id),
      )
      .where(eq(plannedWorkouts.id, data.id))
      .get();
    if (!row) {
      return null;
    }
    const { cw, ...plan } = row;
    const completedWorkout: CompletedWorkoutRow | null =
      cw?.id != null ? cw : null;
    return { ...plan, completedWorkout };
  });

export const createPlanFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      kind: string;
      scheduledAt: string;
      notes?: string | null;
      routineId?: string | null;
      distance?: number | null;
      distanceUnits?: string | null;
      timeSeconds?: number | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const kinds = new Set(["lift", "run", "bike", "swim"]);
    if (!kinds.has(data.kind)) {
      throw new Error("Invalid kind");
    }
    const id = crypto.randomUUID();
    const now = new Date();
    const db = getDb();

    const isLift = data.kind === "lift";
    const routineId =
      isLift && data.routineId && String(data.routineId).trim() !== ""
        ? String(data.routineId).trim()
        : null;

    const cardio = isCardioKind(data.kind);
    const distance = cardio
      ? normalizeOptionalDistance(data.distance ?? null)
      : null;
    const distanceUnits = cardio
      ? normalizeDistanceUnit(data.distanceUnits ?? null)
      : null;
    const timeSeconds = cardio
      ? normalizeOptionalTimeSeconds(data.timeSeconds ?? null)
      : null;

    await db
      .insert(plannedWorkouts)
      .values({
        id,
        kind: data.kind,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        notes: data.notes ?? null,
        status: "planned",
        routineVendor: isLift ? "hevy" : "strava",
        routineId: isLift ? routineId : null,
        completedWorkoutId: null,
        distance,
        distanceUnits,
        timeSeconds,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { id };
  });

/** Create a completed plan in one step from a Strava or Hevy session (no prior plan row). */
export const createPlanFromActivityFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      kind: string;
      scheduledAt: string;
      stravaActivityId?: string | null;
      hevyWorkoutId?: string | null;
      linkedSession: LinkedSessionPayload;
      notes?: string | null;
      routineId?: string | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const kinds = new Set(["lift", "run", "bike", "swim"]);
    if (!kinds.has(data.kind)) {
      throw new Error("Invalid kind");
    }
    const link = resolveWorkoutLink(data.stravaActivityId, data.hevyWorkoutId);
    if (!link) {
      throw new Error("Choose an activity");
    }
    const isLift = data.kind === "lift";
    if (isLift && link.vendor !== "hevy") {
      throw new Error("Lift sessions must use a Hevy workout");
    }
    if (!isLift && link.vendor !== "strava") {
      throw new Error("Run, bike, and swim use Strava activities");
    }
    const now = new Date();
    const completed = normalizeCompletedInsert(link, data.linkedSession, now, {
      planKind: data.kind,
      scheduledAtIso: new Date(data.scheduledAt).toISOString(),
    });
    const id = crypto.randomUUID();
    const db = getDb();
    await db.insert(completedWorkouts).values(completed).run();

    const routineId =
      isLift && data.routineId && String(data.routineId).trim() !== ""
        ? String(data.routineId).trim()
        : null;

    await db
      .insert(plannedWorkouts)
      .values({
        id,
        kind: data.kind,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        notes: data.notes?.trim() ? data.notes.trim() : null,
        status: "completed",
        routineVendor: isLift ? "hevy" : "strava",
        routineId: isLift ? routineId : null,
        completedWorkoutId: completed.id,
        distance: null,
        distanceUnits: null,
        timeSeconds: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { id };
  });

export const updatePlanFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id: string;
      notes?: string | null;
      scheduledAt?: string;
      status?: string;
      stravaActivityId?: string | null;
      hevyWorkoutId?: string | null;
      /** Required when setting a link — mirrors the candidate row you tapped. */
      linkedSession?: LinkedSessionPayload | null;
      hevyRoutineId?: string | null;
      distance?: number | null;
      distanceUnits?: string | null;
      timeSeconds?: number | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const db = getDb();
    const now = new Date();
    const row = await db
      .select()
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.id))
      .get();
    if (!row) {
      throw new Error("Not found");
    }

    const updates: Partial<typeof plannedWorkouts.$inferInsert> = {
      updatedAt: now,
    };

    if (data.notes !== undefined) {
      updates.notes = data.notes;
    }
    if (data.scheduledAt) {
      updates.scheduledAt = new Date(data.scheduledAt).toISOString();
    }

    const explicitStatus =
      data.status && ["planned", "completed", "skipped"].includes(data.status)
        ? data.status
        : undefined;

    const workoutTouched =
      data.stravaActivityId !== undefined || data.hevyWorkoutId !== undefined;

    if (workoutTouched) {
      const link = resolveWorkoutLink(
        data.stravaActivityId,
        data.hevyWorkoutId,
      );
      const previousCompletedId = row.completedWorkoutId;

      if (!link) {
        updates.completedWorkoutId = null;
        if (explicitStatus === undefined) {
          updates.status = "planned";
        }
        if (previousCompletedId) {
          await db
            .update(plannedWorkouts)
            .set({ ...updates, completedWorkoutId: null })
            .where(eq(plannedWorkouts.id, data.id))
            .run();
          await deleteCompletedIfOrphaned(db, previousCompletedId);
          return { ok: true };
        }
      } else {
        if (!data.linkedSession) {
          throw new Error("linkedSession is required when linking a session");
        }
        const completed = normalizeCompletedInsert(
          link,
          data.linkedSession,
          now,
          {
            planKind: row.kind,
            scheduledAtIso: new Date(row.scheduledAt).toISOString(),
          },
        );
        await db.insert(completedWorkouts).values(completed).run();
        updates.completedWorkoutId = completed.id;
        if (explicitStatus === undefined) {
          updates.status = "completed";
        }
        await db
          .update(plannedWorkouts)
          .set(updates)
          .where(eq(plannedWorkouts.id, data.id))
          .run();
        if (previousCompletedId) {
          await deleteCompletedIfOrphaned(db, previousCompletedId);
        }
        return { ok: true };
      }
    }

    if (explicitStatus !== undefined) {
      updates.status = explicitStatus;
    }

    if (data.hevyRoutineId !== undefined) {
      const isLift = row.kind === "lift";
      if (isLift) {
        const rid =
          data.hevyRoutineId === null || data.hevyRoutineId === ""
            ? null
            : String(data.hevyRoutineId).trim();
        updates.routineVendor = "hevy";
        updates.routineId = rid;
      }
    }

    if (data.distance !== undefined || data.distanceUnits !== undefined) {
      if (!isCardioKind(row.kind)) {
        throw new Error("Distance targets only apply to run, bike, and swim");
      }
      if (data.distance !== undefined) {
        updates.distance = normalizeOptionalDistance(data.distance);
      }
      if (data.distanceUnits !== undefined) {
        updates.distanceUnits = normalizeDistanceUnit(data.distanceUnits);
      }
    }
    if (data.timeSeconds !== undefined) {
      if (!isCardioKind(row.kind)) {
        throw new Error("Duration target only applies to run, bike, and swim");
      }
      updates.timeSeconds = normalizeOptionalTimeSeconds(data.timeSeconds);
    }

    await db
      .update(plannedWorkouts)
      .set(updates)
      .where(eq(plannedWorkouts.id, data.id))
      .run();
    return { ok: true };
  });

export const deletePlanFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const db = getDb();
    const row = await db
      .select()
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.id))
      .get();
    const cid = row?.completedWorkoutId ?? null;
    await db
      .delete(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.id))
      .run();
    if (cid) {
      await deleteCompletedIfOrphaned(db, cid);
    }
    return { ok: true };
  });
