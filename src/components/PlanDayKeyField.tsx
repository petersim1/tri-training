import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { isValidDayKey } from "@/lib/utils/dates";
import { activityActions } from "@/server-fcts/activities";

type Props = {
  planId: string;
  dayKey: string;
  onUpdated: () => void | Promise<void>;
};

export function PlanDayKeyField({ planId, dayKey, onUpdated }: Props) {
  const updateActivity = useServerFn(activityActions.update);

  const [draft, setDraft] = useState(dayKey);
  const [err, setErr] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: planId/dayKey identity drives reset
  useEffect(() => {
    setDraft(dayKey);
  }, [planId, dayKey]);

  const updateMutation = useMutation({
    mutationFn: ({ dayKey }: { dayKey: string }) =>
      updateActivity({ data: { id: planId, dayKey } }),
    onMutate: () => setErr(null),
    onError: (e) =>
      setErr(e instanceof Error ? e.message : "Could not save date"),
    onSuccess: () => onUpdated(),
  });

  async function save() {
    const next = draft.trim();
    if (next === dayKey.trim()) {
      return;
    }
    if (!isValidDayKey(next)) {
      setErr("Use a valid calendar date (YYYY-MM-DD)");
      return;
    }
    updateMutation.mutate({ dayKey: next });
  }

  return (
    <div className="space-y-1">
      <label className="block">
        <span className="text-[11px] font-medium text-zinc-500">Date</span>
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-0.5 w-full max-w-48 rounded border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={updateMutation.isPending || draft.trim() === dayKey.trim()}
          onClick={() => void save()}
          className="text-[11px] text-emerald-500/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving…" : "Save date"}
        </button>
        {err ? <span className="text-[11px] text-red-400">{err}</span> : null}
      </div>
    </div>
  );
}
