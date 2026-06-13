import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import { getDimensions } from "@/lib/utils/plots";
import { cookieActions } from "@/server-fcts/cookies";
import { ActivityMetricsChart } from "./activities";
import { ChartRangeToolbar } from "./toolbar";
import { WeightTrendChart } from "./weights";

export const Visualizer: React.FC<{
  initialChartSettings: SessionChartSettings;
}> = ({ initialChartSettings }) => {
  const runSetSessionChartSettings = useServerFn(
    cookieActions.setSessionChartSettings,
  );

  const holderRef = useRef(null);

  const [sessionChartSettings, setSessionChartSettings] =
    useState(initialChartSettings);

  const [dimensions, setDimensions] = useState(getDimensions(650));

  useEffect(() => {
    if (!holderRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions(getDimensions(width));
    });
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, []);

  const patchSessionChartMutation = useMutation({
    mutationFn: async (patch: SessionChartSettings) =>
      runSetSessionChartSettings({ data: patch }),
  });

  const handlePlotChange = (patch: Partial<SessionChartSettings>) => {
    const newSession = { ...sessionChartSettings, ...patch };
    setSessionChartSettings(newSession);
    patchSessionChartMutation.mutate(newSession);
  };

  const sessionChart = useDeferredValue(sessionChartSettings);

  return (
    <section className="flex flex-col gap-2 pb-20" ref={holderRef}>
      <ChartRangeToolbar
        range={sessionChart.range}
        onRangeChange={(r) => handlePlotChange({ range: r })}
      />
      <ActivityMetricsChart
        sessionChart={sessionChart}
        onSessionChartPatch={handlePlotChange}
        dimensions={dimensions}
      />
      <WeightTrendChart sessionChart={sessionChart} dimensions={dimensions} />
    </section>
  );
};
