import { createStart } from "@tanstack/react-start";
import { requireSessionFnMiddleware } from "./lib/auth/require-session-fn-middleware";

/**
 * Registered by the TanStack Start Vite plugin as `#tanstack-start-entry` (default file: `src/start.ts`).
 * At runtime, `@tanstack/start-server-core` does `await startInstance.getOptions()` and applies
 * `requestMiddleware` to each SSR / server-fn request — see `createStartHandler.js` in the framework.
 *
 * Debugging: middleware and any `console.*` inside it run in the **Node process** (the terminal where
 * you run `vite dev` / `vite preview` / production server), not in the browser DevTools console.
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [requireSessionFnMiddleware],
}));

if (import.meta.env.DEV) {
  console.info("[start] src/start.ts loaded (SSR server)");
}
