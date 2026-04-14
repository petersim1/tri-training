import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { backfillLinkedWorkoutsFn } from "~/lib/plans/backfill-server-fns";
import { getStravaSettingsStravaFn } from "~/lib/strava/oauth-flow";

export const Route = createFileRoute("/_authed/settings")({
  loader: async () => {
    const strava = await getStravaSettingsStravaFn();
    return { strava };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { strava } = Route.useLoaderData();
  const router = useRouter();
  const [stravaOAuthMsg, setStravaOAuthMsg] = useState<string | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [backfillErr, setBackfillErr] = useState<string | null>(null);

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
      <p className="break-words text-sm text-red-400">
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
        {strava.kind === "connected" ? (
          <p className="text-sm text-emerald-400">
            Connected
            {strava.athleteId != null ? ` (athlete ${strava.athleteId})` : ""}.
          </p>
        ) : strava.kind === "misconfigured" ? (
          <p className="text-sm text-zinc-500">
            Strava OAuth is not configured (STRAVA_CLIENT_ID).
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-500">Not connected.</p>
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
              Connect Strava
            </a>
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
          disabled={backfillBusy}
          onClick={async () => {
            setBackfillBusy(true);
            setBackfillMsg(null);
            setBackfillErr(null);
            try {
              const r = await backfillLinkedWorkoutsFn();
              setBackfillMsg(
                `Imported Strava ${r.importedStrava}, Hevy ${r.importedHevy}. Linked ${r.linked}, skipped ${r.skipped}.${r.errors.length > 0 ? ` ${r.errors.length} error(s) — see below.` : ""}`,
              );
              if (r.errors.length > 0) {
                setBackfillErr(r.errors.join("\n"));
              }
              await router.invalidate();
            } catch (e) {
              setBackfillErr(e instanceof Error ? e.message : String(e));
            } finally {
              setBackfillBusy(false);
            }
          }}
          className="rounded border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {backfillBusy ? "Running…" : "Backfill links from Strava & Hevy"}
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
