import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ActivityMetricsChart } from "~/components/ActivityMetricsChart";
import { LinkedSessionPanel } from "~/components/LinkedSessionPanel";
import { PlanCardioTargetsField } from "~/components/PlanCardioTargetsField";
import { PlanNotesField } from "~/components/PlanNotesField";
import { PlanStatusSelect } from "~/components/PlanStatusSelect";
import { WeightTrendChart } from "~/components/WeightTrendChart";
import type {
  CompletedWorkoutRow,
  PlannedWorkoutWithCompleted,
  WeightEntryRow,
} from "~/lib/db/schema";
import type {
  HevyRoutineExerciseDetail,
  HevyRoutineFolderGroup,
  HevyRoutineSummary,
} from "~/lib/hevy/types";
import type { CalendarScope } from "~/lib/home/calendar-scope";
import {
  homeHevyBundleQueryKey,
  homePlansQueryKey,
  homeUnresolvedCompletedDayKeysQueryKey,
  homeUnresolvedCompletedForDayQueryKey,
  homeWeightQueryKey,
} from "~/lib/home/query-keys";
import type { SessionChartSettings } from "~/lib/home/session-chart-settings";
import { sessionChartDayRange } from "~/lib/home/session-chart-settings";
import {
  type ActivityPlotKind,
  buildActivityPlotPoints,
} from "~/lib/plans/activity-plot-points";
import {
  CARDIO_DISTANCE_UNITS,
  isCardioKind,
} from "~/lib/plans/cardio-targets";
import {
  completedWorkoutTitle,
  inferPlanKindFromCompletedRow,
} from "~/lib/plans/completed-workout-data";
import type { LinkedSessionPayload } from "~/lib/plans/linked-session";
import {
  linkedSessionFromCompletedRow,
  linkedSessionFromHevyWorkout,
  linkedSessionFromStravaActivity,
} from "~/lib/plans/linked-session";
import type { PlannedWorkoutsPageResult } from "~/lib/plans/select-with-completed";
import {
  fetchHevyHomeBundleFn,
  fetchUnresolvedCompletedDayKeysFn,
  fetchUnresolvedCompletedForDayFn,
  fetchWeightEntriesForHomeFn,
  setCalendarScopeFn,
  setSessionChartSettingsFn,
} from "~/lib/server-fns/home";
import {
  getPlanLinkCandidatesFn,
  getPlanLinkCandidatesForDayFn,
} from "~/lib/server-fns/plan-link-candidates";
import { listAllPlannedWorkoutsFn } from "~/lib/server-fns/planned-workouts-list";
import {
  createPlanFn,
  createPlanFromActivityFn,
  deletePlanFn,
  updatePlanFn,
} from "~/lib/server-fns/plans";
import { getRoutineDetailFn } from "~/lib/server-fns/vendors/hevy";
import {
  clearWeightForDayFn,
  setWeightForDayFn,
} from "~/lib/server-fns/weight";

const homeRouteApi = getRouteApi("/_authed/");

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Shared size for calendar weight / unlinked dots (month + week). */
const CAL_DAY_DOT_BASE =
  "inline-flex size-2 shrink-0 rounded-full ring-1 ring-inset ring-black/25";
const CAL_DAY_DOT_WEIGHT = `${CAL_DAY_DOT_BASE} bg-amber-400`;
const CAL_DAY_DOT_UNLINKED = `${CAL_DAY_DOT_BASE} bg-violet-400`;

/** Month grid: day + weight row + activity icons (desktop wide viewport). */
const CAL_DAY_CELL_MONTH_WIDE_CLASS = "h-18";

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar cell `key` format — matches `day_key` / chart `YYYY-MM-DD`. */
function dayKeyFromParts(y: number, m0: number, day: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayLocalDayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/**
 * Calendar "today" cell — must use the **browser's** local calendar, not SSR/UTC.
 * Server snapshot is empty so no day is highlighted until the client hydrates.
 */
function subscribeTodayDayKey(onChange: () => void): () => void {
  const id = setInterval(onChange, 60_000);
  const bump = () => onChange();
  document.addEventListener("visibilitychange", bump);
  window.addEventListener("focus", bump);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", bump);
    window.removeEventListener("focus", bump);
  };
}

function useTodayDayKeyForCalendar(): string {
  return useSyncExternalStore(subscribeTodayDayKey, todayLocalDayKey, () => "");
}

/** `YYYY-MM-DD` strictly after today (local calendar). */
function isLocalDayKeyInFuture(dayKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dayKey) && dayKey > todayLocalDayKey();
}

/** Plan on this day can still attach this unlinked session (same plan kind, not linked yet). */
function planAcceptsLinkForCompleted(
  p: PlannedWorkoutWithCompleted,
  cw: CompletedWorkoutRow,
): boolean {
  if (p.completedWorkoutId) {
    return false;
  }
  if (p.status !== "planned") {
    return false;
  }
  const pk = inferPlanKindFromCompletedRow(cw);
  return pk !== null && p.kind === pk;
}

function updatePlanPayloadForCompletedLink(
  cw: CompletedWorkoutRow,
  planId: string,
): {
  id: string;
  stravaActivityId: string;
  hevyWorkoutId: string;
  linkedSession: LinkedSessionPayload;
} {
  const linkedSession = linkedSessionFromCompletedRow(cw);
  if (cw.vendor === "strava") {
    return {
      id: planId,
      stravaActivityId: cw.vendorId,
      hevyWorkoutId: "",
      linkedSession,
    };
  }
  return {
    id: planId,
    stravaActivityId: "",
    hevyWorkoutId: cw.vendorId,
    linkedSession,
  };
}

