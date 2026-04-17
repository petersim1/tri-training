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
        const rawBody = await request.text();
        await logWebhookDelivery({
          source: "strava",
          idempotencyKey: null,
          payloadJson: rawBody,
          outcome: "ignored",
          detail: "received",
        });

        let body: unknown;
        try {
          body = rawBody ? JSON.parse(rawBody) : null;
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

        const payloadJson =
          typeof body === "object" && body !== null
            ? JSON.stringify(body)
            : rawBody;
        const sub = ev.subscription_id ?? 0;
        const oid = ev.object_id ?? 0;
        const aspect = ev.aspect_type ?? "";
        const et = ev.event_time ?? 0;
        const idempotencyKey = `strava:${sub}:${oid}:${aspect}:${et}`;

        try {
          const result = await processStravaWebhookEvent(ev);
          if (result.duplicate) {
            return new Response(null, { status: 200 });
          }
          const detail = result.detail;
          const outcome: "ok" | "ignored" =
            detail.includes("ignored") || detail.includes("duplicate")
              ? "ignored"
              : "ok";
          await logWebhookDelivery({
            source: "strava",
            idempotencyKey,
            payloadJson,
            outcome,
            detail,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await logWebhookDelivery({
            source: "strava",
            idempotencyKey,
            payloadJson,
            outcome: "error",
            detail: msg.slice(0, 500),
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
