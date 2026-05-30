import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
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

  const [sessionChartSettings, setSessionChartSettings] =
    useState(initialChartSettings);

  const patchSessionChartMutation = useMutation({
    mutationFn: async (patch: SessionChartSettings) =>
      runSetSessionChartSettings({ data: patch }),
  });

  const handlePlotChange = (patch: Partial<SessionChartSettings>) => {
    const newSession = { ...sessionChartSettings, ...patch };
    setSessionChartSettings(newSession);
    patchSessionChartMutation.mutate(newSession);
  };

  return (
    <section className="flex flex-col gap-2">
      <ChartRangeToolbar
        range={sessionChartSettings.range}
        onRangeChange={(r) => handlePlotChange({ range: r })}
      />
      <ActivityMetricsChart
        sessionChart={sessionChartSettings}
        onSessionChartPatch={handlePlotChange}
      />
      <WeightTrendChart sessionChart={sessionChartSettings} />
    </section>
  );
};
