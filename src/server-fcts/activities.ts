import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import {
  type SessionChartSettings,
  VALID_CUMULATIVE,
  VALID_METRICS,
} from "@/lib/constants/visuals";
import { getDb } from "@/lib/db/index.server";
import {
  type NewWorkoutEntryRow,
  type TypedVendorWorkoutRow,
  vendorActivities,
  type WorkoutEntryRow,
  type WorkoutEntryWithCompleted,
  weightEntries,
  workoutEntries,
} from "@/lib/db/schema.server";
import { hevyFetchRoutineById } from "@/lib/hevy/client";
import {
  getVizValue,
  rollupStackedValue,
  rollupValue,
} from "@/lib/utils/calculations";
import {
  dayKeyToUtc,
  enumerateLocalDayKeysInclusive,
  getDateRange,
  toIsoDate,
} from "@/lib/utils/dates";
import { vendorActivityToPlanKind } from "@/lib/utils/vendors";
import {
  activityListSchema,
  calendarSchema,
  createFromCompletedSchema,
  createPlanSchema,
  stackedVizSchema,
  updatePlanSchema,
  vizSchema,
} from "@/types/requests/activities";
import { idSchema } from "@/types/requests/shared";
import type {
  CalendarPageItem,
  GroupItem,
  LinkAllResponse,
  PlannedWorkoutsPageResult,
  StackedGroupItem,
  StackedVizResult,
  UnlinkedActivitiesItem,
  VizResult,
} from "@/types/responses/activities";
import { activityServerFns } from "./activities.server";
import { cookieActions } from "./cookies";

const calendar = createServerFn({ method: "GET" })
  .inputValidator(calendarSchema)
  .handler(async ({ data }): Promise<CalendarPageItem[]> => {
    // on initial server load, this won't be available to us from the client.
    const timezone = await cookieActions.getTimezone();
    const { dateFrom, dateTo } = getDateRange(data);

    const dateFromTs = dayKeyToUtc(dateFrom, timezone);
    const dateToTs = dayKeyToUtc(dateTo, timezone);
    const today = toIsoDate(new Date(), timezone);

    const db = await getDb();

    const workouts = await db
      .select({
        id: workoutEntries.id,
        kind: workoutEntries.kind,
        dayKey: workoutEntries.dayKey,
        status: workoutEntries.status,
      })
      .from(workoutEntries)
      .where(
        and(
          gte(workoutEntries.dayKey, dateFrom),
          lte(workoutEntries.dayKey, dateTo),
        ),
      )
      .all();

    const weights = await db
      .select({ dayKey: weightEntries.dayKey })
      .from(weightEntries)
      .where(
        and(
          gte(weightEntries.dayKey, dateFrom),
          lte(weightEntries.dayKey, dateTo),
        ),
      )
      .all();

    const unlinkedActivitiesRows = await db
      .select({ vendorActivities })
      .from(vendorActivities)
      .leftJoin(
        workoutEntries,
        eq(workoutEntries.vendorActivityId, vendorActivities.id),
      )
      .where(
        and(
          isNull(workoutEntries.id),
          gte(vendorActivities.createdAt, dateFromTs),
          lt(vendorActivities.createdAt, dateToTs),
        ),
      )
      .orderBy(desc(vendorActivities.createdAt))
      .all();

    const unlinkedActivities = unlinkedActivitiesRows.map(
      (r) => r.vendorActivities,
    );

    const unlinkedByDay = Map.groupBy(unlinkedActivities, (a) =>
      toIsoDate(a.createdAt, timezone),
    );

    const weightDays = new Set(weights.map((w) => w.dayKey));
    const workoutsByDay = Map.groupBy(workouts, (r) => r.dayKey);

    const allDayKeys = enumerateLocalDayKeysInclusive(dateFrom, dateTo);

    const items = allDayKeys.map((dayKey) => ({
      dayKey,
      activities: (workoutsByDay.get(dayKey) ?? []).map(
        ({ id, kind, status }) => ({ id, kind, status }),
      ),
      hasWeight: weightDays.has(dayKey),
      hasUnlinked: unlinkedByDay.has(dayKey),
      isToday: dayKey === today,
    }));

    return items;
  });

const list = createServerFn({ method: "GET" })
  .inputValidator(activityListSchema)
  .handler(async ({ data }): Promise<PlannedWorkoutsPageResult> => {
    return activityServerFns.list(data);
  });

