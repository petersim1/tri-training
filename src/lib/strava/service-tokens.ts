import { eq } from "drizzle-orm";
import { getDb } from "~/lib/db";
import { serviceStravaTokens } from "~/lib/db/schema";
import { exchangeStravaRefreshToken } from "~/lib/strava/tokens";

const SERVICE_ROW_ID = 1 as const;

export async function persistServiceStravaTokens(data: {
  refreshToken: string;
  accessToken: string;
  /** Unix seconds */
  expiresAt: number;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(serviceStravaTokens)
    .values({
      id: SERVICE_ROW_ID,
      refreshToken: data.refreshToken,
      accessToken: data.accessToken,
      expiresAt: data.expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: serviceStravaTokens.id,
      set: {
        refreshToken: data.refreshToken,
        accessToken: data.accessToken,
        expiresAt: data.expiresAt,
        updatedAt: now,
      },
    });
}

export async function getValidAccessTokenForWebhooks(): Promise<string | null> {
  const db = getDb();
  const row = await db
    .select()
    .from(serviceStravaTokens)
    .where(eq(serviceStravaTokens.id, SERVICE_ROW_ID))
    .get();
  if (!row) {
    return null;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (row.expiresAt > nowSec + 120) {
    return row.accessToken;
  }
  const next = await exchangeStravaRefreshToken(row.refreshToken);
  const updated = new Date();
  await db
    .update(serviceStravaTokens)
    .set({
      accessToken: next.access_token,
      refreshToken: next.refresh_token,
      expiresAt: next.expires_at,
      updatedAt: updated,
    })
    .where(eq(serviceStravaTokens.id, SERVICE_ROW_ID))
    .run();
  return next.access_token;
}

export async function stravaFetchJsonForWebhooks<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const token = await getValidAccessTokenForWebhooks();
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
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
