import { type Exception, trace } from "@opentelemetry/api";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie } from "@tanstack/react-start/server";
import { STRAVA_TOKENS_COOKIE } from "@/lib/cookies";

const tracer = trace.getTracer("bevor.auth");

const logout = createServerFn({ method: "POST" }).handler(async () => {
  return tracer.startActiveSpan("logout", async (span) => {
    try {
      deleteCookie(STRAVA_TOKENS_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
      });
      throw redirect({ to: "/login" });
    } catch (err) {
      span.recordException(err as Exception);
      throw err;
    } finally {
      span.end();
    }
  });
});

export const authActions = {
  logout,
};
