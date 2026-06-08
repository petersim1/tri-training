// activity-metrics-chart.tsx
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { select } from "d3";
import { useEffect, useRef, useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import queryKeys from "@/lib/query-keys";
import type { ChartDimensions } from "@/lib/utils/plots";
import { activityActions } from "@/server-fcts/activities";
import type { StackedVizResult, VizResult } from "@/types/responses/activities";
import {
  createStackedViz,
  formatValue,
  STACK_COLORS,
  STACK_ORDER,
} from "../stacked/plot";
import { ActivityMetricsChartHeader } from "./header";
import { BAR_FILL, createViz } from "./plot";

type Props = {
  sessionChart: SessionChartSettings;
  onSessionChartPatch: (patch: Partial<SessionChartSettings>) => void;
  dimensions: ChartDimensions;
};

export const ActivityMetricsChart: React.FC<Props> = ({
  sessionChart,
  onSessionChartPatch,
  dimensions,
}) => {
  const ref = useRef(null);

  const [hoveredStackedPoint, setHoveredStackedPoint] =
    useState<StackedVizResult | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<VizResult | null>(null);

  const { data: points = [], isLoading: isVizLoading } = useQuery({
    queryKey: queryKeys.activityViz(
      sessionChart.kind,
      sessionChart.range,
      sessionChart.agg,
      sessionChart.metric,
      sessionChart.cumulative,
    ),
    queryFn: () =>
      activityActions.viz({
        data: {
          kind: sessionChart.kind,
          agg: sessionChart.agg,
          range: sessionChart.range,
          metric: sessionChart.metric,
          cumulative: sessionChart.cumulative,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const { data: stackedPoints = [], isLoading: isStackLoading } = useQuery({
    queryKey: queryKeys.stackedActivityViz(
      sessionChart.range,
      sessionChart.metric,
      sessionChart.agg,
      sessionChart.proportional,
      sessionChart.cumulative,
    ),
    queryFn: () =>
      activityActions.vizStacked({
        data: {
          agg: sessionChart.agg,
          range: sessionChart.range,
          metric: sessionChart.metric,
          proportional: sessionChart.proportional,
          cumulative: sessionChart.cumulative,
        },
      }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const svg = select(ref.current);
    svg.selectAll("*").remove();
    if (sessionChart.stacked) {
      if (stackedPoints.length > 0) {
        createStackedViz(
          svg,
          dimensions,
          stackedPoints,
          sessionChart.metric,
          sessionChart.range,
          (p: StackedVizResult | null) => setHoveredStackedPoint(p),
        );
      }
    } else {
      if (points.length > 0) {
        createViz(
          svg,
          dimensions,
          points,
          sessionChart.metric,
          sessionChart.range,
          sessionChart.cumulative,
          (p: VizResult | null) => setHoveredPoint(p),
        );
      }
    }
  }, [points, stackedPoints, sessionChart, dimensions]);

  const isLoading = isVizLoading || isStackLoading;

  return (
    <section
      aria-label="Activity metrics chart"
      className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
    >
      <ActivityMetricsChartHeader
        sessionChart={sessionChart}
        onSessionChartPatch={onSessionChartPatch}
      />
      <div
        className="w-full"
        style={{ aspectRatio: `${dimensions.viewW}/${dimensions.viewH}` }}
      >
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          </div>
        )}
        {!isLoading && !sessionChart.stacked && points.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-500">
              No data for the current filters.
            </p>
          </div>
        )}
        <div className="h-6 flex justify-end sm:justify-between items-center px-4 md:px-8">
          {sessionChart.stacked && (
            <div className="gap-1 items-center text-xs text-white/60 hidden sm:flex">
              {STACK_ORDER.map((o) => (
                <div key={o} className="flex gap-1 items-center">
                  <span
                    className="block size-2 rounded-full"
                    style={{ background: STACK_COLORS[o] }}
                  />
                  {o}
                </div>
              ))}
            </div>
          )}
          {sessionChart.stacked && hoveredStackedPoint && (
            <div className="flex gap-3 text-xs h-5">
              {STACK_ORDER.filter(
                (k) => (hoveredStackedPoint.values[k] ?? 0) > 0,
              ).map((k) => {
                const val = hoveredStackedPoint.values[k];
                const total = STACK_ORDER.reduce(
                  (sum, k) => sum + (hoveredStackedPoint.values[k] ?? 0),
                  0,
                );
                const display = sessionChart.proportional
                  ? `${((val / total) * 100).toFixed(0)}%`
                  : formatValue(val, sessionChart.metric);
                return (
                  <span key={k} style={{ color: STACK_COLORS[k] }}>
                    {k} {display}
                  </span>
                );
              })}
            </div>
          )}
          {!sessionChart.stacked && hoveredPoint && (
            <div className="flex gap-2 ml-auto text-white/60 items-center">
              <span style={{ color: BAR_FILL[sessionChart.metric] }}>
                {formatValue(hoveredPoint.value, sessionChart.metric)}
              </span>
              <span>{hoveredPoint.date}</span>
            </div>
          )}
        </div>
        <div ref={ref} />
      </div>
    </section>
  );
};
