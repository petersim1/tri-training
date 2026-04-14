import { createFileRoute } from "@tanstack/react-router";
import { getSessionOk } from "~/lib/auth/session-server";
import { getStravaTokensFromCookies } from "~/lib/strava/cookie-store";

export const Route = createFileRoute("/api/strava/status")({
  server: {
    handlers: {
      GET: async () => {
        if (!(await getSessionOk())) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const row = getStravaTokensFromCookies();
        if (!row) {
          return new Response(JSON.stringify({ connected: false }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            connected: true,
            athleteId: row.athleteId,
            expiresAt: row.expiresAt,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
