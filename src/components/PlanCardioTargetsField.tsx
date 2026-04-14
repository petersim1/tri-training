import { useEffect, useState } from "react";
import {
  CARDIO_DISTANCE_UNITS,
  isCardioKind,
} from "~/lib/plans/cardio-targets";
import { updatePlanFn } from "~/lib/plans/server-fns";

type Props = {
  planId: string;
  kind: string;
  distance: number | null;
  distanceUnits: string | null;
  timeSeconds: number | null;
  onUpdated: () => void | Promise<void>;
};

function sameNum(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  return Math.abs(a - b) < 1e-9;
}

export function PlanCardioTargetsField({
  planId,
  kind,
  distance,
  distanceUnits,
  timeSeconds,
  onUpdated,
}: Props) {
  const [distDraft, setDistDraft] = useState("");
  const [unitsDraft, setUnitsDraft] = useState<string>("");
  const [timeDraft, setTimeDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDistDraft(distance != null ? String(distance) : "");
    setUnitsDraft(distanceUnits ?? "");
    setTimeDraft(timeSeconds != null ? String(timeSeconds) : "");
  }, [planId, distance, distanceUnits, timeSeconds]);

  if (!isCardioKind(kind)) {
    return null;
  }

  async function save() {
    const distTrim = distDraft.trim();
    let nextDist: number | null = null;
    if (distTrim !== "") {
      const n = parseFloat(distTrim.replace(",", "."));
      if (Number.isNaN(n) || n < 0) {
        setErr("Distance must be a non-negative number.");
        return;
      }
      nextDist = n;
    }

    const nextUnits =
      unitsDraft === "" ? null : unitsDraft.toLowerCase().trim();
    if (
      nextUnits &&
      !(CARDIO_DISTANCE_UNITS as readonly string[]).includes(nextUnits)
    ) {
      setErr(`Unit must be one of: ${CARDIO_DISTANCE_UNITS.join(", ")}.`);
      return;
    }

    const timeTrim = timeDraft.trim();
    let nextTime: number | null = null;
    if (timeTrim !== "") {
      const n = parseInt(timeTrim, 10);
      if (Number.isNaN(n) || n < 0) {
        setErr("Duration must be a non-negative whole number (seconds).");
        return;
      }
      nextTime = n;
    }

    if (
      sameNum(distance, nextDist) &&
      (distanceUnits ?? "") === (nextUnits ?? "") &&
      (timeSeconds ?? null) === nextTime
    ) {
      return;
    }

    setErr(null);
    setSaving(true);
    try {
      await updatePlanFn({
        data: {
          id: planId,
          distance: nextDist,
          distanceUnits: nextUnits,
          timeSeconds: nextTime,
        },
      });
      await onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save targets");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5 rounded border border-zinc-800/80 bg-zinc-900/25 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
        Planned targets
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[5rem] flex-1">
          <span className="text-[11px] text-zinc-500">Distance</span>
          <input
            value={distDraft}
            onChange={(e) => setDistDraft(e.target.value)}
            type="text"
            inputMode="decimal"
            placeholder="—"
            className="mt-0.5 w-full rounded border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <label className="w-[4.5rem]">
          <span className="text-[11px] text-zinc-500">Units</span>
          <select
            value={unitsDraft}
            onChange={(e) => setUnitsDraft(e.target.value)}
            className="mt-0.5 w-full rounded border border-zinc-700/80 bg-zinc-900 px-1 py-1 text-[11px] text-zinc-100"
          >
            <option value="">—</option>
            {CARDIO_DISTANCE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[6rem] flex-1">
          <span className="text-[11px] text-zinc-500">Duration (sec)</span>
          <input
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            type="text"
            inputMode="numeric"
            placeholder="—"
            className="mt-0.5 w-full rounded border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="text-[11px] text-emerald-500/90 hover:underline disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save targets"}
        </button>
        {err ? (
          <span className="text-[11px] text-red-400">{err}</span>
        ) : null}
      </div>
    </div>
  );
}
