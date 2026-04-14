import { hevyFetch } from "./client";
import { normalizeHevyRoutineSummary } from "./normalize-routine";
import type { HevyRoutineSummary } from "./types";

type PaginatedRoutines<T> = {
  routines?: T[];
  page_count?: number;
};

type PaginatedFolders<T> = {
  routine_folders?: T[];
  page_count?: number;
};

/** List all routine pages (pageSize 10 per Hevy). */
export async function fetchAllHevyRoutines(): Promise<HevyRoutineSummary[]> {
  const out: HevyRoutineSummary[] = [];
  let page = 1;
  while (true) {
    const r = await hevyFetch<PaginatedRoutines<unknown>>(
      `/routines?page=${page}&pageSize=10`,
    );
    for (const item of r.routines ?? []) {
      const norm = normalizeHevyRoutineSummary(item);
      if (norm) {
        out.push(norm);
      }
    }
    const pageCount = r.page_count ?? 1;
    if (page >= pageCount) break;
    page += 1;
  }
  return out;
}

/** List all routine folder pages (pageSize 10 per Hevy). */
export async function fetchAllRoutineFolders<T>(): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  while (true) {
    const r = await hevyFetch<PaginatedFolders<T>>(
      `/routine_folders?page=${page}&pageSize=10`,
    );
    out.push(...(r.routine_folders ?? []));
    const pageCount = r.page_count ?? 1;
    if (page >= pageCount) break;
    page += 1;
  }
  return out;
}
