import { createServerFn } from "@tanstack/react-start";
import {
  type BackfillReport,
  backfillLinkedWorkouts,
} from "~/lib/plans/backfill-externals";
import { stravaFetchJson } from "~/lib/strava/tokens";

/** Links unlinked plans to same-day Strava / Hevy sessions (uses your Strava cookie + server Hevy key). */
export const backfillLinkedWorkoutsFn = createServerFn({
  method: "POST",
}).handler(async (): Promise<BackfillReport> => {
  return backfillLinkedWorkouts(stravaFetchJson);
});
