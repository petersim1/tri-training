import { scaleLinear, scaleTime, ticks } from "d3";
import { useMemo, useState } from "react";
import {
  type SessionChartMetric,
  type SessionChartRange,
  VALID_CUMULATIVE,
} from "@/lib/constants/visuals";
import type { VizResult } from "@/types/responses/activities";

const PAD_L = 52;
const PAD_R = 20;
const PAD_T = 20;
const PAD_B = 36;
const VIEW_W = 1200;
const VIEW_H = 280;
const CHART_HEIGHT = 280;

const BAR_FILL: Record<SessionChartMetric, string> = {
  volume: "rgb(167 139 250)",
  time: "rgb(52 211 153)",
  distance: "rgb(16 185 129)",
  efficiency: "rgb(56 189 248)",
  pace: "rgb(251 191 36)",
};

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function shortDateLabel(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatValue(v: number, metric: SessionChartMetric) {
  if (metric === "volume")
    return v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(0);
  if (metric === "distance") return v < 10 ? v.toFixed(2) : v.toFixed(1);
  if (metric === "efficiency") return v.toFixed(3);
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
}

function yAxisLabel(metric: SessionChartMetric) {
  if (metric === "volume") return "kg×reps";
  if (metric === "distance") return "mi";
  if (metric === "efficiency") return "m/beat";
  if (metric === "pace") return "mph";
  return "min";
}

function rangeToDateBounds(range: string): { from: Date; to: Date } | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "ytd")
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  return {
    from: new Date(now.getFullYear(), now.getMonth() - months, now.getDate()),
    to: now,
  };
}

function convert(value: number, metric: SessionChartMetric): number {
  switch (metric) {
    case "distance":
      return value / 1609.344;
    case "time":
      return value / 60;
    case "pace":
      return value * 2.23694;
    default:
      return value;
  }
}

type Props = {
  points: VizResult[];
  metric: SessionChartMetric;
  range: SessionChartRange;
  cumulative: boolean;
  isLoading: boolean;
};