const viz = createServerFn({ method: "GET" })
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
      wheres.push(gte(workoutEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "6m") {
      date.setMonth(date.getMonth() - 6);
      wheres.push(gte(workoutEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "12m") {
      date.setFullYear(date.getFullYear() - 1);
      wheres.push(gte(workoutEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "ytd") {
      date.setMonth(0);
      date.setDate(0);
      wheres.push(gte(workoutEntries.dayKey, date.toISOString().split("T")[0]));
    }

    wheres.push(eq(workoutEntries.kind, options.kind));
    wheres.push(eq(workoutEntries.status, "completed"));

    const db = await getDb();

    const rows = await db
      .select({
        kind: workoutEntries.kind,
        dayKey: workoutEntries.dayKey,
        vendorActivy: {
          vendor: vendorActivities.vendor,
          data: vendorActivities.data,
        },
      })
      .from(workoutEntries)
      .leftJoin(
        vendorActivities,
        eq(workoutEntries.vendorActivityId, vendorActivities.id),
      )
      .where(and(...wheres))
      .orderBy(asc(workoutEntries.dayKey))
      .all();

    const out: VizResult[] = [];
    rows.forEach((r) => {
      const { vendorActivy } = r;
      if (!vendorActivy) return;
      const va = vendorActivy as TypedVendorWorkoutRow;
      const value = getVizValue(va, options.metric);
      if (value) {
        out.push({
          date: r.dayKey,
          value,
        });
      }
    });

    const grouped = new Map<string, GroupItem>();

    out.forEach(({ date, value }) => {
      rollupValue(grouped, options.agg, options.metric, date, value);
    });

    const folded: VizResult[] = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, g]) => ({ date, value: g.v }));

    if (!options.cumulative) {
      return folded;
    }

    return folded.reduce((acc, item) => {
      const prev = acc.at(-1)?.value ?? 0;
      acc.push({ date: item.date, value: prev + item.value });
      return acc;
    }, [] as VizResult[]);
  });

