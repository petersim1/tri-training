import * as d3 from "d3";
import type {
  SessionChartMetric,
  SessionChartRange,
} from "@/lib/constants/visuals";
import { DEFAULT_VIZ_UNIT } from "@/lib/utils/calculations";
import {
  monthLabel,
  PAD_B,
  PAD_L,
  PAD_R,
  PAD_T,
  shortDateLabel,
  VIEW_H,
  VIEW_W,
} from "@/lib/utils/plots";
import type { StackedVizResult } from "@/types/responses/activities";

const STACK_COLORS = {
  run: "rgb(16 185 129)", // emerald
  bike: "rgb(251 191 36)", // amber
  swim: "rgb(139 92 246)", // violet
} as const;

const STACK_ORDER = ["run", "bike", "swim"] as const;

const formatValue = (v: number, metric: SessionChartMetric): string => {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (metric === "distance") return v < 10 ? v.toFixed(2) : v.toFixed(1);
  if (metric === "efficiency") return v.toFixed(3);
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
};

const rangeToDateBounds = (range: string): { from: Date; to: Date } | null => {
  const now = new Date();
  if (range === "all") return null;
  if (range === "ytd")
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  return {
    from: new Date(now.getFullYear(), now.getMonth() - months, now.getDate()),
    to: now,
  };
};

