import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityMetricsChart } from "~/components/ActivityMetricsChart";
import { PlanCardioTargetsField } from "~/components/PlanCardioTargetsField";
import { PlanNotesField } from "~/components/PlanNotesField";
import { PlanStatusSelect } from "~/components/PlanStatusSelect";
import { WeightTrendChart } from "~/components/WeightTrendChart";
import type {
  CompletedWorkoutRow,
  PlannedWorkoutWithCompleted,
  WeightEntryRow,
} from "~/lib/db/schema";
import { hevyWorkoutWebUrl, stravaActivityWebUrl } from "~/lib/hevy/links";
import type {
  HevyRoutineExerciseDetail,
  HevyRoutineFolderGroup,
  HevyRoutineSummary,
} from "~/lib/hevy/types";
import { getHomeDataFn } from "~/lib/home/server-fns";
import {
  type ActivityPlotKind,
  buildActivityPlotPoints,
} from "~/lib/plans/activity-plot-points";
import {
  CARDIO_DISTANCE_UNITS,
  isCardioKind,
} from "~/lib/plans/cardio-targets";
import {
  getPlanLinkCandidatesFn,
  getPlanLinkCandidatesForDayFn,
} from "~/lib/plans/link-candidates-fns";
import {
  linkedSessionFromHevyWorkout,
  linkedSessionFromStravaActivity,
} from "~/lib/plans/linked-session";
import {
  createPlanFn,
  createPlanFromActivityFn,
  deletePlanFn,
  updatePlanFn,
} from "~/lib/plans/server-fns";
import { getRoutineDetailFn } from "~/lib/routines/server-fns";
import {
  clearWeightForDayFn,
  setWeightForDayFn,
} from "~/lib/weight/server-fns";

