import { eq } from "drizzle-orm";
import type { HevyWorkoutSummary } from "~/lib/activities/types";
import type { getDb } from "~/lib/db";
import { completedWorkouts, plannedWorkouts } from "~/lib/db/schema";
import { hevyFetch } from "~/lib/hevy/client";
import type { StravaActivitySummary } from "~/lib/strava/types";

/** Same shape as `stravaFetchJson` from `~/lib/strava/tokens` (cookies in app, env in tests). */
export type StravaFetchJson = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T | null>;

const LOG = "[backfill-links]";

/** Hevy `GET /v1/workouts`: `pageSize` max 10 per [API docs](https://api.hevyapp.com/docs/#/Workouts/get_v1_workouts). */
const HEVY_PAGE_SIZE = 10;
/** Strava allows up to 200 per page; paginate within the `after`/`before` window. */
const STRAVA_PER_PAGE = 200;
/** Safety cap if the API keeps returning full pages (should never hit in practice). */
const STRAVA_MAX_PAGES = 500;
/** Hevy: stop after this many pages if the API misbehaves. */
const HEVY_MAX_PAGES = 50_000;

/** Same calendar day string as UI `localDayKey` (runtime local timezone). */
export function localDayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inTimeRange(iso: string | undefined, startMs: number, endMs: number) {
  if (!iso) {
    return false;
  }
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= startMs && t <= endMs;
}

/** Workouts / activities on this calendar day (local `dayStartMs`/`dayEndMs`). */
export type PlanLinkCandidatesResult = {
  hevy: HevyWorkoutSummary[];
  strava: StravaActivitySummary[];
  hevyError?: string;
  stravaError?: string;
};

type HevyWorkoutsPageJson = {
  workouts?: HevyWorkoutSummary[];
  page_count?: number;
  pageCount?: number;
};

/**
 * Walk every Hevy workouts page until a short or empty page (does not trust `page_count` alone).
 */
async function forEachHevyWorkoutPage(
  onPage: (
    batch: HevyWorkoutSummary[],
    meta: { page: number; declaredPages: number },
  ) => void,
): Promise<{ pagesFetched: number }> {
  let page = 1;
  let pagesFetched = 0;
  while (page <= HEVY_MAX_PAGES) {
    const data = await hevyFetch<HevyWorkoutsPageJson>(
      `/workouts?page=${page}&pageSize=${HEVY_PAGE_SIZE}`,
    );
    const batch = data.workouts ?? [];
    const declaredPages = Math.max(1, data.page_count ?? data.pageCount ?? 1);
    pagesFetched++;
    onPage(batch, { page, declaredPages });
    if (batch.length === 0) {
      break;
    }
    if (page < declaredPages) {
      page++;
      continue;
    }
    if (batch.length < HEVY_PAGE_SIZE) {
      break;
    }
    page++;
  }
  return { pagesFetched };
}

/**
 * Full Hevy workout history (all pages). Use for historical backfills — not per-plan day scans.
 */
export async function fetchAllHevyWorkoutsForBackfill(): Promise<{
  workouts: HevyWorkoutSummary[];
  error?: string;
}> {
  const all: HevyWorkoutSummary[] = [];
  try {
    const { pagesFetched } = await forEachHevyWorkoutPage((batch) => {
      for (const w of batch) {
        all.push(w);
      }
    });
    console.log(LOG, "Hevy full history load (backfill)", {
      totalWorkouts: all.length,
      pagesFetched,
      pageSize: HEVY_PAGE_SIZE,
    });
    return { workouts: all };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hevy request failed";
    console.warn(LOG, "Hevy full history load failed", msg);
    return { workouts: [], error: msg };
  }
}

