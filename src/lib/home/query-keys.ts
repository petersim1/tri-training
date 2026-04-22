/** Full planned-workouts list for home calendar — independent of session chart UI (range/metric/cumulative). */
export const homePlansQueryKey = ["plannedWorkouts", "list"] as const;

export const homeWeightQueryKey = ["weightEntries", "list"] as const;

export const homeHevyBundleQueryKey = ["hevy", "homeBundle"] as const;

/** Calendar dot: days with completed sessions not yet linked to any plan (`is_resolved = false`). */
export const homeUnresolvedCompletedDayKeysQueryKey = [
  "completedWorkouts",
  "unresolvedDayKeys",
] as const;

/** Day modal: unlinked sessions for one `YYYY-MM-DD` local day. */
export const homeUnresolvedCompletedForDayQueryKey = (dayKey: string) =>
  ["completedWorkouts", "unresolvedForDay", dayKey] as const;

/** Activities page: list every unlinked completed session (bulk link). */
export const activitiesUnresolvedCompletedQueryKey = [
  "completedWorkouts",
  "allUnresolved",
] as const;
