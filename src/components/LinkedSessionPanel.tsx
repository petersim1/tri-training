import { useMutation } from "@tanstack/react-query";
import type { CompletedWorkoutRow } from "~/lib/db/schema";
import { hevyWorkoutWebUrl, stravaActivityWebUrl } from "~/lib/hevy/links";
import {
  completedWorkoutCalories,
  completedWorkoutDistanceM,
  completedWorkoutMovingSeconds,
  completedWorkoutTitle,
} from "~/lib/plans/completed-workout-data";
import { updatePlanFn } from "~/lib/server-fns/plans";

function formatActualDurationSec(s: number | null | undefined): string | null {
  if (s == null || !Number.isFinite(s)) {
    return null;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function linkedSessionStatsLine(c: CompletedWorkoutRow): string | null {
  const dist = completedWorkoutDistanceM(c);
  const distLabel =
    dist != null && Number.isFinite(dist)
      ? dist >= 1000
        ? `${(dist / 1000).toFixed(2)} km`
        : `${Math.round(dist)} m`
      : null;
  const dur = formatActualDurationSec(completedWorkoutMovingSeconds(c));
  const kcalRaw = completedWorkoutCalories(c);
  const kcal =
    kcalRaw != null && Number.isFinite(kcalRaw) ? Math.round(kcalRaw) : null;
  const parts: string[] = [];
  if (distLabel) {
    parts.push(distLabel);
  }
  if (dur) {
    parts.push(dur);
  }
  if (kcal != null) {
    parts.push(`${kcal} kcal`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

export function LinkedSessionPanel({
  planId,
  completed,
  onUnlinked,
}: {
  planId: string;
  completed: CompletedWorkoutRow;
  onUnlinked: () => Promise<void>;
}) {
  const unlinkMutation = useMutation({
    mutationFn: () =>
      updatePlanFn({
        data: {
          id: planId,
          stravaActivityId: null,
          hevyWorkoutId: null,
        },
      }),
    onSuccess: async () => {
      await onUnlinked();
    },
  });

  const statsLine = linkedSessionStatsLine(completed);
  const sessionTitle = completedWorkoutTitle(completed);
  const isStrava = completed.vendor === "strava";
  const href = isStrava
    ? stravaActivityWebUrl(completed.vendorId)
    : hevyWorkoutWebUrl(completed.vendorId);
  const openLabel = isStrava ? "Open in Strava" : "Open in Hevy";

  return (
    <div className="rounded-md border border-emerald-900/40 bg-emerald-950/25 px-2 py-1.5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-emerald-600/85">
            Linked session
            <span className="ml-1.5 font-normal normal-case text-zinc-500">
              {isStrava ? "Strava" : "Hevy"}
            </span>
          </p>
          {sessionTitle ? (
            <p className="mt-0.5 text-[11px] font-medium leading-snug text-zinc-200">
              {sessionTitle}
            </p>
          ) : null}
          {statsLine ? (
            <p className="mt-0.5 text-[10px] leading-tight text-zinc-400">
              {statsLine}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-emerald-900/30 pt-1.5 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-emerald-400/95 hover:text-emerald-300 hover:underline"
          >
            {openLabel}
          </a>
          <span className="text-[10px] text-zinc-600" aria-hidden>
            ·
          </span>
          <button
            type="button"
            disabled={unlinkMutation.isPending}
            onClick={() => unlinkMutation.mutate()}
            className="text-[10px] font-medium text-amber-400/90 hover:text-amber-300 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {unlinkMutation.isPending ? "Unlinking…" : "Unlink"}
          </button>
        </div>
      </div>
    </div>
  );
}
