import { useEffect, useMemo, useState } from "react";
import {
  nearestSessionIndexFromSvgX,
  svgLocalXFromMouse,
} from "~/lib/chart-svg-interaction";
import type { WeightEntryRow } from "~/lib/db/schema";
import type { SessionChartRange } from "~/lib/home/session-chart-settings";
import { sessionChartRangeLabel } from "~/lib/home/session-chart-settings";

const VIEW_W = 800;
const VIEW_H = 240;
const PAD_L = 52;
const PAD_R = 20;
const PAD_T = 20;
const PAD_B = 44;

const RANGE_OPTIONS: { value: SessionChartRange; label: string }[] = [
  { value: "3m", label: "3 mo" },
  { value: "6m", label: "6 mo" },
  { value: "12m", label: "12 mo" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All" },
];

function shortDateLabel(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return dayKey;
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function pickXTickIndices(n: number): number[] {
  if (n <= 0) {
    return [];
  }
  if (n === 1) {
    return [0];
  }
  if (n <= 4) {
    return Array.from({ length: n }, (_, i) => i);
  }
  return [0, Math.floor(n / 2), n - 1];
}

function pickYTicks(yMin: number, yMax: number): number[] {
  const span = yMax - yMin;
  if (span <= 0 || !Number.isFinite(span)) {
    return [yMin];
  }
  const step =
    span <= 5 ? 1 : span <= 20 ? 2 : span <= 50 ? 5 : Math.ceil(span / 4);
  const start = Math.floor(yMin / step) * step;
  const out: number[] = [];
  for (let v = start; v <= yMax + step * 0.01; v += step) {
    if (v >= yMin - 1e-6 && v <= yMax + 1e-6) {
      out.push(Math.round(v * 10) / 10);
    }
    if (out.length >= 5) {
      break;
    }
  }
  if (out.length < 2) {
    return [yMin, yMax];
  }
  return out;
}

type Props = {
  entries: WeightEntryRow[];
  range: SessionChartRange;
  onRangeChange: (range: SessionChartRange) => void;
  onSelectDayKey?: (dayKey: string) => void;
  selectedDayKey?: string | null;
  isLoading?: boolean;
};

export function WeightTrendChart({
  entries,
  range,
  onRangeChange,
  onSelectDayKey,
  selectedDayKey,
  isLoading = false,
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = useMemo(() => {
    return [...entries].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [entries]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear hover when series / range changes
  useEffect(() => {
    setHoverIdx(null);
  }, [entries, range]);

  const hoverTooltipRows = useMemo(():
    | { text: string; className: string }[]
    | null => {
    if (series.length === 0) {
      return null;
    }
    if (hoverIdx == null || hoverIdx < 0 || hoverIdx >= series.length) {
      return null;
    }
    const e = series[hoverIdx];
    if (!e) {
      return null;
    }
    return [
      { text: shortDateLabel(e.dayKey), className: "fill-zinc-300" },
      {
        text: `${e.weightLb.toFixed(1)} lb`,
        className: "fill-emerald-400",
      },
    ];
  }, [hoverIdx, series]);

  const geometry = useMemo(() => {
    if (series.length === 0) {
      return null;
    }
    const weights = series.map((e) => e.weightLb);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const padLb = Math.max(0.5, (maxW - minW) * 0.12 || 2);
    const yMin = minW - padLb;
    const yMax = maxW + padLb;
    const innerW = VIEW_W - PAD_L - PAD_R;
    const innerH = VIEW_H - PAD_T - PAD_B;
    const n = series.length;

    const xAt = (i: number) =>
      PAD_L + (n <= 1 ? innerW / 2 : (i / Math.max(1, n - 1)) * innerW);
    const yAt = (lb: number) =>
      PAD_T + innerH - ((lb - yMin) / (yMax - yMin)) * innerH;

    const lineD = series
      .map((e, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(e.weightLb)}`)
      .join(" ");

    const areaD =
      n >= 2
        ? `${series
            .map(
              (e, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(e.weightLb)}`,
            )
            .join(
              " ",
            )} L ${xAt(n - 1)} ${PAD_T + innerH} L ${xAt(0)} ${PAD_T + innerH} Z`
        : null;

    const yTicks = pickYTicks(yMin, yMax);
    const xTicks = pickXTickIndices(n);

    return {
      series,
      yMin,
      yMax,
      innerW,
      innerH,
      xAt,
      yAt,
      lineD,
      areaD,
      yTicks,
      xTicks,
    };
  }, [series]);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Range
      </span>
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
    </div>
  );

  if (isLoading) {
    return (
      <section
        aria-label="Weight trend chart"
        className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
      >
        {toolbar}
        <div
          className="flex h-[240px] items-center justify-center px-4 py-6"
          aria-busy="true"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
        </div>
      </section>
    );
  }

  if (series.length === 0) {
    return (
      <section
        aria-label="Weight trend chart"
        className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
      >
        {toolbar}
        <p className="px-4 py-6 text-sm text-zinc-500">
          No weight entries in {sessionChartRangeLabel(range)}. Log weight from
          a day on the calendar, or widen the range.
        </p>
      </section>
    );
  }

  if (!geometry) {
    return null;
  }

  const { lineD, areaD, yTicks, xTicks, xAt, yAt, yMin, yMax, innerW } =
    geometry;
  const innerH = VIEW_H - PAD_T - PAD_B;
  const n = series.length;

  const ariaLabel = `${sessionChartRangeLabel(range)} · Weight trend, ${series.length} entries from ${series[0]?.dayKey} to ${series[series.length - 1]?.dayKey}`;
  const interactive = Boolean(onSelectDayKey);

  return (
    <section
      aria-label="Weight trend chart"
      className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
    >
      {toolbar}
      <div className="p-4">
        <svg
          className="h-auto w-full max-w-full"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={ariaLabel}
        >
          <title>{ariaLabel}</title>
          <defs>
            <linearGradient id="weight-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="rgb(16 185 129)"
                stopOpacity="0.22"
              />
              <stop
                offset="100%"
                stopColor="rgb(16 185 129)"
                stopOpacity="0.02"
              />
            </linearGradient>
          </defs>

          {yTicks.map((lb) => {
            const y = PAD_T + innerH - ((lb - yMin) / (yMax - yMin)) * innerH;
            return (
              <g key={`y-${lb}`}>
                <line
                  x1={PAD_L}
                  y1={y}
                  x2={VIEW_W - PAD_R}
                  y2={y}
                  stroke="rgb(39 39 42)"
                  strokeWidth={1}
                />
                <text
                  x={PAD_L - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-zinc-500 text-[11px]"
                  fontSize={11}
                >
                  {lb.toFixed(1)}
                </text>
              </g>
            );
          })}

          <text
            x={12}
            y={VIEW_H / 2}
            transform={`rotate(-90 12 ${VIEW_H / 2})`}
            textAnchor="middle"
            className="fill-zinc-600 text-[10px]"
            fontSize={10}
          >
            lb
          </text>

          {areaD ? (
            <path d={areaD} fill="url(#weight-area-fill)" stroke="none" />
          ) : null}

          <path
            d={lineD}
            fill="none"
            stroke="rgb(52 211 153)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />

          {interactive && hoverIdx != null && hoverIdx >= 0 && hoverIdx < n ? (
            <line
              x1={xAt(hoverIdx)}
              x2={xAt(hoverIdx)}
              y1={PAD_T}
              y2={VIEW_H - PAD_B}
              stroke="rgb(113 113 122)"
              strokeWidth={1}
              strokeOpacity={0.45}
              pointerEvents="none"
            />
          ) : null}

          {series.map((e, i) => {
            const cx = xAt(i);
            const cy = yAt(e.weightLb);
            const r = series.length === 1 ? 5 : 4;
            const isSelected =
              selectedDayKey != null && e.dayKey === selectedDayKey;
            const isHoveredColumn =
              interactive && hoverIdx != null && hoverIdx === i;
            const isHighlighted = isSelected || isHoveredColumn;
            return (
              <g key={e.id}>
                {isSelected ? (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 5}
                    fill="none"
                    stroke="rgb(56 189 248)"
                    strokeWidth={2}
                    strokeOpacity={0.85}
                    pointerEvents="none"
                  />
                ) : null}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="rgb(16 185 129)"
                  stroke={isSelected ? "rgb(56 189 248)" : "rgb(24 24 27)"}
                  strokeWidth={isSelected ? 2 : 1}
                  pointerEvents="none"
                  opacity={interactive && !isHighlighted ? 0.28 : 1}
                >
                  {!interactive ? (
                    <title>
                      {shortDateLabel(e.dayKey)} · {e.weightLb.toFixed(1)} lb
                    </title>
                  ) : null}
                </circle>
              </g>
            );
          })}

          {interactive &&
          hoverIdx != null &&
          hoverIdx >= 0 &&
          hoverIdx < n &&
          hoverTooltipRows != null &&
          hoverTooltipRows.length > 0
            ? (() => {
                const cx = xAt(hoverIdx);
                const lineH = 14;
                const topY = PAD_T + 2;
                return (
                  <g pointerEvents="none">
                    {hoverTooltipRows.map((row, i) => (
                      <text
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed tooltip lines per column
                        key={`${hoverIdx}-${i}-${row.text}`}
                        x={cx}
                        y={topY + 12 + i * lineH}
                        textAnchor="middle"
                        className={row.className}
                        fontSize={11}
                      >
                        {row.text}
                      </text>
                    ))}
                  </g>
                );
              })()
            : null}

          {xTicks.map((i) => {
            const e = series[i];
            if (!e) {
              return null;
            }
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: SVG axis label (same pattern as activity chart)
              <text
                key={`x-${e.id}`}
                x={xAt(i)}
                y={VIEW_H - 12}
                textAnchor="middle"
                className={
                  interactive
                    ? "cursor-pointer outline-none focus:outline-none fill-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:fill-zinc-200"
                    : "fill-zinc-500"
                }
                fontSize={11}
                onPointerDown={
                  interactive
                    ? (ev) => {
                        if (ev.pointerType === "mouse") {
                          ev.preventDefault();
                        }
                      }
                    : undefined
                }
                onClick={
                  interactive ? () => onSelectDayKey?.(e.dayKey) : undefined
                }
                onKeyDown={
                  interactive
                    ? (ev) => {
                        if (ev.key !== "Enter" && ev.key !== " ") {
                          return;
                        }
                        ev.preventDefault();
                        onSelectDayKey?.(e.dayKey);
                      }
                    : undefined
                }
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={`Go to ${shortDateLabel(e.dayKey)} on the calendar`}
              >
                {shortDateLabel(e.dayKey)}
              </text>
            );
          })}

          {interactive && onSelectDayKey ? (
            // biome-ignore lint/a11y/noStaticElementInteractions: chart scrubber
            <rect
              x={PAD_L}
              y={PAD_T}
              width={innerW}
              height={innerH}
              fill="transparent"
              className="cursor-crosshair"
              onMouseMove={(e) => {
                const svg = e.currentTarget.ownerSVGElement;
                const x = svgLocalXFromMouse(e, svg);
                if (x == null) {
                  return;
                }
                setHoverIdx(
                  nearestSessionIndexFromSvgX(
                    x,
                    n,
                    xAt,
                    (i) => series[i] != null,
                  ),
                );
              }}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={(e) => {
                const svg = e.currentTarget.ownerSVGElement;
                const x = svgLocalXFromMouse(e, svg);
                if (x == null) {
                  return;
                }
                const idx = nearestSessionIndexFromSvgX(
                  x,
                  n,
                  xAt,
                  (i) => series[i] != null,
                );
                if (idx != null) {
                  const row = series[idx];
                  if (row) {
                    onSelectDayKey(row.dayKey);
                  }
                }
              }}
            />
          ) : null}
        </svg>
      </div>
    </section>
  );
}
