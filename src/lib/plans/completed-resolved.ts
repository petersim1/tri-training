import { count, eq } from "drizzle-orm";
import type { getDb } from "~/lib/db";
import { completedWorkouts, plannedWorkouts } from "~/lib/db/schema";

/** Recompute `is_resolved` from whether any plan references this completed row. */
export async function syncCompletedResolvedForId(
  db: ReturnType<typeof getDb>,
  completedWorkoutId: string,
): Promise<void> {
  const row = await db
    .select({ n: count() })
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.completedWorkoutId, completedWorkoutId))
    .get();
  const n = Number(row?.n ?? 0);
  const now = new Date();
  await db
    .update(completedWorkouts)
    .set({
      isResolved: n > 0,
      updatedAt: now,
    })
    .where(eq(completedWorkouts.id, completedWorkoutId))
    .run();
}
