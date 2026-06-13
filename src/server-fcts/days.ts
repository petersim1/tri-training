import { createServerFn } from "@tanstack/react-start";
import { and, eq, getTableColumns, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/index.server";
import {
  vendorActivities,
  weightEntries,
  workoutEntries,
} from "@/lib/db/schema.server";
import { toUtcBounds } from "@/lib/utils/dates";
import { dayKeySchema } from "@/types/requests/shared";
import type { DayItem } from "@/types/responses/activities";
import { cookieActions } from "./cookies";

const dayInfo = createServerFn({ method: "GET" })
  .inputValidator(dayKeySchema)
  .handler(async ({ data }): Promise<DayItem> => {
    const timezone = await cookieActions.getTimezone();

    const db = await getDb();

    const activities = await db
      .select({
        ...getTableColumns(workoutEntries),
        vendorActivity: {
          ...getTableColumns(vendorActivities),
        },
      })
      .from(workoutEntries)
      .leftJoin(
        vendorActivities,
        eq(vendorActivities.id, workoutEntries.vendorActivityId),
      )
      .where(eq(workoutEntries.dayKey, data.dayKey))
      .all();

    const weight = await db
      .select()
      .from(weightEntries)
      .where(eq(weightEntries.dayKey, data.dayKey))
      .get();

    const { start, end } = toUtcBounds(data.dayKey, timezone);

    const linkCandidates = await db
      .select({ vendorActivities })
      .from(vendorActivities)
      .leftJoin(
        workoutEntries,
        eq(workoutEntries.vendorActivityId, vendorActivities.id),
      )
      .where(
        and(
          gte(vendorActivities.createdAt, start),
          lte(vendorActivities.createdAt, end),
          isNull(workoutEntries.id),
        ),
      )
      .all();

    return {
      activities,
      weight: weight?.weightLb,
      linkCandidates: linkCandidates.map((r) => r.vendorActivities),
    };
  });

export const dayActions = {
  dayInfo,
};
