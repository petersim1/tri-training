import { getRequest } from "@tanstack/react-start/server";

/**
 * OAuth `redirect_uri` for Strava — no env. Uses the active request’s origin
 * (so dev port, prod host, etc. match what the browser used).
 * Register the same URL in Strava: `https://your-host/api/strava/callback`.
 */
export function stravaRedirectUri(): string {
  const req = getRequest();
  const origin = new URL(req.url).origin;
  return `${origin}/api/strava/callback"`;
}
