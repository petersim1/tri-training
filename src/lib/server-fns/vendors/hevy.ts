import { createServerFn } from "@tanstack/react-start";
import { hevyFetch } from "~/lib/hevy/client";
import {
  fetchAllHevyRoutines,
  fetchAllRoutineFolders,
} from "~/lib/hevy/fetch-all";
import { groupRoutinesByFolder } from "~/lib/hevy/group-routines";
import type {
  HevyRoutineDetail,
  HevyRoutineFolderGroup,
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
} from "~/lib/hevy/types";

export type {
  HevyRoutineDetail,
  HevyRoutineFolderGroup,
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
} from "~/lib/hevy/types";

export type HevyHomeBundle = {
  hevyRoutines: HevyRoutineSummary[];
  hevyRoutineGroups: HevyRoutineFolderGroup[];
  hevyRoutinesUnfoldered: HevyRoutineSummary[];
};

/** Hevy routines + folder grouping for home — use with `homeHevyBundleQueryKey`. */
export const fetchHevyHomeBundleFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<HevyHomeBundle> => {
    let hevyRoutines: HevyRoutineSummary[] = [];
    let hevyRoutineGroups: HevyRoutineFolderGroup[] = [];
    let hevyRoutinesUnfoldered: HevyRoutineSummary[] = [];
    try {
      hevyRoutines = await fetchAllHevyRoutines();
      try {
        const folders =
          await fetchAllRoutineFolders<HevyRoutineFolderSummary>();
        const { groups, unfoldered } = groupRoutinesByFolder(
          folders,
          hevyRoutines,
        );
        hevyRoutineGroups = groups;
        hevyRoutinesUnfoldered = unfoldered;
      } catch {
        hevyRoutineGroups = [];
        hevyRoutinesUnfoldered = [...hevyRoutines];
      }
    } catch {
      hevyRoutines = [];
    }
    return {
      hevyRoutines,
      hevyRoutineGroups,
      hevyRoutinesUnfoldered,
    };
  },
);

/** Used by Home add-plan flow to preview exercises when a Hevy routine is selected. */
export const getRoutineDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { routineId: string }) => d)
  .handler(async ({ data }) => {
    const res = await hevyFetch<{ routine?: HevyRoutineDetail }>(
      `/routines/${encodeURIComponent(data.routineId)}`,
    );
    return res.routine ?? null;
  });
