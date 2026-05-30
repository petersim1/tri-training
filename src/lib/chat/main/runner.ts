import type OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/src/resources.js";
import type { ToolName } from "@/types/chats/tools";
import type { ChatMessage } from "@/types/responses/chat";
import { getDb } from "../../db/index.server";
import { type ChatMessageRow, chatMessages } from "../../db/schema.server";
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
  priorMessages: ChatMessageRow[],
  currentMessage: string,
  emit: (chunk: ChatMessage) => void,
): Promise<string> => {
  const prompt = buildSystemPrompt(ctx);
  const messages = prepareWithPrompt(priorMessages, currentMessage, prompt);

  let assistantText = "";

  while (ctx.round < MAX_ROUNDS) {
    console.log("starting turn", ctx.round);
    const toolAcc = new Map<number, PartialToolCall>();
    let contentBuf = "";

    const streamResp = await client.chat.completions.create({
      model: PLANNING_CHAT_MODEL,
      messages,
      tools: buildTools(ctx.availableTools),
      stream: true,
      temperature: 0.2,
    });

    for await (const chunk of streamResp) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        contentBuf += delta.content;
        emit({ type: "delta", text: delta.content });
      }

      if (delta.tool_calls) {
        accumulateToolCalls(toolAcc, delta.tool_calls);
      }
    }

    assistantText += contentBuf;

    const toolCalls = finalizeToolCalls(toolAcc);

    if (toolCalls.length === 0) break; // end_turn — no tool calls, we're done

    // push assistant message with tool calls
    messages.push({
      role: "assistant",
      content: contentBuf || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    // execute tools and push results
    for (const tc of toolCalls) {
      console.log("CALLING TOOL", tc.name, tc.arguments);
      const result = await executeTool(
        ctx,
        tc.name as ToolName,
        JSON.parse(tc.arguments),
      );
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }

    ctx.round++;
  }

  return assistantText;
};

export const persistTurn = async (
  ctx: ChatRunContext,
  userMessage: string,
  assistantText: string,
): Promise<ChatMessageRow> => {
  const db = await getDb();
  const [, sysMessage] = await db
    .insert(chatMessages)
    .values([
      {
        createdAt: ctx.runStart,
        updatedAt: ctx.runStart,
        threadId: ctx.thread.id,
        role: "user",
        content: userMessage,
        sportEventId: ctx.event?.id,
      },
      {
        threadId: ctx.thread.id,
        role: "assistant",
        content: assistantText,
        sportEventId: ctx.event?.id,
        tools: ctx.toolsCalled,
        proposals: ctx.proposals,
      },
    ])
    .returning();

  return sysMessage;
};
