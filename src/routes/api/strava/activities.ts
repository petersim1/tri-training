import { createFileRoute } from "@tanstack/react-router";
import { getSessionOk } from "~/lib/auth/session-server";
import { stravaFetchJson } from "~/lib/strava/tokens";
import type { StravaActivitySummary } from "~/lib/strava/types";

export const Route = createFileRoute("/api/strava/activities")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await getSessionOk())) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const url = new URL(request.url);
        const perPage = Math.min(
          50,
          Math.max(1, Number(url.searchParams.get("per_page") ?? "30")),
        );
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
        const after = url.searchParams.get("after");
        const before = url.searchParams.get("before");
        const qp = new URLSearchParams({
          per_page: String(perPage),
          page: String(page),
        });
        if (after !== null && after !== "") {
          qp.set("after", after);
        }
        if (before !== null && before !== "") {
          qp.set("before", before);
        }
        try {
          const list = await stravaFetchJson<StravaActivitySummary[]>(
            `/athlete/activities?${qp.toString()}`,
          );
          if (list === null) {
            return new Response(
              JSON.stringify({
                error: "Strava not connected or token invalid",
              }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ activities: list }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Strava error";
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
