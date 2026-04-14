import { createFileRoute } from "@tanstack/react-router";
import { getSessionOk } from "~/lib/auth/session-server";
import { hevyFetch } from "~/lib/hevy/client";

export const Route = createFileRoute("/api/hevy/workouts")({
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
        const page = url.searchParams.get("page") ?? "1";
        const rawSize =
          url.searchParams.get("pageSize") ??
          url.searchParams.get("page_size") ??
          "10";
        const pageSize = Math.min(10, Math.max(1, Number(rawSize) || 10));
        try {
          const data = await hevyFetch<{
            workouts?: unknown[];
            page?: number;
            page_count?: number;
          }>(`/workouts?page=${page}&pageSize=${pageSize}`);
          return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Hevy error";
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
