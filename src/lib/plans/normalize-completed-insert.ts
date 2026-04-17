import type { HevyWorkoutSummary } from "~/lib/activities/types";
import type { JsonValue, NewCompletedWorkout } from "~/lib/db/schema";
import {
  hevyDataFromLinkedPayload,
  hevyDataFromWorkoutSummary,
  stravaDataFromActivitySummary,
  stravaDataFromLinkedPayload,
} from "~/lib/plans/completed-workout-data";
import type { LinkedSessionPayload } from "~/lib/plans/linked-session";
import type { CompletedActivityKind } from "~/lib/strava/sport-types";
import {
  HEVY_ACTIVITY_KIND,
  normalizeStravaSportType,
} from "~/lib/strava/sport-types";
import type { StravaActivitySummary } from "~/lib/strava/types";

function activityKindForInsert(
  link: { vendor: "strava" | "hevy"; externalId: string },
  data: JsonValue,
  opts?: {
    stravaActivity?: StravaActivitySummary;
    hevyWorkout?: HevyWorkoutSummary;
    planKind?: string;
    scheduledAtIso?: string;
  },
): CompletedActivityKind {
  if (link.vendor === "hevy") {
    return HEVY_ACTIVITY_KIND;
  }
  const sport =
    opts?.stravaActivity?.sport_type ??
    (typeof data === "object" &&
    data !== null &&
    "sport_type" in data &&
    typeof (data as Record<string, unknown>).sport_type === "string"
      ? ((data as Record<string, unknown>).sport_type as string)
      : "");
  return normalizeStravaSportType(sport) as CompletedActivityKind;
}

/** Builds a `completed_workouts` insert row from a linked session payload (and optional vendor payloads). */
export function normalizeCompletedInsert(
  link: { vendor: "strava" | "hevy"; externalId: string },
  p: LinkedSessionPayload,
  now: Date,
  opts?: {
    stravaActivity?: StravaActivitySummary;
    hevyWorkout?: HevyWorkoutSummary;
    planKind?: string;
    scheduledAtIso?: string;
  },
): NewCompletedWorkout {
  if (p.vendor !== link.vendor || p.externalId.trim() !== link.externalId) {
    throw new Error("Linked session does not match selected activity");
  }
  const id = crypto.randomUUID();
  let data: JsonValue;
  if (link.vendor === "strava") {
    if (opts?.stravaActivity) {
      data = stravaDataFromActivitySummary(opts.stravaActivity);
    } else {
      data = stravaDataFromLinkedPayload(p, {
        planKind: opts?.planKind ?? "run",
        scheduledAtIso: opts?.scheduledAtIso ?? new Date().toISOString(),
      });
    }
  } else if (opts?.hevyWorkout) {
    data = hevyDataFromWorkoutSummary(opts.hevyWorkout);
  } else {
    data = hevyDataFromLinkedPayload(p);
  }
  return {
    id,
    vendor: link.vendor,
    vendorId: link.externalId.trim(),
    activityKind: activityKindForInsert(link, data, opts),
    isResolved: false,
    data,
    createdAt: now,
    updatedAt: now,
  };
}
