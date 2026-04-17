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
    const excludeKeys = await linkedSessionExcludeKeys(db);
    return candidatesForKindAndDay(
      db,
      plan.kind,
      data.dayStartMs,
      data.dayEndMs,
      excludeKeys,
    );
  });

/**
 * Same candidate lists as {@link getPlanLinkCandidatesFn}, but for a chosen `kind`
 * when creating a new plan (no `planId` yet).
 */
export const getPlanLinkCandidatesForDayFn = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { kind: string; dayStartMs: number; dayEndMs: number }) => d,
  )
  .handler(async ({ data }): Promise<PlanLinkCandidatesResult> => {
    const kinds = new Set(["lift", "run", "bike", "swim"]);
    if (!kinds.has(data.kind)) {
      throw new Error("Invalid kind");
    }
    const db = getDb();
    const excludeKeys = await linkedSessionExcludeKeys(db);
    return candidatesForKindAndDay(
      db,
      data.kind,
      data.dayStartMs,
      data.dayEndMs,
      excludeKeys,
    );
  });
