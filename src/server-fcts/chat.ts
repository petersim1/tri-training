import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import z from "zod";
import { getPlanningOpenAiClient } from "@/lib/chat/client";
import { runCoachingStateSummary } from "@/lib/chat/coach/runner";
import { handleApproval } from "@/lib/chat/main/approval";
import type { ChatRunContext } from "@/lib/chat/main/dependency";
import { persistTurn } from "@/lib/chat/main/post-processing";
import { runPlanningTurn } from "@/lib/chat/main/runner";
import { runReplaySummary } from "@/lib/chat/replay/runner";
import { getDb } from "@/lib/db/index.server";
import {
  type ChatThreadRow,
  chatMessages,
  chatThreads,
  coachingState,
  type NewChatMessageRow,
  type SportEventRow,
} from "@/lib/db/schema.server";
import { logMessage } from "@/lib/utils";
import type { ToolName } from "@/types/chats/tools";
import { chatSchema, listMessagesSchema } from "@/types/requests/chat";
import { idSchema } from "@/types/requests/shared";
import type { ChatMessage } from "@/types/responses/chat";
import type { ChatMessageItem } from "@/types/responses/chats";
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
  const threads = await db
    .select()
    .from(chatThreads)
    .orderBy(desc(chatThreads.updatedAt))
    .all();
  return threads;
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
  .handler(async ({ data }): Promise<ChatMessageItem[]> => {
    const tid = String(data.threadId ?? "").trim();
    if (!tid) {
      return [];
    }
    const db = await getDb();

    const baseQuery = db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.threadId, tid),
          inArray(chatMessages.role, ["assistant", "user"]),
        ),
      )
      .orderBy(
        data.orderBy === "desc"
          ? desc(chatMessages.createdAt)
          : asc(chatMessages.createdAt),
      );

    const messages = await (data.limit
      ? baseQuery.limit(data.limit)
      : baseQuery
    ).all();

    const seqs = Array.from(new Set(messages.map((m) => m.seq)));

    const proposals = await db
      .select({ seq: chatMessages.seq, proposal: chatMessages.proposal })
      .from(chatMessages)
      .where(
        and(
          isNotNull(chatMessages.proposal),
          inArray(chatMessages.seq, seqs),
          eq(chatMessages.threadId, tid),
          eq(chatMessages.role, "tool"),
        ),
      );
    const proposalSet = Map.groupBy(proposals, (r) => r.seq);

    return messages.map((m) => {
      if (m.role === "tool") throw new Error();
      if (m.role === "user") return m as ChatMessageItem;
      const proposals = proposalSet.get(m.seq);
      if (!proposals) return m as ChatMessageItem;
      return {
        ...m,
        role: m.role as "user" | "assistant",
        proposalSet: proposals.map((p) => {
          return {
            // biome-ignore lint/style/noNonNullAssertion: <guaranteed from the query>
            op: p.proposal!.item.op,
            // biome-ignore lint/style/noNonNullAssertion: <guaranteed from the query>
            status: p.proposal!.status,
          };
        }),
      } as ChatMessageItem;
    });
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
    logMessage(data);
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

    const messages = await listMessages({
      data: { threadId: thread.id, orderBy: "desc", limit: 6 },
    });

    const ctx: ChatRunContext = {
      seq: messages.length ? messages[0].seq + 1 : 0,
      runStart: new Date(),
      dayKey: data.dayKey,
      thread,
      coachingState,
      event,
      hasProposal: false,
      maxRounds: 10,
      availableTools: new Set<ToolName>([
        "list_workouts",
        "get_workout",
        "create_workout",
        "update_workout",
        "delete_workout",
      ]),
    };

    const stream = new ReadableStream<ChatMessage>({
      async start(controller) {
        const emit = (chunk: ChatMessage) => {
          controller.enqueue(chunk);
        };

        let dbMessagesStore: NewChatMessageRow[] = [];
        try {
          dbMessagesStore = await runPlanningTurn(
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
          if (ctx.hasProposal) {
            emit({ type: "approval" });
          }
          emit({ type: "done" });

          // fire and forget after stream closes
          void persistTurn(ctx, data.message, dbMessagesStore)
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
