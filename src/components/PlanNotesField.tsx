import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { activityActions } from "@/server-fcts/activities";

type Props = {
  planId: string;
  notes: string | null;
  onUpdated: () => void | Promise<void>;
  /** Denser layout for list rows. */
  compact?: boolean;
};

export function PlanNotesField({
  planId,
  notes,
  onUpdated,
  compact = false,
}: Props) {
  const updateActivity = useServerFn(activityActions.update);

  const [draft, setDraft] = useState(notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <planId required to trigger changes>
  useEffect(() => {
    setDraft(notes ?? "");
  }, [planId, notes]);

  const updateMutation = useMutation({
    mutationFn: ({ notes }: { notes: string | null }) =>
      updateActivity({ data: { id: planId, notes } }),
    onMutate: () => setErr(null),
    onError: (e) =>
      setErr(e instanceof Error ? e.message : "Could not save date"),
    onSuccess: () => onUpdated(),
  });

  async function save() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    const prev = (notes ?? "").trim() === "" ? null : (notes ?? "").trim();
    if (next === prev) {
      return;
    }
    updateMutation.mutate({ notes: draft });
  }

  return (
    <div className={compact ? "space-y-0.5" : "space-y-1"}>
      <label className="block">
        <span
          className={
            compact ? "text-[10px] text-zinc-500" : "text-[11px] text-zinc-500"
          }
        >
          Notes
        </span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={compact ? 1 : 2}
          placeholder="Optional"
          className={
            compact
              ? "mt-0.5 w-full resize-y rounded border border-zinc-700/80 bg-zinc-900 px-1.5 py-0.5 text-[10px] leading-tight text-zinc-100 placeholder:text-zinc-600"
              : "mt-0.5 w-full resize-y rounded border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] leading-snug text-zinc-100 placeholder:text-zinc-600"
          }
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={updateMutation.isPending}
          onClick={() => void save()}
          className={
            compact
              ? "text-[10px] text-emerald-500/90 hover:underline disabled:opacity-50"
              : "text-[11px] text-emerald-500/90 hover:underline disabled:opacity-50"
          }
        >
          {updateMutation.isPending ? "Saving…" : "Save notes"}
        </button>
        {err ? (
          <span
            className={
              compact ? "text-[10px] text-red-400" : "text-[11px] text-red-400"
            }
          >
            {err}
          </span>
        ) : null}
      </div>
    </div>
  );
}
