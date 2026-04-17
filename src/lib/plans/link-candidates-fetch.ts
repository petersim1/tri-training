import { and, eq } from "drizzle-orm";
import type { HevyWorkoutSummary } from "~/lib/activities/types";
import type { getDb } from "~/lib/db";
import {
  type CompletedWorkoutRow,
  completedWorkouts,
  plannedWorkouts,
} from "~/lib/db/schema";
import { hevyFetch } from "~/lib/hevy/client";
import { stravaSportMatchesPlanKind } from "~/lib/plans/strava-kind-match";
import type { StravaActivitySummary } from "~/lib/strava/types";

/** Same shape as `stravaFetchJson` from `~/lib/strava/tokens` (cookies in app, env in tests). */
export type StravaFetchJson = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T | null>;

const LOG = "[backfill-links]";

/** Hevy `GET /v1/workouts`: `pageSize` max 10 per [API docs](https://api.hevyapp.com/docs/#/Workouts/get_v1_workouts). */
const HEVY_PAGE_SIZE = 10;
/** Hevy `GET /v1/body_measurements` — same pagination shape as workouts. */
const HEVY_BODY_MEASUREMENTS_PAGE_SIZE = 10;
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

function hevySummaryFromCompletedRow(
  row: CompletedWorkoutRow,
): HevyWorkoutSummary {
  const w = row.data as HevyWorkoutSummary;
  const id = w.id?.trim() || row.vendorId.trim();
  return { ...w, id };
}

