import type OpenAI from "openai";

import { updatePlanningMessageReplaySummary } from "../chat/planning-chat-store.server";
import type { PersistedPlanningToolRoundJson } from "../tools/planning-tool-trace-metadata";
import {
  buildToolTraceDigestForSummarizer,
  extractStructuredPlanningTurnSummaryFromOpenAi,
  stringifyTurnSummary,
} from "./planning-turn-summary";

/** Persist structured `replay_summary` on the assistant row when LLM distill succeeds (initial insert already carries a fallback replay). */
export async function refineTurnSummaryAfterPlanningTurn(
  openai: OpenAI,
  input: {
    assistantMessageId: string;
    recentContextBlock: string;
    turnTimestampIso: string;
    userMessage: string;
    assistantMessage: string;
    traceRounds: PersistedPlanningToolRoundJson[];
    signal?: AbortSignal;
  },
): Promise<void> {
  try {
    const toolDigest = buildToolTraceDigestForSummarizer(input.traceRounds);
    const memoryChunk = await extractStructuredPlanningTurnSummaryFromOpenAi(
      openai,
      {
        recentContextBlock: input.recentContextBlock,
        turnTimestampIso: input.turnTimestampIso,
        toolDigest,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
        signal: input.signal,
      },
    );
    await updatePlanningMessageReplaySummary(
      input.assistantMessageId,
      stringifyTurnSummary(memoryChunk),
    );
  } catch (err) {
    console.error("[planning-chat:turn-summary]", err);
  }
}
