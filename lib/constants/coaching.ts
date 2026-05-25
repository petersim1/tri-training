export const PATCH_TOP_KEYS = new Set([
  "constraints_patch",
  "preferences",
  "discipline_state",
  "periodization",
  "flags",
]);

/** Planner output that must never overwrite coaching preferences / periodization. */
export const PLAN_EPHEMERAL_TOP_KEYS = new Set([
  "workout_plan",
  "weekly_plan",
  "calendar_plan",
  "planned_week",
  "week_schedule",
  "proposal_schedule",
]);

export const WEEKDAYS_LOWER = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
