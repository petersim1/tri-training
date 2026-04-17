import { useEffect, useMemo, useState } from "react";
import {
  nearestSessionIndexFromSvgX,
  svgLocalXFromMouse,
} from "~/lib/chart-svg-interaction";
import type {
  SessionChartMetric,
  SessionChartSettings,
} from "~/lib/home/session-chart-settings";
import type {
  ActivityPlotKind,
  ActivityPlotPoint,
} from "~/lib/plans/activity-plot-points";

export type {
  ActivityPlotKind,
  ActivityPlotPoint,
} from "~/lib/plans/activity-plot-points";

const VIEW_W = 800;
const VIEW_H = 280;
const PAD_L = 52;
const PAD_R = 20;
const PAD_T = 8;
const PAD_B = 40;

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

function enumerateDayKeysInclusive(from: string, to: string): string[] {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [from];
  }
  if (start > end) {
    return [from];
  }
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

type PlotDay = {
  dayKey: string;
  point: ActivityPlotPoint | null;
};

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
  const rawStep =
    span <= 5 ? 1 : span <= 20 ? 2 : span <= 50 ? 5 : Math.ceil(span / 4);
  const step = rawStep <= 0 ? 1 : rawStep;
  const start = Math.floor(yMin / step) * step;
  const out: number[] = [];
  for (let v = start; v <= yMax + step * 0.01; v += step) {
    if (v >= yMin - 1e-6 && v <= yMax + 1e-6) {
      out.push(Math.round(v * 100) / 100);
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

function rawMetricValue(
  point: ActivityPlotPoint | null,
  metric: SessionChartMetric,
  isLift: boolean,
): number {
  if (!point) {
    return 0;
  }
  if (isLift || metric === "time") {
    const t = point.timeMin;
    return t != null && Number.isFinite(t) ? t : 0;
  }
  if (metric === "distance") {
    const d = point.distanceKm;
    return d != null && Number.isFinite(d) ? d : 0;
  }
  const d = point.distanceKm;
  const t = point.timeMin;
  if (
    d != null &&
    t != null &&
    d > 0 &&
    Number.isFinite(d) &&
    Number.isFinite(t)
  ) {
    return t / d;
  }
  return 0;
}

function formatYTick(
  v: number,
  metric: SessionChartMetric,
  isLift: boolean,
): string {
  if (isLift || metric === "time") {
    return v < 10 ? v.toFixed(1) : Math.round(v).toString();
  }
  if (metric === "distance") {
    return v < 10 ? v.toFixed(2) : v.toFixed(1);
  }
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
}

function yAxisLabel(metric: SessionChartMetric, isLift: boolean): string {
  if (isLift || metric === "time") {
    return "min";
  }
  if (metric === "distance") {
    return "km";
  }
  return "min/km";
}

type Props = {
  kind: ActivityPlotKind;
  onKindChange: (k: ActivityPlotKind) => void;
  points: ActivityPlotPoint[];
  sessionChart: SessionChartSettings;
  onSessionChartPatch: (patch: Partial<SessionChartSettings>) => void;
  onSelectDayKey?: (dayKey: string) => void;
  selectedDayKey?: string | null;
  emptyCopy?: "filtered" | "all";
  /** Shown while plans query is loading. */
  isLoading?: boolean;
};

const KIND_LABEL: Record<ActivityPlotKind, string> = {
  run: "Run",
  bike: "Bike",
  swim: "Swim",
  lift: "Lift",
};

export function ActivityMetricsChart({
  kind,
  onKindChange,
  points,
  sessionChart,
  onSessionChartPatch,
  onSelectDayKey,
  selectedDayKey,
  emptyCopy = "all",
  isLoading = false,
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const isCardio = kind !== "lift";
  const effectiveMetric: SessionChartMetric = isCardio
    ? sessionChart.metric
    : "time";
  const cumulativeOk = isCardio && effectiveMetric !== "pace";
  const cumulative = cumulativeOk && sessionChart.cumulative;

  const sorted = useMemo(() => {
    return [...points].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [points]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <intentional>
  useEffect(() => {
    setHoverIdx(null);
  }, [points, kind, sessionChart]);

  const barGeometry = useMemo(() => {
    if (sorted.length === 0) {
      return null;
    }
    const minKey = sorted[0]?.dayKey ?? "";
    const maxKey = sorted[sorted.length - 1]?.dayKey ?? minKey;
    const byDay = new Map<string, ActivityPlotPoint>();
    for (const p of sorted) {
      byDay.set(p.dayKey, p);
    }
    const dayKeysDense = enumerateDayKeysInclusive(minKey, maxKey);
    const plotDays: PlotDay[] = dayKeysDense.map((dayKey) => ({
      dayKey,
      point: byDay.get(dayKey) ?? null,
    }));
    const sessionCount = sorted.reduce((acc, p) => {
      const parts = p.id.split("+").filter(Boolean);
      return acc + (parts.length > 0 ? parts.length : 1);
    }, 0);

    const rawPerDay = plotDays.map((pd) =>
      rawMetricValue(pd.point, effectiveMetric, !isCardio),
    );

    let hasAny = false;
    for (const v of rawPerDay) {
      if (v > 0) {
        hasAny = true;
        break;
      }
    }
    if (!hasAny) {
      return { empty: true as const };
    }

    let run = 0;
    const displayPerDay = cumulative
      ? rawPerDay.map((v) => {
          run += v;
          return run;
        })
      : rawPerDay;

    const yMax = Math.max(...displayPerDay, 1e-6);
    const yMin = 0;
    const pad = Math.max(yMax * 0.08, yMax * 0.02);
    const yTop = yMax + pad;

    const n = plotDays.length;
    const innerW = VIEW_W - PAD_L - PAD_R;
    const innerH = VIEW_H - PAD_T - PAD_B;
    const baselineY = PAD_T + innerH;
    const xAt = (i: number) =>
      PAD_L + (n <= 1 ? innerW / 2 : (i / Math.max(1, n - 1)) * innerW);

    const barW = Math.min(24, Math.max(0.5, (innerW / Math.max(1, n)) * 0.72));

    const yAt = (v: number) =>
      PAD_T + innerH - ((v - yMin) / (yTop - yMin)) * innerH;

    const yTicks = pickYTicks(yMin, yTop);

    return {
      empty: false as const,
      n,
      sessionCount,
      plotDays,
      displayPerDay,
      xAt,
      yAt,
      baselineY,
      barW,
      yMin,
      yTop,
      yTicks,
      xTicks: pickXTickIndices(n),
      innerW,
      innerH,
    };
  }, [sorted, isCardio, effectiveMetric, cumulative]);

  const hoverTooltipRows = useMemo(():
    | { text: string; className: string }[]
    | null => {
    if (!barGeometry || barGeometry.empty) {
      return null;
    }
    const { plotDays, displayPerDay } = barGeometry;
    if (hoverIdx == null || hoverIdx < 0 || hoverIdx >= plotDays.length) {
      return null;
    }
    const row = plotDays[hoverIdx];
    if (!row) {
      return null;
    }
    const p = row.point;
    const v = displayPerDay[hoverIdx] ?? 0;
    const dateRow = {
      text: shortDateLabel(row.dayKey),
      className: "fill-zinc-300",
    };
    let line2: string;
    if (cumulative) {
      if (!isCardio || effectiveMetric === "time") {
        line2 = `Cumulative: ${v.toFixed(1)} min`;
      } else if (effectiveMetric === "distance") {
        line2 = `Cumulative: ${v.toFixed(2)} km`;
      } else {
        line2 = "—";
      }
    } else if (!isCardio || effectiveMetric === "time") {
      line2 =
        p?.timeMin != null && Number.isFinite(p.timeMin)
          ? `${p.timeMin.toFixed(1)} min`
          : "0 min";
    } else if (effectiveMetric === "distance") {
      line2 =
        p?.distanceKm != null && Number.isFinite(p.distanceKm)
          ? `${p.distanceKm.toFixed(2)} km`
          : "0 km";
    } else {
      line2 =
        p?.distanceKm != null &&
        p.distanceKm > 0 &&
        p?.timeMin != null &&
        Number.isFinite(p.timeMin)
          ? `${(p.timeMin / p.distanceKm).toFixed(2)} min/km`
          : "—";
    }
    return [dateRow, { text: line2, className: "fill-emerald-400" }];
  }, [barGeometry, hoverIdx, isCardio, effectiveMetric, cumulative]);

  const tabs = (
    <div
      className="flex flex-wrap gap-1.5"
      role="tablist"
      aria-label="Activity for chart"
    >
      {(["run", "bike", "swim", "lift"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={kind === k}
          onClick={() => onKindChange(k)}
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
  );

  const chartHeader = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-800/80 px-4 py-3">
      {tabs}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {isCardio ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["distance", "Distance"],
                ["time", "Time"],
                ["pace", "Pace"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  const patch: Partial<SessionChartSettings> = {
                    metric: value,
                  };
                  if (value === "pace") {
                    patch.cumulative = false;
                  }
                  onSessionChartPatch(patch);
                }}
                className={
                  sessionChart.metric === value
                    ? "rounded-md bg-sky-600/20 px-2 py-1 text-[11px] font-medium text-sky-200 ring-1 ring-sky-500/35"
                    : "rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <label
          className={`flex cursor-pointer items-center gap-2 text-[11px] ${
            cumulativeOk ? "text-zinc-400" : "cursor-not-allowed text-zinc-600"
          }`}
        >
          <input
            type="checkbox"
            className="rounded border-zinc-600 bg-zinc-900"
            checked={cumulativeOk && sessionChart.cumulative}
            disabled={!cumulativeOk}
            onChange={(e) =>
              onSessionChartPatch({ cumulative: e.target.checked })
            }
          />
          Cumulative
        </label>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <section
        aria-label="Activity metrics chart"
        className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
      >
        {chartHeader}
        <div
          className="flex h-[280px] items-center justify-center px-4 py-6"
          aria-busy="true"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
        </div>
      </section>
    );
  }

  if (sorted.length === 0) {
    return (
      <section
        aria-label="Activity metrics chart"
        className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
      >
        {chartHeader}
        <p className="px-4 py-6 text-sm text-zinc-500">
          {emptyCopy === "filtered" ? (
            <>
              No completed sessions with linked data for {KIND_LABEL[kind]} in
              this range. Complete a workout and link Strava or Hevy, or widen
              the date filters.
            </>
          ) : (
            <>
              No completed sessions with linked data for {KIND_LABEL[kind]}.
              Complete a workout and link Strava or Hevy.
            </>
          )}
        </p>
      </section>
    );
  }

  if (!barGeometry || barGeometry.empty) {
    return (
      <section
        aria-label="Activity metrics chart"
        className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
      >
        {chartHeader}
        <p className="px-4 py-6 text-sm text-zinc-500">
          {emptyCopy === "filtered" ? (
            <>
              No usable metrics for {KIND_LABEL[kind]} in this range (e.g.
              distance and time for pace).
            </>
          ) : (
            <>
              No usable metrics for {KIND_LABEL[kind]} with linked data in this
              range.
            </>
          )}
        </p>
      </section>
    );
  }

  const {
    n,
    plotDays,
    displayPerDay,
    xAt,
    yAt,
    baselineY,
    barW,
    yMin,
    yTop,
    yTicks,
    xTicks,
    innerW,
    innerH,
  } = barGeometry;

  const interactive = Boolean(onSelectDayKey);

  const barFill =
    effectiveMetric === "time" || !isCardio
      ? "rgb(52 211 153)"
      : effectiveMetric === "distance"
        ? "rgb(16 185 129)"
        : "rgb(251 191 36)";

  return (
    <section
      aria-label="Activity metrics chart"
      className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
    >
      {chartHeader}
      <svg
        className="h-auto w-full max-w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
      >
        <g pointerEvents="none" opacity={0.4}>
          {yTicks.map((lb) => {
            const y = PAD_T + innerH - ((lb - yMin) / (yTop - yMin)) * innerH;
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
                  className="fill-zinc-500 text-[11px]"
                  fontSize={11}
                >
                  {formatYTick(lb, effectiveMetric, !isCardio)}
                </text>
              </g>
            );
          })}
          <text
            x={10}
            y={VIEW_H / 2}
            transform={`rotate(-90 10 ${VIEW_H / 2})`}
            textAnchor="middle"
            className="fill-zinc-500 text-[10px]"
            fontSize={10}
          >
            {yAxisLabel(effectiveMetric, !isCardio)}
          </text>
        </g>

        {cumulative ? (
          n >= 2 ? (
            <polyline
              fill="none"
              stroke={barFill}
              strokeWidth={2}
              strokeOpacity={0.92}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
              points={Array.from({ length: n }, (_, i) => {
                const v = displayPerDay[i] ?? 0;
                return `${xAt(i)},${yAt(v)}`;
              }).join(" ")}
            />
          ) : null
        ) : (
          plotDays.map((pd, i) => {
            const v = displayPerDay[i] ?? 0;
            const cx = xAt(i);
            const topY = yAt(v);
            const h = Math.max(0, baselineY - topY);
            const x = cx - barW / 2;
            return (
              <rect
                key={pd.dayKey}
                x={x}
                y={topY}
                width={barW}
                height={h}
                fill={barFill}
                opacity={0.88}
                rx={1}
                pointerEvents="none"
              />
            );
          })
        )}

        {xTicks.map((i) => {
          const e = plotDays[i];
          if (!e) {
            return null;
          }
          const pt = e.point;
          const canJump = pt != null;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: SVG axis label
            <text
              key={`x-${e.dayKey}`}
              x={xAt(i)}
              y={VIEW_H - 12}
              textAnchor="middle"
              className={
                interactive && canJump
                  ? "cursor-pointer outline-none focus:outline-none fill-zinc-400/80 underline decoration-zinc-600/80 underline-offset-2 hover:fill-zinc-200"
                  : "fill-zinc-500/70"
              }
              fontSize={11}
              onClick={
                interactive && canJump
                  ? () => onSelectDayKey?.(pt.dayKey)
                  : undefined
              }
              onKeyDown={
                interactive && canJump
                  ? (ev) => {
                      if (ev.key !== "Enter" && ev.key !== " ") {
                        return;
                      }
                      ev.preventDefault();
                      onSelectDayKey?.(pt.dayKey);
                    }
                  : undefined
              }
              role={interactive && canJump ? "button" : undefined}
              tabIndex={interactive && canJump ? 0 : undefined}
              aria-label={
                canJump
                  ? `Go to ${shortDateLabel(e.dayKey)} on the calendar`
                  : undefined
              }
            >
              {shortDateLabel(e.dayKey)}
            </text>
          );
        })}

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

        {plotDays.map((pd, ix) => {
          if (pd.point == null) {
            return null;
          }
          const cx = xAt(ix);
          const isSelected =
            selectedDayKey != null && pd.dayKey === selectedDayKey;
          const isHoveredColumn =
            interactive && hoverIdx != null && hoverIdx === ix;
          const isHighlighted = isSelected || isHoveredColumn;
          const markOpacity = isHighlighted ? 1 : 0.28;
          const cy = yAt(displayPerDay[ix] ?? 0);
          const r = 3;
          return (
            <g key={pd.dayKey} opacity={markOpacity}>
              <circle
                cx={cx}
                cy={cy}
                r={isHighlighted ? r + 0.75 : r}
                fill="rgb(24 24 27)"
                stroke="rgb(244 244 245)"
                strokeWidth={1}
                pointerEvents="none"
              />
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
                  (i) => plotDays[i]?.point != null,
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
                (i) => plotDays[i]?.point != null,
              );
              if (idx != null) {
                const row = plotDays[idx];
                if (row?.point) {
                  onSelectDayKey(row.point.dayKey);
                }
              }
            }}
          />
        ) : null}
      </svg>
    </section>
  );
}
