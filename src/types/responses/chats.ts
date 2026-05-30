import type { PlanKind, WorkoutVendor } from "@/lib/constants/activities";

export type PlannerCompletedBrief = {
  id: string;
  vendor: WorkoutVendor;
  activityKind: string;
  inferredPlanKind: PlanKind | null;
  localDayKey: string | null;
  isoStart: string | null;
  distanceM: number | null;
  movingSeconds: number | null;
  avgHeartRateBpm: number | null;
  liftExerciseLines: string[];
};
