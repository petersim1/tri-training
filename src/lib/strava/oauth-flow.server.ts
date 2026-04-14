import { randomBytes } from "node:crypto";
import { setCookie } from "@tanstack/react-start/server";
import { getSessionOk } from "~/lib/auth/session-server";
import { getStravaTokensFromCookies } from "~/lib/strava/cookie-store";
import { stravaRedirectUri } from "~/lib/strava/oauth";
import {
  buildStravaOAuthQueryString,
  STRAVA_OAUTH_STATE_COOKIE,
  type StravaOAuthConnectUrls,
  type StravaSettingsStrava,
} from "~/lib/strava/oauth-flow.shared";

/**
 * Sets OAuth state cookie (CSRF) and returns Strava authorize URLs.
 * Call only from server handlers (login or settings).
 */
export function issueStravaOAuthConnectUrls(): StravaOAuthConnectUrls {
  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return { kind: "misconfigured" };
  }
  const redirectUri = stravaRedirectUri();
  const state = randomBytes(24).toString("hex");
  setCookie(STRAVA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  const q = buildStravaOAuthQueryString({ clientId, redirectUri, state });
  return {
    kind: "connect",
    mobileAuthorizeUrl: `https://www.strava.com/oauth/mobile/authorize?${q}`,
    deepLinkUrl: `strava://oauth/mobile/authorize?${q}`,
  };
}

export async function getStravaSettingsStravaPayload(): Promise<StravaSettingsStrava> {
  if (!(await getSessionOk())) {
    throw new Error("Unauthorized");
  }
  const existing = getStravaTokensFromCookies();
  if (existing) {
    return { kind: "connected", athleteId: existing.athleteId };
  }
  const start = issueStravaOAuthConnectUrls();
  if (start.kind === "misconfigured") {
    return { kind: "misconfigured" };
  }
  return {
    kind: "connect",
    mobileAuthorizeUrl: start.mobileAuthorizeUrl,
    deepLinkUrl: start.deepLinkUrl,
  };
}
