// Strava API Types
export type SportType =
  | "AlpineSki"
  | "BackcountrySki"
  | "Badminton"
  | "Basketball"
  | "Canoeing"
  | "Cricket"
  | "Crossfit"
  | "Dance"
  | "EBikeRide"
  | "Elliptical"
  | "EMountainBikeRide"
  | "Golf"
  | "GravelRide"
  | "Handcycle"
  | "HighIntensityIntervalTraining"
  | "Hike"
  | "IceSkate"
  | "InlineSkate"
  | "Kayaking"
  | "Kitesurf"
  | "MountainBikeRide"
  | "NordicSki"
  | "Padel"
  | "PhysicalTherapy"
  | "Pickleball"
  | "Pilates"
  | "Racquetball"
  | "Ride"
  | "RockClimbing"
  | "RollerSki"
  | "Rowing"
  | "Run"
  | "Sail"
  | "Skateboard"
  | "Snowboard"
  | "Snowshoe"
  | "Soccer"
  | "Squash"
  | "StairStepper"
  | "StandUpPaddling"
  | "Surfing"
  | "Swim"
  | "TableTennis"
  | "Tennis"
  | "TrailRun"
  | "Velomobile"
  | "VirtualRide"
  | "VirtualRow"
  | "VirtualRun"
  | "Volleyball"
  | "Walk"
  | "WeightTraining"
  | "Wheelchair"
  | "Windsurf"
  | "Workout"
  | "Yoga";

type LatLng = [number, number];

type PolylineMap = {
  id: string;
  polyline?: string;
  summary_polyline?: string;
};

type MetaActivity = { id: number };
type MetaAthlete = { id: number };

type SummarySegment = {
  id: number;
  name: string;
  activity_type: "Ride" | "Run";
  distance: number;
  average_grade: number;
  maximum_grade: number;
  elevation_high: number;
  elevation_low: number;
  start_latlng: LatLng;
  end_latlng: LatLng;
  climb_category: number;
  city: string;
  state: string;
  country: string;
  private: boolean;
  athlete_pr_effort?: {
    pr_activity_id: number;
    pr_elapsed_time: number;
    pr_date: string;
    effort_count: number;
  };
  athlete_segment_stats?: {
    id: number;
    activity_id: number;
    elapsed_time: number;
    start_date: string;
    start_date_local: string;
    distance: number;
    is_kom: boolean;
  };
};

type SegmentEffort = {
  id: number;
  activity_id?: number;
  elapsed_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  is_kom?: boolean;
  name: string;
  activity: MetaActivity;
  athlete: MetaAthlete;
  moving_time: number;
  start_index: number;
  end_index: number;
  average_cadence?: number;
  average_watts?: number;
  device_watts?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  segment: SummarySegment;
  kom_rank?: number;
  pr_rank?: number;
  hidden?: boolean;
};

type Split = {
  average_speed: number;
  distance: number;
  elapsed_time: number;
  elevation_difference: number;
  pace_zone: number;
  moving_time: number;
  split: number;
};

type Lap = {
  id: number;
  activity: MetaActivity;
  athlete: MetaAthlete;
  average_cadence?: number;
  average_speed: number;
  distance: number;
  elapsed_time: number;
  start_index: number;
  end_index: number;
  lap_index: number;
  max_speed: number;
  moving_time: number;
  name: string;
  pace_zone?: number;
  split?: number;
  start_date: string;
  start_date_local: string;
  total_elevation_gain?: number;
};

type Gear = {
  id: string;
  resource_state: number;
  primary: boolean;
  name: string;
  distance: number;
};

export type StravaActivity = {
  id: number;
  external_id?: string;
  upload_id?: number;
  upload_id_str?: string;
  athlete: MetaAthlete;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  elev_high?: number;
  elev_low?: number;
  sport_type: SportType;
  start_date: string;
  start_date_local: string;
  timezone: string;
  start_latlng: LatLng | null;
  end_latlng: LatLng | null;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  total_photo_count: number;
  map: PolylineMap;
  device_name?: string;
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  flagged: boolean;
  workout_type?: number;
  average_speed: number;
  max_speed: number;
  has_kudoed: boolean;
  hide_from_home?: boolean;
  gear_id?: string;
  kilojoules?: number;
  average_watts?: number;
  device_watts?: boolean;
  max_watts?: number;
  weighted_average_watts?: number;
  // DetailedActivity only
  description?: string;
  photos?: {
    count: number;
    primary?: {
      id: number | null;
      source: number;
      unique_id: string;
      urls: Record<string, string>;
    };
  };
  gear?: Gear;
  calories?: number;
  segment_efforts?: SegmentEffort[];
  embed_token?: string;
  splits_metric?: Split[];
  splits_standard?: Split[];
  laps?: Lap[];
  best_efforts?: SegmentEffort[];
  average_heartrate?: number;
  has_heartrate: boolean;
};
