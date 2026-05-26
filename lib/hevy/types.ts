export type HevyWorkout = {
  id: string;
  title: string;
  routine_id: string;
  description: string;
  start_time: string;
  end_time: string;
  updated_at: string;
  created_at: string;
  exercises: HevyExerciseSummary[];
};

export type HevyExerciseSummary = {
  index: number;
  title: string;
  notes: string;
  exercise_template_id: string;
  supersets_id?: number;
  sets: HevySetSummary[];
};

export type HevySetSummary = {
  index: number;
  type: "normal" | "warmup" | "dropset" | "failure";
  weight_kg?: number;
  reps?: number;
  distance_meters?: number;
  duration_seconds?: number;
  rpe?: number;
  custom_metric?: number;
};

export type HevyRoutineSummary = {
  id: string;
  title: string;
  folder_id?: number;
  updated_at: string;
  created_at: string;
  exercises: HevyRoutineExerciseSummary[];
};

export type HevyRoutineExerciseSummary = HevyExerciseSummary & {
  rest_seconds: string;
};

export type HevyRoutineFolderSummary = {
  id: number;
  index: number;
  title: string;
  updated_at: string;
  created_at: string;
};

export type HevyBodyMeasurementSummary = {
  date: string; // YYYY-MM-DD
  weight_kg?: number;
  lean_mass_kg?: number;
  fat_percent?: number;
  neck_cm?: number;
  shoulder_cm?: number;
  chest_cm?: number;
  left_bicep_cm?: number;
  right_bicep_cm?: number;
  left_forearm_cm?: number;
  right_forearm_cm?: number;
  abdomen?: number;
  waist?: number;
  hips?: number;
  left_thigh?: number;
  right_thigh?: number;
  left_calf?: number;
  right_calf?: number;
};
