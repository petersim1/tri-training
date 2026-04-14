import type {
  HevyRoutineFolderGroup,
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
} from "./types";

function folderKey(id: string | number | undefined): string | null {
  if (id === undefined || id === null) return null;
  return String(id);
}

function routineFolderKey(r: HevyRoutineSummary): string | null {
  const fid = r.folder_id ?? r.folderId;
  if (fid === undefined || fid === null) return null;
  return String(fid);
}

export function groupRoutinesByFolder(
  folders: HevyRoutineFolderSummary[],
  routines: HevyRoutineSummary[],
): {
  groups: HevyRoutineFolderGroup[];
  unfoldered: HevyRoutineSummary[];
} {
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
}
