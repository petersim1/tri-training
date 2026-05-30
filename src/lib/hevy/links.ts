/** Web origins for “open in vendor” links (paths may change; adjust if Hevy updates their site). */
const HEVY_WEB = "https://www.hevy.com";
const STRAVA_WEB = "https://www.strava.com";

/** When there is no deep link (e.g. Strava GPS vs Hevy gym), send users to the Hevy web app. */
export function hevyWebRootUrl() {
  return HEVY_WEB;
}

export function hevyWorkoutWebUrl(workoutId: string) {
  return `${HEVY_WEB}/workout/${encodeURIComponent(workoutId)}`;
}

export function stravaActivityWebUrl(activityId: number | string) {
  return `${STRAVA_WEB}/activities/${activityId}`;
}
