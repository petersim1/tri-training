import { createServerFn } from "@tanstack/react-start";
import { and, eq, getTableColumns, gte, lte } from "drizzle-orm";
import z from "zod";
import { getDb } from "@/lib/db/index.server";
import {
  completedWorkouts,
  plannedWorkouts,
  weightEntries,
} from "@/lib/db/schema.server";
import { timezoneSchema } from "@/types/requests/shared";
import type { DayItem } from "@/types/responses/activities";

export const dayInfo = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      ...timezoneSchema.shape,
      dayKey: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<DayItem> => {
    // on initial server load, this won't be available to us from the client.

    const db = await getDb();

    const activities = await db
      .select({
        ...getTableColumns(plannedWorkouts),
        completedWorkout: {
          ...getTableColumns(completedWorkouts),
        },
      })
      .from(plannedWorkouts)
      .leftJoin(
        completedWorkouts,
        eq(completedWorkouts.id, plannedWorkouts.completedWorkoutId),
      )
      .where(eq(plannedWorkouts.dayKey, data.dayKey))
      .all();

    const weight = await db
      .select()
      .from(weightEntries)
      .where(eq(weightEntries.dayKey, data.dayKey))
      .get();

    const startOfDay = new Date(`${data.dayKey}T00:00:00`);
    const endOfDay = new Date(`${data.dayKey}T23:59:59.999`);

    const tzOffset = (date: Date) =>
      date.getTime() -
      new Date(
        date.toLocaleString("en-US", { timeZone: data.timezone }),
      ).getTime();

    const utcStart = new Date(startOfDay.getTime() + tzOffset(startOfDay));
    const utcEnd = new Date(endOfDay.getTime() + tzOffset(endOfDay));

    const unlinkedCandidates = await db
      .select()
      .from(completedWorkouts)
      .where(
        and(
          gte(completedWorkouts.createdAt, utcStart),
          lte(completedWorkouts.createdAt, utcEnd),
          eq(completedWorkouts.isResolved, false),
        ),
      );

    return {
      activities,
      weight: weight?.weightLb,
      linkCandidates: unlinkedCandidates,
    };
  });
