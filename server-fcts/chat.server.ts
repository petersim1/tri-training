import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import z from "zod";
import { getDb } from "@/lib/db/index.server";
import {
  type PlanningChatMessageRow,
  type PlanningChatThreadRow,
  planningChatMessages,
  planningChatThreads,
} from "@/lib/db/schema.server";
import { idSchema } from "@/types/requests/shared";

export const getThread = createServerFn({ method: "GET" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    const db = await getDb();
    return db
      .select()
      .from(planningChatThreads)
      .where(eq(planningChatThreads.id, data.id))
      .get();
  });

export const listThreads = createServerFn({
  method: "GET",
}).handler(async (): Promise<PlanningChatThreadRow[]> => {
  const db = await getDb();
  return db
    .select()
    .from(planningChatThreads)
    .orderBy(desc(planningChatThreads.updatedAt))
    .all();
});

export const createThread = createServerFn({
  method: "POST",
}).handler(async (): Promise<PlanningChatThreadRow> => {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const row: typeof planningChatThreads.$inferInsert = {
    id,
    title: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(planningChatThreads).values(row).run();
  const inserted = await db
    .select()
    .from(planningChatThreads)
    .where(eq(planningChatThreads.id, id))
    .get();
  if (!inserted) {
    throw new Error("Failed to create planning thread");
  }
  return inserted;
});

export const listMessages = createServerFn({
  method: "POST",
})
  .inputValidator((d: { threadId: string }) => d)
  .handler(async ({ data }): Promise<PlanningChatMessageRow[]> => {
    const tid = String(data.threadId ?? "").trim();
    if (!tid) {
      return [];
    }
    const db = await getDb();

    return db
      .select()
      .from(planningChatMessages)
      .where(eq(planningChatMessages.threadId, tid))
      .orderBy(asc(planningChatMessages.seq))
      .all();
  });

export const deleteThread = createServerFn({
  method: "POST",
})
  .inputValidator((d: { threadId: string }) => d)
  .handler(async ({ data }): Promise<{ deleted: boolean }> => {
    const tid = data.threadId.trim();
    if (!tid) {
      return { deleted: false };
    }

    const db = await getDb();
    await db
      .delete(planningChatThreads)
      .where(eq(planningChatThreads.id, tid))
      .run();
    return { deleted: true };
  });

export const updateTitle = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      ...idSchema.shape,
      title: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const row = await db
      .select()
      .from(planningChatThreads)
      .where(
        and(
          eq(planningChatThreads.id, data.id),
          isNull(planningChatThreads.title),
        ),
      )
      .get();

    if (row) {
      const title = data.title.trim().slice(0, 96).replace(/\s+/g, " ");
      await db
        .update(planningChatThreads)
        .set({ title, updatedAt: new Date() })
        .where(eq(planningChatThreads.id, data.id));
    }
  });
