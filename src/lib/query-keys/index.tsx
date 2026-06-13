import type {
  ActivityListSchemaValues,
  CalendarScope,
} from "@/types/requests/activities";
import type { PlanKind } from "../constants/activities";
import type {
  SessionChartAgg,
  SessionChartMetric,
  SessionChartRange,
} from "../constants/visuals";

const activitiesList = (query: ActivityListSchemaValues) => [
  "activities",
  query,
];

const calendarQueryKey = (
  period: CalendarScope,
  anchor: string,
  timeZone: string,
) => ["calendar", period, anchor, timeZone];

const activityViz = (
  kind?: PlanKind,
  range?: SessionChartRange,
  agg?: SessionChartAgg,
  metric?: SessionChartMetric,
  cumulative?: boolean,
) => ["activity-viz", kind, range, agg, metric, cumulative];

const stackedActivityViz = (
  range?: SessionChartRange,
  metric?: SessionChartMetric,
  agg?: SessionChartAgg,
  proportional?: boolean,
  cumulative?: boolean,
) => ["stacked-activity-viz", range, metric, agg, proportional, cumulative];

const weightViz = (range?: SessionChartRange) => ["weight-viz", range];

const unlinkedActivities = ["unlinked"];

const dayDetails = (day: string) => ["day-details", day];

const chatThreads = ["chat-threads"] as const;

const messagesQueryKey = (threadId: string | null): readonly unknown[] => {
  return ["planningChat", "messages", threadId ?? "__none"] as const;
};

const routines = ["hevy-routines"];
const routineDetail = (routineId: string) => ["hevy-routine", routineId];

export default {
  activitiesList,
  calendarQueryKey,
  activityViz,
  stackedActivityViz,
  weightViz,
  unlinkedActivities,
  dayDetails,
  chatThreads,
  messagesQueryKey,
  routines,
  routineDetail,
};