export async function fetchHevyWorkoutsInRange(
  startMs: number,
  endMs: number,
  excludeKeys: Set<string>,
): Promise<{ list: HevyWorkoutSummary[]; error?: string }> {
  const out: HevyWorkoutSummary[] = [];
  try {
    const { pagesFetched } = await forEachHevyWorkoutPage((batch) => {
      for (const w of batch) {
        const id = w.id?.trim();
        if (!id || !inTimeRange(w.start_time, startMs, endMs)) {
          continue;
        }
        if (excludeKeys.has(`hevy:${id}`)) {
          continue;
        }
        out.push(w);
      }
    });
    console.log(LOG, "Hevy workouts in day window", {
      dayStart: new Date(startMs).toISOString(),
      dayEnd: new Date(endMs).toISOString(),
      pagesFetched,
      pageSize: HEVY_PAGE_SIZE,
      matchesInRange: out.length,
    });
    return { list: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hevy request failed";
    console.warn(LOG, "Hevy fetch failed", msg);
    return {
      list: [],
      error: msg,
    };
  }
}

export async function linkedSessionExcludeKeys(
  db: ReturnType<typeof getDb>,
): Promise<Set<string>> {
  const linkedRows = await db
    .select({
      vendor: completedWorkouts.vendor,
      vendorId: completedWorkouts.vendorId,
    })
    .from(plannedWorkouts)
    .innerJoin(
      completedWorkouts,
      eq(plannedWorkouts.completedWorkoutId, completedWorkouts.id),
    )
    .all();
  const excludeKeys = new Set<string>();
  for (const r of linkedRows) {
    if (r.vendorId) {
      excludeKeys.add(`${r.vendor}:${r.vendorId}`);
    }
  }
  return excludeKeys;
}

export async function fetchStravaActivitiesInRange(
  startMs: number,
  endMs: number,
  excludeKeys: Set<string>,
  stravaFetchJsonImpl: StravaFetchJson,
): Promise<{ list: StravaActivitySummary[]; error?: string }> {
  const out: StravaActivitySummary[] = [];
  try {
    const afterSec = Math.floor(startMs / 1000);
    const beforeSec = Math.floor(endMs / 1000);
    let page = 1;
    let pagesWithData = 0;
    while (page <= STRAVA_MAX_PAGES) {
      const list = await stravaFetchJsonImpl<StravaActivitySummary[]>(
        `/athlete/activities?after=${afterSec}&before=${beforeSec}&per_page=${STRAVA_PER_PAGE}&page=${page}`,
      );
      if (list === null) {
        if (page === 1) {
          console.warn(LOG, "Strava: no token / 401 on first page");
          return { list: [], error: "Strava not connected" };
        }
        console.warn(LOG, "Strava: null response mid-pagination", { page });
        break;
      }
      if (list.length === 0) {
        break;
      }
      pagesWithData++;
      for (const a of list) {
        const key = `strava:${String(a.id)}`;
        if (excludeKeys.has(key)) {
          continue;
        }
        out.push(a);
      }
      if (list.length < STRAVA_PER_PAGE) {
        break;
      }
      page++;
    }
    console.log(LOG, "Strava activities in day window", {
      dayStart: new Date(startMs).toISOString(),
      dayEnd: new Date(endMs).toISOString(),
      afterSec,
      beforeSec,
      perPage: STRAVA_PER_PAGE,
      pagesWithData,
      activitiesReturned: out.length,
    });
    return { list: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Strava request failed";
    console.warn(LOG, "Strava fetch failed", msg);
    return {
      list: [],
      error: msg,
    };
  }
}

/**
 * Full Strava activity history (paginated, no `after`/`before` — not limited to one calendar day).
 */
export async function fetchAllStravaActivitiesForBackfill(
  stravaFetchJsonImpl: StravaFetchJson,
): Promise<{ list: StravaActivitySummary[]; error?: string }> {
  const out: StravaActivitySummary[] = [];
  try {
    let page = 1;
    let pagesWithData = 0;
    while (page <= STRAVA_MAX_PAGES) {
      const list = await stravaFetchJsonImpl<StravaActivitySummary[]>(
        `/athlete/activities?per_page=${STRAVA_PER_PAGE}&page=${page}`,
      );
      if (list === null) {
        if (page === 1) {
          console.warn(
            LOG,
            "Strava full history: no token / 401 on first page",
          );
          return { list: [], error: "Strava not connected" };
        }
        console.warn(LOG, "Strava full history: null mid-pagination", { page });
        break;
      }
      if (list.length === 0) {
        break;
      }
      pagesWithData++;
      for (const a of list) {
        out.push(a);
      }
      if (list.length < STRAVA_PER_PAGE) {
        break;
      }
      page++;
    }
    console.log(LOG, "Strava full history load (backfill)", {
      totalActivities: out.length,
      pagesWithData,
      perPage: STRAVA_PER_PAGE,
    });
    return { list: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Strava request failed";
    console.warn(LOG, "Strava full history load failed", msg);
    return { list: [], error: msg };
  }
}

export async function candidatesForKindAndDay(
  kind: string,
  dayStartMs: number,
  dayEndMs: number,
  excludeKeys: Set<string>,
  stravaFetchJsonImpl: StravaFetchJson,
): Promise<PlanLinkCandidatesResult> {
  const useHevy = kind === "lift";
  if (useHevy) {
    const hevyBlock = await fetchHevyWorkoutsInRange(
      dayStartMs,
      dayEndMs,
      excludeKeys,
    );
    return {
      hevy: hevyBlock.list,
      strava: [],
      hevyError: hevyBlock.error,
      stravaError: undefined,
    };
  }
  const stravaBlock = await fetchStravaActivitiesInRange(
    dayStartMs,
    dayEndMs,
    excludeKeys,
    stravaFetchJsonImpl,
  );
  return {
    hevy: [],
    strava: stravaBlock.list,
    hevyError: undefined,
    stravaError: stravaBlock.error,
  };
}
