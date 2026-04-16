import type { SessionChartSettings } from "~/lib/home/session-chart-settings";

/**
 * Home session chart settings (from cookie + defaults) — plans list is the same
 * regardless of metric/cumulative, but the key matches UI so cache invalidates
 * when the user changes persisted chart options.
 */
export function homePlansQueryKey(settings: SessionChartSettings) {
  return [
    "plannedWorkouts",
    "list",
    {
      range: settings.range,
      metric: settings.metric,
      cumulative: settings.cumulative,
    },
  ] as const;
}

export const homeWeightQueryKey = ["weightEntries", "list"] as const;

export const homeHevyBundleQueryKey = ["hevy", "homeBundle"] as const;
