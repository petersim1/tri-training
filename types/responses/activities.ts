import type { PlanStatus } from "@/components/PlanStatusSelect";
import type { PlanKind } from "@/lib/constants/activities";
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
  // hasUnlinked: boolean; // too finnicky with timezone's in the backend.
};

export type VizResult = {
  date: string;
  value: number;
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
