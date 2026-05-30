import type { HevyRoutineFolderSummary, HevyRoutineSummary } from "./types";

function folderKey(id: string | number | undefined): string | null {
  if (id === undefined || id === null) return null;
  return String(id);
}

function routineFolderKey(r: HevyRoutineSummary): string | null {
  if (r.folder_id === undefined || r.folder_id === null) return null;
  return String(r.folder_id);
}

export const groupRoutinesByFolder = (
  folders: HevyRoutineFolderSummary[],
  routines: HevyRoutineSummary[],
): {
  groups: {
    folder: HevyRoutineFolderSummary;
    routines: HevyRoutineSummary[];
  }[];
  unfoldered: HevyRoutineSummary[];
} => {
  const folderIds = new Set(
    folders.map((f) => folderKey(f.id)).filter((k): k is string => k !== null),
  );
  const sorted = [...folders].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const groups = sorted.map((folder) => {
    const fk = folderKey(folder.id);
    return {
      folder,
      routines: routines.filter((r) => routineFolderKey(r) === fk),
    };
  });
  const unfoldered = routines.filter((r) => {
    const rk = routineFolderKey(r);
    return rk === null || !folderIds.has(rk);
  });
  return { groups, unfoldered };
};
