import type { QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "~/lib/db";
import type {
  CompletedWorkoutRow,
  PlanKind,
  PlannedWorkoutRow,
} from "~/lib/db/schema";
import {
  completedWorkouts,
  plannedWorkouts,
  weightEntries,
} from "~/lib/db/schema";
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
import {
  completedWorkoutLocalDayKey,
  completedWorkoutLocalDayKeyInTimeZone,
  completedWorkoutStartIso,
  inferPlanKindFromCompletedRow,
} from "~/lib/plans/completed-workout-data";
import { syncCompletedResolvedForId } from "~/lib/plans/completed-resolved";
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

/** Every unlinked completed session (for bulk link UI). */
export const fetchAllUnresolvedCompletedWorkoutsFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<CompletedWorkoutRow[]> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(completedWorkouts)
    .where(eq(completedWorkouts.isResolved, false))
    .all();
  return [...rows].sort((a, b) => {
    const ia = completedWorkoutStartIso(a);
    const ib = completedWorkoutStartIso(b);
    const ta = ia ? new Date(ia).getTime() : 0;
    const tb = ib ? new Date(ib).getTime() : 0;
    return ta - tb;
  });
});

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type LinkAllUnresolvedCompletedItem =
  | { completedWorkoutId: string; outcome: "linked"; planId: string }
  | { completedWorkoutId: string; outcome: "skipped"; reason: string };

/**
 * Link each unresolved session using calendar day in `timeZone` + inferred plan kind:
 * 0 plans that day for that kind → insert a completed plan row and link;
 * 1 plan, unlinked → link it;
 * 1 plan, already linked → skip;
 * 2+ plans that day for that kind → skip (ambiguous).
 */
export const linkAllUnresolvedCompletedWorkoutsFn = createServerFn({
  method: "POST",
})
  .inputValidator((d: { timeZone: string }) => d)
  .handler(
    async ({
      data,
    }): Promise<{
      linked: number;
      skipped: number;
      details: LinkAllUnresolvedCompletedItem[];
    }> => {
      const tz = String(data.timeZone ?? "").trim();
      if (!tz || !isValidIanaTimeZone(tz)) {
        throw new Error("Invalid or missing time zone");
      }
      const db = getDb();
      const now = new Date();
      const unresolved = await db
        .select()
        .from(completedWorkouts)
        .where(eq(completedWorkouts.isResolved, false))
        .all();
      const allPlans: PlannedWorkoutRow[] = await db
        .select()
        .from(plannedWorkouts)
        .all();

      const sorted = [...unresolved].sort((a, b) => {
        const ia = completedWorkoutStartIso(a);
        const ib = completedWorkoutStartIso(b);
        const ta = ia ? new Date(ia).getTime() : 0;
        const tb = ib ? new Date(ib).getTime() : 0;
        return ta - tb;
      });

      const details: LinkAllUnresolvedCompletedItem[] = [];
      let linked = 0;

      for (const cw of sorted) {
        const dayKey = completedWorkoutLocalDayKeyInTimeZone(cw, tz);
        if (!dayKey) {
          details.push({
            completedWorkoutId: cw.id,
            outcome: "skipped",
            reason: "missing start time",
          });
          continue;
        }
        const pk = inferPlanKindFromCompletedRow(cw);
        if (!pk) {
          details.push({
            completedWorkoutId: cw.id,
            outcome: "skipped",
            reason: "unsupported activity kind",
          });
          continue;
        }

        const sameDayKind = allPlans.filter(
          (p) => p.dayKey === dayKey && p.kind === pk,
        );

        if (sameDayKind.length > 1) {
          details.push({
            completedWorkoutId: cw.id,
            outcome: "skipped",
            reason:
              "multiple plans that day for this activity type — link manually on Home",
          });
          continue;
        }

        if (sameDayKind.length === 1) {
          const plan = sameDayKind[0];
          if (plan.completedWorkoutId != null) {
            details.push({
              completedWorkoutId: cw.id,
              outcome: "skipped",
              reason:
                "a plan already exists that day but is linked to another session",
            });
            continue;
          }
          if (plan.status !== "planned") {
            details.push({
              completedWorkoutId: cw.id,
              outcome: "skipped",
              reason:
                "existing plan that day is not open for linking — adjust status on Home",
            });
            continue;
          }
          await db
            .update(plannedWorkouts)
            .set({
              completedWorkoutId: cw.id,
              status: "completed",
              updatedAt: now,
            })
            .where(eq(plannedWorkouts.id, plan.id))
            .run();
          await syncCompletedResolvedForId(db, cw.id);
          plan.completedWorkoutId = cw.id;
          plan.status = "completed";
          linked++;
          details.push({
            completedWorkoutId: cw.id,
            outcome: "linked",
            planId: plan.id,
          });
          continue;
        }

        const planKind = pk as PlanKind;
        const isLift = planKind === "lift";
        const newId = crypto.randomUUID();
        await db
          .insert(plannedWorkouts)
          .values({
            id: newId,
            kind: planKind,
            dayKey,
            notes: null,
            status: "completed",
            routineVendor: isLift ? "hevy" : "strava",
            routineId: null,
            completedWorkoutId: cw.id,
            distance: null,
            distanceUnits: null,
            timeSeconds: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        await syncCompletedResolvedForId(db, cw.id);
        allPlans.push({
          id: newId,
          kind: planKind,
          dayKey,
          notes: null,
          status: "completed",
          routineVendor: isLift ? "hevy" : "strava",
          routineId: null,
          completedWorkoutId: cw.id,
          distance: null,
          distanceUnits: null,
          timeSeconds: null,
          createdAt: now,
          updatedAt: now,
        });
        linked++;
        details.push({
          completedWorkoutId: cw.id,
          outcome: "linked",
          planId: newId,
        });
      }

      return {
        linked,
        skipped: details.filter((d) => d.outcome === "skipped").length,
        details,
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
