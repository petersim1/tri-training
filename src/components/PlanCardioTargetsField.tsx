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
  /** Tighter layout for activity list rows. */
  compact?: boolean;
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
  compact = false,
}: Props) {
  const [distDraft, setDistDraft] = useState("");
  const [unitsDraft, setUnitsDraft] = useState<string>("");
  const [timeDraft, setTimeDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <planId required to trigger changes.>
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

  const label = compact
    ? "text-[10px] text-zinc-500"
    : "text-[11px] text-zinc-500";
  const input = compact
    ? "mt-0.5 w-full rounded border border-zinc-700/80 bg-zinc-900 px-1 py-0.5 text-[10px] text-zinc-100 placeholder:text-zinc-600"
    : "mt-0.5 w-full rounded border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-600";
  const select = compact
    ? "mt-0.5 w-full rounded border border-zinc-700/80 bg-zinc-900 px-1 py-0.5 text-[10px] text-zinc-100"
    : "mt-0.5 w-full rounded border border-zinc-700/80 bg-zinc-900 px-1 py-1 text-[11px] text-zinc-100";

  return (
    <div
      className={
        compact
          ? "space-y-1 rounded border border-zinc-800/80 bg-zinc-900/25 px-1.5 py-1"
          : "space-y-1.5 rounded border border-zinc-800/80 bg-zinc-900/25 px-2 py-1.5"
      }
    >
      <p
        className={
          compact
            ? "text-[9px] font-medium uppercase tracking-wide text-zinc-600"
            : "text-[10px] font-medium uppercase tracking-wide text-zinc-600"
        }
      >
        Planned targets
      </p>
      <div className="flex flex-wrap items-end gap-1.5 sm:gap-2">
        <label className="min-w-[4.5rem] flex-1">
          <span className={label}>Distance</span>
          <input
            value={distDraft}
            onChange={(e) => setDistDraft(e.target.value)}
            type="text"
            inputMode="decimal"
            placeholder="—"
            className={input}
          />
        </label>
        <label className="w-[4rem] sm:w-[4.5rem]">
          <span className={label}>Units</span>
          <select
            value={unitsDraft}
            onChange={(e) => setUnitsDraft(e.target.value)}
            className={select}
          >
            <option value="">—</option>
            {CARDIO_DISTANCE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[5rem] flex-1">
          <span className={label}>Duration (sec)</span>
          <input
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            type="text"
            inputMode="numeric"
            placeholder="—"
            className={input}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className={
            compact
              ? "text-[10px] text-emerald-500/90 hover:underline disabled:opacity-50"
              : "text-[11px] text-emerald-500/90 hover:underline disabled:opacity-50"
          }
        >
          {saving ? "Saving…" : "Save targets"}
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
