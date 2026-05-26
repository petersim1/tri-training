import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gte } from "drizzle-orm";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import { getDb } from "@/lib/db/index.server";
import { weightEntries } from "@/lib/db/schema.server";
import { cookieActions } from "@/server-fcts";
import { baseVizSchema } from "@/types/requests/activities";
import { dayKeySchema } from "@/types/requests/shared";
import { createWeightSchema } from "@/types/requests/weights";
import type { VizResult } from "@/types/responses/activities";

export const viz = createServerFn({ method: "GET" })
  .inputValidator(baseVizSchema)
  .handler(async ({ data }): Promise<VizResult[]> => {
    const currentSettings = await cookieActions.getVizSettings();
    const options: SessionChartSettings = {
      ...currentSettings,
      ...data,
    };

    const wheres = [];
    const date = new Date();
    if (options.range === "3m") {
      date.setMonth(date.getMonth() - 3);
      wheres.push(gte(weightEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "6m") {
      date.setMonth(date.getMonth() - 6);
      wheres.push(gte(weightEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "12m") {
      date.setFullYear(date.getFullYear() - 1);
      wheres.push(gte(weightEntries.dayKey, date.toISOString().split("T")[0]));
    }
    if (options.range === "ytd") {
      date.setMonth(0);
      date.setDate(0);
      wheres.push(gte(weightEntries.dayKey, date.toISOString().split("T")[0]));
    }

    const db = await getDb();

    const rows = await db
      .select({
        date: weightEntries.dayKey,
        value: weightEntries.weightLb,
      })
      .from(weightEntries)
      .where(and(...wheres))
      .orderBy(asc(weightEntries.dayKey))
      .all();

    return rows;
  });

/** Set or replace the single weight for a calendar day (`YYYY-MM-DD`). */
export const set = createServerFn({ method: "POST" })
  .inputValidator(createWeightSchema)
  .handler(async ({ data }) => {
    const w = data.weightLb;
    if (!Number.isFinite(w) || w <= 0) {
      throw new Error("Enter a positive weight in pounds");
    }
    const now = new Date();
    const id = crypto.randomUUID();
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx
        .delete(weightEntries)
        .where(eq(weightEntries.dayKey, data.dayKey))
        .run();
      await tx
        .insert(weightEntries)
        .values({
          id,
          dayKey: data.dayKey,
          measuredAt: new Date(data.dayKey).toString(),
          weightLb: w,
          notes: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
    return { id };
  });

export const remove = createServerFn({ method: "POST" })
  .inputValidator(dayKeySchema)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db
      .delete(weightEntries)
      .where(eq(weightEntries.dayKey, data.dayKey))
      .run();
    return { ok: true };
  });
