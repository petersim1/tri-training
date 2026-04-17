import type { QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "~/lib/db";
import type { CompletedWorkoutRow } from "~/lib/db/schema";
import { completedWorkouts, weightEntries } from "~/lib/db/schema";
import {
  CALENDAR_SCOPE_COOKIE,
  type CalendarScope,
  parseCalendarScope,
} from "~/lib/home/calendar-scope";
import {
  homeHevyBundleQueryKey,
  homePlansQueryKey,
  homeUnresolvedCompletedDayKeysQueryKey,
  homeWeightQueryKey,
} from "~/lib/home/query-keys";
import {
  parseSessionChartSettings,
  SESSION_CHART_COOKIE,
  type SessionChartSettings,
  serializeSessionChartSettings,
} from "~/lib/home/session-chart-settings";
import { completedWorkoutLocalDayKey } from "~/lib/plans/completed-workout-data";
import { listAllPlannedWorkoutsFn } from "~/lib/server-fns/planned-workouts-list";
import { fetchHevyHomeBundleFn } from "~/lib/server-fns/vendors/hevy";

export type { SessionChartSettings } from "~/lib/home/session-chart-settings";
export { fetchHevyHomeBundleFn };

function validateSessionChartSettings(d: SessionChartSettings): void {
  const ok =
    ["3m", "6m", "12m", "ytd", "all"].includes(d.range) &&
    ["distance", "time", "pace"].includes(d.metric) &&
    typeof d.cumulative === "boolean";
  if (!ok) {
    throw new Error("Invalid session chart settings");
  }
}

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

/** Distinct local day keys (`YYYY-MM-DD`) with at least one unlinked completed session — calendar “floating” dot. */
export const fetchUnresolvedCompletedDayKeysFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<{ dayKeys: string[] }> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(completedWorkouts)
    .where(eq(completedWorkouts.isResolved, false))
    .all();
  const keys = new Set<string>();
  for (const row of rows) {
    const dk = completedWorkoutLocalDayKey(row);
    if (dk) {
      keys.add(dk);
    }
  }
  return { dayKeys: [...keys].sort() };
});

/** Unlinked `completed_workouts` rows whose local calendar day matches `dayKey` (`YYYY-MM-DD`). */
export const fetchUnresolvedCompletedForDayFn = createServerFn({
  method: "GET",
})
  .inputValidator((d: { dayKey: string }) => d)
  .handler(async ({ data }): Promise<CompletedWorkoutRow[]> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dayKey)) {
      throw new Error("Invalid dayKey");
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(completedWorkouts)
      .where(eq(completedWorkouts.isResolved, false))
      .all();
    return rows.filter((r) => completedWorkoutLocalDayKey(r) === data.dayKey);
  });

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

  queryClient.prefetchQuery({
    queryKey: homeUnresolvedCompletedDayKeysQueryKey,
    queryFn: () => fetchUnresolvedCompletedDayKeysFn(),
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
