/** Set line on a logged Hevy workout (`GET /v1/workouts/{id}`). */
export type HevyWorkoutSetSummary = {
  reps?: number | null;
  /** `null` / omitted = bodyweight set (app substitutes max self-recorded scale weight). */
  weight_kg?: number | null;
};

export type HevyWorkoutExerciseSummary = {
  sets?: HevyWorkoutSetSummary[] | null;
};

export type HevyWorkoutSummary = {
  id?: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  routine_id?: string;
  exercises?: HevyWorkoutExerciseSummary[] | null;
};
