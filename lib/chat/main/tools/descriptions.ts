import type { TypedChatCompletionTool } from "@/types/chats/tools";
import {
  activityListSchema,
  createPlanSchema,
  updatePlanSchema,
} from "@/types/requests/activities";
import { idSchema } from "@/types/requests/shared";

export const PLANNING_TOOLS: TypedChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_workouts",
      description: "List user workouts, either past or upcoming",
      parameters: activityListSchema.toJSONSchema(),
    },
  },
  {
    type: "function",
    function: {
      name: "get_workout",
      description: "Load full detail for one planned workout by id.",
      parameters: idSchema.toJSONSchema(),
    },
  },
  {
    type: "function",
    function: {
      name: "create_workout",
      description:
        "Stage a workout for user approval. Call this for every workout in a proposed plan — all in the same turn. The user will approve or reject the full set.",
      parameters: createPlanSchema.toJSONSchema(),
    },
  },
  {
    type: "function",
    function: {
      name: "update_workout",
      description:
        "Stage an update to an existing workout for user approval. Call this for every workout being modified in a proposed plan — all in the same turn.",
      parameters: updatePlanSchema.toJSONSchema(),
    },
  },
  {
    type: "function",
    function: {
      name: "delete_workout",
      description:
        "Stage a workout deletion for user approval. Only call after the user has indicated they want to remove a specific workout.",
      parameters: idSchema.toJSONSchema(),
    },
  },
];