function stravaSummaryFromCompletedRow(
  row: CompletedWorkoutRow,
): StravaActivitySummary | null {
  const a = row.data as StravaActivitySummary;
  if (a == null || typeof a !== "object") {
    return null;
  }
  const id = a.id ?? Number(row.vendorId);
  if (!Number.isFinite(id)) {
    return null;
  }
  return { ...a, id };
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

/** `GET /v1/body_measurements` row (only `weight_kg` used for backfill). */
export type HevyBodyMeasurementRow = {
  date: string;
  weight_kg?: number | null;
};

type HevyBodyMeasurementsPageJson = {
  body_measurements?: HevyBodyMeasurementRow[];
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
    let data: HevyWorkoutsPageJson;
    try {
      data = await hevyFetch<HevyWorkoutsPageJson>(
        `/workouts?page=${page}&pageSize=${HEVY_PAGE_SIZE}`,
      );
    } catch {
      break;
    }
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

async function forEachHevyBodyMeasurementsPage(
  onPage: (
    batch: HevyBodyMeasurementRow[],
    meta: { page: number; declaredPages: number },
  ) => void,
): Promise<{ pagesFetched: number }> {
  let page = 1;
  let pagesFetched = 0;
  while (page <= HEVY_MAX_PAGES) {
    let data: HevyBodyMeasurementsPageJson;
    try {
      data = await hevyFetch<HevyBodyMeasurementsPageJson>(
        `/body_measurements?page=${page}&pageSize=${HEVY_BODY_MEASUREMENTS_PAGE_SIZE}`,
      );
    } catch {
      break;
    }
    const batch = data.body_measurements ?? [];
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
    if (batch.length < HEVY_BODY_MEASUREMENTS_PAGE_SIZE) {
      break;
    }
    page++;
  }
  return { pagesFetched };
}

/**
 * Full Hevy body-measurement history (all pages). Used to backfill `weight_entries` from `weight_kg`.
 */
export async function fetchAllHevyBodyMeasurementsForBackfill(): Promise<{
  measurements: HevyBodyMeasurementRow[];
  error?: string;
}> {
  const all: HevyBodyMeasurementRow[] = [];
  try {
    const { pagesFetched } = await forEachHevyBodyMeasurementsPage((batch) => {
      for (const row of batch) {
        all.push(row);
      }
    });
    console.log(LOG, "Hevy body_measurements load (backfill)", {
      totalRows: all.length,
      pagesFetched,
      pageSize: HEVY_BODY_MEASUREMENTS_PAGE_SIZE,
    });
    return { measurements: all };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Hevy body_measurements failed";
    console.warn(LOG, "Hevy body_measurements load failed", msg);
    return { measurements: [], error: msg };
  }
}

/**
 * Plan-link candidates for a calendar window: `completed_workouts` rows (Hevy),
 * excluding sessions already linked to a plan. Populated by webhooks / backfill — not the Hevy API.
 */
export async function fetchHevyWorkoutsInRange(
  db: ReturnType<typeof getDb>,
  startMs: number,
  endMs: number,
  excludeKeys: Set<string>,
): Promise<{ list: HevyWorkoutSummary[]; error?: string }> {
  const out: HevyWorkoutSummary[] = [];
  try {
    const rows = await db
      .select()
      .from(completedWorkouts)
      .where(
        and(
          eq(completedWorkouts.vendor, "hevy"),
          eq(completedWorkouts.isResolved, false),
        ),
      )
      .all();
    for (const row of rows) {
      const vid = row.vendorId.trim();
      if (!vid || excludeKeys.has(`hevy:${vid}`)) {
        continue;
      }
      const summary = hevySummaryFromCompletedRow(row);
      if (!inTimeRange(summary.start_time, startMs, endMs)) {
        continue;
      }
      out.push(summary);
    }
    out.sort((a, b) => {
      const ta = new Date(a.start_time ?? "").getTime();
      const tb = new Date(b.start_time ?? "").getTime();
      return ta - tb;
    });
    console.log(LOG, "Hevy workouts in day window (DB)", {
      dayStart: new Date(startMs).toISOString(),
      dayEnd: new Date(endMs).toISOString(),
      matchesInRange: out.length,
    });
    return { list: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hevy DB read failed";
    console.warn(LOG, "Hevy candidates from DB failed", msg);
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

/**
 * Plan-link candidates for a calendar window: `completed_workouts` rows (Strava),
 * excluding sessions already linked to a plan. Populated by webhooks / backfill — not the Strava API.
 */
export async function fetchStravaActivitiesInRange(
  db: ReturnType<typeof getDb>,
  startMs: number,
  endMs: number,
  excludeKeys: Set<string>,
  /** When set (run / bike / swim), only sessions whose stored `activity_kind` match that plan kind. */
  cardioPlanKind?: "run" | "bike" | "swim",
): Promise<{ list: StravaActivitySummary[]; error?: string }> {
  const out: StravaActivitySummary[] = [];
  try {
    const rows = await db
      .select()
      .from(completedWorkouts)
      .where(
        and(
          eq(completedWorkouts.vendor, "strava"),
          eq(completedWorkouts.isResolved, false),
        ),
      )
      .all();
    for (const row of rows) {
      const summary = stravaSummaryFromCompletedRow(row);
      if (!summary) {
        continue;
      }
      if (
        cardioPlanKind &&
        !stravaSportMatchesPlanKind(cardioPlanKind, row.activityKind)
      ) {
        continue;
      }
      const key = `strava:${String(summary.id)}`;
      if (excludeKeys.has(key)) {
        continue;
      }
      if (!inTimeRange(summary.start_date, startMs, endMs)) {
        continue;
      }
      out.push(summary);
    }
    out.sort((a, b) => {
      const ta = new Date(a.start_date).getTime();
      const tb = new Date(b.start_date).getTime();
      return ta - tb;
    });
    console.log(LOG, "Strava activities in day window (DB)", {
      dayStart: new Date(startMs).toISOString(),
      dayEnd: new Date(endMs).toISOString(),
      activitiesReturned: out.length,
    });
    return { list: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Strava DB read failed";
    console.warn(LOG, "Strava candidates from DB failed", msg);
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

/**
 * Candidates for linking a plan to a session: reads `completed_workouts` only (after backfill / webhooks).
 */
export async function candidatesForKindAndDay(
  db: ReturnType<typeof getDb>,
  kind: string,
  dayStartMs: number,
  dayEndMs: number,
  excludeKeys: Set<string>,
): Promise<PlanLinkCandidatesResult> {
  const useHevy = kind === "lift";
  if (useHevy) {
    const hevyBlock = await fetchHevyWorkoutsInRange(
      db,
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
    db,
    dayStartMs,
    dayEndMs,
    excludeKeys,
    kind === "run" || kind === "bike" || kind === "swim" ? kind : undefined,
  );
  return {
    hevy: [],
    strava: stravaBlock.list,
    hevyError: undefined,
    stravaError: stravaBlock.error,
  };
}