function formatSessionTime(iso: string | undefined) {
  if (!iso) {
    return "";
  }
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function plansByDayKey(
  plans: PlannedWorkoutWithCompleted[],
): Map<string, PlannedWorkoutWithCompleted[]> {
  const m = new Map<string, PlannedWorkoutWithCompleted[]>();
  for (const p of plans) {
    const k = localDayKey(p.scheduledAt);
    const list = m.get(k) ?? [];
    list.push(p);
    m.set(k, list);
  }
  for (const [, list] of m) {
    list.sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  }
  return m;
}

/** One weight row per calendar day (`dayKey` from DB). */
function weightsByDayKey(
  entries: WeightEntryRow[],
): Map<string, WeightEntryRow> {
  const m = new Map<string, WeightEntryRow>();
  for (const e of entries) {
    m.set(e.dayKey, e);
  }
  return m;
}

function routineTitleMap(routines: HevyRoutineSummary[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of routines) {
    if (r.id && r.title) {
      map.set(r.id, r.title);
    }
  }
  return map;
}

function exerciseLabel(ex: HevyRoutineExerciseDetail): string {
  return (ex.title ?? ex.name ?? "Exercise").trim() || "Exercise";
}

function LiftRoutinePicker({
  groups,
  unfoldered,
  selectedId,
  onSelect,
}: {
  groups: HevyRoutineFolderGroup[];
  unfoldered: HevyRoutineSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const routineQuery = useQuery({
    queryKey: ["hevyRoutineDetail", selectedId],
    queryFn: () =>
      getRoutineDetailFn({ data: { routineId: selectedId as string } }),
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
                  {folder.title ?? folder.name ?? "Folder"}
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
                  ex.exerciseTemplateId ??
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
}

/** Plan-link modal: show stored Hevy routine title + exercise list (read-only). */
function LiftRoutineReadOnlyPreview({
  routineId,
  titleFromList,
}: {
  routineId: string | null;
  titleFromList: string | null;
}) {
  const routineQuery = useQuery({
    queryKey: ["hevyRoutineDetail", routineId],
    queryFn: () =>
      getRoutineDetailFn({ data: { routineId: routineId as string } }),
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
              ex.exerciseTemplateId ??
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
}

type CalendarCell = { key: string; day: number | null };

function calendarCells(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const mondayPad = (first.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < mondayPad; i++) {
    cells.push({ key: `pad-start-${year}-${month}-${i}`, day: null });
  }
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ key: `day-${year}-${month}-${d}`, day: d });
  }
  let tail = 0;
  while (cells.length % 7 !== 0) {
    cells.push({ key: `pad-end-${year}-${month}-${tail}`, day: null });
    tail += 1;
  }
  return cells;
}

/** Local-calendar Monday of the ISO week containing `dt` (week starts Monday). */
function startOfIsoWeekMondayFromDate(dt: Date): {
  y: number;
  m0: number;
  d: number;
} {
  const copy = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const mondayOffset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - mondayOffset);
  return {
    y: copy.getFullYear(),
    m0: copy.getMonth(),
    d: copy.getDate(),
  };
}

function addCalendarDays(
  y: number,
  m0: number,
  d: number,
  delta: number,
): { y: number; m0: number; d: number } {
  const next = new Date(y, m0, d + delta);
  return {
    y: next.getFullYear(),
    m0: next.getMonth(),
    d: next.getDate(),
  };
}

/** Seven consecutive days from Monday `weekMonday` (may cross month boundaries). */
function calendarWeekDayCells(weekMonday: {
  y: number;
  m0: number;
  d: number;
}): { key: string; y: number; m0: number; d: number }[] {
  const out: { key: string; y: number; m0: number; d: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const { y, m0, d } = addCalendarDays(
      weekMonday.y,
      weekMonday.m0,
      weekMonday.d,
      i,
    );
    out.push({ key: `wk-${y}-${m0}-${d}`, y, m0, d });
  }
  return out;
}

function weekRangeLabel(weekMonday: {
  y: number;
  m0: number;
  d: number;
}): string {
  const start = new Date(weekMonday.y, weekMonday.m0, weekMonday.d);
  const endParts = addCalendarDays(
    weekMonday.y,
    weekMonday.m0,
    weekMonday.d,
    6,
  );
  const end = new Date(endParts.y, endParts.m0, endParts.d);
  const a = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const b = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${a} – ${b}`;
}

type CalendarGridCell =
  | { kind: "pad"; key: string }
  | { kind: "day"; key: string; y: number; m0: number; d: number };

function buildCalendarGridCells(
  compact: boolean,
  viewY: number,
  viewM: number,
  weekStart: { y: number; m0: number; d: number },
): CalendarGridCell[] {
  if (compact) {
    return calendarWeekDayCells(weekStart).map((c) => ({
      kind: "day" as const,
      key: c.key,
      y: c.y,
      m0: c.m0,
      d: c.d,
    }));
  }
  return calendarCells(viewY, viewM).map((cell): CalendarGridCell => {
    if (cell.day === null) {
      return { kind: "pad", key: cell.key };
    }
    return {
      kind: "day",
      key: cell.key,
      y: viewY,
      m0: viewM,
      d: cell.day,
    };
  });
}

type HomeCalendarDayLayout = "monthGrid" | "weekList";

type PlanActivityKind = "swim" | "lift" | "run" | "bike";

function normalizePlanActivityKind(kind: string): PlanActivityKind | "other" {
  if (kind === "swim" || kind === "lift" || kind === "run" || kind === "bike") {
    return kind;
  }
  return "other";
}

const activityIconSvgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "sm:size-4 size-3 shrink-0",
  "aria-hidden": true,
} as const;

/** Lucide-style paths — swim (Aquarius waves), lift (dumbbell), run (sport shoe), bike. */
function PlanActivityKindIcon({ kind }: { kind: string }) {
  const k = normalizePlanActivityKind(kind);

  if (k === "swim") {
    return (
      <svg {...activityIconSvgProps}>
        <path d="m2 10 2.456-3.684a.7.7 0 0 1 1.106-.013l2.39 3.413a.7.7 0 0 0 1.096-.001l2.402-3.432a.7.7 0 0 1 1.098 0l2.402 3.432a.7.7 0 0 0 1.098 0l2.389-3.413a.7.7 0 0 1 1.106.013L22 10" />
        <path d="m2 18.002 2.456-3.684a.7.7 0 0 1 1.106-.013l2.39 3.413a.7.7 0 0 0 1.097 0l2.402-3.432a.7.7 0 0 1 1.098 0l2.402 3.432a.7.7 0 0 0 1.098 0l2.389-3.413a.7.7 0 0 1 1.106.013L22 18.002" />
      </svg>
    );
  }

  if (k === "lift") {
    return (
      <svg {...activityIconSvgProps}>
        <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
        <path d="m2.5 21.5 1.4-1.4" />
        <path d="m20.1 3.9 1.4-1.4" />
        <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
        <path d="m9.6 14.4 4.8-4.8" />
      </svg>
    );
  }

  if (k === "run") {
    return (
      <svg {...activityIconSvgProps}>
        <path d="m15 10.42 4.8-5.07" />
        <path d="M19 18h3" />
        <path d="M9.5 22L21.414 9.415A2 2 0 0 0 21.2 6.4l-5.61-4.208A1 1 0 0 0 14 3v2a2 2 0 0 1-1.394 1.906L8.677 8.053A1 1 0 0 0 8 9c-.155 6.393-2.082 9-4 9a2 2 0 0 0 0 4h14" />
      </svg>
    );
  }

  if (k === "bike") {
    return (
      <svg {...activityIconSvgProps}>
        <circle cx="18.5" cy="17.5" r="3.5" />
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="15" cy="5" r="1" />
        <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
      </svg>
    );
  }

  return (
    <svg {...activityIconSvgProps}>
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function CalendarDayActivityIcons({
  dayPlans,
}: {
  dayPlans: PlannedWorkoutWithCompleted[];
}) {
  if (dayPlans.length === 0) {
    return (
      <span className="text-sm leading-none text-zinc-600" aria-hidden>
        ·
      </span>
    );
  }

  return (
    <>
      {dayPlans.map((p) => (
        <span
          key={p.id}
          title={`${p.kind}${p.status === "completed" ? " · completed" : ""}`}
          className={
            p.status === "completed"
              ? "inline-flex shrink-0 text-emerald-500"
              : "inline-flex shrink-0 text-zinc-500"
          }
        >
          <PlanActivityKindIcon kind={p.kind} />
        </span>
      ))}
    </>
  );
}

function HomeCalendarDayBlock({
  y,
  m0,
  day,
  dayKey,
  dayPlans,
  dayWeight,
  dayHasUnlinkedSession,
  isHighlightedDay,
  isToday,
  layout,
  monthCellHeightClass,
  onOpenDay,
}: {
  y: number;
  m0: number;
  day: number;
  dayKey: string;
  dayPlans: PlannedWorkoutWithCompleted[];
  dayWeight: WeightEntryRow | undefined;
  /** Completed session in DB (webhook) not yet linked to any plan — violet dot. */
  dayHasUnlinkedSession: boolean;
  isHighlightedDay: boolean;
  isToday: boolean;
  layout: HomeCalendarDayLayout;
  monthCellHeightClass: string;
  onOpenDay: () => void;
}) {
  const dayAriaLabel = new Date(y, m0, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const openPlanCount = dayPlans.filter((p) => p.status !== "completed").length;
  const completedPlanCount = dayPlans.filter(
    (p) => p.status === "completed",
  ).length;
  const weekListAria = [
    dayAriaLabel,
    openPlanCount > 0
      ? `${openPlanCount} open plan${openPlanCount === 1 ? "" : "s"}`
      : null,
    completedPlanCount > 0 ? `${completedPlanCount} completed` : null,
    dayWeight ? "weight logged" : null,
    dayHasUnlinkedSession ? "unlinked session" : null,
  ]
    .filter(Boolean)
    .join(". ");

  if (layout === "weekList") {
    return (
      <div
        id={`home-cal-day-${dayKey}`}
        className={`relative flex min-h-[3.25rem] min-w-0 flex-col overflow-hidden bg-zinc-950 ${
          isHighlightedDay
            ? "z-[4] ring-2 ring-sky-500/80 ring-inset"
            : isToday
              ? "ring-1 ring-emerald-600/50 ring-inset"
              : ""
        }`}
      >
        <button
          type="button"
          className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 hover:bg-zinc-900/45 focus-visible:z-[5] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset touch-manipulation"
          onClick={onOpenDay}
          aria-label={`Open ${weekListAria}`}
        />
        <div className="relative z-[2] flex h-full min-h-0 w-full flex-col px-0.5 pt-1 pb-0 pointer-events-none">
          <div className="relative mb-0.5 min-h-[1.25rem] w-full shrink-0">
            <span
              className={`relative z-[1] block w-full text-center text-sm font-medium tabular-nums leading-none ${
                isToday ? "text-emerald-400" : "text-zinc-200"
              }`}
            >
              {day}
            </span>
            {dayWeight ? (
              <span
                className={`absolute left-0.5 top-0.5 z-[4] ${CAL_DAY_DOT_WEIGHT}`}
                title={`${dayWeight.weightLb.toFixed(1)} lb`}
                aria-hidden
              />
            ) : null}
            {dayHasUnlinkedSession ? (
              <span
                className={`absolute right-0.5 top-0.5 z-[4] ${CAL_DAY_DOT_UNLINKED}`}
                title="Session not linked to a plan"
                aria-hidden
              />
            ) : null}
          </div>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-1 sm:gap-2">
            <CalendarDayActivityIcons dayPlans={dayPlans} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`home-cal-day-${dayKey}`}
      className={`relative flex ${monthCellHeightClass} min-w-0 flex-col overflow-hidden bg-zinc-950 px-1 pt-0.5 pb-0 ${
        isHighlightedDay
          ? "z-[4] ring-2 ring-sky-500/80 ring-inset"
          : isToday
            ? "ring-1 ring-emerald-600/50 ring-inset"
            : ""
      }`}
    >
      <button
        type="button"
        className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 hover:bg-zinc-900/45 focus-visible:z-[5] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset touch-manipulation"
        onClick={onOpenDay}
        aria-label={`Open ${weekListAria}`}
      />
      <div className="relative z-[2] flex h-full min-h-0 min-w-0 flex-1 flex-col pointer-events-none">
        <div className="flex shrink-0 items-center justify-between gap-1">
          <div
            className={`text-xs font-medium leading-none ${
              isToday ? "text-emerald-400" : "text-zinc-500"
            }`}
          >
            {day}
          </div>
          <div className="flex shrink-0 items-end gap-0.5">
            {dayHasUnlinkedSession ? (
              <span
                className={CAL_DAY_DOT_UNLINKED}
                title="Session not linked to a plan"
                aria-hidden
              />
            ) : null}
            {dayWeight ? (
              <span
                className={CAL_DAY_DOT_WEIGHT}
                title={`${dayWeight.weightLb.toFixed(1)} lb`}
                aria-hidden
              />
            ) : null}
          </div>
        </div>
        <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-2">
          <CalendarDayActivityIcons dayPlans={dayPlans} />
        </div>
      </div>
    </div>
  );
}

type SelectedDay = { y: number; m: number; d: number };

type DayModalScreen = "summary" | "addPlan" | "addFromActivity" | "planLink";

/** Plan scheduled time for this calendar day (local noon); no separate date UI. */
function scheduledAtIsoForDay(y: number, m0: number, d: number): string {
  return new Date(y, m0, d, 12, 0, 0, 0).toISOString();
}

function parseFormOptionalFloat(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") {
    return null;
  }
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function parseFormOptionalInt(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") {
    return null;
  }
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

function removePlannedWorkoutFromCaches(
  queryClient: QueryClient,
  deletedId: string,
) {
  queryClient.setQueryData<PlannedWorkoutWithCompleted[]>(
    homePlansQueryKey,
    (old) => (old ?? []).filter((p) => p.id !== deletedId),
  );

  queryClient.setQueriesData(
    { queryKey: ["plannedWorkouts", "activitiesPage"] },
    (old: unknown) => {
      if (!old || typeof old !== "object" || !("rows" in old)) return old;
      const page = old as PlannedWorkoutsPageResult;
      if (!Array.isArray(page.rows)) return old;
      const had = page.rows.some((r) => r.id === deletedId);
      return {
        ...page,
        rows: page.rows.filter((r) => r.id !== deletedId),
        total: had ? Math.max(0, page.total - 1) : page.total,
        totalAll: Math.max(0, page.totalAll - 1),
      };
    },
  );

  queryClient.removeQueries({ queryKey: ["planLinkCandidates", deletedId] });
}

export function Home() {
  const data = homeRouteApi.useLoaderData();
  const loaderSessionChart = data.sessionChartSettings;
  const loaderCalendarScope = data.calendarScope;
  const queryClient = useQueryClient();

  const [sessionChartSettings, setSessionChartSettings] = useState(
    () => data.sessionChartSettings,
  );

  useEffect(() => {
    setSessionChartSettings(loaderSessionChart);
  }, [loaderSessionChart]);

  const [calendarScope, setCalendarScope] = useState(() => data.calendarScope);

  useEffect(() => {
    setCalendarScope(loaderCalendarScope);
  }, [loaderCalendarScope]);

  const runSetCalendarScope = useServerFn(setCalendarScopeFn);
  const runSetSessionChartSettings = useServerFn(setSessionChartSettingsFn);

  const patchSessionChartMutation = useMutation({
    mutationFn: async (patch: Partial<SessionChartSettings>) => {
      const next = { ...sessionChartSettings, ...patch };
      await runSetSessionChartSettings({ data: next });
      return next;
    },
    onSuccess: (next) => {
      setSessionChartSettings(next);
    },
  });

  const persistCalendarScopeMutation = useMutation({
    mutationFn: (scope: CalendarScope) =>
      runSetCalendarScope({ data: { scope } }),
    onSuccess: (_, scope) => {
      setCalendarScope(scope);
    },
  });

  const plansQuery = useQuery({
    queryKey: homePlansQueryKey,
    queryFn: () => listAllPlannedWorkoutsFn(),
  });
  const plans = plansQuery.data ?? [];

  const weightQuery = useQuery({
    queryKey: homeWeightQueryKey,
    queryFn: () => fetchWeightEntriesForHomeFn(),
  });
  const weightEntries = weightQuery.data ?? [];

  const hevyQuery = useQuery({
    queryKey: homeHevyBundleQueryKey,
    queryFn: () => fetchHevyHomeBundleFn(),
  });
  const hevyRoutines = hevyQuery.data?.hevyRoutines ?? [];
  const hevyRoutineGroups = hevyQuery.data?.hevyRoutineGroups ?? [];
  const hevyRoutinesUnfoldered = hevyQuery.data?.hevyRoutinesUnfoldered ?? [];

  const unresolvedCompletedQuery = useQuery({
    queryKey: homeUnresolvedCompletedDayKeysQueryKey,
    queryFn: () => fetchUnresolvedCompletedDayKeysFn(),
  });
  const unresolvedDayKeysSet = useMemo(() => {
    const keys = unresolvedCompletedQuery.data?.dayKeys ?? [];
    return new Set(keys);
  }, [unresolvedCompletedQuery.data?.dayKeys]);

  async function refreshAfterPlanChange() {
    await queryClient.invalidateQueries({
      queryKey: ["planLinkCandidates"],
      refetchType: "all",
    });
    await queryClient.invalidateQueries({
      queryKey: ["planLinkCandidatesForDay"],
      refetchType: "all",
    });
    await queryClient.invalidateQueries({
      queryKey: ["plannedWorkouts"],
      refetchType: "all",
    });
    await queryClient.invalidateQueries({
      queryKey: ["weightEntries"],
      refetchType: "all",
    });
    await queryClient.invalidateQueries({
      queryKey: ["completedWorkouts"],
      refetchType: "all",
    });
  }

  const [view, setView] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  /** Monday (local) of the visible week — `md` and up use month `view` only. */
  const [weekStart, setWeekStart] = useState(() =>
    startOfIsoWeekMondayFromDate(new Date()),
  );

  const showWeekStrip = calendarScope === "week";

  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);
  const [weightErr, setWeightErr] = useState<string | null>(null);
  const [planKind, setPlanKind] = useState("");
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [liftRoutineId, setLiftRoutineId] = useState<string | null>(null);
  const [dayModalScreen, setDayModalScreen] =
    useState<DayModalScreen>("summary");
  const [linkPlanId, setLinkPlanId] = useState<string | null>(null);
  /** Draft Hevy routine id while editing in plan-link modal (lift). */
  const [planLinkRoutineDraftId, setPlanLinkRoutineDraftId] = useState<
    string | null
  >(null);
  /** When true, show routine picker + save; when false, show current routine + exercises only. */
  const [planLinkRoutineEditing, setPlanLinkRoutineEditing] = useState(false);
  /** While linking an unlinked session from the day summary to a plan (mutation in flight). */
  const [linkingCompletedWorkoutId, setLinkingCompletedWorkoutId] = useState<
    string | null
  >(null);
  /** Notes field on "Add from activity" screen. */
  const [retroActivityNotes, setRetroActivityNotes] = useState("");
  /** Set from weight / session chart: which calendar day is emphasized (modal not opened). */
  const [highlightedDayKey, setHighlightedDayKey] = useState<string | null>(
    null,
  );
  const [activityPlotKind, setActivityPlotKind] =
    useState<ActivityPlotKind>("run");
  const calendarSectionRef = useRef<HTMLElement | null>(null);
  const scrollCalendarFromChartRef = useRef(false);

  const byDay = useMemo(() => plansByDayKey(plans), [plans]);
  const byWeightDay = useMemo(
    () => weightsByDayKey(weightEntries),
    [weightEntries],
  );
  const activityPlotPoints = useMemo(() => {
    const { from, to } = sessionChartDayRange(sessionChartSettings.range);
    return buildActivityPlotPoints(plans, activityPlotKind, from, to);
  }, [plans, activityPlotKind, sessionChartSettings.range]);

  const weightEntriesInRange = useMemo(() => {
    const { from, to } = sessionChartDayRange(sessionChartSettings.range);
    return weightEntries.filter((e) => {
      if (from && e.dayKey < from) {
        return false;
      }
      if (to && e.dayKey > to) {
        return false;
      }
      return true;
    });
  }, [weightEntries, sessionChartSettings.range]);
  const rTitle = useMemo(() => routineTitleMap(hevyRoutines), [hevyRoutines]);
  const todayDayKey = useTodayDayKeyForCalendar();

  const gridCells = useMemo(
    () => buildCalendarGridCells(showWeekStrip, view.y, view.m, weekStart),
    [showWeekStrip, view.y, view.m, weekStart],
  );

  const monthLabel = new Date(view.y, view.m, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const calendarNavLabel = showWeekStrip
    ? weekRangeLabel(weekStart)
    : monthLabel;

  /** Responsive height: no JS viewport — avoids cell jump after hydration / when queries resolve. */
  const monthDayCellHeightClass =
    calendarScope === "month" ? "h-16 lg:h-18" : CAL_DAY_CELL_MONTH_WIDE_CLASS;

  useEffect(() => {
    if (!selectedDay) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return;
      }
      if (
        dayModalScreen === "addPlan" ||
        dayModalScreen === "planLink" ||
        dayModalScreen === "addFromActivity"
      ) {
        setDayModalScreen("summary");
        setPlanErr(null);
        setLinkPlanId(null);
        setPlanLinkRoutineDraftId(null);
        setPlanLinkRoutineEditing(false);
        setLinkingCompletedWorkoutId(null);
        return;
      }
      setSelectedDay(null);
      setWeightErr(null);
      setPlanErr(null);
      setLiftRoutineId(null);
      setLinkPlanId(null);
      setPlanLinkRoutineDraftId(null);
      setPlanLinkRoutineEditing(false);
      setLinkingCompletedWorkoutId(null);
      setDayModalScreen("summary");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDay, dayModalScreen]);

  useEffect(() => {
    if (planKind !== "lift") {
      setLiftRoutineId(null);
    }
  }, [planKind]);

  useLayoutEffect(() => {
    if (!scrollCalendarFromChartRef.current || !highlightedDayKey) {
      return;
    }
    scrollCalendarFromChartRef.current = false;
    const section = calendarSectionRef.current;
    const cell = document.getElementById(`home-cal-day-${highlightedDayKey}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => {
      cell?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [highlightedDayKey]);

  function prevCalendarPage() {
    setHighlightedDayKey(null);
    if (showWeekStrip) {
      setWeekStart((ws) => addCalendarDays(ws.y, ws.m0, ws.d, -7));
    } else {
      setView((v) => {
        const d = new Date(v.y, v.m - 1, 1);
        return { y: d.getFullYear(), m: d.getMonth() };
      });
    }
  }

  function nextCalendarPage() {
    setHighlightedDayKey(null);
    if (showWeekStrip) {
      setWeekStart((ws) => addCalendarDays(ws.y, ws.m0, ws.d, 7));
    } else {
      setView((v) => {
        const d = new Date(v.y, v.m + 1, 1);
        return { y: d.getFullYear(), m: d.getMonth() };
      });
    }
  }

  function goToday() {
    setHighlightedDayKey(null);
    const n = new Date();
    setView({ y: n.getFullYear(), m: n.getMonth() });
    setWeekStart(startOfIsoWeekMondayFromDate(n));
  }

  function openDay(y: number, m0: number, day: number) {
    setHighlightedDayKey(null);
    setSelectedDay({ y, m: m0, d: day });
    setDayModalScreen("summary");
    setLinkPlanId(null);
    setPlanLinkRoutineDraftId(null);
    setPlanLinkRoutineEditing(false);
    setLinkingCompletedWorkoutId(null);
    setWeightErr(null);
    setPlanErr(null);
    setPlanKind("");
    setLiftRoutineId(null);
  }

  /** From weight chart: jump to that month, highlight the day, scroll calendar into view — no modal. */
  function openDayFromDayKey(dayKey: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
    if (!match) {
      return;
    }
    const y = Number(match[1]);
    const month0 = Number(match[2]) - 1;
    const d = Number(match[3]);
    if (
      Number.isNaN(y) ||
      Number.isNaN(month0) ||
      Number.isNaN(d) ||
      month0 < 0 ||
      month0 > 11
    ) {
      return;
    }
    const normalized = dayKeyFromParts(y, month0, d);
    scrollCalendarFromChartRef.current = true;
    setView({ y, m: month0 });
    setWeekStart(startOfIsoWeekMondayFromDate(new Date(y, month0, d)));
    setHighlightedDayKey(normalized);
  }

  function closeWeightDialog() {
    setSelectedDay(null);
    setHighlightedDayKey(null);
    setRetroActivityNotes("");
    setDayModalScreen("summary");
    setLinkPlanId(null);
    setPlanLinkRoutineDraftId(null);
    setPlanLinkRoutineEditing(false);
    setLinkingCompletedWorkoutId(null);
    setWeightErr(null);
    setPlanErr(null);
    setPlanKind("");
    setLiftRoutineId(null);
  }

  function openAddPlanScreen() {
    setPlanKind("");
    setLiftRoutineId(null);
    setPlanErr(null);
    setDayModalScreen("addPlan");
  }

  function openAddFromActivityForKind(kind: "lift" | "run" | "bike" | "swim") {
    if (selectedDay) {
      const key = dayKeyFromParts(selectedDay.y, selectedDay.m, selectedDay.d);
      if (isLocalDayKeyInFuture(key)) {
        return;
      }
    }
    setPlanKind(kind);
    setLiftRoutineId(null);
    setPlanErr(null);
    setRetroActivityNotes("");
    setDayModalScreen("addFromActivity");
  }

  function backToDaySummary() {
    setDayModalScreen("summary");
    setPlanErr(null);
    setLinkPlanId(null);
    setPlanLinkRoutineDraftId(null);
    setPlanLinkRoutineEditing(false);
    setLinkingCompletedWorkoutId(null);
    setPlanKind("");
    setLiftRoutineId(null);
    setRetroActivityNotes("");
  }

  const createPlanMutation = useMutation({
    mutationFn: (data: {
      kind: string;
      scheduledAt: string;
      notes?: string | null;
      routineId?: string | null;
      distance?: number | null;
      distanceUnits?: string | null;
      timeSeconds?: number | null;
    }) => createPlanFn({ data }),
    onSuccess: async () => {
      await refreshAfterPlanChange();
      backToDaySummary();
    },
    onError: (e) => {
      setPlanErr(e instanceof Error ? e.message : "Could not create plan");
    },
  });

  const createPlanFromActivityMutation = useMutation({
    mutationFn: (data: {
      kind: string;
      scheduledAt: string;
      stravaActivityId?: string | null;
      hevyWorkoutId?: string | null;
      linkedSession: LinkedSessionPayload;
      notes?: string | null;
      routineId?: string | null;
    }) => createPlanFromActivityFn({ data }),
    onSuccess: async () => {
      await refreshAfterPlanChange();
      backToDaySummary();
    },
    onError: (e) => {
      setPlanErr(e instanceof Error ? e.message : "Could not create plan");
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: (id: string) => deletePlanFn({ data: { id } }),
    onSuccess: (_, deletedId) => {
      removePlannedWorkoutFromCaches(queryClient, deletedId);
      backToDaySummary();
    },
    onError: (e) => {
      setPlanErr(e instanceof Error ? e.message : "Could not delete plan");
    },
  });

  const setWeightMutation = useMutation({
    mutationFn: (input: { dayKey: string; weightLb: number }) =>
      setWeightForDayFn({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeWeightQueryKey });
    },
    onError: (e) => {
      setWeightErr(e instanceof Error ? e.message : "Could not save");
    },
  });

  const clearWeightMutation = useMutation({
    mutationFn: (dayKey: string) => clearWeightForDayFn({ data: { dayKey } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeWeightQueryKey });
    },
    onError: (e) => {
      setWeightErr(e instanceof Error ? e.message : "Could not clear");
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: (data: {
      id: string;
      notes?: string | null;
      scheduledAt?: string;
      status?: string;
      stravaActivityId?: string | null;
      hevyWorkoutId?: string | null;
      linkedSession?: LinkedSessionPayload | null;
      hevyRoutineId?: string | null;
      distance?: number | null;
      distanceUnits?: string | null;
      timeSeconds?: number | null;
    }) => updatePlanFn({ data }),
    onSuccess: async () => {
      await refreshAfterPlanChange();
    },
    onError: (e) => {
      setPlanErr(e instanceof Error ? e.message : "Could not update plan");
    },
  });

  function openPlanLinkFromSummary(planId: string) {
    setDayModalScreen("planLink");
    setLinkPlanId(planId);
    setPlanErr(null);
    setLinkingCompletedWorkoutId(null);
  }

  const dialogDayKey =
    selectedDay !== null
      ? `${selectedDay.y}-${String(selectedDay.m + 1).padStart(2, "0")}-${String(selectedDay.d).padStart(2, "0")}`
      : null;
  const dialogWeight =
    dialogDayKey !== null ? byWeightDay.get(dialogDayKey) : undefined;
  const dialogPlans =
    dialogDayKey !== null ? (byDay.get(dialogDayKey) ?? []) : [];

  const dialogTitle =
    selectedDay !== null
      ? new Date(
          selectedDay.y,
          selectedDay.m,
          selectedDay.d,
        ).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "";

  const dayLinkBounds = useMemo(() => {
    if (!selectedDay) {
      return null;
    }
    return {
      dayStartMs: new Date(
        selectedDay.y,
        selectedDay.m,
        selectedDay.d,
        0,
        0,
        0,
        0,
      ).getTime(),
      dayEndMs: new Date(
        selectedDay.y,
        selectedDay.m,
        selectedDay.d,
        23,
        59,
        59,
        999,
      ).getTime(),
    };
  }, [selectedDay]);

  const linkPlan = useMemo(
    () =>
      linkPlanId ? dialogPlans.find((p) => p.id === linkPlanId) : undefined,
    [dialogPlans, linkPlanId],
  );

  useEffect(() => {
    if (linkPlan?.kind === "lift") {
      setPlanLinkRoutineDraftId(linkPlan.routineId ?? null);
    } else {
      setPlanLinkRoutineDraftId(null);
    }
    setPlanLinkRoutineEditing(false);
  }, [linkPlan]);

  const plannedOrSkippedPlans = useMemo(
    () =>
      dialogPlans.filter(
        (p) => p.status === "planned" || p.status === "skipped",
      ),
    [dialogPlans],
  );

  const completedPlansForDay = useMemo(
    () =>
      dialogPlans.filter(
        (p) => p.status === "completed" && Boolean(p.completedWorkoutId),
      ),
    [dialogPlans],
  );

  /** Same source as calendar dots — prefetched on home; avoids per-day fetch + loading flash when this day has no unlinked sessions. */
  const unresolvedDayKeysReady = unresolvedCompletedQuery.isSuccess;
  const selectedDayHasUnresolvedSession =
    dialogDayKey !== null && unresolvedDayKeysSet.has(dialogDayKey);

  const unresolvedForDayFetchEnabled =
    Boolean(dialogDayKey && selectedDay) &&
    dayModalScreen === "summary" &&
    unresolvedDayKeysReady &&
    selectedDayHasUnresolvedSession;

  const unresolvedForDayQuery = useQuery({
    queryKey: dialogDayKey
      ? homeUnresolvedCompletedForDayQueryKey(dialogDayKey)
      : ["completedWorkouts", "unresolvedForDay", "__none__"],
    queryFn: async () => {
      if (!dialogDayKey) {
        throw new Error("Missing dayKey");
      }
      return fetchUnresolvedCompletedForDayFn({
        data: { dayKey: dialogDayKey },
      });
    },
    enabled: unresolvedForDayFetchEnabled,
  });

  const showCompletedNoPlanSection =
    dayModalScreen === "summary" &&
    dialogDayKey !== null &&
    unresolvedDayKeysReady &&
    selectedDayHasUnresolvedSession &&
    (unresolvedForDayQuery.isLoading ||
      unresolvedForDayQuery.isError ||
      (unresolvedForDayQuery.data ?? []).length > 0);

  const linkCandidatesQuery = useQuery({
    queryKey: [
      "planLinkCandidates",
      linkPlanId,
      linkPlan?.kind,
      dayLinkBounds?.dayStartMs,
      dayLinkBounds?.dayEndMs,
    ] as const,
    queryFn: async () => {
      if (!linkPlanId || !dayLinkBounds) {
        throw new Error("Missing plan or day bounds");
      }
      return getPlanLinkCandidatesFn({
        data: {
          planId: linkPlanId,
          dayStartMs: dayLinkBounds.dayStartMs,
          dayEndMs: dayLinkBounds.dayEndMs,
        },
      });
    },
    enabled:
      dayModalScreen === "planLink" &&
      Boolean(linkPlanId && linkPlan && dayLinkBounds) &&
      linkPlan?.status !== "skipped" &&
      !linkPlan?.completedWorkoutId,
  });

  const addFromActivityCandidatesQuery = useQuery({
    queryKey: [
      "planLinkCandidatesForDay",
      planKind,
      dayLinkBounds?.dayStartMs,
      dayLinkBounds?.dayEndMs,
    ] as const,
    queryFn: async () => {
      if (!dayLinkBounds || !planKind) {
        throw new Error("Missing bounds or kind");
      }
      return getPlanLinkCandidatesForDayFn({
        data: {
          kind: planKind,
          dayStartMs: dayLinkBounds.dayStartMs,
          dayEndMs: dayLinkBounds.dayEndMs,
        },
      });
    },
    enabled:
      dayModalScreen === "addFromActivity" &&
      Boolean(dayLinkBounds) &&
      planKind !== "" &&
      ["lift", "run", "bike", "swim"].includes(planKind),
  });

  return (
    <div className="space-y-8">
      <section ref={calendarSectionRef} className="space-y-2 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={prevCalendarPage}
              aria-label={showWeekStrip ? "Previous week" : "Previous month"}
              className="touch-manipulation rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              ←
            </button>
            <span className="min-w-0 max-w-[min(100%,16rem)] truncate text-center text-sm font-medium text-zinc-200">
              {calendarNavLabel}
            </span>
            <button
              type="button"
              onClick={nextCalendarPage}
              aria-label={showWeekStrip ? "Next week" : "Next month"}
              className="touch-manipulation rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              →
            </button>
            <button
              type="button"
              onClick={goToday}
              className="touch-manipulation rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Today
            </button>
            <div className="flex rounded-md border border-zinc-700 p-0.5 text-xs text-zinc-400">
              <button
                type="button"
                aria-pressed={calendarScope === "month"}
                disabled={persistCalendarScopeMutation.isPending}
                onClick={() => persistCalendarScopeMutation.mutate("month")}
                className={`touch-manipulation rounded px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                  calendarScope === "month"
                    ? "bg-zinc-800 font-medium text-zinc-100"
                    : "hover:bg-zinc-900/80"
                }`}
              >
                Month
              </button>
              <button
                type="button"
                aria-pressed={calendarScope === "week"}
                disabled={persistCalendarScopeMutation.isPending}
                onClick={() => persistCalendarScopeMutation.mutate("week")}
                className={`touch-manipulation rounded px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                  calendarScope === "week"
                    ? "bg-zinc-800 font-medium text-zinc-100"
                    : "hover:bg-zinc-900/80"
                }`}
              >
                Week
              </button>
            </div>
          </div>
        </div>

        {showWeekStrip ? (
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800">
            <div className="grid min-w-0 grid-cols-7 gap-px">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="bg-zinc-900 px-0.5 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                >
                  {w}
                </div>
              ))}
              {gridCells.map((cell) => {
                if (cell.kind !== "day") {
                  return null;
                }
                const key = dayKeyFromParts(cell.y, cell.m0, cell.d);
                const dayPlans = byDay.get(key) ?? [];
                const dayWeight = byWeightDay.get(key);
                const isToday = todayDayKey !== "" && key === todayDayKey;
                const isHighlightedDay =
                  (dialogDayKey !== null && key === dialogDayKey) ||
                  (highlightedDayKey !== null && key === highlightedDayKey);
                return (
                  <HomeCalendarDayBlock
                    key={cell.key}
                    y={cell.y}
                    m0={cell.m0}
                    day={cell.d}
                    dayKey={key}
                    dayPlans={dayPlans}
                    dayWeight={dayWeight}
                    dayHasUnlinkedSession={unresolvedDayKeysSet.has(key)}
                    isHighlightedDay={isHighlightedDay}
                    isToday={isToday}
                    layout="weekList"
                    monthCellHeightClass={monthDayCellHeightClass}
                    onOpenDay={() => openDay(cell.y, cell.m0, cell.d)}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800">
            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="bg-zinc-900 px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                >
                  {w}
                </div>
              ))}
              {gridCells.map((cell) => {
                if (cell.kind === "pad") {
                  return (
                    <div
                      key={cell.key}
                      className={`${monthDayCellHeightClass} bg-zinc-950/80`}
                    />
                  );
                }
                const { y, m0, d: day } = cell;
                const key = dayKeyFromParts(y, m0, day);
                const dayPlans = byDay.get(key) ?? [];
                const dayWeight = byWeightDay.get(key);
                const isToday = todayDayKey !== "" && key === todayDayKey;
                const isHighlightedDay =
                  (dialogDayKey !== null && key === dialogDayKey) ||
                  (highlightedDayKey !== null && key === highlightedDayKey);
                return (
                  <HomeCalendarDayBlock
                    key={cell.key}
                    y={y}
                    m0={m0}
                    day={day}
                    dayKey={key}
                    dayPlans={dayPlans}
                    dayWeight={dayWeight}
                    dayHasUnlinkedSession={unresolvedDayKeysSet.has(key)}
                    isHighlightedDay={isHighlightedDay}
                    isToday={isToday}
                    layout="monthGrid"
                    monthCellHeightClass={monthDayCellHeightClass}
                    onOpenDay={() => openDay(y, m0, day)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-100">Session trends</h2>
        <ActivityMetricsChart
          kind={activityPlotKind}
          onKindChange={setActivityPlotKind}
          points={activityPlotPoints}
          sessionChart={sessionChartSettings}
          onSessionChartPatch={(patch) =>
            patchSessionChartMutation.mutate(patch)
          }
          onSelectDayKey={openDayFromDayKey}
          selectedDayKey={dialogDayKey ?? highlightedDayKey}
          isLoading={plansQuery.isLoading}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-100">Weight</h2>
        <WeightTrendChart
          entries={weightEntriesInRange}
          range={sessionChartSettings.range}
          onRangeChange={(r) => patchSessionChartMutation.mutate({ range: r })}
          onSelectDayKey={openDayFromDayKey}
          selectedDayKey={dialogDayKey ?? highlightedDayKey}
          isLoading={weightQuery.isLoading}
        />
      </section>

      {selectedDay !== null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 cursor-default border-0 bg-black/60 p-0"
            onClick={closeWeightDialog}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-dialog-title"
            className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
          >
            {dayModalScreen === "summary" ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <h2
                      id="day-dialog-title"
                      className="text-lg font-semibold text-zinc-100"
                    >
                      {dialogTitle}
                    </h2>
                    <p className="text-sm text-zinc-400">This day</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeWeightDialog}
                    className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  >
                    Close
                  </button>
                </div>

                <div className="mb-6 space-y-6">
                  <section>
                    <h3 className="mb-2 text-sm font-medium text-zinc-200">
                      Current Plans
                    </h3>
                    {plannedOrSkippedPlans.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        None for this day.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {plannedOrSkippedPlans.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => openPlanLinkFromSummary(p.id)}
                              className="block w-full rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-sm text-zinc-200 hover:border-zinc-600"
                            >
                              <span className="capitalize text-zinc-100">
                                {p.kind}
                              </span>
                              <span className="text-zinc-500">
                                {" "}
                                · {p.status}
                              </span>
                              {p.status === "planned" &&
                              (p.notes?.trim() ?? "") !== "" ? (
                                <p className="mt-1.5 whitespace-pre-wrap text-left text-xs leading-snug text-zinc-500">
                                  {p.notes?.trim()}
                                </p>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {completedPlansForDay.length > 0 ? (
                    <section>
                      <h3 className="mb-2 text-sm font-medium text-zinc-200">
                        Completed (linked)
                      </h3>
                      <ul className="space-y-2">
                        {completedPlansForDay.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => openPlanLinkFromSummary(p.id)}
                              className="block w-full rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-sm text-zinc-200 hover:border-zinc-600"
                            >
                              <span className="capitalize text-zinc-100">
                                {p.kind}
                              </span>
                              <span className="text-zinc-500">
                                {" "}
                                · {p.status}
                                {p.completedWorkout
                                  ? ` · ${completedWorkoutTitle(p.completedWorkout) ?? "session"}`
                                  : " · linked"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {showCompletedNoPlanSection ? (
                    <section>
                      <h3 className="mb-2 text-sm font-medium text-zinc-200">
                        Completed (no plan)
                      </h3>
                      {unresolvedForDayQuery.isLoading ? (
                        <p className="text-sm text-zinc-500">Loading…</p>
                      ) : unresolvedForDayQuery.isError ? (
                        <p className="text-sm text-red-400">
                          Could not load sessions.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {[...(unresolvedForDayQuery.data ?? [])]
                            .sort((a, b) => a.id.localeCompare(b.id))
                            .map((cw) => {
                              const title =
                                completedWorkoutTitle(cw) ?? "Session";
                              const kindLabel =
                                inferPlanKindFromCompletedRow(cw) ??
                                cw.activityKind;
                              const matchingPlans = dialogPlans.filter((p) =>
                                planAcceptsLinkForCompleted(p, cw),
                              );
                              const pk = inferPlanKindFromCompletedRow(cw);
                              return (
                                <li
                                  key={cw.id}
                                  className="rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2"
                                >
                                  <div className="text-sm text-zinc-100">
                                    {title}
                                  </div>
                                  <div className="mt-0.5 text-xs capitalize text-zinc-500">
                                    {cw.vendor === "hevy" ? "Hevy" : "Strava"} ·{" "}
                                    {kindLabel}
                                  </div>
                                  <div className="mt-2">
                                    {matchingPlans.length === 1 ? (
                                      <button
                                        type="button"
                                        disabled={
                                          updatePlanMutation.isPending &&
                                          linkingCompletedWorkoutId === cw.id
                                        }
                                        onClick={() => {
                                          setPlanErr(null);
                                          setLinkingCompletedWorkoutId(cw.id);
                                          updatePlanMutation.mutate(
                                            updatePlanPayloadForCompletedLink(
                                              cw,
                                              matchingPlans[0].id,
                                            ),
                                            {
                                              onSettled: () =>
                                                setLinkingCompletedWorkoutId(
                                                  null,
                                                ),
                                            },
                                          );
                                        }}
                                        className="rounded border border-violet-500/60 bg-violet-950/40 px-2.5 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-950/70 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {updatePlanMutation.isPending &&
                                        linkingCompletedWorkoutId === cw.id
                                          ? "Linking…"
                                          : "Link to plan"}
                                      </button>
                                    ) : matchingPlans.length > 1 ? (
                                      <div className="space-y-1.5">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                          Choose a plan to link
                                        </p>
                                        <ul className="flex flex-col gap-1">
                                          {matchingPlans.map((p) => (
                                            <li key={p.id}>
                                              <button
                                                type="button"
                                                disabled={
                                                  updatePlanMutation.isPending &&
                                                  linkingCompletedWorkoutId ===
                                                    cw.id
                                                }
                                                onClick={() => {
                                                  setPlanErr(null);
                                                  setLinkingCompletedWorkoutId(
                                                    cw.id,
                                                  );
                                                  updatePlanMutation.mutate(
                                                    updatePlanPayloadForCompletedLink(
                                                      cw,
                                                      p.id,
                                                    ),
                                                    {
                                                      onSettled: () =>
                                                        setLinkingCompletedWorkoutId(
                                                          null,
                                                        ),
                                                    },
                                                  );
                                                }}
                                                className="w-full rounded border border-violet-500/50 bg-violet-950/30 px-2 py-1.5 text-left text-xs text-violet-200 hover:bg-violet-950/55 disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                <span className="capitalize">
                                                  {p.kind}
                                                </span>
                                                <span className="text-zinc-500">
                                                  {" "}
                                                  · {p.status}
                                                </span>
                                                {(p.notes?.trim() ?? "") !==
                                                "" ? (
                                                  <span className="mt-1 block whitespace-pre-wrap text-[11px] leading-snug text-zinc-500">
                                                    {p.notes?.trim()}
                                                  </span>
                                                ) : null}
                                              </button>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : pk &&
                                      dialogDayKey !== null &&
                                      !isLocalDayKeyInFuture(dialogDayKey) ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openAddFromActivityForKind(pk)
                                        }
                                        className="rounded border border-violet-500/60 bg-violet-950/40 px-2.5 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-950/70"
                                      >
                                        Link unplanned activity?
                                      </button>
                                    ) : (
                                      <p className="text-xs text-zinc-500">
                                        {!pk
                                          ? "This activity type cannot be linked to a plan here."
                                          : "Linking from a future day is not available."}
                                      </p>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                      )}
                    </section>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={openAddPlanScreen}
                      className="w-full rounded border border-zinc-600 bg-zinc-900/50 px-3 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
                    >
                      Add plan
                    </button>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-4">
                  <form
                    key={`${dialogDayKey ?? "x"}-${dialogWeight?.weightLb ?? "none"}`}
                    className="flex w-full min-w-0 flex-nowrap items-stretch gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!dialogDayKey) {
                        return;
                      }
                      const fd = new FormData(e.currentTarget);
                      setWeightErr(null);
                      const raw = String(fd.get("weight") ?? "");
                      const w = Number.parseFloat(raw);
                      if (!Number.isFinite(w) || w <= 0) {
                        setWeightErr("Enter a valid weight");
                        return;
                      }
                      setWeightMutation.mutate({
                        dayKey: dialogDayKey,
                        weightLb: w,
                      });
                    }}
                  >
                    <span className="shrink-0 self-center text-xs text-zinc-500">
                      Weight
                    </span>
                    <div className="relative min-w-0 flex-1">
                      <input
                        name="weight"
                        type="number"
                        step="0.1"
                        min="0"
                        required
                        inputMode="decimal"
                        autoComplete="off"
                        defaultValue={
                          dialogWeight ? dialogWeight.weightLb.toFixed(1) : ""
                        }
                        aria-label="Weight in pounds"
                        className="w-full min-w-0 rounded border border-zinc-700 bg-zinc-950 py-1.5 pr-7 pl-2 text-sm tabular-nums text-zinc-100 placeholder:text-zinc-600"
                      />
                      <span
                        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-zinc-500"
                        aria-hidden
                      >
                        lb
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={setWeightMutation.isPending}
                      className="shrink-0 rounded border border-emerald-600 bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {setWeightMutation.isPending ? "…" : "Save"}
                    </button>
                    {dialogWeight && dialogDayKey ? (
                      <button
                        type="button"
                        disabled={
                          clearWeightMutation.isPending ||
                          setWeightMutation.isPending
                        }
                        className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          setWeightErr(null);
                          clearWeightMutation.mutate(dialogDayKey);
                        }}
                      >
                        {clearWeightMutation.isPending ? "…" : "Clear"}
                      </button>
                    ) : null}
                  </form>
                  {weightErr ? (
                    <p className="mt-2 text-xs text-red-400">{weightErr}</p>
                  ) : null}
                </div>
              </>
            ) : dayModalScreen === "addPlan" ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={backToDaySummary}
                    className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Back
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2
                      id="day-dialog-title"
                      className="text-lg font-semibold text-zinc-100"
                    >
                      Add plan
                    </h2>
                    <p className="truncate text-sm text-zinc-400">
                      {dialogTitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeWeightDialog}
                    className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  >
                    Close
                  </button>
                </div>

                {dialogDayKey !== null && selectedDay !== null ? (
                  <form
                    key={dialogDayKey}
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      setPlanErr(null);
                      const kinds = new Set(["lift", "run", "bike", "swim"]);
                      if (!kinds.has(planKind)) {
                        setPlanErr("Choose a type.");
                        return;
                      }
                      const scheduledAt = scheduledAtIsoForDay(
                        selectedDay.y,
                        selectedDay.m,
                        selectedDay.d,
                      );
                      const notesRaw = fd.get("notes");
                      const notes =
                        notesRaw === null || notesRaw === ""
                          ? null
                          : String(notesRaw);
                      const routineId =
                        planKind === "lift" &&
                        liftRoutineId &&
                        liftRoutineId.trim() !== ""
                          ? liftRoutineId
                          : null;
                      const distance = isCardioKind(planKind)
                        ? parseFormOptionalFloat(fd.get("distance"))
                        : null;
                      const unitsRaw = String(
                        fd.get("distanceUnits") ?? "",
                      ).trim();
                      const distanceUnits =
                        isCardioKind(planKind) && unitsRaw !== ""
                          ? unitsRaw.toLowerCase()
                          : null;
                      const timeSeconds = isCardioKind(planKind)
                        ? parseFormOptionalInt(fd.get("timeSeconds"))
                        : null;
                      createPlanMutation.mutate({
                        kind: planKind,
                        scheduledAt,
                        notes,
                        routineId,
                        distance,
                        distanceUnits,
                        timeSeconds,
                      });
                    }}
                  >
                    <label className="block space-y-1">
                      <span className="text-sm text-zinc-400">Type</span>
                      <select
                        name="kind"
                        value={planKind}
                        onChange={(ev) => setPlanKind(ev.target.value)}
                        required
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                      >
                        <option value="" disabled>
                          Select type
                        </option>
                        <option value="lift">Lift</option>
                        <option value="run">Run</option>
                        <option value="bike">Bike</option>
                        <option value="swim">Swim</option>
                      </select>
                    </label>
                    {planKind === "lift" ? (
                      <LiftRoutinePicker
                        groups={hevyRoutineGroups}
                        unfoldered={hevyRoutinesUnfoldered}
                        selectedId={liftRoutineId}
                        onSelect={setLiftRoutineId}
                      />
                    ) : null}
                    {isCardioKind(planKind) ? (
                      <div className="space-y-2 rounded border border-zinc-800/80 bg-zinc-900/30 px-3 py-2">
                        <p className="text-xs text-zinc-500">
                          Planned targets (optional)
                        </p>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="min-w-[5rem] flex-1">
                            <span className="text-xs text-zinc-500">
                              Distance
                            </span>
                            <input
                              name="distance"
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                            />
                          </label>
                          <label className="w-[5.5rem]">
                            <span className="text-xs text-zinc-500">Units</span>
                            <select
                              name="distanceUnits"
                              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                            >
                              <option value="">—</option>
                              {CARDIO_DISTANCE_UNITS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="min-w-[6.5rem] flex-1">
                            <span className="text-xs text-zinc-500">
                              Duration (sec)
                            </span>
                            <input
                              name="timeSeconds"
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}
                    <label className="block space-y-1">
                      <span className="text-sm text-zinc-400">Notes</span>
                      <textarea
                        name="notes"
                        rows={3}
                        placeholder="Optional"
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                      />
                    </label>
                    {planErr ? (
                      <p className="text-sm text-red-400">{planErr}</p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={createPlanMutation.isPending}
                      className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {createPlanMutation.isPending
                        ? "Creating…"
                        : "Create plan"}
                    </button>
                  </form>
                ) : null}
              </>
            ) : dayModalScreen === "addFromActivity" ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={backToDaySummary}
                    className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Back
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2
                      id="day-dialog-title"
                      className="text-lg font-semibold text-zinc-100"
                    >
                      Add from activity
                    </h2>
                    <p className="truncate text-sm text-zinc-400">
                      {dialogTitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeWeightDialog}
                    className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  >
                    Close
                  </button>
                </div>

                <p className="mb-3 text-sm leading-snug text-zinc-500">
                  Creates a completed plan linked to a Strava or Hevy session
                  for this day — for workouts you did without planning ahead.
                </p>

                {dialogDayKey !== null && selectedDay !== null ? (
                  <div className="space-y-4">
                    <label className="block space-y-1">
                      <span className="text-sm text-zinc-400">Type</span>
                      <select
                        value={planKind}
                        onChange={(ev) => setPlanKind(ev.target.value)}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                      >
                        <option value="">Select type</option>
                        <option value="lift">Lift (Hevy)</option>
                        <option value="run">Run (Strava)</option>
                        <option value="bike">Bike (Strava)</option>
                        <option value="swim">Swim (Strava)</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm text-zinc-400">Notes</span>
                      <textarea
                        value={retroActivityNotes}
                        onChange={(e) => setRetroActivityNotes(e.target.value)}
                        rows={2}
                        placeholder="Optional"
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                      />
                    </label>
                    {planErr ? (
                      <p className="text-sm text-red-400">{planErr}</p>
                    ) : null}

                    {planKind === "" ? (
                      <p className="text-xs text-zinc-600">
                        Choose a type to load sessions for this day.
                      </p>
                    ) : addFromActivityCandidatesQuery.isLoading ? (
                      <p className="text-xs text-zinc-500">Loading sessions…</p>
                    ) : addFromActivityCandidatesQuery.isError ? (
                      <p className="text-xs text-red-400">
                        Could not load sessions.
                      </p>
                    ) : planKind === "lift" ? (
                      <div className="space-y-2">
                        {addFromActivityCandidatesQuery.data?.hevyError ? (
                          <p className="text-[11px] text-amber-400/90">
                            Hevy:{" "}
                            {addFromActivityCandidatesQuery.data.hevyError}
                          </p>
                        ) : null}
                        {(addFromActivityCandidatesQuery.data?.hevy ?? [])
                          .length === 0 ? (
                          <p className="text-xs text-zinc-600">
                            No Hevy workouts for this day, or all are linked
                            already.
                          </p>
                        ) : (
                          <ul className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                            {[
                              ...(addFromActivityCandidatesQuery.data?.hevy ??
                                []),
                            ]
                              .sort(
                                (a, b) =>
                                  new Date(b.start_time ?? 0).getTime() -
                                  new Date(a.start_time ?? 0).getTime(),
                              )
                              .map((w) => (
                                <li key={w.id ?? ""}>
                                  <button
                                    type="button"
                                    disabled={
                                      !w.id ||
                                      createPlanFromActivityMutation.isPending
                                    }
                                    onClick={() => {
                                      if (!w.id || !selectedDay) {
                                        return;
                                      }
                                      setPlanErr(null);
                                      const scheduledAt = scheduledAtIsoForDay(
                                        selectedDay.y,
                                        selectedDay.m,
                                        selectedDay.d,
                                      );
                                      createPlanFromActivityMutation.mutate({
                                        kind: "lift",
                                        scheduledAt,
                                        stravaActivityId: "",
                                        hevyWorkoutId: w.id,
                                        linkedSession:
                                          linkedSessionFromHevyWorkout(w),
                                        notes:
                                          retroActivityNotes.trim() || null,
                                        routineId: null,
                                      });
                                    }}
                                    className="w-full rounded border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-left text-[11px] leading-snug text-zinc-200 hover:border-zinc-600 disabled:opacity-50"
                                  >
                                    <div className="font-medium text-zinc-100">
                                      {w.title ?? "Workout"}
                                    </div>
                                    <div className="text-[10px] text-zinc-500">
                                      {formatSessionTime(w.start_time)}
                                    </div>
                                  </button>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {addFromActivityCandidatesQuery.data?.stravaError ? (
                          <p className="text-[11px] text-amber-400/90">
                            Strava:{" "}
                            {addFromActivityCandidatesQuery.data.stravaError}
                          </p>
                        ) : null}
                        {(addFromActivityCandidatesQuery.data?.strava ?? [])
                          .length === 0 ? (
                          <p className="text-xs text-zinc-600">
                            No Strava activities for this day, or all are linked
                            already.
                          </p>
                        ) : (
                          <ul className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                            {[
                              ...(addFromActivityCandidatesQuery.data?.strava ??
                                []),
                            ]
                              .sort(
                                (a, b) =>
                                  new Date(b.start_date).getTime() -
                                  new Date(a.start_date).getTime(),
                              )
                              .map((a) => (
                                <li key={a.id}>
                                  <button
                                    type="button"
                                    disabled={
                                      createPlanFromActivityMutation.isPending
                                    }
                                    onClick={() => {
                                      if (!selectedDay) {
                                        return;
                                      }
                                      setPlanErr(null);
                                      const scheduledAt = scheduledAtIsoForDay(
                                        selectedDay.y,
                                        selectedDay.m,
                                        selectedDay.d,
                                      );
                                      createPlanFromActivityMutation.mutate({
                                        kind: planKind,
                                        scheduledAt,
                                        stravaActivityId: String(a.id),
                                        hevyWorkoutId: "",
                                        linkedSession:
                                          linkedSessionFromStravaActivity(a),
                                        notes:
                                          retroActivityNotes.trim() || null,
                                        routineId: null,
                                      });
                                    }}
                                    className="w-full rounded border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-left text-[11px] leading-snug text-zinc-200 hover:border-zinc-600 disabled:opacity-50"
                                  >
                                    <div className="font-medium text-zinc-100">
                                      {a.name}
                                    </div>
                                    <div className="text-[10px] text-zinc-500">
                                      {a.sport_type} ·{" "}
                                      {formatSessionTime(a.start_date)}
                                    </div>
                                  </button>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={backToDaySummary}
                    className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Back
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2
                      id="day-dialog-title"
                      className="text-lg font-semibold capitalize text-zinc-100"
                    >
                      {linkPlan ? `${linkPlan.kind} plan` : "Plan"}
                    </h2>
                    <p className="text-sm leading-snug text-zinc-400">
                      {dialogTitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeWeightDialog}
                    className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  >
                    Close
                  </button>
                </div>

                {planErr ? (
                  <p className="mb-2 text-sm text-red-400">{planErr}</p>
                ) : null}

                {!linkPlan ? (
                  <p className="text-sm text-zinc-500">
                    This plan is not on this day anymore.
                  </p>
                ) : (
                  <>
                    {linkPlan.kind === "lift" &&
                    linkPlan.status === "planned" &&
                    !linkPlan.completedWorkout ? (
                      <div className="mb-3 rounded border border-zinc-800/80 bg-zinc-900/30 px-2 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                          Hevy routine
                        </p>
                        {planLinkRoutineEditing ? (
                          <>
                            <p className="mt-0.5 mb-2 text-[10px] leading-snug text-zinc-500">
                              Choose a template. Save updates the plan.
                            </p>
                            <LiftRoutinePicker
                              groups={hevyRoutineGroups}
                              unfoldered={hevyRoutinesUnfoldered}
                              selectedId={planLinkRoutineDraftId}
                              onSelect={setPlanLinkRoutineDraftId}
                            />
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                disabled={
                                  updatePlanMutation.isPending ||
                                  planLinkRoutineDraftId ===
                                    (linkPlan.routineId ?? null)
                                }
                                onClick={() => {
                                  setPlanErr(null);
                                  updatePlanMutation.mutate(
                                    {
                                      id: linkPlan.id,
                                      hevyRoutineId: planLinkRoutineDraftId,
                                    },
                                    {
                                      onSuccess: () => {
                                        setPlanLinkRoutineEditing(false);
                                      },
                                    },
                                  );
                                }}
                                className="flex-1 rounded border border-emerald-600/80 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-950/50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {updatePlanMutation.isPending
                                  ? "Saving…"
                                  : "Save routine"}
                              </button>
                              <button
                                type="button"
                                disabled={updatePlanMutation.isPending}
                                onClick={() => {
                                  setPlanLinkRoutineDraftId(
                                    linkPlan.routineId ?? null,
                                  );
                                  setPlanLinkRoutineEditing(false);
                                }}
                                className="rounded border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="mt-2">
                              <LiftRoutineReadOnlyPreview
                                routineId={linkPlan.routineId ?? null}
                                titleFromList={
                                  linkPlan.routineId
                                    ? (rTitle.get(linkPlan.routineId) ?? null)
                                    : null
                                }
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setPlanLinkRoutineDraftId(
                                  linkPlan.routineId ?? null,
                                );
                                setPlanLinkRoutineEditing(true);
                              }}
                              className="mt-3 w-full rounded border border-zinc-600 bg-zinc-900/50 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
                            >
                              Update routine
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}

                    <div className="mb-2 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Status
                        </span>
                        <PlanStatusSelect
                          planId={linkPlan.id}
                          status={linkPlan.status}
                          disabled={Boolean(linkPlan.completedWorkout)}
                          onUpdated={refreshAfterPlanChange}
                        />
                      </div>
                      {linkPlan.completedWorkout ? (
                        <LinkedSessionPanel
                          planId={linkPlan.id}
                          completed={linkPlan.completedWorkout}
                          onUnlinked={refreshAfterPlanChange}
                        />
                      ) : !isCardioKind(linkPlan.kind) ? (
                        <p className="rounded border border-dashed border-zinc-800/90 bg-zinc-950/40 px-2 py-1.5 text-[10px] text-zinc-500">
                          No session linked
                        </p>
                      ) : null}
                    </div>

                    {isCardioKind(linkPlan.kind) &&
                    !linkPlan.completedWorkout ? (
                      <div className="mb-2">
                        <PlanCardioTargetsField
                          planId={linkPlan.id}
                          kind={linkPlan.kind}
                          distance={linkPlan.distance}
                          distanceUnits={linkPlan.distanceUnits}
                          timeSeconds={linkPlan.timeSeconds}
                          onUpdated={refreshAfterPlanChange}
                        />
                      </div>
                    ) : null}

                    <div className="mb-2">
                      <PlanNotesField
                        planId={linkPlan.id}
                        notes={linkPlan.notes}
                        onUpdated={refreshAfterPlanChange}
                      />
                    </div>

                    {linkPlan.status === "skipped" ? (
                      <p className="mb-3 text-[11px] leading-snug text-zinc-500">
                        Skipped — linking hidden. Change status to attach a
                        session.
                      </p>
                    ) : linkPlan.completedWorkoutId ? (
                      <div className="mt-4 border-t border-zinc-800 pt-2.5">
                        <button
                          type="button"
                          disabled={deletePlanMutation.isPending}
                          className="text-[11px] text-red-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => deletePlanMutation.mutate(linkPlan.id)}
                        >
                          {deletePlanMutation.isPending
                            ? "Deleting…"
                            : "Delete plan"}
                        </button>
                      </div>
                    ) : linkCandidatesQuery.isLoading ? (
                      <p className="text-xs text-zinc-500">
                        Loading sessions for this day…
                      </p>
                    ) : linkCandidatesQuery.isError ? (
                      <p className="text-xs text-red-400">
                        Could not load sessions.
                      </p>
                    ) : (
                      <>
                        {linkPlan.kind === "lift" ? (
                          <>
                            {linkCandidatesQuery.data?.hevyError ? (
                              <p className="mb-1.5 text-[11px] text-amber-400/90">
                                Hevy: {linkCandidatesQuery.data.hevyError}
                              </p>
                            ) : null}
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium text-zinc-500">
                                Link Hevy workout
                              </p>
                              <p className="text-[11px] leading-snug text-zinc-600">
                                Completes plan when linked.
                              </p>
                              {(linkCandidatesQuery.data?.hevy ?? []).length ===
                              0 ? (
                                <p className="text-xs text-zinc-600">
                                  None for this day, or all are linked to other
                                  plans.
                                </p>
                              ) : (
                                <ul className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                                  {[...(linkCandidatesQuery.data?.hevy ?? [])]
                                    .sort(
                                      (a, b) =>
                                        new Date(b.start_time ?? 0).getTime() -
                                        new Date(a.start_time ?? 0).getTime(),
                                    )
                                    .map((w) => (
                                      <li key={w.id ?? ""}>
                                        <button
                                          type="button"
                                          disabled={
                                            !w.id ||
                                            updatePlanMutation.isPending
                                          }
                                          onClick={() => {
                                            if (!w.id) {
                                              return;
                                            }
                                            updatePlanMutation.mutate({
                                              id: linkPlan.id,
                                              stravaActivityId: "",
                                              hevyWorkoutId: w.id,
                                              linkedSession:
                                                linkedSessionFromHevyWorkout(w),
                                            });
                                          }}
                                          className="w-full rounded border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-left text-[11px] leading-snug text-zinc-200 hover:border-zinc-600 disabled:opacity-50"
                                        >
                                          <div className="font-medium text-zinc-100">
                                            {w.title ?? "Workout"}
                                          </div>
                                          <div className="text-[10px] text-zinc-500">
                                            {formatSessionTime(w.start_time)}
                                          </div>
                                        </button>
                                      </li>
                                    ))}
                                </ul>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            {linkCandidatesQuery.data?.stravaError ? (
                              <p className="mb-1.5 text-[11px] text-amber-400/90">
                                Strava: {linkCandidatesQuery.data.stravaError}
                              </p>
                            ) : null}
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium text-zinc-500">
                                Link Strava activity
                              </p>
                              <p className="text-[11px] leading-snug text-zinc-600">
                                Completes plan when linked.
                              </p>
                              {(linkCandidatesQuery.data?.strava ?? [])
                                .length === 0 ? (
                                <p className="text-xs text-zinc-600">
                                  None for this day, or all are linked to other
                                  plans.
                                </p>
                              ) : (
                                <ul className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                                  {[...(linkCandidatesQuery.data?.strava ?? [])]
                                    .sort(
                                      (a, b) =>
                                        new Date(b.start_date).getTime() -
                                        new Date(a.start_date).getTime(),
                                    )
                                    .map((a) => (
                                      <li key={a.id}>
                                        <button
                                          type="button"
                                          disabled={
                                            updatePlanMutation.isPending
                                          }
                                          onClick={() =>
                                            updatePlanMutation.mutate({
                                              id: linkPlan.id,
                                              stravaActivityId: String(a.id),
                                              hevyWorkoutId: "",
                                              linkedSession:
                                                linkedSessionFromStravaActivity(
                                                  a,
                                                ),
                                            })
                                          }
                                          className="w-full rounded border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-left text-[11px] leading-snug text-zinc-200 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          <div className="font-medium text-zinc-100">
                                            {a.name}
                                          </div>
                                          <div className="text-[10px] text-zinc-500">
                                            {a.sport_type} ·{" "}
                                            {formatSessionTime(a.start_date)}
                                          </div>
                                        </button>
                                      </li>
                                    ))}
                                </ul>
                              )}
                            </div>
                          </>
                        )}

                        <div className="mt-4 border-t border-zinc-800 pt-2.5">
                          <button
                            type="button"
                            disabled={deletePlanMutation.isPending}
                            className="text-[11px] text-red-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() =>
                              deletePlanMutation.mutate(linkPlan.id)
                            }
                          >
                            {deletePlanMutation.isPending
                              ? "Deleting…"
                              : "Delete plan"}
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
