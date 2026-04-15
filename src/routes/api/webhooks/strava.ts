import { createFileRoute } from "@tanstack/react-router";
import {
  logWebhookDelivery,
  processStravaWebhookEvent,
  type StravaWebhookEvent,
} from "~/lib/webhooks/process-external-webhooks";

export const Route = createFileRoute("/api/webhooks/strava")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const verify = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN?.trim();
        if (!verify) {
          return new Response("Webhook verify token not configured", {
            status: 503,
          });
        }
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token === verify && challenge) {
          return new Response(JSON.stringify({ "hub.challenge": challenge }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 403 });
      },
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(null, { status: 400 });
        }

        if (body == null || typeof body !== "object") {
          return new Response(null, { status: 200 });
        }
        if (!("object_type" in body)) {
          return new Response(null, { status: 200 });
        }

        const ev = body as StravaWebhookEvent;
        if (ev.object_type === "athlete") {
          return new Response(null, { status: 200 });
        }

        const payloadJson = JSON.stringify(body);
        let outcome: "ok" | "ignored" | "error" = "ok";
        let detail = "";
        try {
          const sub = ev.subscription_id ?? 0;
          const oid = ev.object_id ?? 0;
          const aspect = ev.aspect_type ?? "";
          const et = ev.event_time ?? 0;
          const idempotencyKey = `strava:${sub}:${oid}:${aspect}:${et}`;

          const result = await processStravaWebhookEvent(ev);
          detail = result.detail;
          if (result.duplicate) {
            return new Response(null, { status: 200 });
          }
          if (detail.includes("ignored") || detail.includes("duplicate")) {
            outcome = "ignored";
          }
          await logWebhookDelivery({
            source: "strava",
            idempotencyKey,
            payloadJson,
            outcome,
            detail,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          detail = msg.slice(0, 500);
          outcome = "error";
          const sub = ev.subscription_id ?? 0;
          const oid = ev.object_id ?? 0;
          const aspect = ev.aspect_type ?? "";
          const et = ev.event_time ?? 0;
          const idempotencyKey = `strava:${sub}:${oid}:${aspect}:${et}`;
          await logWebhookDelivery({
            source: "strava",
            idempotencyKey,
            payloadJson,
            outcome,
            detail,
          });
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(null, { status: 200 });
      },
    },
  },
});
