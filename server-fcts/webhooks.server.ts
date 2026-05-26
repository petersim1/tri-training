/**
 * Vendor webhooks (Strava / Hevy). This module is the **only** place that may
 * `delete()` `completed_workouts` rows. Server fns, APIs, and imports must only
 * unlink plans or update rows — never remove completed sessions from the DB.
 */
import { and, eq } from "drizzle-orm";
import type { WorkoutVendor } from "@/lib/constants/activities";
import type { CompletedActivityKind } from "@/lib/constants/vendors";
import { getDb } from "@/lib/db/index.server";
import { completedWorkouts, webhookDeliveries } from "@/lib/db/schema.server";
import { hevyFetchWorkoutById } from "@/lib/hevy/client";
import { stravaSportTypeToPlanKind } from "@/lib/plans/completed-workout-data";
import { ALLOWED_STRAVA_ATHLETE_ID } from "@/lib/strava/allowed-athlete";
import type { StravaActivitySummary } from "@/lib/strava/types";
import { vendorActions } from "@/server-fcts";
import type { StravaWebhookEvent } from "@/types/requests/webhooks";

const LOG = "[webhooks/externals]";

export async function logWebhookDelivery(args: {
  source: WorkoutVendor;
  idempotencyKey?: string | null;
  payloadJson: string;
  outcome: "ok" | "ignored" | "error";
  detail?: string | null;
}): Promise<void> {
  const db = await getDb();
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
  const db = await getDb();
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
  const db = await getDb();
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
  const db = await getDb();
  const now = new Date();

  if (!w) {
    await deleteCompletedByVendor("hevy", key);
    return {
      detail: "hevy: workout removed or missing; completed row deleted",
    };
  }

  if (!w.start_time) {
    return { detail: "hevy: workout has no start_time; skipped" };
  }

  const existing_workout = await db
    .select()
    .from(completedWorkouts)
    .where(eq(completedWorkouts.id, key))
    .get();
  if (existing_workout) {
    await db
      .update(completedWorkouts)
      .set({ updatedAt: now, data: w })
      .where(eq(completedWorkouts.id, existing_workout.id));
    return { detail: "hevy: completed workout updated / no new row" };
  } else {
    await db.insert(completedWorkouts).values({
      id: crypto.randomUUID(),
      vendor: "hevy",
      vendorId: key,
      activityKind: "lift",
      isResolved: false,
      data: w,
    });
    return { detail: "hevy: imported new completed workout row" };
  }
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

  const db = await getDb();
  const now = new Date();

  if (aspect === "delete") {
    await deleteCompletedByVendor("strava", String(oid));
    return { detail: "strava: completed workout deleted (plans unlinked)" };
  }

  const token = await vendorActions.getValidAccessTokenForWebhooks();
  if (!token) {
    console.warn(LOG, "strava fetch failed or no service tokens", {
      objectId: oid,
    });
    throw new Error(
      "Strava: cannot fetch activity — complete OAuth once so tokens are stored for webhooks",
    );
  }

  const path = `/activities/${oid}`;

  const url = path.startsWith("http")
    ? path
    : `https://www.strava.com/api/v3${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    console.warn(LOG, "strava fetch failed or no service tokens", {
      objectId: oid,
    });
    throw new Error(
      "Strava: cannot fetch activity — complete OAuth once so tokens are stored for webhooks",
    );
  }
  if (res.status === 404) {
    console.warn(LOG, "strava fetch failed or no service tokens", {
      objectId: oid,
    });
    throw new Error(
      "Strava: cannot fetch activity — complete OAuth once so tokens are stored for webhooks",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API error ${res.status}: ${text}`);
  }

  const activity = (await res.json()) as StravaActivitySummary;

  if (aspect === "create" || aspect === "update") {
    const kind = stravaSportTypeToPlanKind(activity.sport_type);
    if (!kind) {
      return {
        detail: `strava: activity sport not mapped (${activity.sport_type ?? "?"})`,
      };
    }

    const existing_workout = await db
      .select()
      .from(completedWorkouts)
      .where(eq(completedWorkouts.id, activity.id.toString()))
      .get();
    if (existing_workout) {
      await db
        .update(completedWorkouts)
        .set({ updatedAt: now, data: activity })
        .where(eq(completedWorkouts.id, existing_workout.id));
      return { detail: "hevy: completed workout updated / no new row" };
    } else {
      await db.insert(completedWorkouts).values({
        id: crypto.randomUUID(),
        vendor: "strava",
        vendorId: activity.id.toString(),
        activityKind: kind as CompletedActivityKind,
        isResolved: false,
        data: activity,
      });
      return { detail: "hevy: imported new completed workout row" };
    }
  }

  return { detail: `strava: aspect ${aspect} ignored` };
}
