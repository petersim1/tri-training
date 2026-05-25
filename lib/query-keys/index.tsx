import type {
  ActivityListSchemaValues,
  CalendarScope,
} from "@/types/requests/activities";
import type { PlanKind } from "../constants/activities";
import type {
  SessionChartMetric,
  SessionChartRange,
} from "../constants/visuals";

const activitiesList = (query: ActivityListSchemaValues) => [
  "activities",
  query,
];

const calendarQueryKey = (period: CalendarScope, anchor: string) => [
  "calendar",
  period,
  anchor,
];

const activityViz = (
  kind?: PlanKind,
  range?: SessionChartRange,
  metric?: SessionChartMetric,
  cumulative?: boolean,
) => ["activity-viz", kind, range, metric, cumulative];

const weightViz = (range?: SessionChartRange) => ["weight-viz", range];

const unlinkedActivities = ["unlinked"];

const dayDetails = (day: string) => ["day-details", day];

export default {
  activitiesList,
  calendarQueryKey,
  activityViz,
  weightViz,
  unlinkedActivities,
  dayDetails,
};
