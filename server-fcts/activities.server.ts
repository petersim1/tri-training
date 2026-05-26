import { createServerFn } from "@tanstack/react-start";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import type { PlanStatus } from "@/components/PlanStatusSelect";
import type { PlanKind } from "@/lib/constants/activities";
import {
  type SessionChartSettings,
  VALID_CUMULATIVE,
  VALID_METRICS,
} from "@/lib/constants/visuals";
import { getDb } from "@/lib/db/index.server";
import {
  type CompletedWorkoutRow,
  completedWorkouts,
  type NewPlannedWorkout,
  type PlannedWorkoutRow,
  type PlannedWorkoutWithCompleted,
  plannedWorkouts,
  weightEntries,
} from "@/lib/db/schema.server";
import type { HevyWorkoutSummary } from "@/lib/hevy/types";
import { activityKindToPlanKind } from "@/lib/plans/completed-workout-data";
import type { StravaActivitySummary } from "@/lib/strava/types";
import { getDateRange, toIsoDate, toUtcBounds } from "@/lib/utils/dates";
import { cookieActions } from "@/server-fcts";
import {
  activityListSchema,
  calendarSchema,
  candidateLinkSchema,
  createFromCompletedSchema,
  createPlanSchema,
  updatePlanSchema,
  vizSchema,
} from "@/types/requests/activities";
import { timezoneSchema } from "@/types/requests/shared";
import type {
  CalendarPageItem,
  LinkAllResponse,
  PlannedWorkoutsPageResult,
  VizResult,
} from "@/types/responses/activities";

export const calendar = createServerFn({ method: "GET" })
  .inputValidator(calendarSchema)
  .handler(async ({ data }): Promise<CalendarPageItem[]> => {
    // on initial server load, this won't be available to us from the client.
    const { dateFrom, dateTo } = getDateRange(data);

    const db = await getDb();

    const rows = await db
      .select({
        id: plannedWorkouts.id,
        kind: plannedWorkouts.kind,
        dayKey: plannedWorkouts.dayKey,
        status: plannedWorkouts.status,
        hasWeight: sql<boolean>`${weightEntries.dayKey} is not null`,
      })
      .from(plannedWorkouts)
      .leftJoin(weightEntries, eq(plannedWorkouts.dayKey, weightEntries.dayKey))
      .where(
        and(
          gte(plannedWorkouts.dayKey, dateFrom),
          lte(plannedWorkouts.dayKey, dateTo),
        ),
      )
      .all();

    const workoutsByDay = Map.groupBy(rows, (r) => r.dayKey);

    const items = Object.values(
      Object.fromEntries(
        [...workoutsByDay.entries()].map(([dayKey, workouts]) => [
          dayKey,
          {
            dayKey,
            activities: workouts.map(({ id, kind, status }) => ({
              id,
              kind,
              status,
            })),
            hasWeight: workouts[0].hasWeight,
          },
        ]),
      ),
    ).sort((a, b) => a.dayKey.localeCompare(b.dayKey));

    return items;
  });

export const list = createServerFn({ method: "GET" })
  .inputValidator(activityListSchema)
  .handler(async ({ data }): Promise<PlannedWorkoutsPageResult> => {
    const wheres = [];
    if (data.kind) {
      wheres.push(eq(plannedWorkouts.kind, data.kind as PlanKind));
    }
    if (data.status) {
      wheres.push(eq(plannedWorkouts.status, data.status as PlanStatus));
    }
    if (data.dateFrom) {
      wheres.push(gte(plannedWorkouts.dayKey, data.dateFrom));
    }
    if (data.dateTo) {
      wheres.push(lte(plannedWorkouts.dayKey, data.dateTo));
    }

    const whereClause = and(...wheres);

    const db = await getDb();

    const offset = data.page * data.pageSize;

    const [countFilteredRow] = await db
      .select({ n: count() })
      .from(plannedWorkouts)
      .where(whereClause)
      .all();
    const totalPages = Math.ceil(
      Number(countFilteredRow?.n ?? 0) / data.pageSize,
    );

    const rows = await db
      .select({
        ...getTableColumns(plannedWorkouts),
        cw: completedWorkouts,
      })
      .from(plannedWorkouts)
      .leftJoin(
        completedWorkouts,
        eq(plannedWorkouts.completedWorkoutId, completedWorkouts.id),
      )
      .where(whereClause)
      .orderBy(desc(plannedWorkouts.dayKey))
      .limit(data.pageSize)
      .offset(offset)
      .all();

    const mapped = rows.map((r) => {
      const { cw, ...plan } = r;
      const completedWorkout: CompletedWorkoutRow | null =
        cw?.id != null ? cw : null;
      return { ...plan, completedWorkout };
    });

    return { rows: mapped, totalPages };
  });

