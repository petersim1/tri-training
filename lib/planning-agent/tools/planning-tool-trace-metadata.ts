import type { JsonValue } from "@/lib/db/schema.server";

/** One model round where the assistant emitted tool_calls; results are persisted for audit/replay tooling. */
export type PersistedPlanningToolRoundJson = {
  assistantPreamble: string | null;
  toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    content: string;
  }>;
};

export type PlanningAssistantToolTraceMetadata = {
  planningToolTrace: { rounds: PersistedPlanningToolRoundJson[] };
};

export function wrapPlanningToolTraceMetadata(
  rounds: PersistedPlanningToolRoundJson[],
): JsonValue | null {
  if (rounds.length === 0) {
    return null;
  }
  return {
    planningToolTrace: { rounds },
  } satisfies PlanningAssistantToolTraceMetadata;
}

const PLANNING_CALENDAR_WRITE_TOOLS = new Set([
  "create_planned_workout",
  "update_planned_workout",
  "delete_planned_workout",
]);

/** True if this persisted trace ran any mutation that edits the planner calendar grid. */
export function persistedTraceHasCalendarWriteTools(
  trace: PersistedPlanningToolRoundJson[],
): boolean {
  if (trace.length === 0) {
    return false;
  }
  for (const r of trace) {
    for (const tc of r.toolCalls) {
      if (PLANNING_CALENDAR_WRITE_TOOLS.has(tc.function.name)) {
        return true;
      }
    }
  }
  return false;
}
