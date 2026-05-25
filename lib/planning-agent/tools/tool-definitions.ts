import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { CARDIO_DISTANCE_UNITS } from "@/lib/constants/activities";

export const PLANNING_CHAT_MODEL = "gpt-4o";

export const PLANNING_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_completed_workouts",
      description:
        "Broad fetch: synced completions across kinds in a window. Use **only when** you need mixed activity history—not by default each turn and not when one modality will do (use `recent_sessions_by_kind` instead). Markdown bullets grouped by local day.",
      parameters: {
        type: "object",
        properties: {
          since_day: {
            type: "string",
            description: "Inclusive YYYY-MM-DD lower bound.",
          },
          until_day: {
            type: "string",
            description: "Inclusive YYYY-MM-DD upper bound.",
          },
          limit: {
            type: "integer",
            description: "Max rows (default 24, max 80).",
          },
          kind: {
            type: "string",
            enum: ["lift", "run", "bike", "swim", "recovery", "all"],
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recent_sessions_by_kind",
      description:
        "Most recent N synced completions for **one** activity kind (newest by session start time). Use for per-discipline progression. Arguments: `kind` and optional `limit` only — no date or vendor filters.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["lift", "run", "bike", "swim", "recovery"],
          },
          limit: {
            type: "integer",
            description: "Max rows (default 15, max 40); newest-first.",
          },
        },
        required: ["kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_planned_workouts",
      description:
        "Planned rows in a date range—use when you need **calendar intent** for those dates, not every turn.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["all", "lift", "run", "bike", "swim", "recovery"],
          },
          status: {
            type: "string",
            enum: ["all", "planned", "completed", "skipped"],
          },
          since_day: { type: "string", description: "YYYY-MM-DD" },
          until_day: { type: "string", description: "YYYY-MM-DD" },
          limit: { type: "integer", description: "Max rows (max 80)" },
        },
        required: ["kind", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_planned_workout",
      description: "Load full detail for one planned workout by id.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Planned workout id (uuid).",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_planned_workout",
      description:
        "Insert a planned workout row (`status=planned`). Only after the user clearly approved writing to the calendar in the prior exchange.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["lift", "run", "bike", "swim", "recovery"],
          },
          day_key: { type: "string" },
          notes: { type: "string" },
          distance: { type: "number", enum: CARDIO_DISTANCE_UNITS },
          distance_units: { type: "string" },
          time_seconds: { type: "integer" },
        },
        required: ["kind", "day_key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_planned_workout",
      description:
        "Patch a calendar row—only invoke after unmistakable consent to mutate existing plans.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          notes: { type: "string" },
          day_key: { type: "string" },
          kind: {
            type: "string",
            enum: ["lift", "run", "bike", "swim", "recovery"],
          },
          status: {
            type: "string",
            enum: ["planned", "completed", "skipped"],
          },
          hevy_routine_id: { type: "string" },
          distance: { type: "number" },
          distance_units: { type: "string" },
          time_seconds: { type: "integer" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_planned_workout",
      description:
        "Deletes a planner row irreversibly—only after explicit confirmation from the user.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_as_proposal",
      description:
        "Optional no-op for older prompts. The server automatically sets `is_proposal` on prose week plans that have no calendar writes that turn. On turns with `create` / `update` / `delete`, this call is ignored.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_proposal",
      description:
        "Return the latest assistant message with `is_proposal` (full `content`). Call before create/update/delete when the user approves (“yes”, “book it”) so exact dates/kinds are not lost from summarized chat history.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];
