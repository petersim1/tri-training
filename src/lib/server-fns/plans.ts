import { createServerFn } from "@tanstack/react-start";
import { and, eq, getTableColumns } from "drizzle-orm";
import { getDb } from "~/lib/db";
import {
  type CompletedWorkoutRow,
  completedWorkouts,
  type PlanKind,
  type PlannedWorkoutWithCompleted,
  type PlanStatus,
  plannedWorkouts,
} from "~/lib/db/schema";
import {
  CARDIO_DISTANCE_UNITS,
  isCardioKind,
} from "~/lib/plans/cardio-targets";
import { syncCompletedResolvedForId } from "~/lib/plans/completed-resolved";
import { isValidDayKey } from "~/lib/plans/day-key";
import type { LinkedSessionPayload } from "~/lib/plans/linked-session";

const SESSION_NOT_IN_DB =
  "Session not in your library yet. Wait for sync or run backfill before linking.";

async function completedWorkoutIdForVendorLink(
  db: ReturnType<typeof getDb>,
  link: { vendor: "strava" | "hevy"; externalId: string },
): Promise<string | null> {
  const vid = link.externalId.trim();
  if (!vid) {
    return null;
  }
  const row = await db
    .select({ id: completedWorkouts.id })
    .from(completedWorkouts)
    .where(
      and(
        eq(completedWorkouts.vendor, link.vendor),
        eq(completedWorkouts.vendorId, vid),
      ),
    )
    .get();
  return row?.id ?? null;
}

function resolveWorkoutLink(
  stravaActivityId: string | null | undefined,
  hevyWorkoutId: string | null | undefined,
): { vendor: "strava" | "hevy"; externalId: string } | null {
  const s =
    stravaActivityId === undefined || stravaActivityId === null
      ? ""
      : String(stravaActivityId).trim();
  const h =
    hevyWorkoutId === undefined || hevyWorkoutId === null
      ? ""
      : String(hevyWorkoutId).trim();
  if (s.length > 0) {
    return { vendor: "strava", externalId: s };
  }
  if (h.length > 0) {
    return { vendor: "hevy", externalId: h };
  }
  return null;
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
      dayKey: string;
      notes?: string | null;
      routineId?: string | null;
      distance?: number | null;
      distanceUnits?: string | null;
      timeSeconds?: number | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    const kinds = new Set(["lift", "run", "bike", "swim"]);
    if (!kinds.has(data.kind)) {
      throw new Error("Invalid kind");
    }
    const dk = String(data.dayKey ?? "").trim();
    if (!isValidDayKey(dk)) {
      throw new Error("Invalid day");
    }
    const planKind = data.kind as PlanKind;
    const id = crypto.randomUUID();
    const now = new Date();
    const db = getDb();

    const isLift = planKind === "lift";
    const routineId =
      isLift && data.routineId && String(data.routineId).trim() !== ""
        ? String(data.routineId).trim()
        : null;

    const cardio = isCardioKind(planKind);
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
        kind: planKind,
        dayKey: dk,
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
      dayKey: string;
      stravaActivityId?: string | null;
      hevyWorkoutId?: string | null;
      linkedSession: LinkedSessionPayload;
      notes?: string | null;
      routineId?: string | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    const kinds = new Set(["lift", "run", "bike", "swim"]);
    if (!kinds.has(data.kind)) {
      throw new Error("Invalid kind");
    }
    const dk = String(data.dayKey ?? "").trim();
    if (!isValidDayKey(dk)) {
      throw new Error("Invalid day");
    }
    const planKind = data.kind as PlanKind;
    const link = resolveWorkoutLink(data.stravaActivityId, data.hevyWorkoutId);
    if (!link) {
      throw new Error("Choose an activity");
    }
    const isLift = planKind === "lift";
    if (isLift && link.vendor !== "hevy") {
      throw new Error("Lift sessions must use a Hevy workout");
    }
    if (!isLift && link.vendor !== "strava") {
      throw new Error("Run, bike, and swim use Strava activities");
    }
    const p = data.linkedSession;
    if (
      p.vendor !== link.vendor ||
      p.externalId.trim() !== link.externalId.trim()
    ) {
      throw new Error("linkedSession does not match selected activity");
    }
    const now = new Date();
    const db = getDb();
    const completedId = await completedWorkoutIdForVendorLink(db, link);
    if (!completedId) {
      throw new Error(SESSION_NOT_IN_DB);
    }

    const routineId =
      isLift && data.routineId && String(data.routineId).trim() !== ""
        ? String(data.routineId).trim()
        : null;

    const id = crypto.randomUUID();
    await db
      .insert(plannedWorkouts)
      .values({
        id,
        kind: planKind,
        dayKey: dk,
        notes: data.notes?.trim() ? data.notes.trim() : null,
        status: "completed",
        routineVendor: isLift ? "hevy" : "strava",
        routineId: isLift ? routineId : null,
        completedWorkoutId: completedId,
        distance: null,
        distanceUnits: null,
        timeSeconds: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await syncCompletedResolvedForId(db, completedId);
    return { id };
  });

export const updatePlanFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id: string;
      notes?: string | null;
      dayKey?: string;
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
    if (data.dayKey !== undefined && data.dayKey !== null) {
      const dk = String(data.dayKey).trim();
      if (dk !== "") {
        if (!isValidDayKey(dk)) {
          throw new Error("Invalid day");
        }
        updates.dayKey = dk;
      }
    }

    const explicitStatus: PlanStatus | undefined =
      data.status && ["planned", "completed", "skipped"].includes(data.status)
        ? (data.status as PlanStatus)
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
        if (previousCompletedId) {
          updates.completedWorkoutId = null;
          if (explicitStatus === undefined) {
            updates.status = "planned";
          }
          await db
            .update(plannedWorkouts)
            .set({ ...updates, completedWorkoutId: null })
            .where(eq(plannedWorkouts.id, data.id))
            .run();
          await syncCompletedResolvedForId(db, previousCompletedId);
          return { ok: true };
        }
        return { ok: true };
      }
      if (data.linkedSession) {
        const p = data.linkedSession;
        if (
          p.vendor !== link.vendor ||
          p.externalId.trim() !== link.externalId.trim()
        ) {
          throw new Error("linkedSession does not match selected activity");
        }
      }
      const completedId = await completedWorkoutIdForVendorLink(db, link);
      if (!completedId) {
        throw new Error(SESSION_NOT_IN_DB);
      }
      updates.completedWorkoutId = completedId;
      updates.status = "completed";
      await db
        .update(plannedWorkouts)
        .set(updates)
        .where(eq(plannedWorkouts.id, data.id))
        .run();
      await syncCompletedResolvedForId(db, completedId);
      if (previousCompletedId && previousCompletedId !== completedId) {
        await syncCompletedResolvedForId(db, previousCompletedId);
      }
      return { ok: true };
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
    const db = getDb();
    const plan = await db
      .select({ completedWorkoutId: plannedWorkouts.completedWorkoutId })
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.id))
      .get();
    const cwId = plan?.completedWorkoutId ?? null;
    await db
      .delete(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.id))
      .run();
    if (cwId) {
      await syncCompletedResolvedForId(db, cwId);
    }
    return { ok: true };
  });
