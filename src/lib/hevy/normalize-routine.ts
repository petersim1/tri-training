import type { HevyRoutineSummary } from "./types";

/** Map Hevy list payloads to a consistent shape (handles nesting / alternate keys). */
export function normalizeHevyRoutineSummary(
  raw: unknown,
): HevyRoutineSummary | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const inner =
    o.routine && typeof o.routine === "object"
      ? (o.routine as Record<string, unknown>)
      : o;
  const idRaw = inner.id ?? inner.routine_id;
  const id =
    typeof idRaw === "string" ? idRaw : idRaw != null ? String(idRaw) : "";
  if (!id) {
    return null;
  }
  const title = inner.title ?? inner.name;
  const folderRaw = inner.folder_id ?? inner.folderId;
  let folder_id: number | null | undefined;
  if (folderRaw === undefined) {
    folder_id = undefined;
  } else if (folderRaw === null) {
    folder_id = null;
  } else if (typeof folderRaw === "number") {
    folder_id = folderRaw;
  } else if (typeof folderRaw === "string") {
    const n = Number(folderRaw);
    folder_id = Number.isFinite(n) ? n : null;
  } else {
    folder_id = null;
  }
  return {
    id,
    title: typeof title === "string" ? title : undefined,
    folder_id: folder_id ?? null,
    folderId: folder_id ?? null,
  };
}
