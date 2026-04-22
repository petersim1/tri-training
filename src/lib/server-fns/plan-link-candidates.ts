import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "~/lib/db";
import { plannedWorkouts } from "~/lib/db/schema";
import {
  candidatesForKindAndDay,
  linkedSessionExcludeKeys,
  type PlanLinkCandidatesResult,
} from "~/lib/plans/link-candidates-fetch";

export type { PlanLinkCandidatesResult };

/**
 * Sessions for the given calendar day that are not linked to another plan.
 * **Lift**: Hevy rows in `completed_workouts`. **Run / bike / swim**: Strava rows.
 * `dayStartMs` / `dayEndMs` must match the plan’s local calendar day (browser).
 */
export const getPlanLinkCandidatesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { planId: string; dayStartMs: number; dayEndMs: number }) => d,
  )
  .handler(async ({ data }): Promise<PlanLinkCandidatesResult> => {
    const db = getDb();
    const plan = await db
      .select()
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.planId))
      .get();
    if (!plan) {
      throw new Error("Plan not found");
    }
    if (plan.kind === "recovery") {
      return {
        hevy: [],
        strava: [],
        hevyError: undefined,
        stravaError: undefined,
      };
    }
    const excludeKeys = await linkedSessionExcludeKeys(db);
    return candidatesForKindAndDay(
      db,
      plan.kind,
      data.dayStartMs,
      data.dayEndMs,
      excludeKeys,
    );
  });
