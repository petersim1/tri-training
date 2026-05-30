import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { vendorActions } from "@/server-fcts/vendors";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const runStartOAuth = useServerFn(vendorActions.startStravaOAuth);
  const [stravaOAuthMsg, setStravaOAuthMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("strava");
    if (s) {
      setStravaOAuthMsg(s);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: () => runStartOAuth(),
    onSuccess: (d) => {
      if (!d.ok) {
        setStravaOAuthMsg("misconfigured");
        return;
      }
      window.location.assign(d.authorizeUrl);
    },
    onError: () => {
      setStravaOAuthMsg("oauth_start_failed");
    },
  });

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
          disabled={loginMutation.isPending}
          onClick={() => loginMutation.mutate()}
          className="inline-block rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-60"
        >
          {loginMutation.isPending
            ? "Continuing to Strava…"
            : "Sign in with Strava"}
        </button>
      </div>
    </main>
  );
}
