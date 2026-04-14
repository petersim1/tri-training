import { useEffect, useMemo, useState } from "react";
import {
  nearestIndexFromSvgX,
  svgLocalXFromMouse,
} from "~/lib/chart-svg-interaction";
import type { WeightEntryRow } from "~/lib/db/schema";

const VIEW_W = 800;
const VIEW_H = 240;
const PAD_L = 52;
const PAD_R = 20;
const PAD_T = 20;
const PAD_B = 44;

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
  /** When set, clicking a point opens the same day modal as the calendar. */
  onSelectDayKey?: (dayKey: string) => void;
  /** Highlights the active point when the day modal is open (YYYY-MM-DD). */
  selectedDayKey?: string | null;
};

export function WeightTrendChart({
  entries,
  onSelectDayKey,
  selectedDayKey,
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = useMemo(() => {
    return [...entries].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [entries]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear hover when series changes (Biome flags prop deps)
  useEffect(() => {
    setHoverIdx(null);
  }, [entries]);

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

  if (series.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-10 text-center text-sm text-zinc-500">
        No weight entries yet. Log weight from a day on the calendar to see a
        trend.
      </div>
    );
  }

  if (!geometry) {
    return null;
  }

  const { lineD, areaD, yTicks, xTicks, xAt, yAt, yMin, yMax, innerW } =
    geometry;
  const innerH = VIEW_H - PAD_T - PAD_B;
  const n = series.length;

  const ariaLabel = `Weight trend, ${series.length} entries from ${series[0]?.dayKey} to ${series[series.length - 1]?.dayKey}`;
  const interactive = Boolean(onSelectDayKey);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <svg
        className="h-auto w-full max-w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        <defs>
          <linearGradient id="weight-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.22" />
            <stop
              offset="100%"
              stopColor="rgb(16 185 129)"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>

        {/* Y grid + labels */}
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

        {/* X tick labels */}
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
          // biome-ignore lint/a11y/noStaticElementInteractions: chart scrubber; x-nearest column matches hover line + click
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
              setHoverIdx(nearestIndexFromSvgX(x, n, xAt));
            }}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={(e) => {
              const svg = e.currentTarget.ownerSVGElement;
              const x = svgLocalXFromMouse(e, svg);
              if (x == null) {
                return;
              }
              const idx = nearestIndexFromSvgX(x, n, xAt);
              const row = series[idx];
              if (row) {
                onSelectDayKey(row.dayKey);
              }
            }}
          />
        ) : null}
      </svg>
    </div>
  );
}
