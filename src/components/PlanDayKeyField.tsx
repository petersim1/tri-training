import { useEffect, useState } from "react";
import { isValidDayKey } from "~/lib/plans/day-key";
import { updatePlanFn } from "~/lib/server-fns/plans";

type Props = {
  planId: string;
  dayKey: string;
  onUpdated: () => void | Promise<void>;
};

export function PlanDayKeyField({ planId, dayKey, onUpdated }: Props) {
  const [draft, setDraft] = useState(dayKey);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: planId/dayKey identity drives reset
  useEffect(() => {
    setDraft(dayKey);
  }, [planId, dayKey]);

  async function save() {
    const next = draft.trim();
    if (next === dayKey.trim()) {
      return;
    }
    if (!isValidDayKey(next)) {
      setErr("Use a valid calendar date (YYYY-MM-DD)");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await updatePlanFn({
        data: { id: planId, dayKey: next },
      });
      await onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save date");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <label className="block">
        <span className="text-[11px] font-medium text-zinc-500">Date</span>
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-0.5 w-full max-w-[12rem] rounded border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || draft.trim() === dayKey.trim()}
          onClick={() => void save()}
          className="text-[11px] text-emerald-500/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save date"}
        </button>
        {err ? (
          <span className="text-[11px] text-red-400">{err}</span>
        ) : null}
      </div>
    </div>
  );
}
