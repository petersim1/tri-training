import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { bulkInsertPlannedWorkoutsFromApi } from "~/lib/api/bulk-planned-workouts";

const JSON_HDR = { "Content-Type": "application/json" };

function bulkPostAuthorized(request: Request): boolean {
  const secret = process.env.STRAVA_ACCESS_TOKEN;
  if (secret === undefined || secret === "") {
    return false;
  }
  const raw = request.headers.get("Authorization");
  if (raw === null) {
    return false;
  }
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(raw);
  if (!m) {
    return false;
  }
  const token = m[1];
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(secret, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/planned-workouts/bulk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!bulkPostAuthorized(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            { status: 401, headers: JSON_HDR },
          );
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid JSON body" }),
            { status: 400, headers: JSON_HDR },
          );
        }
        const result = await bulkInsertPlannedWorkoutsFromApi(body);
        if (!result.ok) {
          return new Response(JSON.stringify(result), {
            status: 400,
            headers: JSON_HDR,
          });
        }
        return new Response(JSON.stringify(result), {
          status: 201,
          headers: JSON_HDR,
        });
      },
    },
  },
});
