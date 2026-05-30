import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { PlanKind } from "@/lib/constants/activities";
import { activityActions } from "@/server-fcts/activities";

const KINDS: PlanKind[] = ["lift", "run", "bike", "swim", "recovery"];

type Props = {
  planId: string;
  kind: PlanKind;
  onUpdated: () => void | Promise<void>;
};

export function PlanKindField({ planId, kind, onUpdated }: Props) {
  const updateActivity = useServerFn(activityActions.update);

  const [draft, setDraft] = useState(kind);
  const [err, setErr] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: planId/kind identity drives reset
  useEffect(() => {
    setDraft(kind);
  }, [planId, kind]);

  const updateMutation = useMutation({
    mutationFn: ({ kind }: { kind: PlanKind }) =>
      updateActivity({ data: { id: planId, kind } }),
    onMutate: () => setErr(null),
    onError: (e) =>
      setErr(e instanceof Error ? e.message : "Could not save date"),
    onSuccess: () => onUpdated(),
  });

  async function save() {
    if (draft === kind) {
      return;
    }
    updateMutation.mutate({ kind: draft });
  }

  return (
    <div className="space-y-1">
      <label className="block">
        <span className="text-[11px] font-medium text-zinc-500">Activity</span>
        <select
          value={draft}
          onChange={(e) => setDraft(e.target.value as PlanKind)}
          className="mt-0.5 block w-full max-w-48 rounded border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={updateMutation.isPending || draft === kind}
          onClick={() => void save()}
          className="text-[11px] text-emerald-500/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving…" : "Save activity"}
        </button>
        {err ? <span className="text-[11px] text-red-400">{err}</span> : null}
      </div>
    </div>
  );
}
