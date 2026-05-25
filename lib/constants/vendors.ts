/**
 * Strava `sport_type` values ([API](https://developers.strava.com/docs/reference/#api-models-Activity)) —
 * stored lowercase in `completed_workouts.activity_kind`. Hevy sessions use `"lift"`.
 */
export const STRAVA_SPORT_TYPES = [
  "alpineski",
  "backcountryski",
  "badminton",
  "canoeing",
  "crossfit",
  "ebikeride",
  "elliptical",
  "emountainbikeride",
  "golf",
  "gravelride",
  "handcycle",
  "highintensityintervaltraining",
  "hike",
  "iceskate",
  "inlineskate",
  "kayaking",
  "kitesurf",
  "mountainbikeride",
  "nordicski",
  "pickleball",
  "pilates",
  "racquetball",
  "ride",
  "rockclimbing",
  "rollerski",
  "rowing",
  "run",
  "sail",
  "skateboard",
  "snowboard",
  "snowshoe",
  "soccer",
  "squash",
  "stairstepper",
  "standuppaddling",
  "surfing",
  "swim",
  "tabletennis",
  "tennis",
  "trailrun",
  "velomobile",
  "virtualride",
  "virtualrow",
  "virtualrun",
  "walk",
  "weighttraining",
  "wheelchair",
  "windsurf",
  "workout",
  "yoga",
] as const;

export type StravaSportTypeLowercase = (typeof STRAVA_SPORT_TYPES)[number];

/** Hevy strength sessions — not from Strava. */
export const HEVY_ACTIVITY_KIND = "lift" as const;

export type CompletedActivityKind =
  | StravaSportTypeLowercase
  | typeof HEVY_ACTIVITY_KIND;

/**
 * Normalize Strava `sport_type` (PascalCase or otherwise) to lowercase for storage.
 * Unknown types still become lowercase so new Strava values remain usable.
 */
