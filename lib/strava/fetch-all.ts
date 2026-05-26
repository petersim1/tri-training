import { stravaFetchJson } from "./client";
import type { StravaActivity } from "./types";

export async function fetchAllStravaWorkouts(): Promise<StravaActivity[]> {
  const out: StravaActivity[] = [];
  try {
    let page = 1;
    while (page <= 500) {
      const list = await stravaFetchJson<StravaActivity[]>(
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
