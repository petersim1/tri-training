/** Strava list/detail activity — extra fields are present on typical API responses. */
export type StravaActivitySummary = {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  /** Meters */
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  calories?: number;
  /** Strava marks whether streams include heart rate — false ⇒ no HR for this activity. */
  has_heartrate?: boolean;
  /** BPM when activity has HR data */
  average_heartrate?: number;
};