export const viz = createServerFn({ method: "GET" })
  .inputValidator(vizSchema)
  .handler(async ({ data }): Promise<VizResult[]> => {
    const currentSettings = await cookieActions.getVizSettings();

    const options: SessionChartSettings = {
      ...currentSettings,
      ...data,
    };

    const validMetrics = VALID_METRICS[options.kind];
    const cumulativeOk = VALID_CUMULATIVE[options.metric];
    if (!validMetrics.includes(options.metric)) {
      return [];
    }
    if (options.cumulative && !cumulativeOk) {
      return [];
    }

    const wheres = [];
    const date = new Date();
    if (options.range === "3m") {
      date.setMonth(date.getMonth() - 3);
      wheres.push(
        gte(plannedWorkouts.dayKey, date.toISOString().split("T")[0]),
      );
    }
    if (options.range === "6m") {
      date.setMonth(date.getMonth() - 6);
      wheres.push(
        gte(plannedWorkouts.dayKey, date.toISOString().split("T")[0]),
      );
    }
    if (options.range === "12m") {
      date.setFullYear(date.getFullYear() - 1);
      wheres.push(
        gte(plannedWorkouts.dayKey, date.toISOString().split("T")[0]),
      );
    }
    if (options.range === "ytd") {
      date.setMonth(0);
      date.setDate(0);
      wheres.push(
        gte(plannedWorkouts.dayKey, date.toISOString().split("T")[0]),
      );
    }

    wheres.push(eq(plannedWorkouts.kind, options.kind));
    wheres.push(eq(plannedWorkouts.status, "completed"));

    const db = await getDb();

    const rows = await db
      .select({
        kind: plannedWorkouts.kind,
        dayKey: plannedWorkouts.dayKey,
        completedWorkout: {
          activityKind: completedWorkouts.activityKind,
          vendor: completedWorkouts.vendor,
          data: completedWorkouts.data,
        },
      })
      .from(plannedWorkouts)
      .leftJoin(
        completedWorkouts,
        eq(plannedWorkouts.completedWorkoutId, completedWorkouts.id),
      )
      .where(and(...wheres))
      .orderBy(asc(plannedWorkouts.dayKey))
      .all();

    const out: VizResult[] = [];
    rows.forEach((r) => {
      const { completedWorkout } = r;
      if (!completedWorkout) return;
      const { data, vendor } = completedWorkout;
      if (vendor === "strava") {
        const sData = data as StravaActivitySummary;
        if (options.metric === "time" && sData.moving_time) {
          out.push({
            date: r.dayKey,
            value: sData.moving_time,
          });
        } else if (options.metric === "distance" && sData.distance) {
          out.push({
            date: r.dayKey,
            value: sData.distance,
          });
        } else if (
          options.metric === "pace" &&
          sData.distance &&
          sData.moving_time
        ) {
          out.push({
            date: r.dayKey,
            value: sData.distance / sData.moving_time, // km / min
          });
        } else if (
          options.metric === "efficiency" &&
          sData.distance &&
          sData.moving_time &&
          sData.average_heartrate
        ) {
          out.push({
            date: r.dayKey,
            value:
              sData.distance / (sData.average_heartrate * sData.moving_time),
          });
        }
      } else if (vendor === "hevy") {
        const hData = data as HevyWorkoutSummary;
        if (options.metric === "time") {
          out.push({
            date: r.dayKey,
            value:
              (new Date(hData.end_time).getTime() -
                new Date(hData.start_time).getTime()) /
              1_000,
          });
        } else if (options.metric === "volume") {
          let volume = 0;
          hData.exercises.forEach((exercise) => {
            exercise.sets.forEach((set) => {
              if (set.reps && set.weight_kg) {
                volume += Number(set.reps) * Number(set.weight_kg);
              }
            });
          });
          if (volume) {
            out.push({
              date: r.dayKey,
              value: volume,
            });
          }
        }
      }
    });

    if (!options.cumulative) {
      return out;
    }

    return out.reduce((acc, item) => {
      const prev = acc.at(-1)?.value ?? 0;
      acc.push({ date: item.date, value: prev + item.value });
      return acc;
    }, [] as VizResult[]);
  });

