import { createServerFn } from "@tanstack/react-start";
import {
  buildStravaOAuthQueryString,
  STRAVA_OAUTH_STATE_COOKIE,
  type StravaOAuthConnectUrls,
  type StravaSettingsStrava,
} from "~/lib/strava/oauth-flow.shared";
import { getStravaTokensFromCookies } from "~/lib/strava/cookie-store";
import { stravaRedirectUri } from "~/lib/strava/oauth";

export type {
  StravaOAuthConnectUrls,
  StravaSettingsStrava,
} from "~/lib/strava/oauth-flow.shared";
export {
  buildStravaOAuthQueryString,
  STRAVA_OAUTH_STATE_COOKIE,
} from "~/lib/strava/oauth-flow.shared";

/** Strava OAuth entry for the login page (no session required). */
export const getStravaLoginOAuthUrlsFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<StravaOAuthConnectUrls> => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return { kind: "misconfigured" };
  }
  const { setCookie } = await import("@tanstack/react-start/server");
  const redirectUri = stravaRedirectUri();
  const { randomBytes } = await import("node:crypto");

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
});

/** Settings: session required; sets OAuth state cookie when reconnecting. */
export const getStravaSettingsStravaFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<StravaSettingsStrava> => {
  const existing = getStravaTokensFromCookies();
  if (existing) {
    return { kind: "connected", athleteId: existing.athleteId };
  }
  const start = await getStravaLoginOAuthUrlsFn();
  if (start.kind === "misconfigured") {
    return { kind: "misconfigured" };
  }
  return {
    kind: "connect",
    mobileAuthorizeUrl: start.mobileAuthorizeUrl,
    deepLinkUrl: start.deepLinkUrl,
  };
});
