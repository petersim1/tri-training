import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { getSessionOk } from "~/lib/auth/session-server";
import { getDb } from "~/lib/db";
import { weightEntries } from "~/lib/db/schema";
import { selectPlannedWorkoutsWithCompleted } from "~/lib/plans/select-with-completed";
import {
  fetchAllHevyRoutines,
  fetchAllRoutineFolders,
} from "~/lib/hevy/fetch-all";
import { groupRoutinesByFolder } from "~/lib/hevy/group-routines";
import type {
  HevyRoutineFolderGroup,
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
} from "~/lib/hevy/types";

export type {
  HevyRoutineFolderGroup,
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
} from "~/lib/hevy/types";

async function requireAuth() {
  if (!(await getSessionOk())) {
    throw new Error("Unauthorized");
  }
}

export const getHomeDataFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const db = getDb();
    const plans = selectPlannedWorkoutsWithCompleted();

    const weightEntriesList = db
      .select()
      .from(weightEntries)
      .orderBy(desc(weightEntries.dayKey))
      .all();

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
      plans,
      weightEntries: weightEntriesList,
      hevyRoutines,
      hevyRoutineGroups,
      hevyRoutinesUnfoldered,
    };
  },
);
