import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { SessionChartRange } from "@/lib/constants/visuals";
import queryKeys from "@/lib/query-keys";
import { weightActions } from "@/server-fcts";

const VIEW_W = 800;
const VIEW_H = 280;
const PAD_L = 52;
const PAD_R = 20;
const PAD_T = 24;
const PAD_B = 40;
const CHART_HEIGHT = 280;

const sessionChartRangeLabel = (range: SessionChartRange): string => {
  switch (range) {
    case "3m":
      return "Last 3 months";
    case "6m":
      return "Last 6 months";
    case "12m":
      return "Last 12 months";
    case "ytd":
      return "Year to date";
    case "all":
      return "All time";
    default:
      return "";
  }
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

function pickYTicks(yMin: number, yMax: number): number[] {
  const span = yMax - yMin;
  if (span <= 0 || !Number.isFinite(span)) return [yMin];
  const step =
    span <= 5 ? 1 : span <= 20 ? 2 : span <= 50 ? 5 : Math.ceil(span / 4);
  const start = Math.floor(yMin / step) * step;
  const out: number[] = [];
  for (let v = start; v <= yMax + step * 0.01; v += step) {
    if (v >= yMin - 1e-6 && v <= yMax + 1e-6) out.push(Math.round(v * 10) / 10);
    if (out.length >= 5) break;
  }
  return out.length >= 2 ? out : [yMin, yMax];
}

type Props = {
  range: SessionChartRange;
};

export function WeightTrendChart({ range }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { data: points = [], isLoading } = useQuery({
    queryKey: queryKeys.weightViz(range),
    queryFn: () => weightActions.viz({ data: { range } }),
    placeholderData: keepPreviousData,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear hover on data change
  useEffect(() => {
    setHoverIdx(null);
  }, [points]);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    const values = sorted.map((p) => p.value);

    const now = new Date();
    const xTo = now;
    const xFrom = (() => {
      if (range === "all") return new Date(`${sorted[0].date}T12:00:00`);
      if (range === "ytd") return new Date(now.getFullYear(), 0, 1);
      const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
      return new Date(
        now.getFullYear(),
        now.getMonth() - months,
        now.getDate(),
      );
    })();

    const xSpan = xTo.getTime() - xFrom.getTime();
    const minW = Math.min(...values);
    const maxW = Math.max(...values);
    const padLb = Math.max(0.5, (maxW - minW) * 0.12 || 2);
    const yMin = minW - padLb;
    const yMax = maxW + padLb;
    const innerW = VIEW_W - PAD_L - PAD_R;
    const innerH = VIEW_H - PAD_T - PAD_B;

    const xAt = (date: Date) =>
      PAD_L +
      (xSpan <= 0
        ? innerW / 2
        : ((date.getTime() - xFrom.getTime()) / xSpan) * innerW);
    const yAt = (v: number) =>
      PAD_T + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    const lineD = sorted
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${xAt(new Date(`${p.date}T12:00:00`))} ${yAt(p.value)}`,
      )
      .join(" ");

    const firstX = xAt(new Date(`${sorted[0].date}T12:00:00`));
    const lastX = xAt(new Date(`${sorted[sorted.length - 1].date}T12:00:00`));
    const areaD =
      sorted.length >= 2
        ? `${lineD} L ${lastX} ${PAD_T + innerH} L ${firstX} ${PAD_T + innerH} Z`
        : null;

    const allTicks: Date[] = [];
    const cur = new Date(xFrom.getFullYear(), xFrom.getMonth(), 1);
    while (cur <= xTo) {
      allTicks.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    const xTicks =
      allTicks.length <= 3
        ? allTicks
        : [
            allTicks[0],
            allTicks[Math.floor(allTicks.length / 2)],
            allTicks[allTicks.length - 1],
          ];

    return {
      sorted,
      values,
      innerW,
      innerH,
      xAt,
      yAt,
      yMin,
      yMax,
      lineD,
      areaD,
      yTicks: pickYTicks(yMin, yMax),
      xTicks,
    };
  }, [points, range]);

  const chartBody = () => {
    if (isLoading) {
      return (
        <div
          className="flex items-center justify-center"
          style={{ height: CHART_HEIGHT }}
          aria-busy="true"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
        </div>
      );
    }

    if (!geometry) {
      return (
        <div
          className="flex items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          <p className="text-sm text-zinc-500">
            No weight entries in {sessionChartRangeLabel(range)}. Log weight
            from a day on the calendar, or widen the range.
          </p>
        </div>
      );
    }

    const {
      sorted,
      values,
      innerW,
      innerH,
      xAt,
      yAt,
      lineD,
      areaD,
      yTicks,
      xTicks,
    } = geometry;
    const n = sorted.length;

    return (
      <svg
        className="h-auto w-full max-w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
      >
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

        {yTicks.map((lb) => {
          const y = yAt(lb);
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
                className="fill-zinc-500"
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
          className="fill-zinc-600"
          fontSize={10}
        >
          lb
        </text>

        {areaD && (
          <path d={areaD} fill="url(#weight-area-fill)" stroke="none" />
        )}
        {lineD && (
          <path
            d={lineD}
            fill="none"
            stroke="rgb(52 211 153)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />
        )}

        {xTicks.map((d) => {
          const x = xAt(d);
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
            x1={xAt(new Date(`${sorted[hoverIdx].date}T12:00:00`))}
            x2={xAt(new Date(`${sorted[hoverIdx].date}T12:00:00`))}
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
          const cx = xAt(new Date(`${p.date}T12:00:00`));
          return (
            <circle
              key={p.date}
              cx={cx}
              cy={yAt(p.value)}
              r={isHovered ? 3.75 : 3}
              fill="rgb(24 24 27)"
              stroke="rgb(244 244 245)"
              strokeWidth={1}
              opacity={isHovered ? 1 : 0.6}
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
            const cx = xAt(new Date(`${p.date}T12:00:00`));
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
                  {p.value.toFixed(1)} lb
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
              const cx = xAt(new Date(`${sorted[i].date}T12:00:00`));
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
    );
  };

  return (
    <section
      aria-label="Weight trend chart"
      className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
    >
      {chartBody()}
    </section>
  );
}