export const createStackedViz = (
  plotHolder: d3.Selection<null, unknown, null, undefined>,
  points: StackedVizResult[],
  metric: SessionChartMetric,
  range: SessionChartRange,
  proportional: boolean,
) => {
  const bounds = rangeToDateBounds(range);
  const xFrom =
    bounds?.from ??
    (points.length > 0 ? new Date(`${points[0].date}T12:00:00`) : new Date());
  const xTo =
    bounds?.to ??
    (points.length > 0
      ? new Date(`${points[points.length - 1].date}T12:00:00`)
      : new Date());

  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;

  const xScale = d3
    .scaleTime()
    .domain([xFrom, xTo])
    .range([PAD_L, PAD_L + innerW]);

  const yMax = Math.max(
    ...points.map((p) =>
      STACK_ORDER.reduce((sum, k) => sum + (p.values[k] ?? 0), 0),
    ),
    1e-6,
  );
  const yScale = d3
    .scaleLinear()
    .domain([0, yMax])
    .range([PAD_T + innerH, PAD_T]);

  const barW = Math.min(
    10,
    Math.max(2, (innerW / Math.max(points.length, 1)) * 0.5),
  );

  const allMonthTicks = xScale.ticks(12);
  const xTicks =
    allMonthTicks.length <= 3
      ? allMonthTicks
      : [
          allMonthTicks[0],
          allMonthTicks[Math.floor(allMonthTicks.length / 2)],
          allMonthTicks[allMonthTicks.length - 1],
        ];

  const showYear = xFrom.getFullYear() < xTo.getFullYear();

  const svg = plotHolder
    .append("svg")
    .attr("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`)
    .style("max-height", "100%")
    .style("max-width", "100%");

  // Y axis label
  svg
    .append("text")
    .attr("transform", `translate(12, ${VIEW_H / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("fill", "rgb(82 82 91)")
    .attr("font-size", 10)
    .attr("pointer-events", "none")
    .text(DEFAULT_VIZ_UNIT[metric]);

  // Y axis
  svg
    .append("g")
    .attr("transform", `translate(${PAD_L}, 0)`)
    .call(
      d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat((v) => formatValue(+v, metric)),
    )
    .call((g) => g.select(".domain").remove())
    .call((g) =>
      g
        .selectAll(".tick line")
        .attr("x2", innerW)
        .attr("stroke", "rgb(39 39 42)")
        .attr("stroke-opacity", 0.5),
    )
    .call((g) =>
      g
        .selectAll(".tick text")
        .attr("fill", "rgb(113 113 122)")
        .attr("font-size", 11),
    );

  // X axis
  svg
    .append("g")
    .attr("transform", `translate(0, ${VIEW_H - PAD_B})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(xTicks)
        .tickFormat((d) => monthLabel(d as Date, showYear))
        .tickSize(3),
    )
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll(".tick line").attr("stroke", "rgb(63 63 70)"))
    .call((g) =>
      g
        .selectAll(".tick text")
        .attr("fill", "rgb(113 113 122)")
        .attr("font-size", 10),
    );

  // Stacked bars — fixed order: run bottom, bike middle, swim top
  const barsGroup = svg.append("g").attr("pointer-events", "none");

  points.forEach((p) => {
    const cx = xScale(new Date(`${p.date}T12:00:00`));
    let baseline = yScale(0);

    STACK_ORDER.forEach((kind) => {
      const val = p.values[kind] ?? 0;
      if (val <= 0) return;
      const barTop = yScale(yScale.invert(baseline) + val);
      const height = Math.max(0, baseline - barTop);

      barsGroup
        .append("rect")
        .attr("x", cx - barW / 2)
        .attr("y", barTop)
        .attr("width", barW)
        .attr("height", height)
        .attr("fill", STACK_COLORS[kind])
        .attr("opacity", 0.88)
        .attr("rx", 1);

      baseline = barTop;
    });
  });

  // Legend
  const legendG = svg.append("g").attr("pointer-events", "none");
  STACK_ORDER.forEach((kind, i) => {
    const lx = PAD_L + i * 40;
    const ly = PAD_T - PAD_T / 2;
    legendG
      .append("rect")
      .attr("x", lx)
      .attr("y", ly - 7)
      .attr("width", 8)
      .attr("height", 8)
      .attr("fill", STACK_COLORS[kind])
      .attr("rx", 1);
    legendG
      .append("text")
      .attr("x", lx + 12)
      .attr("y", ly)
      .attr("fill", "rgb(113 113 122)")
      .attr("font-size", 10)
      .text(kind.charAt(0).toUpperCase() + kind.slice(1));
  });

  // Hover line
  const hoverLine = svg
    .append("line")
    .attr("y1", PAD_T)
    .attr("y2", VIEW_H - PAD_B)
    .attr("stroke", "rgb(113 113 122)")
    .attr("stroke-width", 1)
    .attr("stroke-opacity", 0.45)
    .attr("pointer-events", "none")
    .style("display", "none");

  // Tooltip
  const tooltip = svg
    .append("g")
    .attr("pointer-events", "none")
    .style("display", "none");

  svg
    .append("rect")
    .attr("x", PAD_L)
    .attr("y", PAD_T)
    .attr("width", innerW)
    .attr("height", innerH)
    .attr("fill", "transparent")
    .style("cursor", "crosshair")
    .on("mousemove", (event) => {
      const [mx] = d3.pointer(event);
      let closest = 0;
      let minDist = Infinity;
      points.forEach((p, i) => {
        const dist = Math.abs(xScale(new Date(`${p.date}T12:00:00`)) - mx);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });

      const p = points[closest];
      if (!p) return;

      const cx = xScale(new Date(`${p.date}T12:00:00`));
      const total = STACK_ORDER.reduce((sum, k) => sum + (p.values[k] ?? 0), 0);

      hoverLine.style("display", null).attr("x1", cx).attr("x2", cx);
      tooltip.style("display", null).selectAll("*").remove();

      const textEl = tooltip
        .append("text")
        .attr("x", VIEW_W - PAD_R)
        .attr("y", PAD_T - PAD_T / 2)
        .attr("text-anchor", "end")
        .attr("font-size", 11);

      STACK_ORDER.filter((k) => (p.values[k] ?? 0) > 0).forEach((k) => {
        const val = p.values[k];
        const display = proportional
          ? `${((val / total) * 100).toFixed(0)}%`
          : formatValue(val, metric);
        textEl
          .append("tspan")
          .attr("fill", STACK_COLORS[k])
          .text(`${k} ${display}  `);
      });

      if (!proportional) {
        textEl
          .append("tspan")
          .attr("fill", "rgb(228 228 231)")
          .text(
            `(total ${formatValue(total, metric)} ${DEFAULT_VIZ_UNIT[metric]})`,
          );
      }

      textEl
        .append("tspan")
        .attr("fill", "rgb(161 161 170)")
        .text(` - ${shortDateLabel(p.date, showYear)}`);
    })
    .on("mouseleave", () => {
      hoverLine.style("display", "none");
      tooltip.style("display", "none").selectAll("*").remove();
    });
};
