import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { desc } from "drizzle-orm";
import { getSessionOk } from "~/lib/auth/session-server";
import { getDb } from "~/lib/db";
import { weightEntries } from "~/lib/db/schema";
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
import {
  CALENDAR_SCOPE_COOKIE,
  type CalendarScope,
  parseCalendarScope,
} from "~/lib/home/calendar-scope";
import { selectPlannedWorkoutsWithCompleted } from "~/lib/plans/select-with-completed";

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
    const plans = await selectPlannedWorkoutsWithCompleted();

    const weightEntriesList = await db
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
      calendarScope: parseCalendarScope(getCookie(CALENDAR_SCOPE_COOKIE)),
    };
  },
);

/** Persist month vs week calendar (`/` home). Read via `getHomeDataFn`. */
export const setCalendarScopeFn = createServerFn({ method: "POST" })
  .inputValidator((d: { scope: CalendarScope }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    if (data.scope !== "month" && data.scope !== "week") {
      throw new Error("Invalid calendar scope");
    }
    setCookie(CALENDAR_SCOPE_COOKIE, data.scope, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
    return { ok: true as const };
  });
