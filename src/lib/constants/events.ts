import type { CardioDistanceUnit, PlanKind } from "./activities";

export const SPORT_EVENT_DISCIPLINES = [
  "lift",
  "run",
  "bike",
  "swim",
  "recovery",
  "multi",
] as const;
export type SportEventDiscipline = (typeof SPORT_EVENT_DISCIPLINES)[number];

export type SportEventTargetSegment = {
  activity: PlanKind;
  /** Distinguishes repeated legs (e.g. second run in duathlon). */
  label?: string | null;
  distance?: number | null;
  distance_units?: CardioDistanceUnit | null;
  time_seconds?: number | null;
  notes?: string | null;
};
