import { useMutation } from "@tanstack/react-query";
import type { VendorActivityRow } from "@/lib/db/schema.server";
import { hevyWorkoutWebUrl, stravaActivityWebUrl } from "@/lib/hevy/links";
import {
  completedWorkoutTitle,
  formatCompletedSessionBrief,
} from "@/lib/plans/completed-workout-data";
import { activityActions } from "@/server-fcts/activities";

export function LinkedSessionPanel({
  planId,
  completed,
  onUnlinked,
}: {
  planId: string;
  completed: VendorActivityRow;
  onUnlinked: () => Promise<void>;
}) {
  const unlinkMutation = useMutation({
    mutationFn: () =>
      activityActions.update({
        data: {
          id: planId,
        },
      }),
    onSuccess: async () => {
      await onUnlinked();
    },
  });

  const statsLine = formatCompletedSessionBrief(completed);
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
