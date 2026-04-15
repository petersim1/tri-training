import { createFileRoute } from "@tanstack/react-router";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { ALLOWED_STRAVA_ATHLETE_ID } from "~/lib/strava/allowed-athlete";
import {
  clearStravaTokensCookie,
  setStravaTokensCookie,
} from "~/lib/strava/cookie-store";
import { stravaRedirectUri } from "~/lib/strava/oauth";
import { STRAVA_OAUTH_STATE_COOKIE } from "~/lib/strava/oauth-flow";
import { persistServiceStravaTokens } from "~/lib/strava/service-tokens";

const TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_ATHLETE_URL = "https://www.strava.com/api/v3/athlete";

const LOG = "[strava/callback]";

function log(
  step: string,
  detail?: Record<string, string | boolean | number | null | undefined>,
) {
  if (detail && Object.keys(detail).length > 0) {
    console.info(LOG, step, detail);
  } else {
    console.info(LOG, step);
  }
}

function logError(step: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(LOG, step, { message: msg, stack });
}

function peek(s: string | undefined, n = 8): string {
  if (!s) {
    return "(empty)";
  }
  if (s.length <= n) {
    return s;
  }
  return `${s.slice(0, n)}…`;
}

/** Failed OAuth / not allowed — no session or Strava cookies set. */
function redirectLogin(
  origin: string,
  stravaQueryValue: string,
  result: string,
): Response {
  const location = new URL(
    `/login?strava=${encodeURIComponent(stravaQueryValue)}`,
    origin,
  ).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "X-Strava-Callback-Result": result,
    },
  });
}

/** Allowed athlete: session + Strava cookies already set. */
function redirectOk(origin: string): Response {
  const location = new URL(`/`, origin).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "X-Strava-Callback-Result": "ok",
    },
  });
}

export const Route = createFileRoute("/api/strava/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;

        try {
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const err = url.searchParams.get("error");
          const scope = url.searchParams.get("scope");

          log("request", {
            path: url.pathname,
            hasCode: Boolean(code),
            hasState: Boolean(state),
            scope: scope ?? "(none)",
            errorParam: err ?? "(none)",
          });

          if (err) {
            log("branch", { result: "strava_error_param", error: err });
            return redirectLogin(origin, err, "error_strava");
          }

          if (!code || !state) {
            log("branch", { result: "missing_code_or_state" });
            return redirectLogin(origin, "missing_code", "missing_code");
          }

          const expected = getCookie(STRAVA_OAUTH_STATE_COOKIE);
          const stateOk = Boolean(expected && expected === state);
          log("state_check", {
            cookiePresent: Boolean(expected),
            cookiePeek: peek(expected),
            queryStatePeek: peek(state),
            match: stateOk,
          });

          if (!expected || expected !== state) {
            log("branch", { result: "bad_state" });
            return redirectLogin(origin, "bad_state", "bad_state");
          }

          const clientId = process.env.STRAVA_CLIENT_ID;
          const clientSecret = process.env.STRAVA_CLIENT_SECRET;
          if (!clientId || !clientSecret) {
            log("branch", { result: "missing_client_config" });
            return redirectLogin(origin, "config", "config");
          }

          const redirectUri = stravaRedirectUri();
          log("token_exchange", {
            redirectUri,
            tokenUrl: TOKEN_URL,
          });

          const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          });

          let tokenRes: Response;
          try {
            tokenRes = await fetch(TOKEN_URL, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body,
            });
          } catch (e) {
            logError("token fetch threw", e);
            const msg = e instanceof Error ? e.message : "fetch_failed";
            return redirectLogin(origin, `network:${msg}`, "network_error");
          }

          log("token_response", {
            status: tokenRes.status,
            ok: tokenRes.ok,
          });

          if (!tokenRes.ok) {
            const text = await tokenRes.text();
            log("token_error_body", {
              bodyPreview: text.slice(0, 500),
            });
            return redirectLogin(
              origin,
              `token_${tokenRes.status}: ${text.slice(0, 120)}`,
              `token_${tokenRes.status}`,
            );
          }

          const data = (await tokenRes.json()) as {
            access_token: string;
            refresh_token: string;
            expires_at: number;
            athlete?: { id?: number };
          };

          let athleteRes: Response;
          try {
            athleteRes = await fetch(STRAVA_ATHLETE_URL, {
              headers: { Authorization: `Bearer ${data.access_token}` },
            });
          } catch (e) {
            logError("GET /athlete fetch threw", e);
            return redirectLogin(
              origin,
              "athlete_fetch_failed",
              "network_error",
            );
          }

          if (!athleteRes.ok) {
            const text = await athleteRes.text();
            log("athlete_error_body", {
              status: athleteRes.status,
              bodyPreview: text.slice(0, 300),
            });
            return redirectLogin(
              origin,
              `athlete_${athleteRes.status}`,
              "athlete_error",
            );
          }

          const athlete = (await athleteRes.json()) as { id?: number };
          if (athlete.id !== ALLOWED_STRAVA_ATHLETE_ID) {
            log("branch", {
              result: "athlete_not_allowed",
              id: athlete.id ?? null,
              allowed: ALLOWED_STRAVA_ATHLETE_ID,
            });
            deleteCookie(STRAVA_OAUTH_STATE_COOKIE, { path: "/" });
            clearStravaTokensCookie();
            return redirectLogin(origin, "forbidden", "forbidden");
          }

          try {
            setStravaTokensCookie({
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAt: data.expires_at,
              athleteId: athlete.id ?? null,
            });
            try {
              await persistServiceStravaTokens({
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: data.expires_at,
              });
            } catch (persistErr) {
              logError("persist service Strava tokens failed", persistErr);
            }
          } catch (e) {
            logError("set cookies failed", e);
            return redirectLogin(
              origin,
              `cookie:${e instanceof Error ? e.message : "set_failed"}`,
              "cookie_error",
            );
          }

          deleteCookie(STRAVA_OAUTH_STATE_COOKIE, { path: "/" });
          log("branch", {
            result: "ok",
            athleteId: athlete.id ?? null,
          });
          return redirectOk(origin);
        } catch (e) {
          logError("unhandled", e);
          return redirectLogin(
            origin,
            `exception:${e instanceof Error ? e.message : String(e)}`,
            "exception",
          );
        }
      },
    },
  },
});
