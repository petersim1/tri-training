import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie } from "@tanstack/react-start/server";
import { STRAVA_TOKENS_COOKIE } from "@/lib/cookies";

const logout = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(STRAVA_TOKENS_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  });
  throw redirect({ to: "/login" });
});

export const authActions = {
  logout,
};
