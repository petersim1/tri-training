/**
 * Vendor webhooks (Strava / Hevy). This module is the **only** place that may
 * `delete()` `completed_workouts` rows. Server fns, APIs, and imports must only
 * unlink plans or update rows — never remove completed sessions from the DB.
 */

import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import type { WorkoutVendor } from "@/lib/constants/activities";
import { getDb } from "@/lib/db/index.server";
import { vendorActivities, webhookDeliveries } from "@/lib/db/schema.server";
import { hevyFetchWorkoutById } from "@/lib/hevy/client";
import { ALLOWED_STRAVA_ATHLETE_ID } from "@/lib/strava/allowed-athlete";
import type { StravaActivity } from "@/lib/strava/types";
import type { StravaWebhookEvent } from "@/types/requests/webhooks";
import { vendorActions } from "./vendors";

const LOG = "[webhooks/externals]";

const logWebhookDelivery = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      source: WorkoutVendor;
      idempotencyKey?: string | null;
      payloadJson: string;
      outcome: "ok" | "ignored" | "error";
      detail?: string | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const now = new Date();
    await db
      .insert(webhookDeliveries)
      .values({
        id: crypto.randomUUID(),
        source: data.source,
        idempotencyKey: data.idempotencyKey ?? null,
        payloadJson: data.payloadJson,
        outcome: data.outcome,
        detail: data.detail ?? null,
        createdAt: now,
      })
      .run();
  });

/**
 * Hard-delete by vendor id. Called only from this file (webhook handlers).
 * Plans are unlinked via FK `onDelete: "set null"`.
 */
const deleteCompletedByVendor = async (
  vendor: WorkoutVendor,
  vendorId: string,
): Promise<void> => {
  const db = await getDb();
  const vid = vendorId.trim();
  if (!vid) {
    return;
  }
  await db
    .delete(vendorActivities)
    .where(
      and(
        eq(vendorActivities.vendor, vendor),
        eq(vendorActivities.vendorId, vid),
      ),
    )
    .run();
};

const processHevyWorkoutWebhook = createServerFn({ method: "POST" })
  .inputValidator((d: { workoutId: string }) => d)
  .handler(async ({ data }): Promise<{ detail: string }> => {
    const key = data.workoutId.trim();
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
      .from(vendorActivities)
      .where(eq(vendorActivities.id, key))
      .get();
    if (existing_workout) {
      await db
        .update(vendorActivities)
        .set({ updatedAt: now, data: w })
        .where(eq(vendorActivities.id, existing_workout.id));
      return { detail: "hevy: completed workout updated / no new row" };
    } else {
      await db.insert(vendorActivities).values({
        id: crypto.randomUUID(),
        vendor: "hevy",
        vendorId: key,
        data: w,
      });
      return { detail: "hevy: imported new completed workout row" };
    }
  });
const processStravaWebhookEvent = createServerFn({ method: "POST" })
  .inputValidator((d: StravaWebhookEvent) => d)
  .handler(
    async ({ data }): Promise<{ detail: string; duplicate?: boolean }> => {
      if (
        (data.object_type === "activity" || data.object_type === "athlete") &&
        data.owner_id !== ALLOWED_STRAVA_ATHLETE_ID
      ) {
        return { detail: "strava: ignored (different athlete)" };
      }

      if (data.object_type === "athlete") {
        return { detail: "strava: athlete event (ignored)" };
      }

      if (data.object_type !== "activity" || data.object_id == null) {
        return { detail: "strava: unsupported object_type" };
      }

      const sub = data.subscription_id ?? 0;
      const oid = data.object_id;
      const aspect = data.aspect_type ?? "";
      const et = data.event_time ?? 0;
      const idempotencyKey = `strava:${sub}:${oid}:${aspect}:${et}`;

      const db = await getDb();
      const row = await db
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.idempotencyKey, idempotencyKey))
        .get();

      if (row) {
        return { detail: "strava: duplicate event skipped", duplicate: true };
      }
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

      const activity = (await res.json()) as StravaActivity;

      if (aspect === "create" || aspect === "update") {
        const existing_workout = await db
          .select()
          .from(vendorActivities)
          .where(eq(vendorActivities.id, activity.id.toString()))
          .get();
        if (existing_workout) {
          await db
            .update(vendorActivities)
            .set({ updatedAt: now, data: activity })
            .where(eq(vendorActivities.id, existing_workout.id));
          return { detail: "strava: completed workout updated / no new row" };
        } else {
          await db.insert(vendorActivities).values({
            id: crypto.randomUUID(),
            vendor: "strava",
            vendorId: activity.id.toString(),
            data: activity,
          });
          return { detail: "hevy: imported new completed workout row" };
        }
      }

      return { detail: `strava: aspect ${aspect} ignored` };
    },
  );

export const webhookActions = {
  logWebhookDelivery,
  processHevyWorkoutWebhook,
  processStravaWebhookEvent,
};
