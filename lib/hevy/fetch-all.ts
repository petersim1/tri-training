import { hevyFetch } from "./client";
import type {
  HevyBodyMeasurementSummary,
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
  HevyWorkout,
} from "./types";

type PaginatedWorkouts = {
  page: number;
  page_count: number;
  workouts: HevyWorkout[];
};

type PaginatedRoutines = {
  page: number;
  page_count: number;
  routines: HevyRoutineSummary[];
};

type PaginatedFolders = {
  page: number;
  page_count: number;
  routine_folders: HevyRoutineFolderSummary[];
};

type PaginatedMeasurements = {
  page: number;
  page_count: number;
  body_measurements: HevyBodyMeasurementSummary[];
};

export async function fetchAllHevyWorkouts(): Promise<HevyWorkout[]> {
  const out: HevyWorkout[] = [];
  let page = 1;
  while (true) {
    const r = await hevyFetch<PaginatedWorkouts>(
      `/workouts?page=${page}&pageSize=10`,
    );
    out.push(...r.workouts);
    const pageCount = r.page_count ?? 1;
    if (page >= pageCount) break;
    page += 1;
  }
  return out;
}

/** List all routine pages (pageSize 10 per Hevy). */
export async function fetchAllBodyMeasurements(): Promise<
  HevyBodyMeasurementSummary[]
> {
  const out: HevyBodyMeasurementSummary[] = [];
  let page = 1;
  while (true) {
    const r = await hevyFetch<PaginatedMeasurements>(
      `/body_measurements?page=${page}&pageSize=10`,
    );
    out.push(...r.body_measurements);
    const pageCount = r.page_count ?? 1;
    if (page >= pageCount) break;
    page += 1;
  }
  return out;
}
