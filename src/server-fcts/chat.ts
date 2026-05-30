import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import z from "zod";
import { getPlanningOpenAiClient } from "@/lib/chat/client";
import { runCoachingStateSummary } from "@/lib/chat/coach/runner";
import { handleApproval } from "@/lib/chat/main/approval";
import type { ChatRunContext } from "@/lib/chat/main/dependency";
import { persistTurn, runPlanningTurn } from "@/lib/chat/main/runner";
import { runReplaySummary } from "@/lib/chat/replay/runner";
import { getDb } from "@/lib/db/index.server";
import {
  type ChatMessageRow,
  type ChatThreadRow,
  chatMessages,
  chatThreads,
  coachingState,
  type SportEventRow,
} from "@/lib/db/schema.server";
import type { ToolName } from "@/types/chats/tools";
import { chatSchema, listMessagesSchema } from "@/types/requests/chat";
import { idSchema } from "@/types/requests/shared";
import type { ChatMessage } from "@/types/responses/chat";
import { coachingActions } from "./coaching";
import { eventActions } from "./events";

const getThread = createServerFn({ method: "GET" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<ChatThreadRow> => {
    const db = await getDb();
    const thread = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.id, data.id))
      .get();

    if (!thread) {
      throw new Error("not found");
    }
    return thread;
  });

const listThreads = createServerFn({
  method: "GET",
}).handler(async (): Promise<ChatThreadRow[]> => {
  const db = await getDb();
  return db
    .select()
    .from(chatThreads)
    .orderBy(desc(chatThreads.updatedAt))
    .all();
});

const createThread = createServerFn({
  method: "POST",
}).handler(async (): Promise<string> => {
  const db = await getDb();
  const [row] = await db
    .insert(chatThreads)
    .values({})
    .returning({ id: chatThreads.id });
  if (!row) {
    throw new Error("Failed to create planning thread");
  }
  const existing = await db
    .select({ id: coachingState.id })
    .from(coachingState)
    .get();
  if (!existing) {
    await db.insert(coachingState).values({}).run();
  }
  return row.id;
});

const listMessages = createServerFn({
  method: "POST",
})
  .inputValidator(listMessagesSchema)
  .handler(async ({ data }): Promise<ChatMessageRow[]> => {
    const tid = String(data.threadId ?? "").trim();
    if (!tid) {
      return [];
    }
    const db = await getDb();

    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, tid))
      .orderBy(asc(chatMessages.createdAt))
      .all();
  });

const deleteThread = createServerFn({
  method: "POST",
})
  .inputValidator((d: { threadId: string }) => d)
  .handler(async ({ data }): Promise<{ deleted: boolean }> => {
    const tid = data.threadId.trim();
    if (!tid) {
      return { deleted: false };
    }

    const db = await getDb();
    await db.delete(chatThreads).where(eq(chatThreads.id, tid)).run();
    return { deleted: true };
  });

const updateTitle = createServerFn({ method: "POST" })
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
      .from(chatThreads)
      .where(and(eq(chatThreads.id, data.id), isNull(chatThreads.title)))
      .get();

    if (row) {
      const title = data.title.trim().slice(0, 96).replace(/\s+/g, " ");
      await db
        .update(chatThreads)
        .set({ title, updatedAt: new Date() })
        .where(eq(chatThreads.id, data.id));
    }
  });

const chat = createServerFn({ method: "POST" })
  .inputValidator(chatSchema)
  .handler(async ({ data }) => {
    if (data.type === "approval") {
      await handleApproval(data.threadId, data.approved);
      return;
    }

    const thread = await getThread({ data: { id: data.threadId } });
    const coachingState = await coachingActions.get();

    let event: SportEventRow | undefined;
    if (data.eventId) {
      const ev = await eventActions.get({ data: { id: data.eventId } });
      if (!ev) {
        throw new Error("unknown_sport_event");
      }
      event = ev;
    }

    const client = getPlanningOpenAiClient(process.env.OPENAI_KEY as string);

    const ctx: ChatRunContext = {
      runStart: new Date(),
      dayKey: data.dayKey,
      thread,
      coachingState,
      event,
      round: 0,
      maxRounds: 10,
      toolsCalled: [],
      availableTools: new Set<ToolName>([
        "list_workouts",
        "get_workout",
        "create_workout",
        "update_workout",
        "delete_workout",
      ]),
    };

    const db = await getDb();

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, thread.id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(6)
      .all();

    const stream = new ReadableStream<ChatMessage>({
      async start(controller) {
        const emit = (chunk: ChatMessage) => {
          controller.enqueue(chunk);
        };

        let assistantText = "";
        try {
          assistantText = await runPlanningTurn(
            client,
            ctx,
            messages,
            data.message,
            emit,
          );
        } catch (e) {
          emit({
            type: "error",
            message: e instanceof Error ? e.message : "failed",
          });
        } finally {
          if (ctx.proposals) {
            emit({ type: "approval" });
          }
          emit({ type: "done" });

          // fire and forget after stream closes
          void persistTurn(ctx, data.message, assistantText)
            .then((sysMessage) => {
              runReplaySummary(client, ctx, messages, data.message, sysMessage);
              runCoachingStateSummary(
                client,
                ctx,
                messages,
                data.message,
                sysMessage,
              );
            })
            .catch(console.error);

          controller.close();
        }
      },
    });

    return stream;
  });

export const chatActions = {
  getThread,
  createThread,
  deleteThread,
  listThreads,
  listMessages,
  chat,
  updateTitle,
};
