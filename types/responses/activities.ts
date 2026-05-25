import type { PlanStatus } from "@/components/PlanStatusSelect";
import type { PlanKind } from "@/lib/constants/activities";
import type { SessionChartMetric } from "@/lib/constants/visuals";
import type {
  CompletedWorkoutRow,
  PlannedWorkoutWithCompleted,
} from "@/lib/db/schema.server";

export type PlannedWorkoutsPageResult = {
  rows: PlannedWorkoutWithCompleted[];
  total: number;
};

export type ActivityItem = {
  id: string;
  kind: PlanKind;
  status: PlanStatus;
};

export type CalendarPageItem = {
  dayKey: string;
  activities: ActivityItem[];
  hasWeight: boolean;
  // hasUnlinked: boolean; // too finnicky with timezone's in the backend.
};

export type VizResult = {
  date: string;
  value: number;
};

export type VizResponse = {
  validMetrics: SessionChartMetric[];
  cumulativeOk: boolean;
  results: VizResult[];
};

export type DayItem = {
  activities: PlannedWorkoutWithCompleted[];
  weight?: number;
  linkCandidates: CompletedWorkoutRow[];
};

export type LinkAllUnresolvedCompletedItem = {
  completedWorkoutId: string;
  planId: string;
};

export type BackfillReport = {
  /** New `completed_workouts` rows ingested from Strava (no auto-created plans). */
  importedStrava: number;
  /** New `completed_workouts` rows ingested from Hevy (no auto-created plans). */
  importedHevy: number;
  /** New `weight_entries` rows from Hevy `body_measurements.weight_kg` (skips days that already have a weight). */
  importedHevyWeights: number;
};
