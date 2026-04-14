import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";

/** Single httpOnly cookie holding Strava OAuth tokens (no DB). */
export const STRAVA_TOKENS_COOKIE = "wt_strava";

const MAX_AGE_SEC = 60 * 60 * 24 * 400; // ~400d; Strava refresh is long-lived

export type StravaTokenPayload = {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds */
  expiresAt: number;
  athleteId: number | null;
};

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export function getStravaTokensFromCookies(): StravaTokenPayload | null {
  const raw = getCookie(STRAVA_TOKENS_COOKIE);
  if (!raw) {
    return null;
  }
  try {
    const p = JSON.parse(raw) as StravaTokenPayload;
    if (
      typeof p.accessToken !== "string" ||
      typeof p.refreshToken !== "string" ||
      typeof p.expiresAt !== "number"
    ) {
      return null;
    }
    return {
      accessToken: p.accessToken,
      refreshToken: p.refreshToken,
      expiresAt: p.expiresAt,
      athleteId: typeof p.athleteId === "number" ? p.athleteId : null,
    };
  } catch {
    return null;
  }
}

export function setStravaTokensCookie(payload: StravaTokenPayload): void {
  setCookie(STRAVA_TOKENS_COOKIE, JSON.stringify(payload), cookieOpts());
}

export function clearStravaTokensCookie(): void {
  const o = cookieOpts();
  deleteCookie(STRAVA_TOKENS_COOKIE, {
    httpOnly: o.httpOnly,
    secure: o.secure,
    sameSite: o.sameSite,
    path: o.path,
  });
}
