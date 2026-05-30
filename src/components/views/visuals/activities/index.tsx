// activity-metrics-chart.tsx
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as d3 from "d3";
import { useEffect, useRef } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import queryKeys from "@/lib/query-keys";
import { VIEW_H, VIEW_W } from "@/lib/utils/plots";
import { activityActions } from "@/server-fcts/activities";
import { createStackedViz } from "../stacked/plot";
import { ActivityMetricsChartHeader } from "./header";
import { createViz } from "./plot";

type Props = {
  sessionChart: SessionChartSettings;
  onSessionChartPatch: (patch: Partial<SessionChartSettings>) => void;
};

export const ActivityMetricsChart: React.FC<Props> = ({
  sessionChart,
  onSessionChartPatch,
}) => {
  const ref = useRef(null);

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
    ),
    queryFn: () =>
      activityActions.vizStacked({
        data: {
          agg: sessionChart.agg,
          range: sessionChart.range,
          metric: sessionChart.metric,
          proportional: sessionChart.proportional,
        },
      }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    if (sessionChart.stacked) {
      if (stackedPoints.length > 0) {
        createStackedViz(
          svg,
          stackedPoints,
          sessionChart.metric,
          sessionChart.range,
          sessionChart.proportional,
        );
      }
    } else {
      if (points.length > 0) {
        createViz(
          svg,
          points,
          sessionChart.metric,
          sessionChart.range,
          sessionChart.cumulative,
        );
      }
    }
  }, [points, stackedPoints, sessionChart]);

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
      <div className="w-full" style={{ aspectRatio: `${VIEW_W}/${VIEW_H}` }}>
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
        <div ref={ref} />
      </div>
    </section>
  );
};
