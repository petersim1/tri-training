import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { clearStravaTokensCookie } from "~/lib/strava/cookie-store";

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  clearStravaTokensCookie();
  throw redirect({ to: "/login" });
});
