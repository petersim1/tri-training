export type ChatMessage =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "approval" }
  | { type: "error"; message: string };
