// activity-metrics-chart.tsx
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import queryKeys from "@/lib/query-keys";
import { activityActions } from "@/server-fcts";
import { ActivityMetricsChartHeader } from "./header";
import { ActivityMetricsChartPlot } from "./plot";

type Props = {
  sessionChart: SessionChartSettings;
  onSessionChartPatch: (patch: Partial<SessionChartSettings>) => void;
};

export const ActivityMetricsChart: React.FC<Props> = ({
  sessionChart,
  onSessionChartPatch,
}) => {
  const { kind, metric, range, cumulative } = sessionChart;

  const { data: points = [], isLoading } = useQuery({
    queryKey: queryKeys.activityViz(kind, range, metric, cumulative),
    queryFn: () =>
      activityActions.viz({ data: { kind, range, metric, cumulative } }),
    placeholderData: keepPreviousData,
  });

  return (
    <section
      aria-label="Activity metrics chart"
      className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950 shadow-sm"
    >
      <ActivityMetricsChartHeader
        sessionChart={sessionChart}
        onSessionChartPatch={onSessionChartPatch}
      />
      <ActivityMetricsChartPlot
        points={points}
        metric={metric}
        range={range}
        cumulative={cumulative}
        isLoading={isLoading}
      />
    </section>
  );
};
