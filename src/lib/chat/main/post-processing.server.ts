import { getDb } from "@/lib/db/index.server";
import {
  type ChatMessageRow,
  chatMessages,
  type NewChatMessageRow,
} from "@/lib/db/schema.server";
import type { ChatRunContext } from "./dependency";

export const persistTurn = async (
  ctx: ChatRunContext,
  userMessage: string,
  dbMessages: NewChatMessageRow[],
): Promise<ChatMessageRow> => {
  const db = await getDb();

  const messagesStore: NewChatMessageRow[] = [
    {
      createdAt: ctx.runStart,
      updatedAt: ctx.runStart,
      threadId: ctx.thread.id,
      seq: ctx.seq,
      round: -1,
      role: "user",
      content: userMessage,
      sportEventId: ctx.event?.id,
    },
    ...dbMessages.map((m) => ({
      ...m,
      sportEventId: ctx.event?.id,
    })),
  ];

  const messages = await db
    .insert(chatMessages)
    .values(messagesStore)
    .returning();

  const assistantMessage = messages.find((m) => m.role === "assistant");
  if (!assistantMessage) throw new Error("No assistant message found");
  return assistantMessage;
};
