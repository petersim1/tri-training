import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { vendorActions } from "@/server-fcts";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const runStartOAuth = useServerFn(vendorActions.startStravaOAuth);
  const [stravaOAuthMsg, setStravaOAuthMsg] = useState<string | null>(null);
  const [oauthPending, setOAuthPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("strava");
    if (s) {
      setStravaOAuthMsg(s);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const onStravaClick = useCallback(async () => {
    console.log("CLICKED");
    setOAuthPending(true);
    try {
      const r = await runStartOAuth();
      if (!r.ok) {
        setStravaOAuthMsg("misconfigured");
        return;
      }
      window.location.assign(r.authorizeUrl);
    } catch {
      setStravaOAuthMsg("oauth_start_failed");
    } finally {
      setOAuthPending(false);
    }
  }, [runStartOAuth]);

  const stravaBanner =
    stravaOAuthMsg === "forbidden" ? (
      <p className="text-sm text-red-400">
        This Strava account is not allowed to use this app.
      </p>
    ) : stravaOAuthMsg === "misconfigured" ? (
      <p className="text-sm text-zinc-500">
        Strava OAuth is not configured (STRAVA_CLIENT_ID).
      </p>
    ) : stravaOAuthMsg ? (
      <p className="wrap-break-words text-sm text-red-400">
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
        <button
          type="button"
          disabled={oauthPending}
          onClick={() => void onStravaClick()}
          className="inline-block rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-60"
        >
          {oauthPending ? "Continuing to Strava…" : "Sign in with Strava"}
        </button>
      </div>
    </main>
  );
}
