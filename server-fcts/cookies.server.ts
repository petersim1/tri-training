import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import type { PlanKind } from "@/lib/constants/activities";
import {
  DEFAULT_CALENDAR_SCOPE,
  DEFAULT_SESSION_CHART_SETTINGS,
  type SessionChartMetric,
  type SessionChartRange,
  type SessionChartSettings,
} from "@/lib/constants/visuals";
import {
  CALENDAR_SCOPE_COOKIE,
  SESSION_CHART_COOKIE,
  STRAVA_TOKENS_COOKIE,
} from "@/lib/cookies";
import type { CalendarScope } from "@/types/requests/activities";
import type { StravaTokenPayload } from "@/types/requests/cookies";

export const getCalendarScope = createServerFn({ method: "POST" }).handler(
  async (): Promise<CalendarScope> => {
    const raw = getCookie(CALENDAR_SCOPE_COOKIE);
    if (raw === "week" || raw === "month") {
      return raw;
    }
    return DEFAULT_CALENDAR_SCOPE;
  },
);

export const getVizSettings = createServerFn({ method: "POST" }).handler(
  async (): Promise<SessionChartSettings> => {
    // allow for injection as well.
    const raw = getCookie(SESSION_CHART_COOKIE);
    if (!raw || raw === "") {
      return { ...DEFAULT_SESSION_CHART_SETTINGS };
    }
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      const kind = o.kind as PlanKind;
      const range = o.range as SessionChartRange;
      const metric = o.metric as SessionChartMetric;
      const cumulative = o.cumulative as boolean;
      return {
        kind,
        range,
        metric,
        cumulative,
      };
    } catch {
      return { ...DEFAULT_SESSION_CHART_SETTINGS };
    }
  },
);

/** Persist month vs week calendar (`/` home). Read via `loadHomePageDataFn`. */
export const setCalendarScope = createServerFn({ method: "POST" })
  .inputValidator((d: { scope: CalendarScope }) => d)
  .handler(async ({ data }) => {
    if (data.scope !== "month" && data.scope !== "week") {
      throw new Error("Invalid calendar scope");
    }
    setCookie(CALENDAR_SCOPE_COOKIE, data.scope, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
    return { ok: true as const };
  });

/** Session trends chart: range, metric, cumulative — read via `loadHomePageDataFn`. */
export const setSessionChartSettings = createServerFn({ method: "POST" })
  .inputValidator((d: SessionChartSettings) => d)
  .handler(async ({ data }) => {
    setCookie(SESSION_CHART_COOKIE, JSON.stringify(data), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
    return { ok: true as const };
  });

export const setStravaTokensCookie = createServerFn({ method: "POST" })
  .inputValidator((d: StravaTokenPayload) => d)
  .handler(({ data }) => {
    setCookie(STRAVA_TOKENS_COOKIE, JSON.stringify(data), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  });

export const getStravaTokensFromCookies = createServerFn({
  method: "GET",
}).handler((): StravaTokenPayload | null => {
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
});
