import { createFileRoute } from "@tanstack/react-router";
import {
  logWebhookDelivery,
  processHevyWorkoutWebhook,
} from "~/lib/webhooks/process-external-webhooks";

export const Route = createFileRoute("/api/webhooks/hevy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.HEVY_WEBHOOK_BEARER_SECRET?.trim();
        if (!secret) {
          return new Response(
            JSON.stringify({ error: "HEVY_WEBHOOK_BEARER_SECRET is not set" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${secret}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const workoutId =
          typeof body === "object" &&
          body !== null &&
          "workoutId" in body &&
          typeof (body as { workoutId?: unknown }).workoutId === "string"
            ? (body as { workoutId: string }).workoutId.trim()
            : typeof body === "object" &&
                body !== null &&
                "workoutId" in body &&
                typeof (body as { workoutId?: unknown }).workoutId === "number"
              ? String((body as { workoutId: number }).workoutId)
              : "";

        if (!workoutId) {
          return new Response(JSON.stringify({ error: "workoutId required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const result = await processHevyWorkoutWebhook({ workoutId });
          await logWebhookDelivery({
            source: "hevy",
            idempotencyKey: null,
            payloadJson: JSON.stringify(body),
            outcome: "ok",
            detail: result.detail,
          });
          return new Response(null, { status: 200 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await logWebhookDelivery({
            source: "hevy",
            payloadJson: JSON.stringify(body),
            outcome: "error",
            detail: msg.slice(0, 500),
          });
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
