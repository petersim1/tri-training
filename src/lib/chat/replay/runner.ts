import { eq } from "drizzle-orm";
import type OpenAI from "openai";
import { getDb } from "@/lib/db/index.server";
import { type ChatMessageRow, chatMessages } from "@/lib/db/schema.server";
import { replaySummaryStoredSchema } from "@/types/db";
import type { ChatMessageItem } from "@/types/responses/chats";
import type { ChatRunContext } from "../main/dependency";
import { prepareWithPrompt } from "./prepare";
import { buildSummarizerSystemPrompt } from "./prompt";

const REPLAY_CHAT_MODEL = "gpt-4o";

export const runReplaySummary = async (
  client: OpenAI,
  ctx: ChatRunContext,
  priorMessages: ChatMessageItem[],
  newUserMessage: string,
  newAssistantMessage: ChatMessageRow,
) => {
  const prompt = buildSummarizerSystemPrompt(ctx);
  const messages = prepareWithPrompt(
    priorMessages,
    newUserMessage,
    newAssistantMessage.content,
    prompt,
  );

  const res = await client.responses.parse({
    model: REPLAY_CHAT_MODEL,
    input: messages,
    stream: false,
    temperature: 0.2,
    text: {
      format: {
        type: "json_schema",
        name: "replay",
        strict: true,
        schema: replaySummaryStoredSchema.toJSONSchema(),
      },
    },
  });

  if (res.output_parsed) {
    const db = await getDb();
    await db
      .update(chatMessages)
      .set({ replaySummary: res.output_parsed })
      .where(eq(chatMessages.id, newAssistantMessage.id));
  }
};
