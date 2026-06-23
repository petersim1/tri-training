import { type Exception, trace } from "@opentelemetry/api";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { STRAVA_OAUTH_STATE_COOKIE } from "@/lib/cookies";
import { getDb } from "@/lib/db/index.server";
import { serviceStravaTokens } from "@/lib/db/schema.server";
import { hevyFetch } from "@/lib/hevy/client";
import { fetchAllFolders, fetchAllRoutines } from "@/lib/hevy/fetch-all";
import { groupRoutinesByFolder } from "@/lib/hevy/group-routines";
import type { GroupedRoutines, HevyRoutineSummary } from "@/lib/hevy/types";
import type { StartStravaOAuthResult } from "@/types/responses/vendors";
import { cookieActions } from "./cookies";

const tracer = trace.getTracer("bevor.vendors");

const TOKEN_URL = "https://www.strava.com/oauth/token";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

const SERVICE_ROW_ID = 1 as const;

/** Refresh access token; used by cookie-based sessions and server-stored tokens (webhooks). */
async function exchangeStravaRefreshToken(
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
const getValidStravaAccessToken = createServerFn({ method: "POST" }).handler(
  async (): Promise<string | null> => {
    return tracer.startActiveSpan("getValidStravaAccessToken", async (span) => {
      try {
        const row = await cookieActions.getStravaTokensFromCookies();
        if (!row) {
          return null;
        }
        const now = Math.floor(Date.now() / 1000);
        if (row.expiresAt > now + 120) {
          return row.accessToken;
        }
        const next = await exchangeStravaRefreshToken(row.refreshToken);
        await cookieActions.setStravaTokensCookie({
          data: {
            accessToken: next.access_token,
            refreshToken: next.refresh_token,
            expiresAt: next.expires_at,
            athleteId: row.athleteId,
          },
        });
        return next.access_token;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  },
);

const startStravaOAuth = createServerFn({ method: "POST" }).handler(
  async (): Promise<StartStravaOAuthResult> => {
    return tracer.startActiveSpan(
      "startStravaOAuth",
      async (span): Promise<StartStravaOAuthResult> => {
        try {
          const clientId = process.env.STRAVA_CLIENT_ID?.trim();
          if (!clientId) {
            return { ok: false, misconfigured: true };
          }
          const req = getRequest();
          const origin = new URL(req.url).origin;
          const redirectUri = `${origin}/api/strava/callback`;

          const { randomBytes } = await import("node:crypto");
          const state = randomBytes(24).toString("hex");
          setCookie(STRAVA_OAUTH_STATE_COOKIE, state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 600,
            path: "/",
          });
          const q = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            approval_prompt: "force",
            scope: "activity:read_all",
            state: state,
          }).toString();

          return {
            ok: true,
            authorizeUrl: `https://www.strava.com/oauth/mobile/authorize?${q}`,
          };
        } catch (err) {
          span.recordException(err as Exception);
          throw err;
        } finally {
          span.end();
        }
      },
    );
  },
);

/** Used by Home add-plan flow to preview exercises when a Hevy routine is selected. */
const getRoutine = createServerFn({ method: "GET" })
  .inputValidator((d: { routineId: string }) => d)
  .handler(async ({ data }) => {
    return tracer.startActiveSpan("getRoutine", async (span) => {
      try {
        const res = await hevyFetch<{ routine?: HevyRoutineSummary }>(
          `/routines/${encodeURIComponent(data.routineId)}`,
        );
        return res.routine ?? null;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const listRoutines = createServerFn({ method: "GET" }).handler(
  async (): Promise<GroupedRoutines> => {
    return tracer.startActiveSpan("listRoutines", async (span) => {
      try {
        const [routines, folders] = await Promise.all([
          fetchAllRoutines(),
          fetchAllFolders(),
        ]);

        return groupRoutinesByFolder(folders, routines);
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  },
);

const persistServiceStravaTokens = createServerFn({ method: "POST" })
  .inputValidator((data: TokenResponse) => data)
  .handler(async ({ data }) => {
    return tracer.startActiveSpan(
      "persistServiceStravaTokens",
      async (span) => {
        try {
          const db = await getDb();
          const now = new Date();
          await db
            .insert(serviceStravaTokens)
            .values({
              id: SERVICE_ROW_ID,
              refreshToken: data.refresh_token,
              accessToken: data.access_token,
              expiresAt: data.expires_at,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: serviceStravaTokens.id,
              set: {
                refreshToken: data.refresh_token,
                accessToken: data.access_token,
                expiresAt: data.expires_at,
                updatedAt: now,
              },
            });
        } catch (err) {
          span.recordException(err as Exception);
          throw err;
        } finally {
          span.end();
        }
      },
    );
  });

const getValidAccessTokenForWebhooks = createServerFn({
  method: "GET",
}).handler(async () => {
  return tracer.startActiveSpan(
    "getValidAccessTokenForWebhooks",
    async (span) => {
      try {
        const db = await getDb();
        const row = await db
          .select()
          .from(serviceStravaTokens)
          .where(eq(serviceStravaTokens.id, SERVICE_ROW_ID))
          .get();
        if (!row) {
          return null;
        }
        const nowSec = Math.floor(Date.now() / 1000);
        if (row.expiresAt > nowSec + 120) {
          return row.accessToken;
        }
        const next = await exchangeStravaRefreshToken(row.refreshToken);
        const updated = new Date();
        await db
          .update(serviceStravaTokens)
          .set({
            accessToken: next.access_token,
            refreshToken: next.refresh_token,
            expiresAt: next.expires_at,
            updatedAt: updated,
          })
          .where(eq(serviceStravaTokens.id, SERVICE_ROW_ID))
          .run();
        return next.access_token;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    },
  );
});

export const vendorActions = {
  getValidStravaAccessToken,
  startStravaOAuth,
  getRoutine,
  listRoutines,
  persistServiceStravaTokens,
  getValidAccessTokenForWebhooks,
};
