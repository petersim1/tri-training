import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getSessionOk } from "~/lib/auth/session-server";

function normalizePathname(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p;
}

/** Paths that must work without a session (login, OAuth callback, inbound webhooks). */
function isPublicPath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  if (p === "/login") {
    return true;
  }
  if (p.startsWith("/api/strava/callback")) {
    return true;
  }
  if (p.startsWith("/api/webhooks/")) {
    return true;
  }
  return false;
}

/**
 * `requestMiddleware` runs for both document requests and TanStack Start server-function HTTP
 * calls. Server functions use `TSS_SERVER_FN_BASE` + id in the URL — not `/login` — so treating
 * them like pages incorrectly redirected every unauthenticated server fn (including the login
 * loader) to `/login`, which never completes.
 *
 * Auth for server functions must be enforced inside each `createServerFn` (or shared middleware
 * on those fns), not here.
 */
function isServerFnHttpRequest(request: Request, pathname: string): boolean {
  if (request.headers.get("x-tsr-serverFn") === "true") {
    return true;
  }
  const base = process.env.TSS_SERVER_FN_BASE;
  return Boolean(base && pathname.startsWith(base));
}

/** Global `requestMiddleware` in `start.ts`: require a session for page/document routes only. */
export const requireSessionFnMiddleware = createMiddleware().server(
  async ({ next, pathname, request }) => {
    if (isServerFnHttpRequest(request, pathname)) {
      return next();
    }

    const isAuthed = await getSessionOk();

    if (isAuthed && normalizePathname(pathname) === "/login") {
      throw redirect({ to: "/" });
    }
    if (!isAuthed && !isPublicPath(pathname)) {
      throw redirect({ to: "/login" });
    }
    return next();
  },
);
