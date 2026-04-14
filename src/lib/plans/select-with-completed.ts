import { desc, eq, getTableColumns } from "drizzle-orm";
import { getDb } from "~/lib/db";
import {
  completedWorkouts,
  plannedWorkouts,
  type CompletedWorkoutRow,
  type PlannedWorkoutWithCompleted,
} from "~/lib/db/schema";

export function selectPlannedWorkoutsWithCompleted(): PlannedWorkoutWithCompleted[] {
  const db = getDb();
  const rows = db
    .select({
      ...getTableColumns(plannedWorkouts),
      cw: completedWorkouts,
    })
    .from(plannedWorkouts)
    .leftJoin(
      completedWorkouts,
      eq(plannedWorkouts.completedWorkoutId, completedWorkouts.id),
    )
    .orderBy(desc(plannedWorkouts.scheduledAt))
    .all();

  return rows.map((r) => {
    const { cw, ...plan } = r;
    const completedWorkout: CompletedWorkoutRow | null =
      cw?.id != null ? cw : null;
    return { ...plan, completedWorkout };
  });
}
