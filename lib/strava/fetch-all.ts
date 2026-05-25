import { stravaFetchJson } from "./client";
import type { StravaActivitySummary } from "./types";

export async function fetchAllStravaWorkouts(): Promise<
  StravaActivitySummary[]
> {
  const out: StravaActivitySummary[] = [];
  try {
    let page = 1;
    while (page <= 500) {
      const list = await stravaFetchJson<StravaActivitySummary[]>(
        `/athlete/activities?per_page=${200}&page=${page}`,
      );
      if (list === null) {
        if (page === 1) {
          return [];
        }
        break;
      }
      if (list.length === 0) {
        break;
      }
      for (const a of list) {
        out.push(a);
      }
      if (list.length < 200) {
        break;
      }
      page++;
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Strava request failed";
    console.warn(msg);
    return [];
  }
}
