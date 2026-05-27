import type { ChatCompletionMessageParam } from "openai/resources";
import type { ChatMessageRow } from "@/lib/db/schema.server";
import type { ToolName, TypedChatCompletionTool } from "@/types/chats/tools";
import { formatReplaySummary } from "../utils";
import { PLANNING_TOOLS } from "./tools/descriptions";

const prepareMessageHistory = (
  pastMessages: ChatMessageRow[],
  message: string,
): ChatCompletionMessageParam[] => {
  const out: ChatCompletionMessageParam[] = [];
  pastMessages
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .forEach((m) => {
      out.push({
        role: m.role,
        content:
          m.role === "assistant" && m.replaySummary
            ? formatReplaySummary(m.replaySummary) // use summary for older assistant messages
            : m.content,
      });
    });

  out.push({
    role: "user",
    content: message,
  });

  return out;
};

export const prepareWithPrompt = (
  pastMessages: ChatMessageRow[],
  message: string,
  prompt: string,
): ChatCompletionMessageParam[] => {
  return [
    {
      role: "system",
      content: prompt,
    },
    ...prepareMessageHistory(pastMessages, message),
  ];
};

export const buildTools = (
  availableTools: Set<ToolName>,
): TypedChatCompletionTool[] => {
  return PLANNING_TOOLS.filter((tool) =>
    availableTools.has(tool.function.name),
  );
};
