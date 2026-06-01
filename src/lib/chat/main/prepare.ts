import type { ChatCompletionMessageParam } from "openai/resources";
import type { ToolName, TypedChatCompletionTool } from "@/types/chats/tools";
import type { ChatMessageItem } from "@/types/responses/chats";
import { formatReplaySummary } from "../utils";
import { PLANNING_TOOLS } from "./tools/descriptions";

const prepareMessageHistory = (
  pastMessages: ChatMessageItem[],
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
            ? formatReplaySummary(m.replaySummary) +
              (m.proposalSet?.length && m.proposalSet[0].status !== "pending"
                ? `\n[Proposal ${m.proposalSet[0].status}: ${[...new Set(m.proposalSet.map((p) => p.op))].join(", ")}]`
                : "")
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
  pastMessages: ChatMessageItem[],
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
