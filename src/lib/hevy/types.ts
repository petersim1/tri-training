export type HevyRoutineSummary = {
  id?: string;
  title?: string;
  folder_id?: number | null;
  /** Some responses may use camelCase. */
  folderId?: number | null;
};

export type HevyRoutineFolderSummary = {
  id?: number | string;
  title?: string;
  name?: string;
  index?: number;
};

export type HevyRoutineFolderGroup = {
  folder: HevyRoutineFolderSummary;
  routines: HevyRoutineSummary[];
};

export type HevyRoutineSetDetail = {
  type?: string;
  weight_kg?: number | null;
  reps?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
};

/** Exercise line inside a routine (GET /v1/routines/{id}). */
export type HevyRoutineExerciseDetail = {
  index?: number;
  title?: string;
  name?: string;
  exercise_template_id?: string;
  exerciseTemplateId?: string;
  notes?: string | null;
  rest_seconds?: number | null;
  sets?: HevyRoutineSetDetail[];
};

export type HevyRoutineDetail = {
  id?: string;
  title?: string;
  folder_id?: number | null;
  notes?: string | null;
  exercises?: HevyRoutineExerciseDetail[];
};
