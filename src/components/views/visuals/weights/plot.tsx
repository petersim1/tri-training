import {
  area,
  axisBottom,
  axisLeft,
  line,
  pointer,
  scaleLinear,
  scaleTime,
} from "d3";
import type { SessionChartRange } from "@/lib/constants/visuals";
import {
  type ChartDimensions,
  monthLabel,
  shortDateLabel,
} from "@/lib/utils/plots";
import type { VizResult } from "@/types/responses/activities";

type EnrichedPoint = VizResult & { cx: number; cy: number };

export const createViz = (
  plotHolder: d3.Selection<null, unknown, null, undefined>,
  dimensions: ChartDimensions,
  points: VizResult[],
  range: SessionChartRange,
  onHover: (idx: number | null) => void,
) => {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((p) => p.value);

  const now = new Date();
  const xTo = now;
  const xFrom = (() => {
    if (range === "all") return new Date(`${sorted[0].date}T12:00:00`);
    if (range === "ytd") return new Date(now.getFullYear(), 0, 1);
    const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
    return new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  })();

  const minW = Math.min(...values);
  const maxW = Math.max(...values);
  const padLb = Math.max(0.5, (maxW - minW) * 0.12 || 2);
  const innerW = dimensions.viewW - dimensions.pad.l - dimensions.pad.r;
  const innerH = dimensions.viewH - dimensions.pad.t - dimensions.pad.b;

  const xScale = scaleTime()
    .domain([xFrom, xTo])
    .range([dimensions.pad.l, dimensions.pad.l + innerW]);
  const yScale = scaleLinear()
    .domain([minW - padLb, maxW + padLb])
    .range([dimensions.pad.t + innerH, dimensions.pad.t]);

  const xTicks = Array.from({ length: dimensions.nTicks.x }, (_, i) => {
    const t = i / (dimensions.nTicks.x - 1);
    return new Date(xFrom.getTime() + t * (xTo.getTime() - xFrom.getTime()));
  });
  const showYear = xFrom.getFullYear() < xTo.getFullYear();

  const enriched: EnrichedPoint[] = sorted.map((p) => ({
    ...p,
    cx: xScale(new Date(`${p.date}T12:00:00`)),
    cy: yScale(p.value),
  }));

  const svg = plotHolder
    .append("svg")
    .attr("viewBox", `0 0 ${dimensions.viewW} ${dimensions.viewH}`)
    .style("max-height", "100%")
    .style("max-width", "100%");

  // Defs
  const defs = svg.append("defs");
  const grad = defs
    .append("linearGradient")
    .attr("id", "weight-area-fill")
    .attr("x1", "0")
    .attr("y1", "0")
    .attr("x2", "0")
    .attr("y2", "1");
  grad
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "rgb(16 185 129)")
    .attr("stop-opacity", 0.22);
  grad
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "rgb(16 185 129)")
    .attr("stop-opacity", 0.02);

  // Y axis
  svg
    .append("g")
    .attr("transform", `translate(${dimensions.pad.l}, 0)`)
    .call(
      axisLeft(yScale)
        .ticks(5)
        .tickFormat((v) => `${(+v).toFixed(1)}`),
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
        .attr("font-size", dimensions.fontSize.axis),
    );

  // Y axis label
  svg
    .append("text")
    .attr("transform", `translate(12, ${dimensions.viewH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("fill", "rgb(82 82 91)")
    .attr("font-size", dimensions.fontSize.label)
    .text("lb");

  // X axis
  svg
    .append("g")
    .attr("transform", `translate(0, ${dimensions.viewH - dimensions.pad.b})`)
    .call(
      axisBottom(xScale)
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
        .attr("font-size", dimensions.fontSize.axis),
    );

  // Area
  if (enriched.length >= 2) {
    svg
      .append("path")
      .datum(enriched)
      .attr("fill", "url(#weight-area-fill)")
      .attr("stroke", "none")
      .attr(
        "d",
        area<EnrichedPoint>()
          .x((d) => d.cx)
          .y0(dimensions.pad.t + innerH)
          .y1((d) => d.cy),
      );
  }

  // Line
  svg
    .append("path")
    .datum(enriched)
    .attr("fill", "none")
    .attr("stroke", "rgb(52 211 153)")
    .attr("stroke-width", 2)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("opacity", 0.95)
    .attr(
      "d",
      line<EnrichedPoint>()
        .x((d) => d.cx)
        .y((d) => d.cy),
    );

  // Dots
  svg
    .append("g")
    .selectAll("circle")
    .data(enriched)
    .join("circle")
    .attr("cx", (d) => d.cx)
    .attr("cy", (d) => d.cy)
    .attr("r", 3)
    .attr("fill", "rgb(24 24 27)")
    .attr("stroke", "rgb(244 244 245)")
    .attr("stroke-width", 1)
    .attr("opacity", 0.6)
    .attr("pointer-events", "none");

  // Hover line
  const hoverLine = svg
    .append("line")
    .attr("stroke", "rgb(113 113 122)")
    .attr("stroke-width", 1)
    .attr("stroke-opacity", 0.45)
    .attr("y1", dimensions.pad.t)
    .attr("y2", dimensions.viewH - dimensions.pad.b)
    .attr("pointer-events", "none")
    .style("display", "none");

  // Tooltip
  const tooltip = svg
    .append("g")
    .attr("pointer-events", "none")
    .style("display", "none");
  const tooltipValue = tooltip
    .append("text")
    .attr("fill", "rgb(52 211 153)")
    .attr("font-size", dimensions.fontSize.tooltip);
  const tooltipDate = tooltip
    .append("text")
    .attr("fill", "rgb(161 161 170)")
    .attr("font-size", dimensions.fontSize.tooltip);

  // Scrubber
  svg
    .append("rect")
    .attr("x", dimensions.pad.l)
    .attr("y", dimensions.pad.t)
    .attr("width", innerW)
    .attr("height", innerH)
    .attr("fill", "transparent")
    .style("cursor", "crosshair")
    .on("mousemove", (event) => {
      const [mx] = pointer(event);
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
        p.cx > dimensions.viewW - 120 ? "end" : p.cx < 120 ? "start" : "middle";

      hoverLine.style("display", null).attr("x1", p.cx).attr("x2", p.cx);

      tooltip.style("display", null);
      tooltipValue
        .attr("x", p.cx)
        .attr("y", dimensions.pad.t - 16)
        .attr("text-anchor", anchor)
        .text(`${p.value.toFixed(1)} lb`);
      tooltipDate
        .attr("x", p.cx)
        .attr("y", dimensions.pad.t - 4)
        .attr("text-anchor", anchor)
        .text(shortDateLabel(p.date, showYear));

      svg
        .selectAll("circle")
        .attr("opacity", (_d, i) => (i === closest ? 1 : 0.6))
        .attr("r", (_d, i) => (i === closest ? 3.75 : 3));

      onHover(closest);
    })
    .on("mouseleave", () => {
      hoverLine.style("display", "none");
      tooltip.style("display", "none");
      svg.selectAll("circle").attr("opacity", 0.6).attr("r", 3);
      onHover(null);
    });
};
