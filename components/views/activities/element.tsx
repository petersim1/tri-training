import { PencilEditIcon } from "@/components/assets";
import { normalizePlanStatus } from "@/components/PlanStatusSelect";
import type {
  CompletedWorkoutRow,
  PlannedWorkoutWithCompleted,
} from "@/lib/db/schema.server";
import { hevyWorkoutWebUrl, stravaActivityWebUrl } from "@/lib/hevy/links";
import { formatPlannedCardioTargets } from "@/lib/plans/cardio-targets";
import {
  completedWorkoutTitle,
  formatCompletedSessionBrief,
} from "@/lib/plans/completed-workout-data";
import { formatPlanDayKey } from "@/lib/utils/dates";

const completedWorkoutOpenInVendor = (
  cw: CompletedWorkoutRow,
): {
  href: string;
  label: string;
} => {
  const isStrava = cw.vendor === "strava";
  return {
    href: isStrava
      ? stravaActivityWebUrl(cw.vendorId)
      : hevyWorkoutWebUrl(cw.vendorId),
    label: isStrava ? "Open in Strava" : "Open in Hevy",
  };
};

export const ActivityElement: React.FC<{
  workout: PlannedWorkoutWithCompleted;
  onEdit?: () => void;
  hideDate?: boolean;
  hideNote?: boolean;
  hideEdit?: boolean;
}> = ({
  workout,
  onEdit,
  hideDate = false,
  hideNote = false,
  hideEdit = false,
}) => {
  const linked = Boolean(workout.completedWorkout);
  const title =
    linked && workout.completedWorkout
      ? completedWorkoutTitle(workout.completedWorkout)
      : null;
  const brief =
    linked && workout.completedWorkout
      ? formatCompletedSessionBrief(workout.completedWorkout)
      : null;
  const planTargets = ["run", "bike", "swim"].includes(workout.kind)
    ? formatPlannedCardioTargets(workout)
    : null;
  const vendorOpen = workout.completedWorkout
    ? completedWorkoutOpenInVendor(workout.completedWorkout)
    : null;
  return (
    <div
      key={workout.id}
      className="min-w-0 rounded-md border border-zinc-800/80 bg-zinc-950/70 px-2 py-2"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-start justify-between gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="text-[10px] font-medium capitalize text-zinc-200">
              {workout.kind}
            </span>
            <span className="rounded bg-zinc-800/90 px-1 py-px text-[9px] capitalize text-zinc-400">
              {normalizePlanStatus(workout.status)}
            </span>
          </div>
          {!hideEdit && (
            <button
              type="button"
              aria-label={`Edit ${workout.kind} — ${formatPlanDayKey(workout.dayKey)}`}
              className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800/90 hover:text-zinc-300"
              onClick={onEdit}
            >
              <PencilEditIcon className="size-3.5" />
            </button>
          )}
        </div>
        {!hideDate && (
          <p
            className="text-[9px] tabular-nums text-zinc-500"
            title={workout.dayKey}
          >
            {formatPlanDayKey(workout.dayKey)}
          </p>
        )}
        {workout.notes?.trim() && !hideNote && (
          <p className="line-clamp-2 text-[10px] leading-tight text-zinc-500 py-2">
            {workout.notes.trim()}
          </p>
        )}
        {linked && workout.completedWorkout ? (
          <div className="rounded border border-emerald-900/35 bg-emerald-950/20 px-1.5 py-1 h-14">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-medium uppercase tracking-wide text-emerald-600/85">
                  Linked
                </p>
                {title ? (
                  <p className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-300">
                    {title}
                  </p>
                ) : null}
                {brief ? (
                  <p className="mt-0.5 text-[9px] text-zinc-500">{brief}</p>
                ) : null}
                {planTargets ? (
                  <p className="mt-0.5 text-[9px] text-zinc-600">
                    Target: {planTargets}
                  </p>
                ) : null}
              </div>
              {vendorOpen ? (
                <a
                  href={vendorOpen.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 pt-0.5 text-right text-[9px] font-medium leading-tight text-emerald-400/95 hover:text-emerald-300 hover:underline"
                >
                  {vendorOpen.label}
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="h-14 flex justify-start items-center pl-1.5">
            <p className="text-[9px] text-zinc-600">No session linked</p>
          </div>
        )}
      </div>
    </div>
  );
};
