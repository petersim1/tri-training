import { useEffect, useMemo, useState } from "react";
import {
  nearestIndexFromSvgX,
  svgLocalXFromMouse,
} from "~/lib/chart-svg-interaction";
import type {
  ActivityPlotKind,
  ActivityPlotPoint,
} from "~/lib/plans/activity-plot-points";

export type {
  ActivityPlotKind,
  ActivityPlotPoint,
} from "~/lib/plans/activity-plot-points";

const VIEW_W = 800;
const VIEW_H = 260;
const PAD_L = 56;
const PAD_R = 56;
const PAD_T = 16;
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

function pathFromYs(
  ys: (number | null)[],
  xAt: (i: number) => number,
  yAt: (v: number) => number,
): string | null {
  let d = "";
  let started = false;
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    if (y == null || !Number.isFinite(y)) {
      started = false;
      continue;
    }
    const x = xAt(i);
    const yy = yAt(y);
    d += started ? ` L ${x} ${yy}` : `M ${x} ${yy}`;
    started = true;
  }
  return d || null;
}

type Props = {
  kind: ActivityPlotKind;
  onKindChange: (k: ActivityPlotKind) => void;
  points: ActivityPlotPoint[];
  /** When set, clicking a point or date label jumps the calendar to that day. */
  onSelectDayKey?: (dayKey: string) => void;
  /** Highlights the point(s) when that day is selected on the calendar. */
  selectedDayKey?: string | null;
  /**
   * `filtered`: copy references narrowing the date range (activities).
   * `all`: all-time series (home).
   */
  emptyCopy?: "filtered" | "all";
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
  onSelectDayKey,
  selectedDayKey,
  emptyCopy = "all",
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const isCardio = kind !== "lift";

  const sorted = useMemo(() => {
    return [...points].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [points]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear hover when series data changes (Biome flags prop deps)
  useEffect(() => {
    setHoverIdx(null);
  }, [points]);

  const geometry = useMemo(() => {
    if (sorted.length === 0) {
      return null;
    }
    const n = sorted.length;
    const innerW = VIEW_W - PAD_L - PAD_R;
    const innerH = VIEW_H - PAD_T - PAD_B;
    const xAt = (i: number) =>
      PAD_L + (n <= 1 ? innerW / 2 : (i / Math.max(1, n - 1)) * innerW);

    if (!isCardio) {
      const times = sorted
        .map((p) => p.timeMin)
        .filter((t): t is number => t != null && Number.isFinite(t));
      if (times.length === 0) {
        return { mode: "lift" as const, empty: true as const };
      }
      const tMin = Math.min(...times);
      const tMax = Math.max(...times);
      const pad = Math.max(0.5, (tMax - tMin) * 0.12 || 1);
      const yMin = tMin - pad;
      const yMax = tMax + pad;
      const yAt = (v: number) =>
        PAD_T + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
      const ys = sorted.map((p) => p.timeMin);
      const lineD = pathFromYs(ys, xAt, yAt);
      return {
        mode: "lift" as const,
        empty: false as const,
        cardioLayout: undefined as undefined,
        n,
        xAt,
        yAt,
        yMin,
        yMax,
        yTicks: pickYTicks(yMin, yMax),
        xTicks: pickXTickIndices(n),
        lineD,
        distD: null as string | null,
        timeD: lineD,
        rightYTicks: null as number[] | null,
        rightYMin: null as number | null,
        rightYMax: null as number | null,
        yAtRight: null as ((v: number) => number) | null,
      };
    }

    const distVals = sorted
      .map((p) => p.distanceKm)
      .filter((d): d is number => d != null && Number.isFinite(d));
    const timeVals = sorted
      .map((p) => p.timeMin)
      .filter((t): t is number => t != null && Number.isFinite(t));

    if (distVals.length === 0 && timeVals.length === 0) {
      return { mode: "cardio" as const, empty: true as const };
    }

    if (distVals.length === 0 && timeVals.length > 0) {
      const tMin = Math.min(...timeVals);
      const tMax = Math.max(...timeVals);
      const tPad = Math.max(0.5, (tMax - tMin) * 0.12 || 1);
      const yMin = Math.max(0, tMin - tPad);
      const yMax = tMax + tPad;
      const yAt = (v: number) =>
        PAD_T + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
      const ys = sorted.map((p) => p.timeMin);
      const timeOnlyD = pathFromYs(ys, xAt, yAt);
      return {
        mode: "cardio" as const,
        empty: false as const,
        cardioLayout: "timeOnly" as const,
        n,
        xAt,
        yAt,
        yMin,
        yMax,
        yTicks: pickYTicks(yMin, yMax),
        xTicks: pickXTickIndices(n),
        distD: null as string | null,
        timeD: timeOnlyD,
        rightYTicks: null as number[] | null,
        rightYMin: null as number | null,
        rightYMax: null as number | null,
        yAtRight: null as ((v: number) => number) | null,
      };
    }

    if (timeVals.length === 0 && distVals.length > 0) {
      const dMin = Math.min(...distVals);
      const dMax = Math.max(...distVals);
      const dPad = Math.max(0.05, (dMax - dMin) * 0.12 || 0.2);
      const yMin = Math.max(0, dMin - dPad);
      const yMax = dMax + dPad;
      const yAt = (v: number) =>
        PAD_T + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
      const ys = sorted.map((p) => p.distanceKm);
      const distOnlyD = pathFromYs(ys, xAt, yAt);
      return {
        mode: "cardio" as const,
        empty: false as const,
        cardioLayout: "distOnly" as const,
        n,
        xAt,
        yAt,
        yMin,
        yMax,
        yTicks: pickYTicks(yMin, yMax),
        xTicks: pickXTickIndices(n),
        distD: distOnlyD,
        timeD: null as string | null,
        rightYTicks: null as number[] | null,
        rightYMin: null as number | null,
        rightYMax: null as number | null,
        yAtRight: null as ((v: number) => number) | null,
      };
    }

    let dMin = 0;
    let dMax = 1;
    if (distVals.length > 0) {
      dMin = Math.min(...distVals);
      dMax = Math.max(...distVals);
      const dPad = Math.max(0.05, (dMax - dMin) * 0.12 || 0.2);
      dMin = Math.max(0, dMin - dPad);
      dMax = dMax + dPad;
    }

    let tMin = 0;
    let tMax = 1;
    if (timeVals.length > 0) {
      tMin = Math.min(...timeVals);
      tMax = Math.max(...timeVals);
      const tPad = Math.max(0.5, (tMax - tMin) * 0.12 || 1);
      tMin = Math.max(0, tMin - tPad);
      tMax = tMax + tPad;
    }

    const yAtLeft = (v: number) =>
      PAD_T + innerH - ((v - dMin) / (dMax - dMin)) * innerH;
    const yAtRight = (v: number) =>
      PAD_T + innerH - ((v - tMin) / (tMax - tMin)) * innerH;

    const distYs = sorted.map((p) => p.distanceKm);
    const timeYs = sorted.map((p) => p.timeMin);
    const distD = distVals.length > 0 ? pathFromYs(distYs, xAt, yAtLeft) : null;
    const timeD =
      timeVals.length > 0 ? pathFromYs(timeYs, xAt, yAtRight) : null;

    return {
      mode: "cardio" as const,
      empty: false as const,
      cardioLayout: "dual" as const,
      n,
      xAt,
      yAt: yAtLeft,
      yMin: dMin,
      yMax: dMax,
      yTicks: pickYTicks(dMin, dMax),
      xTicks: pickXTickIndices(n),
      lineD: null as string | null,
      distD,
      timeD,
      rightYTicks: pickYTicks(tMin, tMax),
      rightYMin: tMin,
      rightYMax: tMax,
      yAtRight,
    };
  }, [sorted, isCardio]);

  /** Date = zinc; distance / lift duration = emerald (matches solid paths); time = sky (matches dashed path). */
  const hoverTooltipRows = useMemo(():
    | { text: string; className: string }[]
    | null => {
    if (!geometry || ("empty" in geometry && geometry.empty)) {
      return null;
    }
    if (hoverIdx == null || hoverIdx < 0 || hoverIdx >= sorted.length) {
      return null;
    }
    const p = sorted[hoverIdx];
    if (!p) {
      return null;
    }
    const dateRow = {
      text: shortDateLabel(p.dayKey),
      className: "fill-zinc-300",
    };
    if (geometry.mode === "lift") {
      const t = p.timeMin;
      return [
        dateRow,
        {
          text: t != null && Number.isFinite(t) ? `${t.toFixed(1)} min` : "—",
          className: "fill-emerald-400",
        },
      ];
    }
    if (geometry.mode === "cardio") {
      if (geometry.cardioLayout === "dual") {
        const rows: { text: string; className: string }[] = [dateRow];
        if (p.distanceKm != null && Number.isFinite(p.distanceKm)) {
          rows.push({
            text: `${p.distanceKm.toFixed(2)} km`,
            className: "fill-emerald-500",
          });
        }
        if (p.timeMin != null && Number.isFinite(p.timeMin)) {
          rows.push({
            text: `${p.timeMin.toFixed(1)} min`,
            className: "fill-sky-400",
          });
        }
        if (rows.length === 1) {
          rows.push({ text: "—", className: "fill-zinc-500" });
        }
        return rows;
      }
      if (geometry.cardioLayout === "timeOnly") {
        const t = p.timeMin;
        return [
          dateRow,
          {
            text: t != null && Number.isFinite(t) ? `${t.toFixed(1)} min` : "—",
            className: "fill-sky-400",
          },
        ];
      }
      if (geometry.cardioLayout === "distOnly") {
        const km = p.distanceKm;
        return [
          dateRow,
          {
            text:
              km != null && Number.isFinite(km) ? `${km.toFixed(2)} km` : "—",
            className: "fill-emerald-500",
          },
        ];
      }
    }
    return [dateRow];
  }, [geometry, hoverIdx, sorted]);

  const tabs = (
    <div
      className="mb-3 flex flex-wrap gap-1.5"
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

  if (sorted.length === 0) {
    return (
      <section
        aria-label="Activity metrics chart"
        className="rounded-xl border border-zinc-800/90 bg-zinc-950 p-5 shadow-sm"
      >
        {tabs}
        <p className="text-sm text-zinc-500">
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

  if (!geometry || geometry.empty) {
    return (
      <section
        aria-label="Activity metrics chart"
        className="rounded-xl border border-zinc-800/90 bg-zinc-950 p-5 shadow-sm"
      >
        {tabs}
        <p className="text-sm text-zinc-500">
          {emptyCopy === "filtered" ? (
            <>
              No distance or duration recorded for {KIND_LABEL[kind]} sessions
              in this range.
            </>
          ) : (
            <>
              No distance or duration recorded for {KIND_LABEL[kind]} sessions
              with linked data.
            </>
          )}
        </p>
      </section>
    );
  }

  const innerH = VIEW_H - PAD_T - PAD_B;
  const chartInnerW = VIEW_W - PAD_L - PAD_R;
  const {
    n,
    xAt,
    yAt,
    yMin,
    yMax,
    yTicks,
    xTicks,
    distD,
    timeD,
    rightYTicks,
    rightYMin,
    rightYMax,
    yAtRight,
  } = geometry;

  const ariaLabel =
    geometry.mode === "lift"
      ? `Lift duration trend, ${n} sessions`
      : geometry.cardioLayout === "timeOnly"
        ? `Time trend, ${n} ${KIND_LABEL[kind]} sessions`
        : geometry.cardioLayout === "distOnly"
          ? `Distance trend, ${n} ${KIND_LABEL[kind]} sessions`
          : `Distance and duration trend, ${n} ${KIND_LABEL[kind]} sessions`;

  const interactive = Boolean(onSelectDayKey);

  const caption =
    geometry.mode === "lift" ? (
      <p className="mb-2 text-[11px] text-zinc-500">
        Duration (min) from linked session, or planned duration if not linked.
      </p>
    ) : geometry.cardioLayout === "dual" ? (
      <p className="mb-2 text-[11px] text-zinc-500">
        Solid: distance (km). Dashed: time (min). Linked session when present;
        else planned targets.
      </p>
    ) : geometry.cardioLayout === "timeOnly" ? (
      <p className="mb-2 text-[11px] text-zinc-500">
        Time (min) from linked session or planned duration. No distance on these
        plans.
      </p>
    ) : (
      <p className="mb-2 text-[11px] text-zinc-500">
        Distance (km) from linked session or planned distance. No duration on
        these plans.
      </p>
    );

  return (
    <section
      aria-label="Activity metrics chart"
      className="rounded-xl border border-zinc-800/90 bg-zinc-950 p-5 shadow-sm"
    >
      {tabs}
      {caption}

      <svg
        className="h-auto w-full max-w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>

        <g pointerEvents="none" opacity={0.4}>
          {geometry.mode === "cardio" &&
          geometry.cardioLayout === "dual" &&
          yAtRight != null &&
          rightYTicks &&
          rightYMin != null &&
          rightYMax != null ? (
            <>
              {yTicks.map((lb) => {
                const y =
                  PAD_T + innerH - ((lb - yMin) / (yMax - yMin)) * innerH;
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
                      {lb < 10 ? lb.toFixed(2) : lb.toFixed(1)}
                    </text>
                  </g>
                );
              })}
              {rightYTicks.map((lb) => {
                const y =
                  PAD_T +
                  innerH -
                  ((lb - rightYMin) / (rightYMax - rightYMin)) * innerH;
                return (
                  <text
                    key={`yr-${lb}`}
                    x={VIEW_W - PAD_R + 8}
                    y={y + 4}
                    textAnchor="start"
                    className="fill-sky-500/90 text-[11px]"
                    fontSize={11}
                  >
                    {lb < 10 ? lb.toFixed(1) : Math.round(lb)}
                  </text>
                );
              })}
              <text
                x={10}
                y={VIEW_H / 2}
                transform={`rotate(-90 10 ${VIEW_H / 2})`}
                textAnchor="middle"
                className="fill-emerald-600/90 text-[10px]"
                fontSize={10}
              >
                km
              </text>
              <text
                x={VIEW_W - 10}
                y={VIEW_H / 2}
                transform={`rotate(90 ${VIEW_W - 10} ${VIEW_H / 2})`}
                textAnchor="middle"
                className="fill-sky-500/80 text-[10px]"
                fontSize={10}
              >
                min
              </text>
              {distD ? (
                <path
                  d={distD}
                  fill="none"
                  pointerEvents="none"
                  stroke="rgb(16 185 129)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {timeD ? (
                <path
                  d={timeD}
                  fill="none"
                  pointerEvents="none"
                  stroke="rgb(56 189 248)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.95}
                />
              ) : null}
            </>
          ) : geometry.mode === "cardio" &&
            geometry.cardioLayout === "timeOnly" &&
            timeD ? (
            <>
              {yTicks.map((lb) => {
                const y =
                  PAD_T + innerH - ((lb - yMin) / (yMax - yMin)) * innerH;
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
                      {lb < 10 ? lb.toFixed(1) : Math.round(lb)}
                    </text>
                  </g>
                );
              })}
              <text
                x={12}
                y={VIEW_H / 2}
                transform={`rotate(-90 12 ${VIEW_H / 2})`}
                textAnchor="middle"
                className="fill-sky-500/80 text-[10px]"
                fontSize={10}
              >
                min
              </text>
              <path
                d={timeD}
                fill="none"
                pointerEvents="none"
                stroke="rgb(56 189 248)"
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
            </>
          ) : geometry.mode === "cardio" &&
            geometry.cardioLayout === "distOnly" &&
            distD ? (
            <>
              {yTicks.map((lb) => {
                const y =
                  PAD_T + innerH - ((lb - yMin) / (yMax - yMin)) * innerH;
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
                      {lb < 10 ? lb.toFixed(2) : lb.toFixed(1)}
                    </text>
                  </g>
                );
              })}
              <text
                x={12}
                y={VIEW_H / 2}
                transform={`rotate(-90 12 ${VIEW_H / 2})`}
                textAnchor="middle"
                className="fill-emerald-600/90 text-[10px]"
                fontSize={10}
              >
                km
              </text>
              <path
                d={distD}
                fill="none"
                pointerEvents="none"
                stroke="rgb(16 185 129)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
            </>
          ) : geometry.mode === "lift" ? (
            <>
              {yTicks.map((lb) => {
                const y =
                  PAD_T + innerH - ((lb - yMin) / (yMax - yMin)) * innerH;
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
                      {lb < 10 ? lb.toFixed(1) : Math.round(lb)}
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
                min
              </text>
              {timeD ? (
                <path
                  d={timeD}
                  fill="none"
                  pointerEvents="none"
                  stroke="rgb(52 211 153)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.95}
                />
              ) : null}
            </>
          ) : null}
        </g>

        {xTicks.map((i) => {
          const e = sorted[i];
          if (!e) {
            return null;
          }
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: SVG axis label (same pattern as weight chart)
            <text
              key={`x-${e.id}`}
              x={xAt(i)}
              y={VIEW_H - 12}
              textAnchor="middle"
              className={
                interactive
                  ? "cursor-pointer outline-none focus:outline-none fill-zinc-400/80 underline decoration-zinc-600/80 underline-offset-2 hover:fill-zinc-200"
                  : "fill-zinc-500/70"
              }
              fontSize={11}
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

        {sorted.map((p, i) => {
          const cx = xAt(i);
          const hasTime = p.timeMin != null && Number.isFinite(p.timeMin);
          const hasDist = p.distanceKm != null && Number.isFinite(p.distanceKm);
          const isSelected =
            selectedDayKey != null && p.dayKey === selectedDayKey;
          const isHoveredColumn =
            interactive && hoverIdx != null && hoverIdx === i;
          const isHighlighted = isSelected || isHoveredColumn;
          const markOpacity = isHighlighted ? 1 : 0.28;

          if (geometry.mode === "lift") {
            if (!hasTime) {
              return null;
            }
            const tm = p.timeMin;
            if (tm == null || !Number.isFinite(tm)) {
              return null;
            }
            const cy = yAt(tm);
            const r = 4;
            return (
              <g key={p.id} opacity={markOpacity}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHighlighted ? r + 0.75 : r}
                  fill="rgb(16 185 129)"
                  stroke="rgb(24 24 27)"
                  strokeWidth={1}
                  pointerEvents="none"
                >
                  {!interactive ? (
                    <title>
                      {shortDateLabel(p.dayKey)} · {tm.toFixed(1)} min
                    </title>
                  ) : null}
                </circle>
              </g>
            );
          }
          if (
            geometry.mode === "cardio" &&
            geometry.cardioLayout === "timeOnly"
          ) {
            if (!hasTime) {
              return null;
            }
            const tm = p.timeMin;
            if (tm == null || !Number.isFinite(tm)) {
              return null;
            }
            const cy = yAt(tm);
            const r = 4;
            return (
              <g key={p.id} opacity={markOpacity}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHighlighted ? r + 0.75 : r}
                  fill="rgb(56 189 248)"
                  stroke="rgb(24 24 27)"
                  strokeWidth={1}
                  pointerEvents="none"
                >
                  {!interactive ? (
                    <title>
                      {shortDateLabel(p.dayKey)} · {tm.toFixed(1)} min
                    </title>
                  ) : null}
                </circle>
              </g>
            );
          }
          if (
            geometry.mode === "cardio" &&
            geometry.cardioLayout === "distOnly"
          ) {
            if (!hasDist) {
              return null;
            }
            const dk = p.distanceKm;
            if (dk == null || !Number.isFinite(dk)) {
              return null;
            }
            const cy = yAt(dk);
            const r = 4;
            return (
              <g key={p.id} opacity={markOpacity}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHighlighted ? r + 0.75 : r}
                  fill="rgb(16 185 129)"
                  stroke="rgb(24 24 27)"
                  strokeWidth={1}
                  pointerEvents="none"
                >
                  {!interactive ? (
                    <title>
                      {shortDateLabel(p.dayKey)} · {dk.toFixed(2)} km
                    </title>
                  ) : null}
                </circle>
              </g>
            );
          }
          if (!hasTime && !hasDist) {
            return null;
          }
          const tmDual =
            hasTime && p.timeMin != null && Number.isFinite(p.timeMin)
              ? p.timeMin
              : null;
          const kmDual =
            hasDist && p.distanceKm != null && Number.isFinite(p.distanceKm)
              ? p.distanceKm
              : null;
          const cyTime = tmDual != null && yAtRight ? yAtRight(tmDual) : null;
          const cyDist = kmDual != null ? yAt(kmDual) : null;
          const rDual = isHighlighted ? 4.25 : 3.5;
          return (
            <g key={p.id} opacity={markOpacity}>
              {hasDist && cyDist != null ? (
                <circle
                  cx={cx}
                  cy={cyDist}
                  r={rDual}
                  fill="rgb(16 185 129)"
                  stroke="rgb(24 24 27)"
                  strokeWidth={0.5}
                  pointerEvents="none"
                >
                  {!interactive ? (
                    <title>
                      {shortDateLabel(p.dayKey)} ·{" "}
                      {kmDual != null ? kmDual.toFixed(2) : ""} km
                    </title>
                  ) : null}
                </circle>
              ) : null}
              {hasTime && cyTime != null ? (
                <circle
                  cx={cx}
                  cy={cyTime}
                  r={rDual}
                  fill="rgb(56 189 248)"
                  stroke="rgb(24 24 27)"
                  strokeWidth={0.5}
                  pointerEvents="none"
                >
                  {!interactive ? (
                    <title>
                      {shortDateLabel(p.dayKey)} ·{" "}
                      {tmDual != null ? tmDual.toFixed(1) : ""} min
                    </title>
                  ) : null}
                </circle>
              ) : null}
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
          // biome-ignore lint/a11y/noStaticElementInteractions: chart scrubber; x-nearest column matches hover line + click
          <rect
            x={PAD_L}
            y={PAD_T}
            width={chartInnerW}
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
              const row = sorted[idx];
              if (row) {
                onSelectDayKey(row.dayKey);
              }
            }}
          />
        ) : null}
      </svg>
    </section>
  );
}
