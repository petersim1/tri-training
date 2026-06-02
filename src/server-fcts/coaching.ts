import { createServerFn } from "@tanstack/react-start";
import type { CoachingStateRow } from "@/lib/db/schema.server";
import { coachingServerFns } from "./coaching.server";

const get = createServerFn({ method: "GET" }).handler(
  async (): Promise<CoachingStateRow> => {
    return coachingServerFns.get();
  },
);

export const coachingActions = {
  get,
};