export const Route = createFileRoute("/_authed/")({
  loader: async () => {
    return getHomeDataFn();
  },
  component: Home,
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** All month cells share this height (3 single-line previews + day/weight row). */
const CAL_DAY_CELL_CLASS = "h-32";

function LinkedExternalSessionIcon() {
  return (
    <span
      className="inline-flex shrink-0 text-zinc-500"
      title="Linked external session"
      aria-hidden
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3 shrink-0"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </span>
  );
}

function PlanStatusPreviewGlyph({ status }: { status: string }) {
  const label =
    status === "completed"
      ? "Completed"
      : status === "skipped"
        ? "Skipped"
        : "Planned";
  const common = "inline-flex h-3 w-3 shrink-0";
  if (status === "completed") {
    return (
      <span className={`${common} text-emerald-500`} title={label} aria-hidden>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className={`${common} text-amber-500`} title={label} aria-hidden>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`${common} text-zinc-500`} title={label} aria-hidden>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <circle cx="10" cy="10" r="3" />
      </svg>
    </span>
  );
}

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

/** `YYYY-MM-DD` strictly after today (local calendar). */
function isLocalDayKeyInFuture(dayKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dayKey) && dayKey > todayLocalDayKey();
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

function formatActualDurationSec(s: number | null | undefined): string | null {
  if (s == null || !Number.isFinite(s)) {
    return null;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function CardioActualFromCompleted({ c }: { c: CompletedWorkoutRow }) {
  const dist = c.distanceM;
  const distLabel =
    dist != null && Number.isFinite(dist)
      ? dist >= 1000
        ? `${(dist / 1000).toFixed(2)} km`
        : `${Math.round(dist)} m`
      : null;
  const dur = formatActualDurationSec(c.movingTimeSeconds);
  const kcal =
    c.calories != null && Number.isFinite(c.calories)
      ? Math.round(c.calories)
      : null;
  if (!distLabel && !dur && kcal == null) {
    return null;
  }
  return (
    <div className="rounded border border-zinc-800/80 bg-zinc-900/20 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
        Actual (linked)
      </p>
      <div className="mt-0.5 text-[11px] text-zinc-400">
        {distLabel ? <span>{distLabel}</span> : null}
        {distLabel && dur ? <span className="text-zinc-600"> · </span> : null}
        {dur ? <span>{dur}</span> : null}
        {kcal != null ? (
          <span>
            {distLabel || dur ? (
              <span className="text-zinc-600"> · </span>
            ) : null}
            {kcal} kcal
          </span>
        ) : null}
      </div>
    </div>
  );
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
        <div className="max-h-48 space-y-4 overflow-y-auto pr-1">
          {groups.map(({ folder, routines }, gi) =>
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
          {unfoldered.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Other
              </p>
              <div className="flex flex-col gap-1">
                {unfoldered.map((r) => {
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

function Home() {
  const data = Route.useLoaderData();
  const {
    plans,
    weightEntries,
    hevyRoutines,
    hevyRoutineGroups,
    hevyRoutinesUnfoldered,
  } = data;
  const router = useRouter();
  const queryClient = useQueryClient();

  async function refreshAfterPlanChange() {
    await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
    await queryClient.invalidateQueries({
      queryKey: ["planLinkCandidatesForDay"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["plannedWorkouts", "list"],
    });
    await router.invalidate();
  }

  const [view, setView] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);
  const [weightErr, setWeightErr] = useState<string | null>(null);
  const [planKind, setPlanKind] = useState("");
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [liftRoutineId, setLiftRoutineId] = useState<string | null>(null);
  const [dayModalScreen, setDayModalScreen] =
    useState<DayModalScreen>("summary");
  const [linkPlanId, setLinkPlanId] = useState<string | null>(null);
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
  const activityPlotPoints = useMemo(
    () =>
      buildActivityPlotPoints(plans, activityPlotKind, undefined, undefined),
    [plans, activityPlotKind],
  );
  const rTitle = useMemo(() => routineTitleMap(hevyRoutines), [hevyRoutines]);

  const cells = useMemo(() => calendarCells(view.y, view.m), [view.y, view.m]);

  const monthLabel = new Date(view.y, view.m, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

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
        return;
      }
      setSelectedDay(null);
      setWeightErr(null);
      setPlanErr(null);
      setLiftRoutineId(null);
      setLinkPlanId(null);
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
  }, [highlightedDayKey, view.y, view.m]);

  function prevMonth() {
    setHighlightedDayKey(null);
    setView((v) => {
      const d = new Date(v.y, v.m - 1, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function nextMonth() {
    setHighlightedDayKey(null);
    setView((v) => {
      const d = new Date(v.y, v.m + 1, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function goToday() {
    setHighlightedDayKey(null);
    const n = new Date();
    setView({ y: n.getFullYear(), m: n.getMonth() });
  }

  function openDay(y: number, m0: number, day: number) {
    setHighlightedDayKey(null);
    setSelectedDay({ y, m: m0, d: day });
    setDayModalScreen("summary");
    setLinkPlanId(null);
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
    setHighlightedDayKey(normalized);
  }

  function openDayWithPlan(y: number, m0: number, day: number, planId: string) {
    setHighlightedDayKey(null);
    setSelectedDay({ y, m: m0, d: day });
    setDayModalScreen("planLink");
    setLinkPlanId(planId);
    setWeightErr(null);
    setPlanErr(null);
    setPlanKind("");
    setLiftRoutineId(null);
  }

  function closeWeightDialog() {
    setSelectedDay(null);
    setHighlightedDayKey(null);
    setRetroActivityNotes("");
    setDayModalScreen("summary");
    setLinkPlanId(null);
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

  function openAddFromActivityScreen() {
    if (selectedDay) {
      const key = dayKeyFromParts(selectedDay.y, selectedDay.m, selectedDay.d);
      if (isLocalDayKeyInFuture(key)) {
        return;
      }
    }
    setPlanKind("");
    setLiftRoutineId(null);
    setPlanErr(null);
    setRetroActivityNotes("");
    setDayModalScreen("addFromActivity");
  }

  function backToDaySummary() {
    setDayModalScreen("summary");
    setPlanErr(null);
    setLinkPlanId(null);
  }

  function openPlanLinkFromSummary(planId: string) {
    setDayModalScreen("planLink");
    setLinkPlanId(planId);
    setPlanErr(null);
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-zinc-400">
          Click a day for weight and plans. Tap a plan to link a session: lifts
          use Hevy; run, bike, and swim use Strava.
        </p>
      </div>

      <section ref={calendarSectionRef} className="space-y-3 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-zinc-100">Calendar</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              ←
            </button>
            <span className="min-w-[10rem] text-center text-sm font-medium text-zinc-200">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              →
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Today
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-zinc-800 bg-zinc-800">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-zinc-900 px-3 py-2 text-center text-xs font-medium text-zinc-500"
            >
              {w}
            </div>
          ))}
          {cells.map((cell) => {
            if (cell.day === null) {
              return (
                <div
                  key={cell.key}
                  className={`${CAL_DAY_CELL_CLASS} bg-zinc-950/80`}
                />
              );
            }
            const day = cell.day;
            const key = `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayPlans = byDay.get(key) ?? [];
            const dayWeight = byWeightDay.get(key);
            const isToday =
              new Date().toDateString() ===
              new Date(view.y, view.m, day).toDateString();
            const isHighlightedDay =
              (dialogDayKey !== null && key === dialogDayKey) ||
              (highlightedDayKey !== null && key === highlightedDayKey);
            const dayAriaLabel = new Date(
              view.y,
              view.m,
              day,
            ).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            });

            return (
              <div
                key={cell.key}
                id={`home-cal-day-${key}`}
                className={`relative flex ${CAL_DAY_CELL_CLASS} flex-col bg-zinc-950 px-1.5 py-0.5 ${
                  isHighlightedDay
                    ? "z-[4] ring-2 ring-sky-500/80 ring-inset"
                    : isToday
                      ? "ring-1 ring-emerald-600/50 ring-inset"
                      : ""
                }`}
              >
                <button
                  type="button"
                  className="absolute inset-0 z-[1] cursor-pointer rounded border-0 bg-transparent p-0 text-left hover:bg-zinc-900/45 focus-visible:z-[5] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset"
                  onClick={() => openDay(view.y, view.m, day)}
                  aria-label={`Open ${dayAriaLabel}`}
                />
                <div className="relative z-[2] flex h-full min-h-0 min-w-0 flex-1 flex-col pointer-events-none">
                  <div className="flex shrink-0 items-start justify-between gap-1">
                    <div
                      className={`text-xs font-medium leading-none ${
                        isToday ? "text-emerald-400" : "text-zinc-500"
                      }`}
                    >
                      {day}
                    </div>
                    {dayWeight ? (
                      <div className="text-right text-[11px] leading-none tabular-nums text-zinc-300">
                        {dayWeight.weightLb.toFixed(1)} lb
                      </div>
                    ) : null}
                  </div>
                  <ul className="relative z-[3] mt-1.5 flex flex-col gap-px pointer-events-auto">
                    {([0, 1, 2] as const).map((slot) => {
                      const p = dayPlans[slot];
                      if (!p) {
                        return (
                          <li
                            key={`${key}-preview-${slot}`}
                            className="h-7 shrink-0"
                            aria-hidden
                          />
                        );
                      }
                      return (
                        <li key={p.id} className="h-7 min-h-0 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDayWithPlan(view.y, view.m, day, p.id);
                            }}
                            className="flex h-full w-full min-w-0 max-w-full items-center gap-1 overflow-hidden rounded border border-zinc-800 bg-zinc-900/80 px-1.5 py-0 text-left text-[11px] leading-none text-zinc-200 hover:border-zinc-600"
                          >
                            <span className="min-w-0 flex-1 truncate capitalize text-zinc-100">
                              {p.kind}
                            </span>
                            <PlanStatusPreviewGlyph status={p.status} />
                            {p.completedWorkout ? (
                              <LinkedExternalSessionIcon />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium text-zinc-100">Session trends</h2>
          <p className="text-sm text-zinc-500">
            Completed workouts with linked Strava or Hevy data (all time), by
            type — separate from the filtered list on{" "}
            <Link
              to="/activities"
              search={{
                kind: "all",
                status: "all",
                from: undefined,
                to: undefined,
              }}
              className="text-emerald-400/90 hover:underline"
            >
              Activities
            </Link>
            . Click a point or its date label to jump the calendar to that day
            and highlight it — same as weight below.
          </p>
        </div>
        <ActivityMetricsChart
          kind={activityPlotKind}
          onKindChange={setActivityPlotKind}
          points={activityPlotPoints}
          onSelectDayKey={openDayFromDayKey}
          selectedDayKey={dialogDayKey ?? highlightedDayKey}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium text-zinc-100">Weight</h2>
          <p className="text-sm text-zinc-500">
            Trend from your logged entries (lb). Click a point or its date label
            to jump the calendar to that day and highlight it — then open the
            day on the calendar to log or edit.
          </p>
        </div>
        <WeightTrendChart
          entries={weightEntries}
          onSelectDayKey={openDayFromDayKey}
          selectedDayKey={dialogDayKey ?? highlightedDayKey}
        />
      </section>

      {selectedDay !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="presentation"
          onClick={closeWeightDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-dialog-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
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

                <div className="mb-6 space-y-3">
                  <h3 className="text-sm font-medium text-zinc-200">
                    Current plans
                  </h3>
                  {dialogPlans.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                      No plans for this day.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {dialogPlans.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => openPlanLinkFromSummary(p.id)}
                            className="block w-full rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-sm text-zinc-200 hover:border-zinc-600"
                          >
                            <span className="capitalize text-zinc-100">
                              {p.kind}
                            </span>
                            <span className="text-zinc-500"> · {p.status}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={openAddPlanScreen}
                      className="w-full rounded border border-zinc-600 bg-zinc-900/50 px-3 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
                    >
                      Add plan
                    </button>
                    {dialogDayKey !== null &&
                    !isLocalDayKeyInFuture(dialogDayKey) ? (
                      <>
                        <button
                          type="button"
                          onClick={openAddFromActivityScreen}
                          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900"
                        >
                          Add from activity
                        </button>
                        <p className="text-[11px] leading-snug text-zinc-600">
                          Use when you already logged a workout in Strava or
                          Hevy but did not create a plan first.
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-5">
                  <p className="mb-3 text-sm font-medium text-zinc-200">
                    Weight (lb)
                  </p>
                  <form
                    key={`${dialogDayKey ?? "x"}-${dialogWeight?.weightLb ?? "none"}`}
                    className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
                    onSubmit={async (e) => {
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
                      try {
                        await setWeightForDayFn({
                          data: { dayKey: dialogDayKey, weightLb: w },
                        });
                        await router.invalidate();
                      } catch (e2) {
                        setWeightErr(
                          e2 instanceof Error ? e2.message : "Could not save",
                        );
                      }
                    }}
                  >
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
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2.5 pr-11 pl-3 text-zinc-100 tabular-nums placeholder:text-zinc-600"
                      />
                      <span
                        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-zinc-500"
                        aria-hidden
                      >
                        lb
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
                      >
                        Save
                      </button>
                      {dialogWeight && dialogDayKey ? (
                        <button
                          type="button"
                          className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
                          onClick={async () => {
                            if (!confirm("Clear weight for this day?")) {
                              return;
                            }
                            await clearWeightForDayFn({
                              data: { dayKey: dialogDayKey },
                            });
                            await router.invalidate();
                          }}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </form>
                  {weightErr ? (
                    <p className="mt-3 text-sm text-red-400">{weightErr}</p>
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
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      setPlanErr(null);
                      const kinds = new Set(["lift", "run", "bike", "swim"]);
                      if (!kinds.has(planKind)) {
                        setPlanErr("Choose a type.");
                        return;
                      }
                      try {
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
                        await createPlanFn({
                          data: {
                            kind: planKind,
                            scheduledAt,
                            notes,
                            routineId,
                            distance,
                            distanceUnits,
                            timeSeconds,
                          },
                        });
                        await refreshAfterPlanChange();
                        closeWeightDialog();
                      } catch (e2) {
                        setPlanErr(
                          e2 instanceof Error
                            ? e2.message
                            : "Could not create plan",
                        );
                      }
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
                      className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                    >
                      Create plan
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
                                    disabled={!w.id}
                                    onClick={async () => {
                                      if (!w.id || !selectedDay) {
                                        return;
                                      }
                                      setPlanErr(null);
                                      try {
                                        const scheduledAt =
                                          scheduledAtIsoForDay(
                                            selectedDay.y,
                                            selectedDay.m,
                                            selectedDay.d,
                                          );
                                        await createPlanFromActivityFn({
                                          data: {
                                            kind: "lift",
                                            scheduledAt,
                                            stravaActivityId: "",
                                            hevyWorkoutId: w.id,
                                            linkedSession:
                                              linkedSessionFromHevyWorkout(w),
                                            notes:
                                              retroActivityNotes.trim() || null,
                                            routineId: null,
                                          },
                                        });
                                        await refreshAfterPlanChange();
                                        closeWeightDialog();
                                      } catch (e2) {
                                        setPlanErr(
                                          e2 instanceof Error
                                            ? e2.message
                                            : "Could not create plan",
                                        );
                                      }
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
                                    onClick={async () => {
                                      if (!selectedDay) {
                                        return;
                                      }
                                      setPlanErr(null);
                                      try {
                                        const scheduledAt =
                                          scheduledAtIsoForDay(
                                            selectedDay.y,
                                            selectedDay.m,
                                            selectedDay.d,
                                          );
                                        await createPlanFromActivityFn({
                                          data: {
                                            kind: planKind,
                                            scheduledAt,
                                            stravaActivityId: String(a.id),
                                            hevyWorkoutId: "",
                                            linkedSession:
                                              linkedSessionFromStravaActivity(
                                                a,
                                              ),
                                            notes:
                                              retroActivityNotes.trim() || null,
                                            routineId: null,
                                          },
                                        });
                                        await refreshAfterPlanChange();
                                        closeWeightDialog();
                                      } catch (e2) {
                                        setPlanErr(
                                          e2 instanceof Error
                                            ? e2.message
                                            : "Could not create plan",
                                        );
                                      }
                                    }}
                                    className="w-full rounded border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-left text-[11px] leading-snug text-zinc-200 hover:border-zinc-600"
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
                      className="text-lg font-semibold text-zinc-100"
                    >
                      Link session
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

                {!linkPlan ? (
                  <p className="text-sm text-zinc-500">
                    This plan is not on this day anymore.
                  </p>
                ) : (
                  <>
                    {linkPlan.kind === "lift" &&
                    linkPlan.routineId &&
                    linkPlan.routineVendor === "hevy" ? (
                      <div className="mb-2 rounded border border-zinc-800/80 bg-zinc-900/30 px-2 py-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                          Hevy routine
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-200">
                          {rTitle.get(linkPlan.routineId) ??
                            linkPlan.routineId.slice(0, 8)}
                        </p>
                        <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                          Template from when you created the plan.
                        </p>
                      </div>
                    ) : null}

                    <div className="mb-2 rounded border border-zinc-800/90 bg-zinc-900/40 px-2 py-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="text-sm capitalize text-zinc-200">
                          {linkPlan.kind}
                        </span>
                        <PlanStatusSelect
                          planId={linkPlan.id}
                          status={linkPlan.status}
                          onUpdated={refreshAfterPlanChange}
                        />
                      </div>
                      {linkPlan.completedWorkout ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[11px] text-zinc-500">
                            Linked session.
                          </span>
                          {linkPlan.completedWorkout.vendor === "strava" ? (
                            <a
                              href={stravaActivityWebUrl(
                                linkPlan.completedWorkout.externalId,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-emerald-400/90 hover:underline"
                            >
                              View in Strava
                            </a>
                          ) : (
                            <a
                              href={hevyWorkoutWebUrl(
                                linkPlan.completedWorkout.externalId,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-emerald-400/90 hover:underline"
                            >
                              Open Hevy workout
                            </a>
                          )}
                          <button
                            type="button"
                            className="text-[11px] text-amber-400/90 hover:underline"
                            onClick={async () => {
                              await updatePlanFn({
                                data: {
                                  id: linkPlan.id,
                                  stravaActivityId: null,
                                  hevyWorkoutId: null,
                                },
                              });
                              await refreshAfterPlanChange();
                            }}
                          >
                            Unlink
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-zinc-600">
                          No session linked.
                        </p>
                      )}
                    </div>

                    {isCardioKind(linkPlan.kind) ? (
                      <div className="mb-2 space-y-1.5">
                        <PlanCardioTargetsField
                          planId={linkPlan.id}
                          kind={linkPlan.kind}
                          distance={linkPlan.distance}
                          distanceUnits={linkPlan.distanceUnits}
                          timeSeconds={linkPlan.timeSeconds}
                          onUpdated={refreshAfterPlanChange}
                        />
                        {linkPlan.completedWorkout ? (
                          <CardioActualFromCompleted
                            c={linkPlan.completedWorkout}
                          />
                        ) : null}
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
                          className="text-[11px] text-red-400/90 hover:underline"
                          onClick={async () => {
                            if (!confirm("Delete this plan?")) {
                              return;
                            }
                            await deletePlanFn({ data: { id: linkPlan.id } });
                            await refreshAfterPlanChange();
                            closeWeightDialog();
                          }}
                        >
                          Delete plan
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
                                          disabled={!w.id}
                                          onClick={async () => {
                                            if (!w.id) {
                                              return;
                                            }
                                            await updatePlanFn({
                                              data: {
                                                id: linkPlan.id,
                                                stravaActivityId: "",
                                                hevyWorkoutId: w.id,
                                                linkedSession:
                                                  linkedSessionFromHevyWorkout(
                                                    w,
                                                  ),
                                              },
                                            });
                                            await refreshAfterPlanChange();
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
                                          onClick={async () => {
                                            await updatePlanFn({
                                              data: {
                                                id: linkPlan.id,
                                                stravaActivityId: String(a.id),
                                                hevyWorkoutId: "",
                                                linkedSession:
                                                  linkedSessionFromStravaActivity(
                                                    a,
                                                  ),
                                              },
                                            });
                                            await refreshAfterPlanChange();
                                          }}
                                          className="w-full rounded border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-left text-[11px] leading-snug text-zinc-200 hover:border-zinc-600"
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
                            className="text-[11px] text-red-400/90 hover:underline"
                            onClick={async () => {
                              if (!confirm("Delete this plan?")) {
                                return;
                              }
                              await deletePlanFn({ data: { id: linkPlan.id } });
                              await refreshAfterPlanChange();
                              closeWeightDialog();
                            }}
                          >
                            Delete plan
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
