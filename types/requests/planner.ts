import type { WorkoutVendor } from "@/lib/constants/activities";

export type LinkedSessionPayload = {
  vendor: WorkoutVendor;
  externalId: string;
  title?: string | null;
  distanceM?: number | null;
  movingTimeSeconds?: number | null;
  elapsedTimeSeconds?: number | null;
  calories?: number | null;
  /** Hevy: optional; server can derive duration when times are missing */
  startTimeIso?: string | null;
  endTimeIso?: string | null;
};

export type PlannerCreatePlanInput = {
  kind: string;
  dayKey: string;
  notes?: string | null;
  routineId?: string | null;
  distance?: number | null;
  distanceUnits?: string | null;
  timeSeconds?: number | null;
};

/** Shared between `updatePlanFn` and the planning agent (no markdown). */
export type PlannerUpdatePlanInput = {
  id: string;
  notes?: string | null;
  dayKey?: string;
  kind?: string;
  status?: string;
  stravaActivityId?: string | null;
  hevyWorkoutId?: string | null;
  linkedSession?: LinkedSessionPayload | null;
  hevyRoutineId?: string | null;
  distance?: number | null;
  distanceUnits?: string | null;
  timeSeconds?: number | null;
};
