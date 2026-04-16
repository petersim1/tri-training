import { createServerFn } from "@tanstack/react-start";
import { hevyFetch } from "~/lib/hevy/client";
import type { HevyRoutineDetail } from "~/lib/hevy/types";

export type { HevyRoutineDetail } from "~/lib/hevy/types";

/** Used by Home add-plan flow to preview exercises when a Hevy routine is selected. */
export const getRoutineDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { routineId: string }) => d)
  .handler(async ({ data }) => {
    const res = await hevyFetch<{ routine?: HevyRoutineDetail }>(
      `/routines/${encodeURIComponent(data.routineId)}`,
    );
    return res.routine ?? null;
  });
