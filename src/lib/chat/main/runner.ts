import type OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/src/resources.js";
import type { ToolName } from "@/types/chats/tools";
import type { ChatMessage } from "@/types/responses/chat";
import type { ChatMessageItem } from "@/types/responses/chats";
import type { NewChatMessageRow } from "../../db/schema.server";
import type { ChatRunContext } from "./dependency";
import { buildTools, prepareWithPrompt } from "./prepare";
import { buildSystemPrompt } from "./prompt";
import { executeTool } from "./tools/definitions";

const MAX_ROUNDS = 10;

const PLANNING_CHAT_MODEL = "gpt-4o";

type PartialToolCall = {
  id: string;
  name: string;
  arguments: string;
};

const accumulateToolCalls = (
  acc: Map<number, PartialToolCall>,
  toolCalls: ChatCompletionChunk.Choice.Delta["tool_calls"],
) => {
  for (const tc of toolCalls ?? []) {
    const prev = acc.get(tc.index) ?? { id: "", name: "", arguments: "" };
    acc.set(tc.index, {
      id: prev.id + (tc.id ?? ""),
      name: prev.name + (tc.function?.name ?? ""),
      arguments: prev.arguments + (tc.function?.arguments ?? ""),
    });
  }
};

const finalizeToolCalls = (
  acc: Map<number, PartialToolCall>,
): PartialToolCall[] =>
  [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => tc)
    .filter((tc) => tc.id && tc.name);

export const runPlanningTurn = async (
  client: OpenAI,
  ctx: ChatRunContext,
  priorMessages: ChatMessageItem[],
  currentMessage: string,
  emit: (chunk: ChatMessage) => void,
): Promise<NewChatMessageRow[]> => {
  const prompt = buildSystemPrompt(ctx);
  const messages = prepareWithPrompt(priorMessages, currentMessage, prompt);

  const dbMessages: NewChatMessageRow[] = [];

  let round = 0;
  while (round < MAX_ROUNDS) {
    const now = new Date();
    const toolAcc = new Map<number, PartialToolCall>();

    const streamResp = await client.chat.completions.create({
      model: PLANNING_CHAT_MODEL,
      messages,
      tools: buildTools(ctx.availableTools),
      stream: true,
      temperature: 0.2,
    });

    let contentChunk = "";
    let finishReason:
      | "tool_calls"
      | "length"
      | "stop"
      | "content_filter"
      | "function_call"
      | null = null;
    for await (const chunk of streamResp) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      finishReason = choice.finish_reason;
      const delta = choice.delta;

      if (delta.content) {
        contentChunk += delta.content;
        emit({ type: "delta", text: contentChunk });
      }

      if (delta.tool_calls) {
        accumulateToolCalls(toolAcc, delta.tool_calls);
      }
    }

    if (finishReason === "stop") {
      dbMessages.push({
        createdAt: now,
        updatedAt: now,
        threadId: ctx.thread.id,
        role: "assistant",
        seq: ctx.seq,
        round: round,
        content: contentChunk,
      });
      break;
    }
    if (finishReason === "tool_calls") {
      // we occassionally get some weird preamble, that we cannot differentiate from a final result.
      // we don't store the preamble, but we do stream it. This will just tell the client to reset.
      emit({ type: "reset" });
      const toolCalls = finalizeToolCalls(toolAcc);
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      for (const tc of toolCalls) {
        const { success, content, proposal } = await executeTool(
          ctx,
          tc.name as ToolName,
          JSON.parse(tc.arguments),
        );
        if (proposal) {
          ctx.hasProposal = true;
        }
        dbMessages.push({
          createdAt: now,
          updatedAt: now,
          threadId: ctx.thread.id,
          role: "tool",
          seq: ctx.seq,
          round: round,
          content: JSON.stringify({ name: tc.name, args: tc.arguments }),
          isSuccess: Number(success),
          proposal: proposal
            ? {
                status: "pending",
                item: proposal,
              }
            : null,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content,
        });
      }
    }
    round++;
  }

  return dbMessages;
};
