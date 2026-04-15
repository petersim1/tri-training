import { createServerFn } from "@tanstack/react-start";
import { requireSessionFnMiddleware } from "~/lib/auth/require-session-fn-middleware";
import type { PlannedWorkoutWithCompleted } from "~/lib/db/schema";
import { selectPlannedWorkoutsWithCompleted } from "~/lib/plans/select-with-completed";

/** All planned workouts, newest scheduled first — filter on the client for the activities list. */
export const listAllPlannedWorkoutsFn = createServerFn({ method: "GET" })
  .middleware([requireSessionFnMiddleware])
  .handler(async (): Promise<PlannedWorkoutWithCompleted[]> => {
    return await selectPlannedWorkoutsWithCompleted();
  });
