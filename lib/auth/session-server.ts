import { getCookie } from "@tanstack/react-start/server";
import type { StravaTokenPayload } from "@/types/requests/cookies";
import { STRAVA_TOKENS_COOKIE } from "../cookies";
import { ALLOWED_STRAVA_ATHLETE_ID } from "../strava/allowed-athlete";

/** Sole auth: Strava OAuth. “Logged in” = httpOnly Strava token cookie set by /api/strava/callback with allowlisted athleteId. */
export async function getSessionOk(): Promise<boolean> {
  const raw = getCookie(STRAVA_TOKENS_COOKIE);
  if (!raw) {
    return false;
  }
  try {
    const p = JSON.parse(raw) as StravaTokenPayload;
    if (
      typeof p.accessToken !== "string" ||
      typeof p.refreshToken !== "string" ||
      typeof p.expiresAt !== "number"
    ) {
      return false;
    }
    return p.athleteId === ALLOWED_STRAVA_ATHLETE_ID;
  } catch {
    return false;
  }
}
