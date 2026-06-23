import { type Exception, trace } from "@opentelemetry/api";
import { createServerFn } from "@tanstack/react-start";
import type { CoachingStateRow } from "@/lib/db/schema.server";
import { coachingServerFns } from "./coaching.server";

const tracer = trace.getTracer("bevor.coaching");

const get = createServerFn({ method: "GET" }).handler(
  async (): Promise<CoachingStateRow> => {
    return tracer.startActiveSpan("get", async (span) => {
      try {
        return coachingServerFns.get();
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  },
);

export const coachingActions = {
  get,
};
