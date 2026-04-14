import { ALLOWED_STRAVA_ATHLETE_ID } from "~/lib/strava/allowed-athlete";
import { getStravaTokensFromCookies } from "~/lib/strava/cookie-store";

/** Sole auth: Strava OAuth. “Logged in” = httpOnly Strava token cookie set by /api/strava/callback with allowlisted athleteId. */
export async function getSessionOk(): Promise<boolean> {
  const row = getStravaTokensFromCookies();
  if (!row) {
    return false;
  }
  return row.athleteId === ALLOWED_STRAVA_ATHLETE_ID;
}
