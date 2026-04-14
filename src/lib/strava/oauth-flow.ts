import { createServerFn } from "@tanstack/react-start";
import type {
  StravaOAuthConnectUrls,
  StravaSettingsStrava,
} from "~/lib/strava/oauth-flow.shared";

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
  const { issueStravaOAuthConnectUrls } = await import(
    "~/lib/strava/oauth-flow.server"
  );
  return issueStravaOAuthConnectUrls();
});

/**
 * Sets OAuth state cookie (for callback CSRF) and returns Strava URLs.
 * Does not hit our own API — use these hrefs to navigate directly to Strava.
 */
export const getStravaSettingsStravaFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<StravaSettingsStrava> => {
  const { getStravaSettingsStravaPayload } = await import(
    "~/lib/strava/oauth-flow.server"
  );
  return getStravaSettingsStravaPayload();
});
