import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { requireSessionFnMiddleware } from "~/lib/auth/require-session-fn-middleware";
import { getDb } from "~/lib/db";
import { plannedWorkouts } from "~/lib/db/schema";
import {
  candidatesForKindAndDay,
  linkedSessionExcludeKeys,
  type PlanLinkCandidatesResult,
} from "~/lib/plans/link-candidates-fetch";
import { stravaFetchJson } from "~/lib/strava/tokens";

export type { PlanLinkCandidatesResult };

/**
 * Sessions for the given calendar day that are not linked to another plan.
 * **Lift** plans: only Hevy workouts are fetched. **Run / bike / swim**: only Strava.
 * `dayStartMs` / `dayEndMs` must match the plan’s local calendar day (browser).
 */
export const getPlanLinkCandidatesFn = createServerFn({ method: "GET" })
  .middleware([requireSessionFnMiddleware])
  .inputValidator(
    (d: { planId: string; dayStartMs: number; dayEndMs: number }) => d,
  )
  .handler(async ({ data }): Promise<PlanLinkCandidatesResult> => {
    const db = getDb();
    const plan = db
      .select()
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, data.planId))
      .get();
    if (!plan) {
      throw new Error("Plan not found");
    }
    const excludeKeys = linkedSessionExcludeKeys(db);
    return candidatesForKindAndDay(
      plan.kind,
      data.dayStartMs,
      data.dayEndMs,
      excludeKeys,
      stravaFetchJson,
    );
  });

/**
 * Same candidate lists as {@link getPlanLinkCandidatesFn}, but for a chosen `kind`
 * when creating a new plan (no `planId` yet).
 */
export const getPlanLinkCandidatesForDayFn = createServerFn({ method: "GET" })
  .middleware([requireSessionFnMiddleware])
  .inputValidator(
    (d: { kind: string; dayStartMs: number; dayEndMs: number }) => d,
  )
  .handler(async ({ data }): Promise<PlanLinkCandidatesResult> => {
    const kinds = new Set(["lift", "run", "bike", "swim"]);
    if (!kinds.has(data.kind)) {
      throw new Error("Invalid kind");
    }
    const db = getDb();
    const excludeKeys = linkedSessionExcludeKeys(db);
    return candidatesForKindAndDay(
      data.kind,
      data.dayStartMs,
      data.dayEndMs,
      excludeKeys,
      stravaFetchJson,
    );
  });
