import type { QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { desc } from "drizzle-orm";
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
import {
  homeHevyBundleQueryKey,
  homePlansQueryKey,
  homeWeightQueryKey,
} from "~/lib/home/query-keys";
import {
  parseSessionChartSettings,
  SESSION_CHART_COOKIE,
  type SessionChartSettings,
  serializeSessionChartSettings,
} from "~/lib/home/session-chart-settings";
import { listAllPlannedWorkoutsFn } from "~/lib/plans/list-planned-fns";

export type {
  HevyRoutineFolderGroup,
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
} from "~/lib/hevy/types";

export type { SessionChartSettings } from "~/lib/home/session-chart-settings";

function validateSessionChartSettings(d: SessionChartSettings): void {
  const ok =
    ["3m", "6m", "12m", "ytd", "all"].includes(d.range) &&
    ["distance", "time", "pace"].includes(d.metric) &&
    typeof d.cumulative === "boolean";
  if (!ok) {
    throw new Error("Invalid session chart settings");
  }
}

export type HevyHomeBundle = {
  hevyRoutines: HevyRoutineSummary[];
  hevyRoutineGroups: HevyRoutineFolderGroup[];
  hevyRoutinesUnfoldered: HevyRoutineSummary[];
};

/** Weight rows for home — use with `homeWeightQueryKey`. */
export const fetchWeightEntriesForHomeFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const db = getDb();
  return await db
    .select()
    .from(weightEntries)
    .orderBy(desc(weightEntries.dayKey))
    .all();
});

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

/**
 * Home `/` loader: cookie-backed settings (defaults if missing) + dehydrated React Query state only.
 * Prefetch uses the same query keys + queryFns as `useQuery` on the client.
 *
 * Must be a server function so client navigations still hit the server: plain loaders run in the
 * browser where httpOnly session cookies are not visible to `getCookie`, which would throw Unauthorized.
 */
export const loadHomePageDataFn = async (
  queryClient: QueryClient,
): Promise<{
  calendarScope: CalendarScope;
  sessionChartSettings: SessionChartSettings;
}> => {
  const calendarScope = await getCalendarScope();
  const sessionChartSettings = await getCalendarSettings();

  queryClient.prefetchQuery({
    queryKey: homePlansQueryKey,
    queryFn: () => listAllPlannedWorkoutsFn(),
  });

  queryClient.prefetchQuery({
    queryKey: homeWeightQueryKey,
    queryFn: () => fetchWeightEntriesForHomeFn(),
  });

  queryClient.prefetchQuery({
    queryKey: homeHevyBundleQueryKey,
    queryFn: () => fetchHevyHomeBundleFn(),
  });

  return {
    calendarScope,
    sessionChartSettings,
  };
};

export const getCalendarScope = createServerFn({ method: "POST" }).handler(
  async (): Promise<CalendarScope> => {
    return parseCalendarScope(getCookie(CALENDAR_SCOPE_COOKIE));
  },
);

export const getCalendarSettings = createServerFn({ method: "POST" }).handler(
  async (): Promise<SessionChartSettings> => {
    return parseSessionChartSettings(getCookie(SESSION_CHART_COOKIE));
  },
);

/** Persist month vs week calendar (`/` home). Read via `loadHomePageDataFn`. */
export const setCalendarScopeFn = createServerFn({ method: "POST" })
  .inputValidator((d: { scope: CalendarScope }) => d)
  .handler(async ({ data }) => {
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

/** Session trends chart: range, metric, cumulative — read via `loadHomePageDataFn`. */
export const setSessionChartSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: SessionChartSettings) => d)
  .handler(async ({ data }) => {
    validateSessionChartSettings(data);
    setCookie(SESSION_CHART_COOKIE, serializeSessionChartSettings(data), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
    return { ok: true as const };
  });
