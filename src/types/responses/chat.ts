export type ChatMessage =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "approval" }
  | { type: "reset" }
  | { type: "error"; message: string };
