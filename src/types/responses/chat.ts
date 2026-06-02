import type { ChatMessageItem } from "./chats";

export type ChatMessage =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "approval" }
  | { type: "reset" }
  | { type: "error"; message: string }
  | { type: "message"; message: ChatMessageItem };
