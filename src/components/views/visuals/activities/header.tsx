import { LayersIcon, PlanActivityKindIcon } from "@/components/assets";
import { Select } from "@/components/Forms";
import {
  CHART_AGG_VALUES,
  type SessionChartAgg,
  type SessionChartMetric,
  type SessionChartSettings,
  VALID_CUMULATIVE,
  VALID_METRICS,
} from "@/lib/constants/visuals";
import { cn } from "@/lib/utils";

const CHART_KINDS = ["bike", "run", "swim", "lift"] as const;
type ChartKinds = (typeof CHART_KINDS)[number];

const METRIC_TABS = [
  ["distance", "Distance"],
  ["time", "Time"],
  ["pace", "Pace"],
  ["efficiency", "Efficiency"],
  ["volume", "Volume"],
] as const satisfies readonly (readonly [SessionChartMetric, string])[];

const DISABLED_TITLE: Partial<
  Record<ChartKinds, Partial<Record<SessionChartMetric, string>>>
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

export const ActivityMetricsChartHeader: React.FC<Props> = ({
  sessionChart,
  onSessionChartPatch,
}) => {
  const { kind, metric, cumulative, agg, stacked, proportional } = sessionChart;
  const cumulativeOk = VALID_CUMULATIVE[metric];
  const validMetrics = stacked ? ["distance", "time"] : VALID_METRICS[kind];

  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-4 py-3 flex-wrap">
      <div className="flex gap-1.5" role="tablist">
        {CHART_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k && !stacked}
            onClick={() => onSessionChartPatch({ kind: k, stacked: false })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              (stacked || kind !== k) &&
                "border border-zinc-700/80 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
              kind === k &&
                !stacked &&
                "bg-emerald-600/25 text-emerald-200 ring-1 ring-emerald-500/40",
            )}
          >
            <PlanActivityKindIcon kind={k} />
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={stacked}
          onClick={() => onSessionChartPatch({ stacked: !stacked })}
          className={cn(
            "rounded-md  px-2.5 py-1 text-xs font-medium ",
            stacked && "bg-blue-600/25 text-blue-200 ring-1 ring-blue-500/40",
            !stacked &&
              "border border-zinc-700/80 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
          )}
        >
          <LayersIcon className="size-3" />
        </button>
      </div>
      <div className="flex gap-2 items-center">
        <div className="hidden sm:flex border border-zinc-800/80 rounded-lg">
          {METRIC_TABS.map(([value, label]) => {
            const enabled = validMetrics.includes(value);
            const selected = enabled && metric === value;
            return (
              <button
                key={value}
                type="button"
                disabled={!enabled}
                title={DISABLED_TITLE[(kind ?? "run") as ChartKinds]?.[value]}
                onClick={() => {
                  if (!enabled) return;
                  const patch: Partial<SessionChartSettings> = {
                    metric: value,
                  };
                  if (value === "pace" || value === "efficiency")
                    patch.cumulative = false;
                  onSessionChartPatch(patch);
                }}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium",
                  selected &&
                    "bg-sky-600/20 text-sky-200 ring-1 ring-sky-500/35",
                  !selected &&
                    enabled &&
                    "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                  !selected && !enabled && "text-zinc-600 opacity-60",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <Select
          name="metric"
          className="sm:hidden w-fit h-6 py-0 text-xs"
          value={metric}
          onChange={(e) => {
            const value = e.target.value as SessionChartMetric;
            const patch: Partial<SessionChartSettings> = { metric: value };
            if (value === "pace" || value === "efficiency") {
              patch.cumulative = false;
            }
            onSessionChartPatch(patch);
          }}
        >
          {METRIC_TABS.map(([value, label]) => (
            <option
              key={value}
              value={value}
              disabled={!validMetrics.includes(value)}
            >
              {label}
            </option>
          ))}
        </Select>
        <div className="hidden sm:flex border border-zinc-800/80 rounded-lg">
          {CHART_AGG_VALUES.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onSessionChartPatch({ agg: a })}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                agg === a && "bg-zinc-700/50 text-zinc-200",
                agg !== a &&
                  "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300",
              )}
            >
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>
        <Select
          name="aggregation"
          className="sm:hidden w-fit h-6 py-0 text-xs"
          value={agg}
          onChange={(e) =>
            onSessionChartPatch({ agg: e.target.value as SessionChartAgg })
          }
        >
          {(["day", "week", "month"] as const).map((a) => (
            <option key={a} value={a}>
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </option>
          ))}
        </Select>
        {stacked ? (
          <button
            type="button"
            aria-pressed={Boolean(proportional)}
            title="Stack proportionally"
            onClick={() => {
              onSessionChartPatch({ proportional: !proportional });
            }}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-medium",
              proportional &&
                "border-emerald-500/45 bg-emerald-600/15 text-emerald-200",
              !proportional &&
                "border-zinc-600/80 bg-zinc-900/35 text-zinc-400 hover:border-zinc-500 hover:bg-zinc-800/45 hover:text-zinc-200",
            )}
          >
            Proportional
          </button>
        ) : (
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
              if (cumulativeOk)
                onSessionChartPatch({ cumulative: !cumulative });
            }}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-medium",
              !cumulativeOk && "border-zinc-800/70 text-zinc-600 opacity-60",
              cumulativeOk &&
                cumulative &&
                "border-emerald-500/45 bg-emerald-600/15 text-emerald-200",
              cumulativeOk &&
                !cumulative &&
                "border-zinc-600/80 bg-zinc-900/35 text-zinc-400 hover:border-zinc-500 hover:bg-zinc-800/45 hover:text-zinc-200",
            )}
          >
            Cumulative
          </button>
        )}
      </div>
    </div>
  );
};
