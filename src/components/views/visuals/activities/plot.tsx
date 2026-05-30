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
import type { VizResult } from "@/types/responses/activities";

const BAR_FILL: Record<SessionChartMetric, string> = {
  volume: "rgb(167 139 250)",
  time: "rgb(52 211 153)",
  distance: "rgb(16 185 129)",
  efficiency: "rgb(56 189 248)",
  pace: "rgb(251 191 36)",
};

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

type EnrichedPoint = VizResult & {
  displayValue: number;
  cx: number;
  cy: number;
};

export const createViz = (
  plotHolder: d3.Selection<null, unknown, null, undefined>,
  points: VizResult[],
  metric: SessionChartMetric,
  range: SessionChartRange,
  cumulative: boolean,
) => {
  const fill = BAR_FILL[metric];

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
  const values = points.map((p) => p.value);

  const yMax = Math.max(...values, 1e-6);
  const yScale = d3
    .scaleLinear()
    .domain([0, yMax])
    .range([PAD_T + innerH, PAD_T]);
  const barW = Math.min(
    10,
    Math.max(2, (innerW / Math.max(points.length, 1)) * 0.5),
  );

  const enriched: EnrichedPoint[] = points.map((p, i) => ({
    ...p,
    displayValue: points[i].value ?? 0,
    cx: xScale(new Date(`${p.date}T12:00:00`)),
    cy: yScale(points[i].value ?? 0),
  }));

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

  // Y axis
  svg
    .append("text")
    .attr("transform", `translate(12, ${VIEW_H / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("fill", "rgb(82 82 91)")
    .attr("font-size", 10)
    .attr("pointer-events", "none")
    .text(DEFAULT_VIZ_UNIT[metric]);

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

  // Data
  if (cumulative && enriched.length >= 2) {
    svg
      .append("path")
      .datum(enriched)
      .attr("fill", "none")
      .attr("stroke", fill)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.92)
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round")
      .attr("pointer-events", "none")
      .attr(
        "d",
        d3
          .line<EnrichedPoint>()
          .x((d) => d.cx)
          .y((d) => d.cy),
      );
  } else {
    const baselineY = yScale(0);
    svg
      .append("g")
      .attr("pointer-events", "none")
      .selectAll("rect")
      .data(enriched)
      .join("rect")
      .attr("x", (d) => d.cx - barW / 2)
      .attr("y", (d) => d.cy)
      .attr("width", barW)
      .attr("height", (d) => Math.max(0, baselineY - d.cy))
      .attr("fill", fill)
      .attr("opacity", 0.88)
      .attr("rx", 1);
  }

  // Dots
  const dots = svg
    .append("g")
    .attr("pointer-events", "none")
    .selectAll("circle")
    .data(enriched)
    .join("circle")
    .attr("cx", (d) => d.cx)
    .attr("cy", (d) => d.cy)
    .attr("r", 3)
    .attr("fill", "rgb(24 24 27)")
    .attr("stroke", "rgb(244 244 245)")
    .attr("stroke-width", 1)
    .attr("opacity", 0.28);

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
  const tooltipValue = tooltip
    .append("text")
    .attr("font-size", 12)
    .attr("fill", "rgb(52 211 153)");
  const tooltipDate = tooltip
    .append("text")
    .attr("font-size", 11)
    .attr("fill", "rgb(161 161 170)");

  // Scrubber
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
      enriched.forEach((p, i) => {
        const dist = Math.abs(p.cx - mx);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });
      const p = enriched[closest];
      if (!p) return;

      const anchor =
        p.cx > VIEW_W - 120 ? "end" : p.cx < 120 ? "start" : "middle";

      hoverLine.style("display", null).attr("x1", p.cx).attr("x2", p.cx);
      dots
        .attr("opacity", (_d, i) => (i === closest ? 1 : 0.28))
        .attr("r", (_d, i) => (i === closest ? 3.75 : 3));

      tooltip.style("display", null);
      tooltipValue
        .attr("x", p.cx)
        .attr("y", PAD_T - 16)
        .attr("text-anchor", anchor)
        .text(
          `${formatValue(p.displayValue, metric)} ${DEFAULT_VIZ_UNIT[metric]}`,
        );
      tooltipDate
        .attr("x", p.cx)
        .attr("y", PAD_T - 4)
        .attr("text-anchor", anchor)
        .text(shortDateLabel(p.date, showYear));
    })
    .on("mouseleave", () => {
      hoverLine.style("display", "none");
      tooltip.style("display", "none");
      dots.attr("opacity", 0.28).attr("r", 3);
    });
};
