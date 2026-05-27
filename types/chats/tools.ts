import type { FunctionDefinition } from "openai/src/resources.js";

export const TOOL_NAME_VALUES = [
  "list_workouts",
  "get_workout",
  "create_workout",
  "update_workout",
  "delete_workout",
] as const;

export type ToolName = (typeof TOOL_NAME_VALUES)[number];

export type TypedFunctionDefinition = FunctionDefinition & {
  name: ToolName;
};

export type TypedChatCompletionTool = {
  type: "function";
  function: TypedFunctionDefinition;
};
