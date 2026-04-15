import type { HevyWorkoutSummary } from "~/lib/activities/types";

const BASE = "https://api.hevyapp.com/v1";

function headers(): HeadersInit {
  const key = process.env.HEVY_API_KEY;
  if (!key) {
    throw new Error("HEVY_API_KEY must be set");
  }
  return {
    "api-key": key,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function hevyFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...headers(),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hevy API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Single workout `GET /v1/workouts/{id}`; `null` if not found. */
export async function hevyFetchWorkoutById(
  workoutId: string,
): Promise<HevyWorkoutSummary | null> {
  const id = workoutId.trim();
  if (!id) {
    return null;
  }
  const url = `${BASE}/workouts/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: {
      ...headers(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hevy API ${res.status}: ${text}`);
  }
  return res.json() as Promise<HevyWorkoutSummary>;
}
