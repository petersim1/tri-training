export const PLAN_KIND_VALUES = [
  "lift",
  "run",
  "bike",
  "swim",
  "recovery",
] as const;
export type PlanKind = (typeof PLAN_KIND_VALUES)[number];

/** Strava vs Hevy — `completed_workouts.vendor`, `planned_workouts.routine_vendor`, webhooks. */
const WORKOUT_VENDORS = ["strava", "hevy"] as const;
export type WorkoutVendor = (typeof WORKOUT_VENDORS)[number];

/** Planned workout / sport event lifecycle `status`. */
export const PLAN_STATUS_VALUES = ["planned", "completed", "skipped"] as const;
export type PlanStatus = (typeof PLAN_STATUS_VALUES)[number];

export const CARDIO_DISTANCE_UNITS = ["km", "mi", "m", "yd"] as const;
export type CardioDistanceUnit = (typeof CARDIO_DISTANCE_UNITS)[number];
