import type { PlanKind, WorkoutVendor } from "@/lib/constants/activities";
import type { CompletedActivityKind } from "@/lib/constants/vendors";

export type PlannerCompletedBrief = {
  id: string;
  vendor: WorkoutVendor;
  activityKind: CompletedActivityKind;
  inferredPlanKind: PlanKind | null;
  localDayKey: string | null;
  isoStart: string | null;
  isResolved: boolean;
  distanceM: number | null;
  movingSeconds: number | null;
  avgHeartRateBpm: number | null;
  liftExerciseLines: string[];
};
