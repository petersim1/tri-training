import { createServerFn } from "@tanstack/react-start";
import type { PlannedWorkoutWithCompleted } from "~/lib/db/schema";
import {
  type PlannedWorkoutsPageResult,
  selectPlannedWorkoutsWithCompleted,
  selectPlannedWorkoutsWithCompletedPage,
} from "~/lib/plans/select-with-completed";

const KINDS = new Set(["all", "lift", "run", "bike", "swim"]);
const STATUSES = new Set(["all", "planned", "completed", "skipped"]);
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** All planned workouts, newest `day_key` first — home calendar and other full-list callers. */
export const listAllPlannedWorkoutsFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<PlannedWorkoutWithCompleted[]> => {
  return await selectPlannedWorkoutsWithCompleted();
});

/** Activities list: filtered + counted + paginated in the database. */
export const listPlannedWorkoutsPageFn = createServerFn({
  method: "GET",
})
  .inputValidator(
    (d: {
      kind: string;
      status: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    }) => d,
  )
  .handler(async ({ data }): Promise<PlannedWorkoutsPageResult> => {
    if (!KINDS.has(data.kind)) {
      throw new Error("Invalid kind filter");
    }
    if (!STATUSES.has(data.status)) {
      throw new Error("Invalid status filter");
    }
    if (data.from !== undefined && !DAY_KEY.test(data.from)) {
      throw new Error("Invalid from date");
    }
    if (data.to !== undefined && !DAY_KEY.test(data.to)) {
      throw new Error("Invalid to date");
    }
    const page =
      typeof data.page === "number" && Number.isFinite(data.page)
        ? Math.max(1, Math.floor(data.page))
        : 1;
    const pageSize =
      typeof data.pageSize === "number" && Number.isFinite(data.pageSize)
        ? Math.min(100, Math.max(1, Math.floor(data.pageSize)))
        : 20;
    return await selectPlannedWorkoutsWithCompletedPage({
      filters: {
        kind: data.kind,
        status: data.status,
        from: data.from,
        to: data.to,
      },
      page,
      pageSize,
    });
  });