const vizStacked = createServerFn({ method: "GET" })
  .inputValidator(stackedVizSchema)
  .handler(async ({ data }): Promise<StackedVizResult[]> => {
    const currentSettings = await cookieActions.getVizSettings();

    const options: SessionChartSettings = {
      ...currentSettings,
      ...data,
    };

    if (!["distance", "time"].includes(options.metric)) {
      return [];
    }

    const wheres = [];
    const date = new Date();
    if (options.range === "3m") {
      date.setMonth(date.getMonth() - 3);
      wheres.push(gte(workoutEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "6m") {
      date.setMonth(date.getMonth() - 6);
      wheres.push(gte(workoutEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "12m") {
      date.setFullYear(date.getFullYear() - 1);
      wheres.push(gte(workoutEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "ytd") {
      date.setMonth(0);
      date.setDate(0);
      wheres.push(gte(workoutEntries.dayKey, date.toISOString().split("T")[0]));
    }

    wheres.push(inArray(workoutEntries.kind, ["bike", "run", "swim"]));
    wheres.push(eq(workoutEntries.status, "completed"));

    const db = await getDb();

    const rows = await db
      .select({
        kind: workoutEntries.kind,
        dayKey: workoutEntries.dayKey,
        vendorActivy: {
          vendor: vendorActivities.vendor,
          data: vendorActivities.data,
        },
      })
      .from(workoutEntries)
      .leftJoin(
        vendorActivities,
        eq(workoutEntries.vendorActivityId, vendorActivities.id),
      )
      .where(and(...wheres))
      .orderBy(asc(workoutEntries.dayKey))
      .all();

    const out: (VizResult & { kind: "swim" | "bike" | "run" })[] = [];
    rows.forEach((r) => {
      const { vendorActivy } = r;
      if (!vendorActivy) return;
      const va = vendorActivy as TypedVendorWorkoutRow;
      const value = getVizValue(va, options.metric);
      if (value) {
        out.push({
          date: r.dayKey,
          value,
          kind: r.kind as "swim" | "bike" | "run",
        });
      }
    });

    const grouped = new Map<string, StackedGroupItem>();

    out.forEach(({ date, value, kind }) => {
      rollupStackedValue(grouped, options.agg, kind, date, value);
    });

    const folded: StackedVizResult[] = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, g]) => ({ date, values: g.values }));

    if (!options.proportional && !options.cumulative) {
      return folded;
    }

    if (options.proportional) {
      return folded.map((f) => {
        const tot = f.values.bike + f.values.run + f.values.swim;
        return {
          date: f.date,
          values: {
            swim: f.values.swim / tot,
            bike: f.values.bike / tot,
            run: f.values.run / tot,
          },
        };
      });
    }

    return folded.reduce((acc, item) => {
      const prev = acc.at(-1);
      acc.push({
        date: item.date,
        values: {
          swim: (prev?.values.swim ?? 0) + item.values.swim,
          bike: (prev?.values.bike ?? 0) + item.values.bike,
          run: (prev?.values.run ?? 0) + item.values.run,
        },
      });
      return acc;
    }, [] as StackedVizResult[]);
  });

const unlinked = createServerFn({ method: "GET" }).handler(
  async (): Promise<UnlinkedActivitiesItem[]> => {
    const timezone = await cookieActions.getTimezone();
    const db = await getDb();

    const rows = await db
      .select({ vendorActivities })
      .from(vendorActivities)
      .leftJoin(
        workoutEntries,
        eq(workoutEntries.vendorActivityId, vendorActivities.id),
      )
      .where(isNull(workoutEntries.id))
      .orderBy(desc(vendorActivities.createdAt))
      .all();

    return rows.map((r) => ({
      ...r.vendorActivities,
      dayKey: toIsoDate(r.vendorActivities.createdAt, timezone),
    }));
  },
);

const linkAll = createServerFn({ method: "POST" }).handler(
  async (): Promise<LinkAllResponse> => {
    const timezone = await cookieActions.getTimezone();

    const db = await getDb();
    const now = new Date();

    const unlinkedActivities = await unlinked();

    const allPlans = await db
      .select()
      .from(workoutEntries)
      .where(
        and(
          isNull(workoutEntries.vendorActivityId),
          eq(workoutEntries.status, "planned"),
        ),
      )
      .all();

    const plansByDayKind = new Map<string, WorkoutEntryRow[]>();
    for (const p of allPlans) {
      const key = `${p.dayKey}:${p.kind}`;
      const arr = plansByDayKind.get(key) ?? [];
      arr.push(p);
      plansByDayKind.set(key, arr);
    }

    const resolvedIds = [];

    for (const unlinkedActivity of unlinkedActivities) {
      const activity = unlinkedActivity as TypedVendorWorkoutRow;
      const dayKey = toIsoDate(activity.createdAt, timezone);
      const planKind = vendorActivityToPlanKind(activity);
      if (!planKind) continue;

      const key = `${dayKey}:${planKind}`;
      const candidates = plansByDayKind.get(key) ?? [];
      const existing = candidates.shift(); // take the first available, remove it so next cw doesn't reuse it

      if (existing) {
        await db
          .update(workoutEntries)
          .set({
            vendorActivityId: activity.id,
            status: "completed",
            updatedAt: now,
          })
          .where(eq(workoutEntries.id, existing.id))
          .run();
        existing.vendorActivityId = activity.id;
        existing.status = "completed";
      } else {
        const id = crypto.randomUUID();
        await db
          .insert(workoutEntries)
          .values({
            id,
            kind: planKind,
            dayKey,
            notes: null,
            status: "completed",
            routineVendor: activity.vendor,
            routineId: null,
            vendorActivityId: activity.id,
            distance: null,
            distanceUnits: null,
            timeSeconds: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      resolvedIds.push(activity.id);
    }

    if (resolvedIds.length > 0) {
      await db
        .update(vendorActivities)
        .set({ updatedAt: now })
        .where(inArray(vendorActivities.id, resolvedIds))
        .run();
    }

    return {
      nLinked: resolvedIds.length,
      nUnlinked: unlinkedActivities.length - resolvedIds.length,
    };
  },
);

/** Server-fn registration only — DB implementation lives in `planner-db-operations.ts` (not client-bundled). */
const get = createServerFn({ method: "GET" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<WorkoutEntryWithCompleted> => {
    return activityServerFns.get(data);
  });

const create = createServerFn({ method: "POST" })
  .inputValidator(createPlanSchema)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const cardio = ["run", "bike", "swim"].includes(data.kind);
    const distance = cardio ? data.distance : null;
    const distanceUnits = cardio ? data.distanceUnits : null;

    const db = await getDb();

    const id = crypto.randomUUID();
    await db
      .insert(workoutEntries)
      .values({
        id,
        kind: data.kind,
        dayKey: data.dayKey,
        notes: data.notes ?? null,
        status: "planned",
        routineVendor: data.kind === "lift" ? "hevy" : "strava",
        routineId: data.kind === "lift" ? data.routineId : null,
        vendorActivityId: null,
        distance,
        distanceUnits,
        timeSeconds: data.timeSeconds,
      })
      .run();
    return { id };
  });

const createFromCompleted = createServerFn({ method: "POST" })
  .inputValidator(createFromCompletedSchema)
  .handler(async ({ data }) => {
    const db = await getDb();

    const completed = await db
      .select()
      .from(vendorActivities)
      .where(eq(vendorActivities.id, data.vendorActivityId))
      .get();
    if (!completed) throw new Error("Completed workout not found");
    const linked = await db
      .select()
      .from(workoutEntries)
      .where(eq(workoutEntries.vendorActivityId, completed.id))
      .get();
    if (linked) throw new Error("Activity is already linked");

    const planKind = vendorActivityToPlanKind(
      completed as TypedVendorWorkoutRow,
    );

    if (!planKind) {
      throw new Error(
        `cannot create a plan from ${completed.vendor} due to incompatible activity type`,
      );
    }

    const existing = await db
      .select()
      .from(workoutEntries)
      .where(
        and(
          eq(workoutEntries.dayKey, data.dayKey),
          eq(workoutEntries.kind, planKind),
          isNull(workoutEntries.vendorActivityId),
        ),
      )
      .get();

    const id = existing ? existing.id : crypto.randomUUID();
    if (existing) {
      await db
        .update(workoutEntries)
        .set({
          vendorActivityId: completed.id,
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(workoutEntries.id, existing.id))
        .run();
    } else {
      await db
        .insert(workoutEntries)
        .values({
          id,
          kind: planKind,
          dayKey: data.dayKey,
          status: "completed",
          routineVendor: completed.vendor,
          routineId: null,
          vendorActivityId: completed.id,
          notes: null,
          distance: null,
          distanceUnits: null,
          timeSeconds: null,
        })
        .run();
    }

    return { id };
  });

const update = createServerFn({ method: "POST" })
  .inputValidator(updatePlanSchema)
  .handler(async ({ data }): Promise<{ ok: boolean; note?: string }> => {
    const db = await getDb();
    const row = await db
      .select()
      .from(workoutEntries)
      .where(eq(workoutEntries.id, data.id))
      .get();

    if (!row) throw new Error("Plan not found");
    const updates: Partial<NewWorkoutEntryRow> = { updatedAt: new Date() };

    if (data.notes !== undefined) updates.notes = data.notes;

    if (!row.vendorActivityId) {
      if (data.dayKey !== undefined) updates.dayKey = data.dayKey;
      if (data.kind !== undefined) updates.kind = data.kind;
      if (data.distance !== undefined) updates.distance = data.distance;
      if (data.distanceUnits !== undefined)
        updates.distanceUnits = data.distanceUnits;
      if (data.timeSeconds !== undefined)
        updates.timeSeconds = data.timeSeconds;
      if (data.routineId !== undefined) {
        if (data.routineId && data.routineId !== row.routineId) {
          try {
            await hevyFetchRoutineById(data.routineId);
          } catch {
            throw new Error(
              "Could not verify routine — it may no longer exist in Hevy.",
            );
          }
          updates.routineId = data.routineId;
          updates.routineVendor = "hevy";
        } else if (!data.routineId) {
          updates.routineId = null;
          updates.routineVendor = null;
        }
      }
    }

    await db
      .update(workoutEntries)
      .set(updates)
      .where(eq(workoutEntries.id, data.id));
    return { ok: true };
  });

const deletePlan = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    const db = await getDb();
    const plan = await db
      .select({ completedWorkoutId: workoutEntries.vendorActivityId })
      .from(workoutEntries)
      .where(eq(workoutEntries.id, data.id))
      .get();
    if (!plan) throw new Error("plan not found");
    if (plan.completedWorkoutId) {
      return {
        ok: false,
        note: "cannot delete a completed workout",
      };
    }
    await db.delete(workoutEntries).where(eq(workoutEntries.id, data.id)).run();
    return { ok: true };
  });

export const activityActions = {
  calendar,
  list,
  get,
  create,
  createFromCompleted,
  viz,
  vizStacked,
  unlinked,
  linkAll,
  update,
  deletePlan,
};
