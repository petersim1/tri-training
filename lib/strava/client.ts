import { vendorActions } from "@/server-fcts";

export async function stravaFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const token = await vendorActions.getValidStravaAccessToken();
  if (!token) {
    return null;
  }
  const url = path.startsWith("http")
    ? path
    : `https://www.strava.com/api/v3${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
