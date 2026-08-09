import { type Exception, trace } from "@opentelemetry/api";
import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index.server";
import { type SportEventRow, sportEvents } from "@/lib/db/schema.server";
import { createSportEventSchema, updateSportEventSchema } from "@/types/requests/events";
import { idSchema } from "@/types/requests/shared";

const tracer = trace.getTracer("bevor.events");

const get = createServerFn({ method: "GET" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<SportEventRow> => {
    return tracer.startActiveSpan("get", async (span) => {
      try {
        const db = await getDb();
        const row = await db.select().from(sportEvents).where(eq(sportEvents.id, data.id)).get();

        if (!row) {
          throw new Error("not found");
        }

        return row;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const list = createServerFn({ method: "GET" }).handler(async (): Promise<SportEventRow[]> => {
  return tracer.startActiveSpan("list", async (span) => {
    try {
      const db = await getDb();
      return await db
        .select()
        .from(sportEvents)
        .orderBy(asc(sportEvents.eventDayKey))
        .limit(20)
        .all();
    } catch (err) {
      span.recordException(err as Exception);
      throw err;
    } finally {
      span.end();
    }
  });
});

const add = createServerFn({ method: "POST" })
  .inputValidator(createSportEventSchema)
  .handler(async ({ data }): Promise<SportEventRow> => {
    return tracer.startActiveSpan("add", async (span) => {
      try {
        const db = await getDb();

        const now = new Date();
        const id = crypto.randomUUID();
        const [event] = await db
          .insert(sportEvents)
          .values({
            id,
            name: data.name,
            eventDayKey: data.dayKey,
            status: "planned",
            discipline: data.discipline,
            notes: data.notes,
            targets: data.targets,
            url: data.url,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!event) {
          throw new Error("Failed to create event");
        }
        return event;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const update = createServerFn({ method: "POST" })
  .inputValidator(updateSportEventSchema)
  .handler(async ({ data }): Promise<SportEventRow> => {
    return tracer.startActiveSpan("update", async (span) => {
      try {
        const db = await getDb();
        const existing = await db
          .select()
          .from(sportEvents)
          .where(eq(sportEvents.id, data.id))
          .get();

        if (!existing) throw new Error("Event not found");

        const [event] = await db
          .update(sportEvents)
          .set({
            name: data.name ?? existing.name,
            eventDayKey: data.dayKey ?? existing.eventDayKey,
            discipline: data.discipline === undefined ? existing.discipline : data.discipline,
            status: data.status ?? existing.status,
            notes: data.notes === undefined ? existing.notes : data.notes,
            targets: data.targets ?? existing.targets,
            url: data.url === undefined ? existing.url : data.url,
            updatedAt: new Date(),
          })
          .where(eq(sportEvents.id, data.id))
          .returning();

        if (!event) {
          throw new Error("Failed to update event");
        }
        return event;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const remove = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    return tracer.startActiveSpan("remove", async (span) => {
      try {
        const db = await getDb();
        await db.delete(sportEvents).where(eq(sportEvents.id, data.id)).run();
        return { ok: true };
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

export const eventActions = {
  get,
  list,
  add,
  update,
  remove,
};
