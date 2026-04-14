import { useEffect, useState } from "react";
import { updatePlanFn } from "~/lib/plans/server-fns";

type Props = {
  planId: string;
  notes: string | null;
  onUpdated: () => void | Promise<void>;
};

export function PlanNotesField({ planId, notes, onUpdated }: Props) {
  const [draft, setDraft] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(notes ?? "");
  }, [planId, notes]);

  async function save() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    const prev = (notes ?? "").trim() === "" ? null : (notes ?? "").trim();
    if (next === prev) {
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await updatePlanFn({
        data: { id: planId, notes: next },
      });
      await onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save notes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <label className="block">
        <span className="text-[11px] text-zinc-500">Notes</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Optional"
          className="mt-0.5 w-full resize-y rounded border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] leading-snug text-zinc-100 placeholder:text-zinc-600"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="text-[11px] text-emerald-500/90 hover:underline disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save notes"}
        </button>
        {err ? (
          <span className="text-[11px] text-red-400">{err}</span>
        ) : null}
      </div>
    </div>
  );
}