export const unlinked = createServerFn({ method: "GET" })
  .inputValidator((data) => data)
  .handler(async (): Promise<CompletedWorkoutRow[]> => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(completedWorkouts)
      .where(eq(completedWorkouts.isResolved, false))
      .orderBy(desc(completedWorkouts.createdAt))
      .all();

    return rows;
  });

export const linkAll = createServerFn({ method: "POST" })
  .inputValidator(timezoneSchema)
  .handler(async ({ data }): Promise<LinkAllResponse> => {
    const db = await getDb();
    const now = new Date();

    const unresolved = await db
      .select()
      .from(completedWorkouts)
      .where(eq(completedWorkouts.isResolved, false))
      .orderBy(asc(completedWorkouts.createdAt))
      .all();

    const allPlans = await db
      .select()
      .from(plannedWorkouts)
      .where(
        and(
          isNull(plannedWorkouts.completedWorkoutId),
          eq(plannedWorkouts.status, "planned"),
        ),
      )
      .all();
    const plansByDayKind = new Map<string, PlannedWorkoutRow[]>();
    for (const p of allPlans) {
      const key = `${p.dayKey}:${p.kind}`;
      const arr = plansByDayKind.get(key) ?? [];
      arr.push(p);
      plansByDayKind.set(key, arr);
    }

    const resolvedIds = [];

    for (const cw of unresolved) {
      const dayKey = toIsoDate(cw.createdAt, data.timezone);
      const planKind = activityKindToPlanKind(cw.activityKind);
      if (!planKind) continue;

      const key = `${dayKey}:${planKind}`;
      const candidates = plansByDayKind.get(key) ?? [];
      const existing = candidates.shift(); // take the first available, remove it so next cw doesn't reuse it

      if (existing) {
        await db
          .update(plannedWorkouts)
          .set({
            completedWorkoutId: cw.id,
            status: "completed",
            updatedAt: now,
          })
          .where(eq(plannedWorkouts.id, existing.id))
          .run();
        existing.completedWorkoutId = cw.id;
        existing.status = "completed";
      } else {
        const id = crypto.randomUUID();
        await db
          .insert(plannedWorkouts)
          .values({
            id,
            kind: planKind,
            dayKey,
            notes: null,
            status: "completed",
            routineVendor: cw.vendor,
            routineId: null,
            completedWorkoutId: cw.id,
            distance: null,
            distanceUnits: null,
            timeSeconds: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      resolvedIds.push(cw.id);
    }

    if (resolvedIds.length > 0) {
      await db
        .update(completedWorkouts)
        .set({ isResolved: true, updatedAt: now })
        .where(inArray(completedWorkouts.id, resolvedIds))
        .run();
    }

    return {
      nLinked: resolvedIds.length,
      nUnlinked: unresolved.length - resolvedIds.length,
    };
  });

export const getLinkCandidates = createServerFn({ method: "GET" })
  .inputValidator(candidateLinkSchema)
  .handler(async ({ data }): Promise<CompletedWorkoutRow[]> => {
    const db = await getDb();
    const plan = await db
      .select()
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.planId))
      .get();
    if (!plan) {
      throw new Error("Plan not found");
    }
    if (plan.kind === "recovery") {
      return [];
    }

    const { start, end } = toUtcBounds(plan.dayKey, data.timezone);

    const completed = await db
      .select()
      .from(completedWorkouts)
      .where(
        and(
          and(
            gte(completedWorkouts.createdAt, start),
            lte(completedWorkouts.createdAt, end),
            eq(completedWorkouts.isResolved, false),
          ),
        ),
      );

    return completed;
  });

/** Server-fn registration only — DB implementation lives in `planner-db-operations.ts` (not client-bundled). */
export const get = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<PlannedWorkoutWithCompleted | null> => {
    const db = await getDb();
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

export const create = createServerFn({ method: "POST" })
  .inputValidator(createPlanSchema)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const cardio = ["run", "bike", "swim"].includes(data.kind);
    const distance = cardio ? data.distance : null;
    const distanceUnits = cardio ? data.distanceUnits : null;

    const db = await getDb();

    const id = crypto.randomUUID();
    await db
      .insert(plannedWorkouts)
      .values({
        id,
        kind: data.kind,
        dayKey: data.dayKey,
        notes: data.notes ?? null,
        status: "planned",
        routineVendor: data.kind === "lift" ? "hevy" : "strava",
        routineId: data.kind === "lift" ? data.routineId : null,
        completedWorkoutId: null,
        distance,
        distanceUnits,
        timeSeconds: data.timeSeconds,
      })
      .run();
    return { id };
  });

