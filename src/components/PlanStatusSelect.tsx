import { updatePlanFn } from "~/lib/server-fns/plans";

export const PLAN_STATUSES = ["planned", "completed", "skipped"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export function normalizePlanStatus(s: string): PlanStatus {
  if (s === "planned" || s === "completed" || s === "skipped") {
    return s;
  }
  return "planned";
}

type Props = {
  planId: string;
  status: string;
  onUpdated: () => void | Promise<void>;
  className?: string;
  /** When true (e.g. session linked), status is fixed until unlinked. */
  disabled?: boolean;
};

const selectClassName =
  "h-6 max-w-[7rem] min-w-0 rounded border border-zinc-700/70 bg-zinc-900 py-0 pl-1 pr-0.5 text-[11px] leading-none text-zinc-200 focus:border-emerald-600/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20";

export function PlanStatusSelect({
  planId,
  status,
  onUpdated,
  className,
  disabled = false,
}: Props) {
  const value = normalizePlanStatus(status);

  return (
    <label className={className ?? "inline-flex items-center"}>
      <select
        aria-label="Status"
        title={
          disabled ? "Unlink the session before changing status" : "Status"
        }
        disabled={disabled}
        value={value}
        onChange={async (e) => {
          const next = e.target.value as PlanStatus;
          if (next === value) {
            return;
          }
          if (next === "skipped") {
            await updatePlanFn({
              data: {
                id: planId,
                status: "skipped",
                stravaActivityId: null,
                hevyWorkoutId: null,
              },
            });
          } else {
            await updatePlanFn({ data: { id: planId, status: next } });
          }
          await onUpdated();
        }}
        className={`${selectClassName} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <option value="planned">Planned</option>
        <option value="completed">Completed</option>
        <option value="skipped">Skipped</option>
      </select>
    </label>
  );
}
