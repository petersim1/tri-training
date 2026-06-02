import { getDb } from "@/lib/db/index.server";
import { chatMessages, type NewChatMessageRow } from "@/lib/db/schema.server";
import type { ChatMessageItem } from "@/types/responses/chats";
import type { ChatRunContext } from "./dependency";

export const persistTurn = async (
  ctx: ChatRunContext,
  userMessage: string,
  dbMessages: NewChatMessageRow[],
): Promise<[ChatMessageItem, ChatMessageItem]> => {
  // return the ChatMessageItem, so that we can immediately stream + hydrate without re-querying the listMessages() on the client.
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

  const assistantMessage = messages.find(
    (m) => m.role === "assistant",
  ) as ChatMessageItem | null;
  const userMessageRow = messages.find(
    (m) => m.role === "user",
  ) as ChatMessageItem | null;
  if (!assistantMessage || !userMessageRow) {
    throw new Error("No assistant/user message found");
  }
  const proposalSets = dbMessages
    .filter((m) => !!m.proposal)
    .map((m) => ({
      op: m.proposal!.item.op,
      status: m.proposal!.status,
    }));
  if (proposalSets.length > 0) {
    assistantMessage.proposalSet = proposalSets;
  }
  return [userMessageRow, assistantMessage];
};
