import type { PlanKind, PlanStatus } from "@/lib/constants/activities";
import type {
  VendorActivityRow,
  WorkoutEntryWithCompleted,
} from "@/lib/db/schema.server";

export type PlannedWorkoutsPageResult = {
  rows: WorkoutEntryWithCompleted[];
  totalPages: number;
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
  hasUnlinked: boolean;
  isToday: boolean;
};

export type UnlinkedActivitiesItem = VendorActivityRow & {
  dayKey: string;
};

export type VizResult = {
  date: string;
  value: number;
};

export type StackedVizResult = {
  date: string;
  values: {
    swim: number;
    bike: number;
    run: number;
  };
};

export type GroupItem = {
  n: number;
  v: number;
};

export type StackedGroupItem = {
  n: number;
  values: {
    swim: number;
    bike: number;
    run: number;
  };
};

export type DayItem = {
  activities: WorkoutEntryWithCompleted[];
  weight?: number;
  linkCandidates: VendorActivityRow[];
};

export type LinkAllResponse = {
  nLinked: number;
  nUnlinked: number;
};

export type BackfillReport = {
  /** New `completed_workouts` rows ingested from Strava (no auto-created plans). */
  importedStrava: number;
  /** New `completed_workouts` rows ingested from Hevy (no auto-created plans). */
  importedHevy: number;
  /** New `weight_entries` rows from Hevy `body_measurements.weight_kg` (skips days that already have a weight). */
  importedHevyWeights: number;
};
