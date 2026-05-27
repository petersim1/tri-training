import type { EasyInputMessage } from "openai/resources/responses/responses";
import type { ChatMessageRow } from "@/lib/db/schema.server";
import { formatReplaySummary } from "../utils";

const prepareMessageHistory = (
  pastMessages: ChatMessageRow[],
  message: string,
): EasyInputMessage[] => {
  const out: EasyInputMessage[] = [];
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
  userMessage: string,
  assistantResponse: string,
  prompt: string,
): EasyInputMessage[] => {
  // we're using the same message set, so trim the 1st 2, to be replaced with our new user + assistant message.
  const ms = pastMessages.slice(-4);
  return [
    {
      role: "system",
      content: prompt,
    },
    ...prepareMessageHistory(ms, userMessage),
    {
      role: "system",
      content: assistantResponse,
    },
  ];
};
