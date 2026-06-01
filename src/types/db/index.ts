import { z } from "zod";
import type {
  CardioDistanceUnit,
  PlanKind,
  PlanStatus,
} from "@/lib/constants/activities";
import { TOOL_NAME_VALUES } from "../chats/tools";

export type CreateWorkoutOp = {
  op: "create";
  dayKey: string;
  kind: PlanKind;
  notes?: string | null;
  distance?: number | null;
  distanceUnits?: CardioDistanceUnit | null;
  timeSeconds?: number | null;
};

export type UpdateWorkoutOp = {
  op: "update";
  id: string;
  notes?: string | null;
  dayKey?: string | null;
  kind?: PlanKind | null;
  status?: PlanStatus | null;
  distance?: number | null;
  distanceUnits?: CardioDistanceUnit | null;
  timeSeconds?: number | null;
};

export type DeleteWorkoutOp = {
  op: "delete";
  id: string;
};

export type WorkoutOp = CreateWorkoutOp | UpdateWorkoutOp | DeleteWorkoutOp;

export type ChatProposal = {
  status: "pending" | "approved" | "rejected";
  item: WorkoutOp;
};

// discriminated union of the available operations that require explicit approval.

export const replaySummaryStoredSchema = z.object({
  userIntent: z
    .string()
    .describe(
      "The underlying goal driving the user's message, not a paraphrase of their words.",
    ),
  assistantSummary: z
    .string()
    .describe(
      "Faithful compressed prose of what the assistant said, proposed, or decided. Do not editorialize — just compress.",
    ),
  decisions: z
    .array(z.string())
    .default([])
    .describe(
      "Things concretely resolved this turn. Empty array if nothing was decided.",
    ),
  openQuestions: z
    .array(z.string())
    .default([])
    .describe(
      "Anything deferred, unresolved, or that needs revisiting. If a workout proposal was staged, always include it here with full scope: number of workouts, date range, and disciplines covered. Empty array if nothing is unresolved.",
    ),
});

export type ReplaySummaryStoredSchemaValues = z.infer<
  typeof replaySummaryStoredSchema
>;

export const toolCalledSchema = z.object({
  name: z.enum(TOOL_NAME_VALUES),
  args: z.record(z.string(), z.union([z.string(), z.int()])).optional(),
  success: z.boolean(),
});

export type ToolCallSchemaValues = z.infer<typeof toolCalledSchema>;

export const coachingStateSchema = z.object({
  physicalState: z
    .array(
      z.object({
        area: z
          .string()
          .describe(
            "The body part or area affected, e.g. 'left shoulder', 'achilles'",
          ),
        status: z
          .enum(["active", "monitoring", "resolved"])
          .describe("Current status of the physical issue"),
        note: z
          .string()
          .describe("Brief description of the issue and any relevant context"),
      }),
    )
    .default([])
    .describe(
      "Transient physical issues, injuries, or soreness the athlete has reported. Mark as resolved when the athlete confirms recovery.",
    ),

  disciplineState: z
    .array(z.string())
    .default([])
    .describe(
      "Per-discipline notes as strings, e.g. 'swim: needs work on flip turns', 'run: strong base, reduce intensity'",
    ),

  preferences: z
    .array(z.string())
    .default([])
    .describe(
      "Stable training preferences and style notes, e.g. 'prefers morning sessions', 'likes workout variety'. These rarely change.",
    ),

  directives: z
    .array(
      z.object({
        instruction: z
          .string()
          .describe(
            "The active coaching directive, e.g. '3-4 pool sessions per week'",
          ),
        source: z
          .string()
          .describe(
            "What prompted this directive, e.g. 'athlete requested', 'coach inferred from feedback'",
          ),
        status: z
          .enum(["active", "resolved"])
          .describe("Whether this directive is still in effect"),
      }),
    )
    .default([])
    .describe(
      "Actionable instructions actively shaping the training plan. Resolve when superseded or explicitly cancelled.",
    ),
});

export type CoachingStateSchemaValues = z.infer<typeof coachingStateSchema>;
