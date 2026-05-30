import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ChangeEvent } from "react";
import type { PlanStatus } from "@/lib/constants/activities";
import { activityActions } from "@/server-fcts/activities";

type Props = {
  planId: string;
  status: PlanStatus;
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
  const updateActivity = useServerFn(activityActions.update);

  const updateMutation = useMutation({
    mutationFn: ({ status }: { status: PlanStatus }) =>
      updateActivity({ data: { id: planId, status } }),
    onSuccess: () => onUpdated(),
  });

  const handleChange = (
    e: ChangeEvent<HTMLSelectElement, HTMLSelectElement>,
  ) => {
    const newStatus = e.target.value as PlanStatus;
    if (newStatus === status) return;
    updateMutation.mutate({ status: newStatus });
  };

  return (
    <label className={className ?? "inline-flex items-center"}>
      <select
        aria-label="Status"
        title={
          disabled ? "Unlink the session before changing status" : "Status"
        }
        disabled={disabled}
        value={status}
        onChange={handleChange}
        className={`${selectClassName} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <option value="planned">Planned</option>
        <option value="completed">Completed</option>
        <option value="skipped">Skipped</option>
      </select>
    </label>
  );
}
