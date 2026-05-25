import type { CalendarScope } from "@/types/requests/activities";
import type { PlanKind } from "./activities";

// valid transition states.
export const VALID_METRICS: Record<PlanKind, SessionChartMetric[]> = {
  bike: ["distance", "efficiency", "pace", "time"],
  run: ["distance", "efficiency", "pace", "time"],
  swim: ["distance", "efficiency", "pace", "time"],
  recovery: [],
  lift: ["time", "volume"],
};

export const VALID_CUMULATIVE: Record<SessionChartMetric, boolean> = {
  distance: true,
  efficiency: false,
  pace: false,
  time: true,
  volume: true,
};

export const DEFAULT_CALENDAR_SCOPE: CalendarScope = "month";

export const CHART_RANGE_VALUES = ["3m", "6m", "12m", "ytd", "all"] as const;
export type SessionChartRange = (typeof CHART_RANGE_VALUES)[number];

export const CHART_METRIC_VALUES = [
  "distance",
  "time",
  "pace",
  "efficiency",
  "volume",
] as const;
export type SessionChartMetric = (typeof CHART_METRIC_VALUES)[number];

export type SessionChartSettings = {
  kind: PlanKind;
  range: SessionChartRange;
  metric: SessionChartMetric;
  cumulative: boolean;
};

export const DEFAULT_SESSION_CHART_SETTINGS: SessionChartSettings = {
  kind: "run",
  range: "12m",
  metric: "time",
  cumulative: false,
};
