import { eq } from "drizzle-orm";
import type OpenAI from "openai";
import { getDb } from "@/lib/db/index.server";
import { type ChatMessageRow, coachingState } from "@/lib/db/schema.server";
import { coachingStateSchema } from "@/types/db";
import type { ChatRunContext } from "../main/dependency";
import { prepareWithPrompt } from "./prepare";
import { buildSummarizerSystemPrompt } from "./prompt";

const COACHING_CHAT_MODEL = "gpt-4o";

export const runCoachingStateSummary = async (
  client: OpenAI,
  ctx: ChatRunContext,
  priorMessages: ChatMessageRow[],
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
    model: COACHING_CHAT_MODEL,
    input: messages,
    stream: false,
    temperature: 0.2,
    text: {
      format: {
        type: "json_schema",
        name: "state",
        strict: true,
        schema: coachingStateSchema.toJSONSchema(),
      },
    },
  });

  if (res.output_parsed) {
    const db = await getDb();
    await db
      .update(coachingState)
      .set({ state: res.output_parsed })
      .where(eq(coachingState.id, ctx.coachingState.id));
  }
};
