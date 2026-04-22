/**
 * Vendor webhooks (Strava / Hevy). This module is the **only** place that may
 * `delete()` `completed_workouts` rows. Server fns, APIs, and imports must only
 * unlink plans or update rows — never remove completed sessions from the DB.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "~/lib/db";
import {
  completedWorkouts,
  type WorkoutVendor,
  webhookDeliveries,
} from "~/lib/db/schema";
import { hevyFetchWorkoutById } from "~/lib/hevy/client";
import {
  upsertCalendarFromHevyWorkout,
  upsertCalendarFromStravaActivity,
} from "~/lib/plans/backfill-externals";
import { linkedSessionExcludeKeys } from "~/lib/plans/link-candidates-fetch";
import { inferPlanKindFromStravaSport } from "~/lib/plans/strava-kind-match";
import { ALLOWED_STRAVA_ATHLETE_ID } from "~/lib/strava/allowed-athlete";
import { stravaFetchJsonForWebhooks } from "~/lib/strava/service-tokens";
import type { StravaActivitySummary } from "~/lib/strava/types";

const LOG = "[webhooks/externals]";

export type StravaWebhookEvent = {
  object_type?: string;
  object_id?: number;
  aspect_type?: string;
  owner_id?: number;
  subscription_id?: number;
  event_time?: number;
  updates?: Record<string, string>;
};

export async function logWebhookDelivery(args: {
  source: WorkoutVendor;
  idempotencyKey?: string | null;
  payloadJson: string;
  outcome: "ok" | "ignored" | "error";
  detail?: string | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(webhookDeliveries)
    .values({
      id: crypto.randomUUID(),
      source: args.source,
      idempotencyKey: args.idempotencyKey ?? null,
      payloadJson: args.payloadJson,
      outcome: args.outcome,
      detail: args.detail ?? null,
      createdAt: now,
    })
    .run();
}

async function isStravaDuplicate(idempotencyKey: string): Promise<boolean> {
  const db = getDb();
  const row = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.idempotencyKey, idempotencyKey))
    .get();
  return row != null;
}

/**
 * Hard-delete by vendor id. Called only from this file (webhook handlers).
 * Plans are unlinked via FK `onDelete: "set null"`.
 */
async function deleteCompletedByVendor(
  vendor: WorkoutVendor,
  vendorId: string,
): Promise<void> {
  const db = getDb();
  const vid = vendorId.trim();
  if (!vid) {
    return;
  }
  await db
    .delete(completedWorkouts)
    .where(
      and(
        eq(completedWorkouts.vendor, vendor),
        eq(completedWorkouts.vendorId, vid),
      ),
    )
    .run();
}

export async function processHevyWorkoutWebhook(args: {
  workoutId: string;
}): Promise<{ detail: string }> {
  const key = args.workoutId.trim();
  if (!key) {
    throw new Error("workoutId required");
  }
  if (!process.env.HEVY_API_KEY?.trim()) {
    throw new Error("HEVY_API_KEY is not configured");
  }

  const w = await hevyFetchWorkoutById(key);
  const db = getDb();
  const now = new Date();
  const calendarExternalKeys = await linkedSessionExcludeKeys(db);

  if (!w) {
    await deleteCompletedByVendor("hevy", key);
    return {
      detail: "hevy: workout removed or missing; completed row deleted",
    };
  }

  if (!w.start_time) {
    return { detail: "hevy: workout has no start_time; skipped" };
  }

  const created = await upsertCalendarFromHevyWorkout(
    db,
    w,
    calendarExternalKeys,
    now,
  );
  if (created) {
    return { detail: "hevy: imported new completed workout row" };
  }
  return { detail: "hevy: completed workout updated / no new row" };
}

export async function processStravaWebhookEvent(
  ev: StravaWebhookEvent,
): Promise<{ detail: string; duplicate?: boolean }> {
  if (
    (ev.object_type === "activity" || ev.object_type === "athlete") &&
    ev.owner_id !== ALLOWED_STRAVA_ATHLETE_ID
  ) {
    return { detail: "strava: ignored (different athlete)" };
  }

  if (ev.object_type === "athlete") {
    return { detail: "strava: athlete event (ignored)" };
  }

  if (ev.object_type !== "activity" || ev.object_id == null) {
    return { detail: "strava: unsupported object_type" };
  }

  const sub = ev.subscription_id ?? 0;
  const oid = ev.object_id;
  const aspect = ev.aspect_type ?? "";
  const et = ev.event_time ?? 0;
  const idempotencyKey = `strava:${sub}:${oid}:${aspect}:${et}`;
  if (await isStravaDuplicate(idempotencyKey)) {
    return { detail: "strava: duplicate event skipped", duplicate: true };
  }

  const db = getDb();
  const now = new Date();

  if (aspect === "delete") {
    await deleteCompletedByVendor("strava", String(oid));
    return { detail: "strava: completed workout deleted (plans unlinked)" };
  }

  const activity = await stravaFetchJsonForWebhooks<StravaActivitySummary>(
    `/activities/${oid}`,
  );
  if (!activity) {
    console.warn(LOG, "strava fetch failed or no service tokens", {
      objectId: oid,
    });
    throw new Error(
      "Strava: cannot fetch activity — complete OAuth once so tokens are stored for webhooks",
    );
  }

  const calendarExternalKeys = await linkedSessionExcludeKeys(db);

  if (aspect === "create" || aspect === "update") {
    const kind = inferPlanKindFromStravaSport(activity.sport_type);
    if (!kind) {
      return {
        detail: `strava: activity sport not mapped (${activity.sport_type ?? "?"})`,
      };
    }
    const imported = await upsertCalendarFromStravaActivity(
      db,
      activity,
      calendarExternalKeys,
      now,
    );
    if (imported) {
      return {
        detail: `strava: new completed workout row (${aspect})`,
      };
    }
    return {
      detail: `strava: completed workout updated; no new row (${aspect})`,
    };
  }

  return { detail: `strava: aspect ${aspect} ignored` };
}
