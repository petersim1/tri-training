import {
  type SessionChartMetric,
  type SessionChartSettings,
  VALID_CUMULATIVE,
  VALID_METRICS,
} from "@/lib/constants/visuals";

type ActivityPlotKind = "run" | "bike" | "swim" | "lift";

const KIND_LABEL: Record<ActivityPlotKind, string> = {
  run: "Run",
  bike: "Bike",
  swim: "Swim",
  lift: "Lift",
};

const METRIC_TABS = [
  ["distance", "Distance"],
  ["time", "Time"],
  ["pace", "Pace"],
  ["efficiency", "Efficiency"],
  ["volume", "Volume"],
] as const satisfies readonly (readonly [SessionChartMetric, string])[];

const ENABLED: Record<ActivityPlotKind, Record<SessionChartMetric, boolean>> = {
  run: {
    distance: true,
    time: true,
    pace: true,
    efficiency: true,
    volume: false,
  },
  bike: {
    distance: true,
    time: true,
    pace: true,
    efficiency: true,
    volume: false,
  },
  swim: {
    distance: true,
    time: true,
    pace: true,
    efficiency: true,
    volume: false,
  },
  lift: {
    distance: false,
    time: true,
    pace: false,
    efficiency: false,
    volume: true,
  },
};

const DISABLED_TITLE: Partial<
  Record<ActivityPlotKind, Partial<Record<SessionChartMetric, string>>>
> = {
  run: { volume: "Volume uses Hevy lift sets (kg × reps)." },
  bike: { volume: "Volume uses Hevy lift sets (kg × reps)." },
  swim: { volume: "Volume uses Hevy lift sets (kg × reps)." },
  lift: {
    distance: "Lift chart uses session time only — no distance series.",
    pace: "Pace applies to Run, Bike, or Swim.",
    efficiency: "Efficiency applies to Strava-linked Run, Bike, or Swim only.",
  },
};

type Props = {
  sessionChart: SessionChartSettings;
  onSessionChartPatch: (patch: Partial<SessionChartSettings>) => void;
};

export function ActivityMetricsChartHeader({
  sessionChart,
  onSessionChartPatch,
}: Props) {
  const { kind, metric, cumulative } = sessionChart;

  const cumulativeOk = VALID_CUMULATIVE[metric];
  const validMetrics = VALID_METRICS[kind];

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-800/80 px-4 py-3">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {(["run", "bike", "swim", "lift"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => onSessionChartPatch({ kind: k })}
            className={
              kind === k
                ? "rounded-md bg-emerald-600/25 px-2.5 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/40"
                : "rounded-md border border-zinc-700/80 bg-zinc-900/40 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            }
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap gap-2">
          {METRIC_TABS.map(([value, label]) => {
            const enabled = validMetrics.includes(value);
            const selected = enabled && metric === value;
            return (
              <button
                key={value}
                type="button"
                disabled={!enabled}
                title={
                  DISABLED_TITLE[(kind ?? "run") as ActivityPlotKind]?.[value]
                }
                onClick={() => {
                  if (!enabled) return;
                  const patch: Partial<SessionChartSettings> = {
                    metric: value,
                  };
                  if (value === "pace" || value === "efficiency")
                    patch.cumulative = false;
                  onSessionChartPatch(patch);
                }}
                className={
                  selected
                    ? "rounded-md bg-sky-600/20 px-2 py-1 text-[11px] font-medium text-sky-200 ring-1 ring-sky-500/35"
                    : enabled
                      ? "rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                      : "cursor-not-allowed rounded-md px-2 py-1 text-[11px] font-medium text-zinc-600 opacity-60"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={Boolean(cumulativeOk && cumulative)}
          disabled={!cumulativeOk}
          title={
            cumulativeOk
              ? undefined
              : kind === "lift"
                ? "Switch to Volume for cumulative totals."
                : "Not available for pace or efficiency."
          }
          onClick={() => {
            if (cumulativeOk) onSessionChartPatch({ cumulative: !cumulative });
          }}
          className={
            !cumulativeOk
              ? "cursor-not-allowed rounded-md border border-zinc-800/70 px-2 py-0.5 text-[11px] font-medium text-zinc-600 opacity-60"
              : cumulative
                ? "rounded-md border border-emerald-500/45 bg-emerald-600/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200"
                : "rounded-md border border-zinc-600/80 bg-zinc-900/35 px-2 py-0.5 text-[11px] font-medium text-zinc-400 hover:border-zinc-500 hover:bg-zinc-800/45 hover:text-zinc-200"
          }
        >
          Cumulative
        </button>
      </div>
    </div>
  );
}
