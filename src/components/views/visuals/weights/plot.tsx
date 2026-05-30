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

type EnrichedPoint = VizResult & { cx: number; cy: number };

export const createViz = (
  plotHolder: d3.Selection<null, unknown, null, undefined>,
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
  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;

  const xScale = scaleTime()
    .domain([xFrom, xTo])
    .range([PAD_L, PAD_L + innerW]);
  const yScale = scaleLinear()
    .domain([minW - padLb, maxW + padLb])
    .range([PAD_T + innerH, PAD_T]);

  const allTicks = xScale.ticks(12);
  const xTicks =
    allTicks.length <= 3
      ? allTicks
      : [
          allTicks[0],
          allTicks[Math.floor(allTicks.length / 2)],
          allTicks[allTicks.length - 1],
        ];

  const showYear = xFrom.getFullYear() < xTo.getFullYear();

  const enriched: EnrichedPoint[] = sorted.map((p) => ({
    ...p,
    cx: xScale(new Date(`${p.date}T12:00:00`)),
    cy: yScale(p.value),
  }));

  const svg = plotHolder
    .append("svg")
    .attr("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`)
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
    .attr("transform", `translate(${PAD_L}, 0)`)
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
        .attr("font-size", 11),
    );

  // Y axis label
  svg
    .append("text")
    .attr("transform", `translate(12, ${VIEW_H / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("fill", "rgb(82 82 91)")
    .attr("font-size", 10)
    .text("lb");

  // X axis
  svg
    .append("g")
    .attr("transform", `translate(0, ${VIEW_H - PAD_B})`)
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
        .attr("font-size", 10),
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
          .y0(PAD_T + innerH)
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
    .attr("y1", PAD_T)
    .attr("y2", VIEW_H - PAD_B)
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
    .attr("font-size", 12);
  const tooltipDate = tooltip
    .append("text")
    .attr("fill", "rgb(161 161 170)")
    .attr("font-size", 11);

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
        p.cx > VIEW_W - 120 ? "end" : p.cx < 120 ? "start" : "middle";

      hoverLine.style("display", null).attr("x1", p.cx).attr("x2", p.cx);

      tooltip.style("display", null);
      tooltipValue
        .attr("x", p.cx)
        .attr("y", PAD_T - 16)
        .attr("text-anchor", anchor)
        .text(`${p.value.toFixed(1)} lb`);
      tooltipDate
        .attr("x", p.cx)
        .attr("y", PAD_T - 4)
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
