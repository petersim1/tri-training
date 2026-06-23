import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  HevyRoutineExerciseSummary,
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
} from "@/lib/hevy/types";
import queryKeys from "@/lib/query-keys";
import { vendorActions } from "@/server-fcts/vendors";

export const routineTitleMap = (
  routines: HevyRoutineSummary[],
): Map<string, string> => {
  const map = new Map<string, string>();
  for (const r of routines) {
    if (r.id && r.title) {
      map.set(r.id, r.title);
    }
  }
  return map;
};

function exerciseLabel(ex: HevyRoutineExerciseSummary): string {
  return (ex.title ?? "Exercise").trim() || "Exercise";
}

export const LiftRoutinePicker: React.FC<{
  groups: {
    folder: HevyRoutineFolderSummary;
    routines: HevyRoutineSummary[];
  }[];
  unfoldered: HevyRoutineSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}> = ({ groups, unfoldered, selectedId, onSelect }) => {
  const routineQuery = useQuery({
    // biome-ignore lint/style/noNonNullAssertion: <enabled flag exists.>
    queryKey: queryKeys.routineDetail(selectedId!),
    queryFn: () =>
      vendorActions.getRoutine({ data: { routineId: selectedId as string } }),
    enabled: Boolean(selectedId),
  });

  const total =
    groups.reduce((n, g) => n + g.routines.length, 0) + unfoldered.length;

  const exercises = useMemo(() => {
    const raw = routineQuery.data?.exercises ?? [];
    return [...raw].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }, [routineQuery.data?.exercises]);

  const visibleGroups = useMemo(() => {
    if (!selectedId) {
      return groups;
    }
    return groups
      .map((g) => ({
        ...g,
        routines: g.routines.filter((r) => r.id === selectedId),
      }))
      .filter((g) => g.routines.length > 0);
  }, [groups, selectedId]);

  const visibleUnfoldered = useMemo(() => {
    if (!selectedId) {
      return unfoldered;
    }
    return unfoldered.filter((r) => r.id === selectedId);
  }, [unfoldered, selectedId]);

  const selectedTitle =
    selectedId && routineQuery.data?.title
      ? routineQuery.data.title
      : selectedId
        ? (groups
            .flatMap((g) => g.routines)
            .concat(unfoldered)
            .find((r) => r.id === selectedId)?.title ?? null)
        : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-zinc-400">Routine</span>
        <button
          type="button"
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          onClick={() => onSelect(null)}
        >
          Clear
        </button>
      </div>

      {total === 0 ? (
        <p className="text-xs text-zinc-500">No routines loaded from Hevy.</p>
      ) : (
        <div
          className={
            selectedId
              ? "space-y-4 pr-1"
              : "max-h-48 space-y-4 overflow-y-auto pr-1"
          }
        >
          {visibleGroups.map(({ folder, routines }, gi) =>
            routines.length > 0 ? (
              <div
                key={
                  folder.id != null
                    ? `fg-${String(folder.id)}`
                    : `fg-${gi}-${folder.title ?? ""}`
                }
                className="space-y-1.5"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {folder.title ?? "Folder"}
                </p>
                <div className="flex flex-col gap-1">
                  {routines.map((r) => {
                    const id = r.id;
                    if (!id) {
                      return null;
                    }
                    const active = selectedId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelect(id)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                          active
                            ? "border-emerald-500/80 bg-emerald-950/40 text-zinc-100"
                            : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
                        }`}
                      >
                        {r.title ?? id}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null,
          )}
          {visibleUnfoldered.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Other
              </p>
              <div className="flex flex-col gap-1">
                {visibleUnfoldered.map((r) => {
                  const id = r.id;
                  if (!id) {
                    return null;
                  }
                  const active = selectedId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelect(id)}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        active
                          ? "border-emerald-500/80 bg-emerald-950/40 text-zinc-100"
                          : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      {r.title ?? id}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {selectedId &&
          visibleGroups.length === 0 &&
          visibleUnfoldered.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-300">
              {selectedTitle ?? selectedId}
            </p>
          ) : null}
        </div>
      )}

      {selectedId ? (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
          <p className="text-xs font-medium text-zinc-500">
            Exercises
            {selectedTitle ? (
              <span className="font-normal text-zinc-400">
                {" "}
                · {selectedTitle}
              </span>
            ) : null}
          </p>
          {routineQuery.isPending ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : routineQuery.isError || !routineQuery.data ? (
            <p className="text-sm text-amber-500/90">Could not load routine.</p>
          ) : exercises.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No exercises in this routine.
            </p>
          ) : (
            <ol className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {exercises.map((ex, i) => {
                const nSets = ex.sets?.length ?? 0;
                const rowKey =
                  ex.exercise_template_id ??
                  `ex-${String(ex.index ?? i)}-${exerciseLabel(ex)}`;
                return (
                  <li key={rowKey} className="flex gap-2 text-sm">
                    <span className="w-6 shrink-0 tabular-nums text-zinc-600">
                      {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-zinc-100">{exerciseLabel(ex)}</div>
                      {nSets > 0 ? (
                        <div className="text-xs text-zinc-500">
                          {nSets} set{nSets === 1 ? "" : "s"}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
};

/** Plan-link modal: show stored Hevy routine title + exercise list (read-only). */
export const LiftRoutineReadOnlyPreview: React.FC<{
  routineId: string | null;
  titleFromList: string | null;
}> = ({ routineId, titleFromList }) => {
  const routineQuery = useQuery({
    queryKey: queryKeys.routineDetail(routineId as string),
    queryFn: () =>
      vendorActions.getRoutine({ data: { routineId: routineId as string } }),
    enabled: Boolean(routineId),
  });

  const exercises = useMemo(() => {
    const raw = routineQuery.data?.exercises ?? [];
    return [...raw].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }, [routineQuery.data?.exercises]);

  const title =
    routineQuery.data?.title?.trim() ||
    titleFromList?.trim() ||
    (routineId ? routineId.slice(0, 8) : null);

  if (!routineId) {
    return <p className="text-xs text-zinc-500">No Hevy routine selected.</p>;
  }

  return (
    <div className="space-y-2">
      {title ? (
        <p className="text-sm font-medium text-zinc-200">{title}</p>
      ) : null}
      {routineQuery.isPending ? (
        <p className="text-xs text-zinc-500">Loading routine…</p>
      ) : routineQuery.isError || !routineQuery.data ? (
        <p className="text-xs text-amber-500/90">Could not load routine.</p>
      ) : exercises.length === 0 ? (
        <p className="text-xs text-zinc-500">No exercises in this routine.</p>
      ) : (
        <ol className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {exercises.map((ex, i) => {
            const nSets = ex.sets?.length ?? 0;
            const rowKey =
              ex.exercise_template_id ??
              `ex-${String(ex.index ?? i)}-${exerciseLabel(ex)}`;
            return (
              <li key={rowKey} className="flex gap-2 text-sm">
                <span className="w-6 shrink-0 tabular-nums text-zinc-600">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-zinc-100">{exerciseLabel(ex)}</div>
                  {nSets > 0 ? (
                    <div className="text-xs text-zinc-500">
                      {nSets} set{nSets === 1 ? "" : "s"}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};
