// activity-metrics-chart.tsx
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type React from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import queryKeys from "@/lib/query-keys";
import { weightActions } from "@/server-fcts";
import { WeightPlot } from "./plot";

type Props = {
  sessionChart: SessionChartSettings;
};

export const WeightTrendChart: React.FC<Props> = ({ sessionChart }) => {
  const { data: points = [], isLoading } = useQuery({
    queryKey: queryKeys.weightViz(sessionChart.range),
    queryFn: () => weightActions.viz({ data: { range: sessionChart.range } }),
    placeholderData: keepPreviousData,
  });

  return (
    <section
      aria-label="Weights chart"
      className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
    >
      <WeightPlot
        points={points}
        range={sessionChart.range}
        isLoading={isLoading}
      />
    </section>
  );
};