export function ActivityMetricsChartPlot({
  points,
  metric,
  range,
  cumulative,
  isLoading,
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const fill = BAR_FILL[metric];
  const cumulativeOk = VALID_CUMULATIVE[metric];

  const geometry = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    const bounds = rangeToDateBounds(range);
    const xFrom =
      bounds?.from ??
      (sorted.length > 0 ? new Date(`${sorted[0].date}T12:00:00`) : new Date());
    const xTo =
      bounds?.to ??
      (sorted.length > 0
        ? new Date(`${sorted[sorted.length - 1].date}T12:00:00`)
        : new Date());

    const innerW = VIEW_W - PAD_L - PAD_R;
    const innerH = VIEW_H - PAD_T - PAD_B;

    const xScale = scaleTime()
      .domain([xFrom, xTo])
      .range([PAD_L, PAD_L + innerW]);

    const values = sorted.map((p) => convert(p.value, metric));
    let run = 0;
    const displayValues =
      cumulative && cumulativeOk
        ? values.map((v) => {
            run += v;
            return run;
          })
        : values;

    const hasData = values.some((v) => v > 0);
    const yMax = Math.max(...displayValues, 1e-6);

    const yScale = scaleLinear()
      .domain([0, yMax])
      .range([PAD_T + innerH, PAD_T]);

    const barW = Math.min(
      10,
      Math.max(2, (innerW / Math.max(sorted.length, 1)) * 0.5),
    );

    // X ticks: up to 3 month boundaries
    const allMonthTicks = xScale.ticks(12);
    const xTicks =
      allMonthTicks.length <= 3
        ? allMonthTicks
        : [
            allMonthTicks[0],
            allMonthTicks[Math.floor(allMonthTicks.length / 2)],
            allMonthTicks[allMonthTicks.length - 1],
          ];

    // Y ticks via d3
    const yTicks = ticks(0, yMax, 5);

    return {
      sorted,
      displayValues,
      hasData,
      xScale,
      yScale,
      baselineY: yScale(0),
      barW,
      innerW,
      innerH,
      yTicks,
      xTicks,
      n: sorted.length,
    };
  }, [points, range, metric, cumulative, cumulativeOk]);

  const {
    sorted,
    displayValues,
    hasData,
    xScale,
    yScale,
    baselineY,
    barW,
    innerW,
    innerH,
    yTicks,
    xTicks,
    n,
  } = geometry;

  return (
    <div style={{ height: CHART_HEIGHT }}>
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
        </div>
      ) : !hasData ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-zinc-500">
            No data for the current filters.
          </p>
        </div>
      ) : (
        <svg
          className="h-full w-full"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
        >
          <g pointerEvents="none" opacity={0.4}>
            {yTicks.map((lb) => {
              const y = yScale(lb);
              return (
                <g key={`yl-${lb}`}>
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
                    className="fill-zinc-500"
                    fontSize={11}
                  >
                    {formatValue(lb, metric)}
                  </text>
                </g>
              );
            })}
            <text
              x={10}
              y={VIEW_H / 2}
              transform={`rotate(-90 10 ${VIEW_H / 2})`}
              textAnchor="middle"
              className="fill-zinc-500"
              fontSize={10}
            >
              {yAxisLabel(metric)}
            </text>
          </g>

          {cumulative && cumulativeOk
            ? n >= 2 && (
                <polyline
                  fill="none"
                  stroke={fill}
                  strokeWidth={2}
                  strokeOpacity={0.92}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pointerEvents="none"
                  points={sorted
                    .map(
                      (p, i) =>
                        `${xScale(new Date(`${p.date}T12:00:00`))},${yScale(displayValues[i] ?? 0)}`,
                    )
                    .join(" ")}
                />
              )
            : sorted.map((p, i) => {
                const v = displayValues[i] ?? 0;
                const cx = xScale(new Date(`${p.date}T12:00:00`));
                const topY = yScale(v);
                return (
                  <rect
                    key={`${p.date}-${i}`}
                    x={cx - barW / 2}
                    y={topY}
                    width={barW}
                    height={Math.max(0, baselineY - topY)}
                    fill={fill}
                    opacity={0.88}
                    rx={1}
                    pointerEvents="none"
                  />
                );
              })}

          {xTicks.map((d) => {
            const x = xScale(d);
            if (x < PAD_L || x > VIEW_W - PAD_R) return null;
            return (
              <g key={d.toISOString()} pointerEvents="none">
                <line
                  x1={x}
                  y1={VIEW_H - PAD_B}
                  x2={x}
                  y2={VIEW_H - PAD_B + 3}
                  stroke="rgb(63 63 70)"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={VIEW_H - 10}
                  textAnchor="middle"
                  className="fill-zinc-500/70"
                  fontSize={10}
                >
                  {monthLabel(d)}
                </text>
              </g>
            );
          })}

          {hoverIdx != null && hoverIdx >= 0 && hoverIdx < n && (
            <line
              x1={xScale(new Date(`${sorted[hoverIdx].date}T12:00:00`))}
              x2={xScale(new Date(`${sorted[hoverIdx].date}T12:00:00`))}
              y1={PAD_T}
              y2={VIEW_H - PAD_B}
              stroke="rgb(113 113 122)"
              strokeWidth={1}
              strokeOpacity={0.45}
              pointerEvents="none"
            />
          )}

          {sorted.map((p, i) => {
            const isHovered = hoverIdx === i;
            return (
              <circle
                key={`${p.date}-${i}`}
                cx={xScale(new Date(`${p.date}T12:00:00`))}
                cy={yScale(displayValues[i] ?? 0)}
                r={isHovered ? 3.75 : 3}
                fill="rgb(24 24 27)"
                stroke="rgb(244 244 245)"
                strokeWidth={1}
                opacity={isHovered ? 1 : 0.28}
                pointerEvents="none"
              />
            );
          })}

          {hoverIdx != null &&
            hoverIdx >= 0 &&
            hoverIdx < n &&
            (() => {
              const p = sorted[hoverIdx];
              if (!p) return null;
              const v = displayValues[hoverIdx] ?? 0;
              const cx = xScale(new Date(`${p.date}T12:00:00`));
              return (
                <g pointerEvents="none">
                  <text
                    x={cx}
                    y={PAD_T - 8}
                    textAnchor="middle"
                    className="fill-zinc-300"
                    fontSize={11}
                  >
                    {shortDateLabel(p.date)}
                  </text>
                  <text
                    x={cx}
                    y={PAD_T + 6}
                    textAnchor="middle"
                    className="fill-emerald-400"
                    fontSize={11}
                  >
                    {formatValue(v, metric)} {yAxisLabel(metric)}
                  </text>
                </g>
              );
            })()}

          {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG chart scrubber */}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={innerW}
            height={innerH}
            fill="transparent"
            className="cursor-crosshair"
            onMouseMove={(e) => {
              const svg = e.currentTarget.ownerSVGElement;
              const pt = svg?.createSVGPoint();
              if (!pt) return;
              pt.x = e.clientX;
              pt.y = e.clientY;
              const local = pt.matrixTransform(svg?.getScreenCTM()?.inverse());
              let closest = 0;
              let minDist = Infinity;
              for (let i = 0; i < n; i++) {
                const cx = xScale(new Date(`${sorted[i].date}T12:00:00`));
                const d = Math.abs(cx - local.x);
                if (d < minDist) {
                  minDist = d;
                  closest = i;
                }
              }
              setHoverIdx(closest);
            }}
            onMouseLeave={() => setHoverIdx(null)}
          />
        </svg>
      )}
    </div>
  );
}
