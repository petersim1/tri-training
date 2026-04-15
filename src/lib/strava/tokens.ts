import {
  getStravaTokensFromCookies,
  setStravaTokensCookie,
} from "~/lib/strava/cookie-store";

const TOKEN_URL = "https://www.strava.com/oauth/token";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

/** Refresh access token; used by cookie-based sessions and server-stored tokens (webhooks). */
export async function exchangeStravaRefreshToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token refresh failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/** Returns a valid access token, refreshing and updating the cookie when needed. */
export async function getValidStravaAccessToken(): Promise<string | null> {
  const row = getStravaTokensFromCookies();
  if (!row) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (row.expiresAt > now + 120) {
    return row.accessToken;
  }
  const next = await exchangeStravaRefreshToken(row.refreshToken);
  setStravaTokensCookie({
    accessToken: next.access_token,
    refreshToken: next.refresh_token,
    expiresAt: next.expires_at,
    athleteId: row.athleteId,
  });
  return next.access_token;
}

export async function stravaFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const token = await getValidStravaAccessToken();
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
