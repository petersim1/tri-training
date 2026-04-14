import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { LogoutButton } from "~/components/LogoutButton";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    if (!context.auth.ok) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-900/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-semibold tracking-tight">
            Workout tracker
          </span>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <Link
              to="/"
              activeProps={{ className: "font-semibold text-white" }}
            >
              Home
            </Link>
            <Link
              to="/activities"
              search={{
                kind: "all",
                status: "all",
                from: undefined,
                to: undefined,
              }}
              activeProps={{ className: "font-semibold text-white" }}
            >
              Activities
            </Link>
            <Link
              to="/settings"
              activeProps={{ className: "font-semibold text-white" }}
            >
              Settings
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex w-full flex-1 flex-col bg-zinc-950">
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
