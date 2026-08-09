// activity-metrics-chart.tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { select } from "d3";
import type React from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import { getters } from "@/lib/query-keys";
import type { ChartDimensions } from "@/lib/utils/plots";
import type { VizResult } from "@/types/responses/activities";
import { createViz, LINE_COLOR } from "./plot";

type Props = {
  sessionChart: SessionChartSettings;
  dimensions: ChartDimensions;
};

export const WeightTrendChart: React.FC<Props> = ({ sessionChart, dimensions }) => {
  const [hoveredPoint, setHoveredPoint] = useState<VizResult | null>(null);

  return (
    <section
      aria-label="Weights chart"
      className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
    >
      <div className="w-full" style={{ aspectRatio: `${dimensions.viewW}/${dimensions.viewH}` }}>
        <div className="h-6 flex justify-end items-center px-4 md:px-8">
          {hoveredPoint && (
            <div className="flex gap-2 ml-auto text-white/60 items-center text-xs">
              <span style={{ color: LINE_COLOR }}>{hoveredPoint.value.toFixed(1)} lb</span>
              <span>{hoveredPoint.date}</span>
            </div>
          )}
        </div>
        <Suspense fallback={<Loader dimensions={dimensions} />}>
          <Inner
            sessionChart={sessionChart}
            dimensions={dimensions}
            setHoveredPoint={setHoveredPoint}
          />
        </Suspense>
      </div>
    </section>
  );
};

const Loader: React.FC<{ dimensions: ChartDimensions }> = ({ dimensions }) => {
  return (
    <div
      className="overflow-hidden rounded-full bg-zinc-950"
      style={{ aspectRatio: `${dimensions.viewW}/${dimensions.viewH}` }}
    >
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
      </div>
    </div>
  );
};

type InnerProps = {
  sessionChart: SessionChartSettings;
  dimensions: ChartDimensions;
  setHoveredPoint: React.Dispatch<React.SetStateAction<VizResult | null>>;
};

const Inner: React.FC<InnerProps> = ({ sessionChart, dimensions, setHoveredPoint }) => {
  const ref = useRef(null);

  const { data: points } = useSuspenseQuery(getters.visuals.weights(sessionChart.range));

  // biome-ignore lint/correctness/useExhaustiveDependencies: <>
  useEffect(() => {
    const svg = select(ref.current);
    svg.selectAll("*").remove();
    if (points.length > 0) {
      createViz(svg, dimensions, points, sessionChart.range, (p: VizResult | null) =>
        setHoveredPoint(p),
      );
    }
  }, [points, sessionChart.range, dimensions]);

  const showEmpty = points.length === 0;

  return (
    <>
      <div ref={ref} className={showEmpty ? "hidden" : undefined} />
      {showEmpty && (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-zinc-500">No data for the current filters.</p>
        </div>
      )}
    </>
  );
};
