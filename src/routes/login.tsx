import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getStravaLoginOAuthUrlsFn } from "~/lib/strava/oauth-flow";

export const Route = createFileRoute("/login")({
  beforeLoad: async ({ context }) => {
    if (context.auth.ok) {
      throw redirect({ to: "/" });
    }
  },
  loader: async () => {
    return { strava: await getStravaLoginOAuthUrlsFn() };
  },
  component: LoginPage,
});

function LoginPage() {
  const { strava } = Route.useLoaderData();
  const [stravaOAuthMsg, setStravaOAuthMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("strava");
    if (s) {
      setStravaOAuthMsg(s);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const stravaBanner =
    stravaOAuthMsg === "forbidden" ? (
      <p className="text-sm text-red-400">
        This Strava account is not allowed to use this app.
      </p>
    ) : stravaOAuthMsg ? (
      <p className="break-words text-sm text-red-400">
        Strava OAuth: {stravaOAuthMsg}
      </p>
    ) : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-8">
      <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-sm text-zinc-400">
        Sign in with Strava. Your session lasts 30 days on this device.
      </p>
      {stravaBanner}
      {strava.kind === "misconfigured" ? (
        <p className="text-sm text-zinc-500">
          Strava OAuth is not configured (STRAVA_CLIENT_ID).
        </p>
      ) : strava.kind === "connect" ? (
        <a
          href={strava.mobileAuthorizeUrl}
          className="inline-block rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
          onClick={(e) => {
            e.preventDefault();
            const now = Date.now();
            window.location.href = strava.deepLinkUrl;
            setTimeout(() => {
              if (Date.now() - now > 100) {
                return;
              }
              window.location.href = strava.mobileAuthorizeUrl;
            }, 25);
          }}
        >
          Sign in with Strava
        </a>
      ) : null}
      </div>
    </main>
  );
}
