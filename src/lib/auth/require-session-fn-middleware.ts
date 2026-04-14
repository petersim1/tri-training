import { createMiddleware } from "@tanstack/react-start";
import { getSessionOk } from "~/lib/auth/session-server";

/** Attach to `createServerFn` via `.middleware([requireSessionFnMiddleware])` instead of checking session in each handler. */
export const requireSessionFnMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  if (!(await getSessionOk())) {
    throw new Error("Unauthorized");
  }
  return next();
});
