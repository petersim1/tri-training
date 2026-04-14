export const STRAVA_OAUTH_STATE_COOKIE = "strava_oauth_state";

export function buildStravaOAuthQueryString(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  return new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    approval_prompt: "force",
    scope: "activity:read_all",
    state: input.state,
  }).toString();
}

export type StravaOAuthConnectUrls =
  | { kind: "misconfigured" }
  | {
      kind: "connect";
      /** `https://www.strava.com/oauth/mobile/authorize?...` — `redirect_uri` is in the query. */
      mobileAuthorizeUrl: string;
      /** `strava://oauth/mobile/authorize?...` — same query string as mobile. */
      deepLinkUrl: string;
    };

export type StravaSettingsStrava =
  | { kind: "connected"; athleteId: number | null }
  | { kind: "misconfigured" }
  | {
      kind: "connect";
      mobileAuthorizeUrl: string;
      deepLinkUrl: string;
    };
