import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import { cookieActions } from "@/server-fcts";
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
    mutationFn: async (patch: Partial<SessionChartSettings>) => {
      const next = { ...sessionChartSettings, ...patch };
      await runSetSessionChartSettings({ data: next });
      return next;
    },
    onSuccess: (next) => {
      setSessionChartSettings(next);
    },
  });

  const handlePlotChange = (patch: Partial<SessionChartSettings>) => {
    setSessionChartSettings((prev) => ({ ...prev, patch }));
    patchSessionChartMutation.mutate(patch);
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
      <WeightTrendChart range={sessionChartSettings.range} />
    </section>
  );
};
