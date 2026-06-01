// activity-metrics-chart.tsx
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { select } from "d3";
import type React from "react";
import { useEffect, useRef } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import queryKeys from "@/lib/query-keys";
import type { ChartDimensions } from "@/lib/utils/plots";
import { weightActions } from "@/server-fcts/weights";
import { createViz } from "./plot";

type Props = {
  sessionChart: SessionChartSettings;
  dimensions: ChartDimensions;
};

export const WeightTrendChart: React.FC<Props> = ({
  sessionChart,
  dimensions,
}) => {
  const ref = useRef(null);

  const { data: points = [], isLoading } = useQuery({
    queryKey: queryKeys.weightViz(sessionChart.range),
    queryFn: () => weightActions.viz({ data: { range: sessionChart.range } }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const svg = select(ref.current);
    svg.selectAll("*").remove();
    if (points.length > 0) {
      createViz(svg, dimensions, points, sessionChart.range, () => {});
    }
  }, [points, sessionChart.range, dimensions]);

  return (
    <section
      aria-label="Weights chart"
      className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
    >
      <div
        className="w-full"
        style={{ aspectRatio: `${dimensions.viewW}/${dimensions.viewH}` }}
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-500">
              No data for the current filters.
            </p>
          </div>
        ) : (
          <div ref={ref} />
        )}
      </div>
    </section>
  );
};
