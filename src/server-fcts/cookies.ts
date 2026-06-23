import { type Exception, trace } from "@opentelemetry/api";
import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import {
  DEFAULT_CALENDAR_SCOPE,
  DEFAULT_SESSION_CHART_SETTINGS,
  type SessionChartSettings,
} from "@/lib/constants/visuals";
import {
  CALENDAR_SCOPE_COOKIE,
  SESSION_CHART_COOKIE,
  STRAVA_TOKENS_COOKIE,
  USER_TIMEZONE_COOKIE,
} from "@/lib/cookies";
import { isValidIanaTimeZone } from "@/lib/utils/dates";
import type { CalendarScope } from "@/types/requests/activities";
import type { StravaTokenPayload } from "@/types/requests/cookies";
import { timezoneSchema } from "@/types/requests/shared";

const tracer = trace.getTracer("bevor.cookies");

const getTimezone = createServerFn({ method: "GET" }).handler(async () => {
  return tracer.startActiveSpan("getTimezone", async (span) => {
    try {
      const raw = getCookie(USER_TIMEZONE_COOKIE);
      if (!raw) {
        return "UTC";
      }
      if (!isValidIanaTimeZone(raw)) {
        deleteCookie(USER_TIMEZONE_COOKIE);
        return "UTC";
      }
      return raw;
    } catch (err) {
      span.recordException(err as Exception);
      throw err;
    } finally {
      span.end();
    }
  });
});

const setTimezone = createServerFn({ method: "POST" })
  .inputValidator(timezoneSchema)
  .handler(async ({ data }) => {
    return tracer.startActiveSpan("setTimezone", async (span) => {
      try {
        if (!isValidIanaTimeZone(data.timezone)) {
          return;
        }
        setCookie(USER_TIMEZONE_COOKIE, data.timezone);
        return;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const getCalendarScope = createServerFn({ method: "POST" }).handler(
  async (): Promise<CalendarScope> => {
    return tracer.startActiveSpan("getCalendarScope", async (span) => {
      try {
        const raw = getCookie(CALENDAR_SCOPE_COOKIE);
        if (raw === "week" || raw === "month") {
          return raw;
        }
        return DEFAULT_CALENDAR_SCOPE;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  },
);

const getVizSettings = createServerFn({ method: "POST" }).handler(
  async (): Promise<SessionChartSettings> => {
    return tracer.startActiveSpan("getVizSettings", async (span) => {
      try {
        // allow for injection as well.
        const raw = getCookie(SESSION_CHART_COOKIE);
        if (!raw || raw === "") {
          return { ...DEFAULT_SESSION_CHART_SETTINGS };
        }
        try {
          const o = JSON.parse(raw) as Record<string, unknown>;
          return {
            ...DEFAULT_SESSION_CHART_SETTINGS,
            ...Object.fromEntries(
              Object.entries(o).filter(([, v]) => v !== undefined),
            ),
          };
        } catch {
          return { ...DEFAULT_SESSION_CHART_SETTINGS };
        }
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  },
);

/** Persist month vs week calendar (`/` home). Read via `loadHomePageDataFn`. */
const setCalendarScope = createServerFn({ method: "POST" })
  .inputValidator((d: { scope: CalendarScope }) => d)
  .handler(async ({ data }) => {
    return tracer.startActiveSpan("setCalendarScope", async (span) => {
      try {
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
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

/** Session trends chart: range, metric, cumulative — read via `loadHomePageDataFn`. */
const setSessionChartSettings = createServerFn({ method: "POST" })
  .inputValidator((d: SessionChartSettings) => d)
  .handler(async ({ data }) => {
    return tracer.startActiveSpan("setSessionChartSettings", async (span) => {
      try {
        setCookie(SESSION_CHART_COOKIE, JSON.stringify(data), {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
        });
        return { ok: true as const };
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const setStravaTokensCookie = createServerFn({ method: "POST" })
  .inputValidator((d: StravaTokenPayload) => d)
  .handler(({ data }) => {
    return tracer.startActiveSpan("setStravaTokensCookie", (span) => {
      try {
        setCookie(STRAVA_TOKENS_COOKIE, JSON.stringify(data), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const,
          path: "/",
          maxAge: 60 * 60 * 24 * 400,
        });
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const getStravaTokensFromCookies = createServerFn({
  method: "GET",
}).handler((): StravaTokenPayload | null => {
  return tracer.startActiveSpan("getStravaTokensFromCookies", (span) => {
    try {
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
    } catch (err) {
      span.recordException(err as Exception);
      throw err;
    } finally {
      span.end();
    }
  });
});

export const cookieActions = {
  getTimezone,
  setTimezone,
  getCalendarScope,
  getStravaTokensFromCookies,
  getVizSettings,
  setCalendarScope,
  setSessionChartSettings,
  setStravaTokensCookie,
};
