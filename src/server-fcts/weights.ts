import { type Exception, trace } from "@opentelemetry/api";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gte } from "drizzle-orm";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import { getDb } from "@/lib/db/index.server";
import { weightEntries } from "@/lib/db/schema.server";
import { baseVizSchema } from "@/types/requests/activities";
import { dayKeySchema } from "@/types/requests/shared";
import { createWeightSchema } from "@/types/requests/weights";
import type { VizResult } from "@/types/responses/activities";
import { cookieActions } from "./cookies";

const tracer = trace.getTracer("bevor.weights");

const viz = createServerFn({ method: "GET" })
  .inputValidator(baseVizSchema)
  .handler(async ({ data }): Promise<VizResult[]> => {
    return tracer.startActiveSpan("viz", async (span) => {
      try {
        const currentSettings = await cookieActions.getVizSettings();
        const options: SessionChartSettings = {
          ...currentSettings,
          ...data,
        };

        const wheres = [];
        const date = new Date();
        if (options.range === "3m") {
          date.setMonth(date.getMonth() - 3);
          wheres.push(
            gte(weightEntries.dayKey, date.toISOString().split("T")[0]),
          );
        }
        if (options.range === "6m") {
          date.setMonth(date.getMonth() - 6);
          wheres.push(
            gte(weightEntries.dayKey, date.toISOString().split("T")[0]),
          );
        }
        if (options.range === "12m") {
          date.setFullYear(date.getFullYear() - 1);
          wheres.push(
            gte(weightEntries.dayKey, date.toISOString().split("T")[0]),
          );
        }
        if (options.range === "ytd") {
          date.setMonth(0);
          date.setDate(0);
          wheres.push(
            gte(weightEntries.dayKey, date.toISOString().split("T")[0]),
          );
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
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

/** Set or replace the single weight for a calendar day (`YYYY-MM-DD`). */
const set = createServerFn({ method: "POST" })
  .inputValidator(createWeightSchema)
  .handler(async ({ data }) => {
    return tracer.startActiveSpan("set", async (span) => {
      try {
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
              weightLb: w,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        });
        return { id };
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const remove = createServerFn({ method: "POST" })
  .inputValidator(dayKeySchema)
  .handler(async ({ data }) => {
    return tracer.startActiveSpan("remove", async (span) => {
      try {
        const db = await getDb();
        await db
          .delete(weightEntries)
          .where(eq(weightEntries.dayKey, data.dayKey))
          .run();
        return { ok: true };
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

export const weightActions = {
  viz,
  set,
  remove,
};
