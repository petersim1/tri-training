import type {
  TypedVendorWorkoutRow,
  WorkoutEntryWithCompleted,
} from "@/lib/db/schema.server";
import { convertDistance, convertTime } from "@/lib/utils/calculations";
import { activityServerFns } from "@/server-fcts/activities.server";
import type { ToolName } from "@/types/chats/tools";
import type { ToolCallSchemaValues, WorkoutOp } from "@/types/db";
import {
  activityListSchema,
  createPlanSchema,
  updatePlanSchema,
} from "@/types/requests/activities";
import { idSchema } from "@/types/requests/shared";
import type { ChatRunContext } from "../dependency";

type ToolResponse = {
  content: string;
  success: boolean;
  proposal?: WorkoutOp;
};

export const executeTool = async (
  ctx: ChatRunContext,
  name: ToolName,
  args: ToolCallSchemaValues["args"],
): Promise<ToolResponse> => {
  switch (name) {
    case "create_workout":
      return createWorkoutTool(ctx, args);
    case "delete_workout":
      return deleteWorkoutTool(ctx, args);
    case "update_workout":
      return updateWorkoutTool(ctx, args);
    case "get_workout":
      return getWorkoutTool(ctx, args);
    case "list_workouts":
      return listWorkoutTool(ctx, args);
    default:
      return { success: false, content: "invalid tool name" };
  }
};

const createWorkoutTool = async (
  ctx: ChatRunContext,
  args: ToolCallSchemaValues["args"],
): Promise<ToolResponse> => {
  // ONLY serves to stage the change.
  const parsed = createPlanSchema.safeParse(args);
  if (!parsed.success) {
    return { content: parsed.error.message, success: false };
  }

  return {
    success: true,
    content:
      "Proposal staged — awaiting athlete approval before any DB write occurs.",
    proposal: {
      op: "create",
      ...parsed.data,
    },
  };
};

const deleteWorkoutTool = async (
  ctx: ChatRunContext,
  args: ToolCallSchemaValues["args"],
): Promise<ToolResponse> => {
  const parsed = idSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, content: parsed.error.message };
  }

  const workoutExists = await activityServerFns.exists(parsed.data);
  if (!workoutExists) {
    return { success: false, content: "This is an invalid workout id." };
  }

  return {
    success: false,
    content:
      "Proposal staged — awaiting athlete approval before any DB delete occurs.",
    proposal: {
      op: "delete",
      ...parsed.data,
    },
  };
};

const updateWorkoutTool = async (
  ctx: ChatRunContext,
  args: ToolCallSchemaValues["args"],
): Promise<ToolResponse> => {
  const parsed = updatePlanSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, content: parsed.error.message };
  }

  const workoutExists = await activityServerFns.exists({ id: parsed.data.id });
  if (!workoutExists) {
    return { success: false, content: "This is an invalid workout id." };
  }

  return {
    success: true,
    content:
      "Proposal staged — awaiting athlete approval before any DB update occurs.",
    proposal: {
      op: "update",
      ...parsed.data,
    },
  };
};

const formatWorkoutForModel = (row: WorkoutEntryWithCompleted): string => {
  const lines: string[] = [
    `id: ${row.id} · ${row.dayKey} · ${row.kind} · ${row.status}`,
  ];

  if (!row.vendorActivity) {
    if (row.notes) lines.push(`Notes: ${row.notes}`);
    if (row.distance && row.distanceUnits)
      lines.push(`Planned: ${row.distance} ${row.distanceUnits}`);
    if (row.timeSeconds)
      lines.push(
        `Planned duration: ${Math.round(convertTime(row.timeSeconds, "s", "m"))} min`,
      );
  } else {
    const activity = row.vendorActivity as TypedVendorWorkoutRow;

    if (activity.vendor === "strava") {
      if (activity.data.distance)
        lines.push(
          `Distance: ${(convertDistance(activity.data.distance, "m", "km")).toFixed(2)} km`,
        );
      if (activity.data.moving_time)
        lines.push(
          `Moving time: ${Math.round(convertTime(activity.data.moving_time, "s", "m"))} min`,
        );
      if (activity.data.average_heartrate)
        lines.push(
          `Avg HR: ${Math.round(activity.data.average_heartrate)} bpm`,
        );
      if (activity.data.average_speed)
        lines.push(
          `Avg speed: ${(convertTime(convertDistance(activity.data.average_speed, "m", "mi"), "s", "hr")).toFixed(1)} mph`,
        );
      if (activity.data.total_elevation_gain)
        lines.push(
          `Elevation: ${Math.round(activity.data.total_elevation_gain)} m`,
        );
      if (activity.data.average_watts)
        lines.push(`Avg power: ${Math.round(activity.data.average_watts)} W`);
    }
    if (activity.vendor === "hevy") {
      const durationMs =
        new Date(activity.data.end_time).getTime() -
        new Date(activity.data.start_time).getTime();
      const durationMin = convertTime(durationMs, "ms", "m");
      if (activity.data.title) lines.push(`Workout: ${activity.data.title}`);
      lines.push(`Duration: ${durationMin} min`);
      for (const e of activity.data.exercises) {
        const sets = e.sets.map((s) => `${s.reps}×${s.weight_kg}kg`).join(", ");
        lines.push(`  ${e.title}: ${sets}`);
      }
    }
  }

  return lines.join("\n");
};

const getWorkoutTool = async (
  ctx: ChatRunContext,
  args: ToolCallSchemaValues["args"],
): Promise<ToolResponse> => {
  const parsed = idSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, content: parsed.error.message };
  }

  try {
    const workout = await activityServerFns.get(parsed.data);
    return { success: true, content: formatWorkoutForModel(workout) };
  } catch {
    return { success: false, content: "This workout does not exist" };
  }
};

const listWorkoutTool = async (
  ctx: ChatRunContext,
  args: ToolCallSchemaValues["args"],
): Promise<ToolResponse> => {
  const parsed = activityListSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, content: parsed.error.message };
  }

  const workouts = await activityServerFns.list(parsed.data);

  return {
    success: true,
    content: workouts.rows.map((w) => formatWorkoutForModel(w)).join("\n\n"),
  };
};
