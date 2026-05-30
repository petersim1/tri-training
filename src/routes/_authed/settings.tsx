import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { backfillActions } from "@/server-fcts/backfill";
import { cookieActions } from "@/server-fcts/cookies";
import { vendorActions } from "@/server-fcts/vendors";

export const Route = createFileRoute("/_authed/settings")({
  loader: async () => {
    const cookie = await cookieActions.getStravaTokensFromCookies();
    if (cookie) {
      return { kind: "connected", athleteId: cookie.athleteId };
    }
    if (!process.env.STRAVA_CLIENT_ID?.trim()) {
      return { kind: "misconfigured" };
    }
    return { kind: "connect" };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { kind, athleteId } = Route.useLoaderData();
  const queryClient = useQueryClient();
  const router = useRouter();
  const runStartOAuth = useServerFn(vendorActions.startStravaOAuth);
  const backfill = useServerFn(backfillActions.backfillLinkedWorkouts);
  const [stravaOAuthMsg, setStravaOAuthMsg] = useState<string | null>(null);
  const [stravaOAuthPending, setStravaOAuthPending] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [backfillErr, setBackfillErr] = useState<string | null>(null);

  const backfillMutation = useMutation({
    mutationFn: () => backfill(),
    onMutate: () => {
      setBackfillMsg(null);
      setBackfillErr(null);
    },
    onSuccess: (r) => {
      setBackfillMsg(
        `Imported Strava ${r.importedStrava}, Hevy ${r.importedHevy}, Hevy weights ${r.importedHevyWeights}.}`,
      );
      router.invalidate();
      queryClient.clear();
    },
    onError: (e) => {
      setBackfillErr(e instanceof Error ? e.message : String(e));
    },
  });

  const onConnectStrava = useCallback(async () => {
    setStravaOAuthPending(true);
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
      setStravaOAuthPending(false);
    }
  }, [runStartOAuth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("strava");
    if (s) {
      setStravaOAuthMsg(s);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const stravaBanner =
    stravaOAuthMsg === "ok" ? (
      <p className="text-sm text-emerald-400">Strava linked successfully.</p>
    ) : stravaOAuthMsg ? (
      <p className="wrap-break-word text-sm text-red-400">
        Strava OAuth: {stravaOAuthMsg}
      </p>
    ) : null;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <section className="space-y-3 rounded border border-zinc-800 p-4">
        <h2 className="font-medium text-zinc-100">Strava</h2>
        {stravaBanner}
        {kind === "connected" ? (
          <p className="text-sm text-emerald-400">
            Connected
            {athleteId != null ? ` (athlete ${athleteId})` : ""}.
          </p>
        ) : kind === "misconfigured" ? (
          <p className="text-sm text-zinc-500">
            Strava OAuth is not configured (STRAVA_CLIENT_ID).
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-500">Not connected.</p>
            <button
              type="button"
              disabled={stravaOAuthPending}
              onClick={() => void onConnectStrava()}
              className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-60"
            >
              {stravaOAuthPending ? "Continuing to Strava…" : "Connect Strava"}
            </button>
          </>
        )}
      </section>

      <section className="space-y-3 rounded border border-zinc-800 p-4">
        <h2 className="font-medium text-zinc-100">Link sessions</h2>
        <p className="text-sm text-zinc-500">
          For plans that don&apos;t have a linked Strava or Hevy workout yet,
          try to match same-day activities (closest time to your scheduled
          plan). Strava uses your connection above; Hevy uses the server API
          key.
        </p>
        <button
          type="button"
          disabled={backfillMutation.isPending}
          onClick={() => backfillMutation.mutate()}
          className="rounded border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {backfillMutation.isPending
            ? "Running…"
            : "Backfill links from Strava & Hevy"}
        </button>
        {backfillMsg ? (
          <p className="text-sm text-emerald-400/90">{backfillMsg}</p>
        ) : null}
        {backfillErr ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-red-900/50 bg-red-950/30 p-2 text-xs text-red-300">
            {backfillErr}
          </pre>
        ) : null}
      </section>

      <Link to="/" className="text-sm text-emerald-400 hover:underline">
        ← Home
      </Link>
    </div>
  );
}
