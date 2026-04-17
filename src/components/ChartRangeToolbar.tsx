import type { SessionChartRange } from "~/lib/home/session-chart-settings";

const RANGE_OPTIONS: { value: SessionChartRange; label: string }[] = [
  { value: "3m", label: "3 mo" },
  { value: "6m", label: "6 mo" },
  { value: "12m", label: "12 mo" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All" },
];

type Props = {
  range: SessionChartRange;
  onRangeChange: (range: SessionChartRange) => void;
  className?: string;
};

/** Shared date preset for activity + weight charts (same `sessionChart.range` in the DB). */
export function ChartRangeToolbar({
  range,
  onRangeChange,
  className = "",
}: Props) {
  return (
    <fieldset
      className={`m-0 flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-zinc-800/90 bg-zinc-950 px-3 py-2.5 shadow-sm ${className}`}
    >
      <legend className="sr-only">Chart date range</legend>
      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onRangeChange(opt.value)}
            className={
              range === opt.value
                ? "rounded-md bg-emerald-600/20 px-2 py-1 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-500/35"
                : "rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
