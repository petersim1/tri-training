export const SESSION_CHART_COOKIE = "wt_session_chart" as const;

/** Preset ranges; `all` uses full history from loaded plans. */
export type SessionChartRange = "3m" | "6m" | "12m" | "ytd" | "all";

/** Cardio: distance, time, or pace (min/km). Lift uses time only. */
export type SessionChartMetric = "distance" | "time" | "pace";

export type SessionChartSettings = {
  range: SessionChartRange;
  metric: SessionChartMetric;
  cumulative: boolean;
};

export const DEFAULT_SESSION_CHART_SETTINGS: SessionChartSettings = {
  range: "12m",
  metric: "time",
  cumulative: false,
};

function isRange(x: unknown): x is SessionChartRange {
  return x === "3m" || x === "6m" || x === "12m" || x === "ytd" || x === "all";
}

function isMetric(x: unknown): x is SessionChartMetric {
  return x === "distance" || x === "time" || x === "pace";
}

export function parseSessionChartSettings(
  raw: string | undefined,
): SessionChartSettings {
  if (!raw || raw === "") {
    return { ...DEFAULT_SESSION_CHART_SETTINGS };
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const range = o.range;
    const metric = o.metric;
    const cumulative = o.cumulative;
    return {
      range: isRange(range) ? range : DEFAULT_SESSION_CHART_SETTINGS.range,
      metric: isMetric(metric) ? metric : DEFAULT_SESSION_CHART_SETTINGS.metric,
      cumulative:
        typeof cumulative === "boolean"
          ? cumulative
          : DEFAULT_SESSION_CHART_SETTINGS.cumulative,
    };
  } catch {
    return { ...DEFAULT_SESSION_CHART_SETTINGS };
  }
}

export function serializeSessionChartSettings(s: SessionChartSettings): string {
  return JSON.stringify(s);
}

/** Local `YYYY-MM-DD` for `monthsBack` months before today. */
export function dayKeyMonthsAgoLocal(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayLocalDayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function sessionChartDayRange(range: SessionChartRange): {
  from: string | undefined;
  to: string | undefined;
} {
  const to = todayLocalDayKey();
  switch (range) {
    case "all":
      return { from: undefined, to: undefined };
    case "ytd": {
      const y = new Date().getFullYear();
      return { from: `${y}-01-01`, to };
    }
    case "3m":
      return { from: dayKeyMonthsAgoLocal(3), to };
    case "6m":
      return { from: dayKeyMonthsAgoLocal(6), to };
    case "12m":
      return { from: dayKeyMonthsAgoLocal(12), to };
    default:
      return { from: dayKeyMonthsAgoLocal(12), to };
  }
}

export function sessionChartRangeLabel(range: SessionChartRange): string {
  switch (range) {
    case "3m":
      return "Last 3 months";
    case "6m":
      return "Last 6 months";
    case "12m":
      return "Last 12 months";
    case "ytd":
      return "Year to date";
    case "all":
      return "All time";
    default:
      return "";
  }
}