export const createFromCompleted = createServerFn({ method: "POST" })
  .inputValidator(createFromCompletedSchema)
  .handler(async ({ data }) => {
    const db = await getDb();

    const completed = await db
      .select()
      .from(completedWorkouts)
      .where(eq(completedWorkouts.id, data.completedWorkoutId))
      .get();
    if (!completed) throw new Error("Completed workout not found");
    if (completed.isResolved) throw new Error("Workout is already linked");

    const planKind = activityKindToPlanKind(completed.activityKind);
    if (!planKind) {
      throw new Error(
        `cannot create a plan from ${completed.vendor} ${completed.activityKind} type`,
      );
    }

    const existing = await db
      .select()
      .from(plannedWorkouts)
      .where(
        and(
          eq(plannedWorkouts.dayKey, data.dayKey),
          eq(plannedWorkouts.kind, planKind),
          isNull(plannedWorkouts.completedWorkoutId),
        ),
      )
      .get();

    const id = existing ? existing.id : crypto.randomUUID();
    if (existing) {
      await db
        .update(plannedWorkouts)
        .set({
          completedWorkoutId: completed.id,
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(plannedWorkouts.id, existing.id))
        .run();
    } else {
      await db
        .insert(plannedWorkouts)
        .values({
          id,
          kind: planKind,
          dayKey: data.dayKey,
          status: "completed",
          routineVendor: completed.vendor,
          routineId: null,
          completedWorkoutId: completed.id,
          notes: null,
          distance: null,
          distanceUnits: null,
          timeSeconds: null,
        })
        .run();
    }

    await db
      .update(completedWorkouts)
      .set({ isResolved: true, updatedAt: new Date() })
      .where(eq(completedWorkouts.id, completed.id))
      .run();

    return { id };
  });

export const update = createServerFn({ method: "POST" })
  .inputValidator(updatePlanSchema)
  .handler(async ({ data }): Promise<{ ok: boolean; note?: string }> => {
    const db = await getDb();
    const row = await db
      .select()
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.id))
      .get();

    if (!row) throw new Error("Plan not found");

    const canEditSchedule =
      row.status === "planned" && row.completedWorkoutId == null;
    const updates: Partial<NewPlannedWorkout> = { updatedAt: new Date() };

    if (data.notes !== undefined) updates.notes = data.notes;

    if (data.dayKey) {
      if (!canEditSchedule)
        throw new Error(
          "Date can only be changed for planned workouts without a linked session",
        );
      updates.dayKey = data.dayKey;
    }

    if (data.kind && data.kind !== row.kind) {
      if (!canEditSchedule)
        throw new Error(
          "Activity type can only be changed for planned workouts without a linked session",
        );
      updates.kind = data.kind;
      if (data.kind === "lift") {
        Object.assign(updates, {
          routineVendor: "hevy",
          routineId: null,
          distance: null,
          distanceUnits: null,
          timeSeconds: null,
        });
      } else {
        Object.assign(updates, { routineVendor: "strava", routineId: null });
        if (row.kind === "lift")
          Object.assign(updates, {
            distance: null,
            distanceUnits: null,
            timeSeconds: null,
          });
      }
    }

    if (data.status) updates.status = data.status;

    if (data.hevyRoutineId !== undefined && row.kind === "lift") {
      updates.routineVendor = "hevy";
      updates.routineId = data.hevyRoutineId?.trim() || null;
    }

    if (data.distance !== undefined || data.distanceUnits !== undefined) {
      if (!["run", "bike", "swim"].includes(row.kind))
        throw new Error("Distance targets only apply to run, bike, and swim");
      if (data.distance !== undefined) updates.distance = data.distance;
      if (data.distanceUnits !== undefined)
        updates.distanceUnits = data.distanceUnits;
    }

    if (data.timeSeconds !== undefined) {
      if (!["run", "bike", "swim"].includes(row.kind))
        throw new Error("Duration target only applies to run, bike, and swim");
      updates.timeSeconds = data.timeSeconds;
    }

    await db
      .update(plannedWorkouts)
      .set(updates)
      .where(eq(plannedWorkouts.id, data.id))
      .run();
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const db = await getDb();
    const plan = await db
      .select({ completedWorkoutId: plannedWorkouts.completedWorkoutId })
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.id))
      .get();
    if (!plan) throw new Error("plan not found");
    if (plan.completedWorkoutId) {
      return {
        ok: false,
        note: "cannot delete a completed workout",
      };
    }
    await db
      .delete(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.id))
      .run();
    return { ok: true };
  });
