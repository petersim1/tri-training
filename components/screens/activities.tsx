import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import { ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE } from "@/lib/api/activities-markdown-import";
import type { CompletedWorkoutRow } from "@/lib/db/schema.server";
import {
  hevyWebRootUrl,
  hevyWorkoutWebUrl,
  stravaActivityWebUrl,
} from "@/lib/hevy/links";
import { formatPlannedCardioTargets } from "@/lib/plans/cardio-targets";
import {
  completedWorkoutTitle,
  formatCompletedSessionBrief,
  inferPlanKindFromCompletedRow,
} from "@/lib/plans/completed-workout-data";
import queryKeys from "@/lib/query-keys";
import {
  browserTimeZone,
  formatPlanDayKey,
  toIsoDate,
} from "@/lib/utils/dates";
import { activityActions, markdownActions } from "@/server-fcts";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import { PencilEditIcon } from "../assets";
import { LinkedSessionPanel } from "../LinkedSessionPanel";
import { PlanCardioTargetsField } from "../PlanCardioTargetsField";
import { PlanDayKeyField } from "../PlanDayKeyField";
import { PlanKindField } from "../PlanKindField";
import { PlanNotesField } from "../PlanNotesField";
import { normalizePlanStatus, PlanStatusSelect } from "../PlanStatusSelect";
import { ActivityFilters } from "../views/activities/filters";

const STRAVA_ACTIVITIES_HOME = "https://www.strava.com/athlete/training";
const MAIN_COLUMN = "mx-auto w-full max-w-6xl";

function completedWorkoutOpenInVendor(cw: CompletedWorkoutRow): {
  href: string;
  label: string;
} {
  const isStrava = cw.vendor === "strava";
  return {
    href: isStrava
      ? stravaActivityWebUrl(cw.vendorId)
      : hevyWorkoutWebUrl(cw.vendorId),
    label: isStrava ? "Open in Strava" : "Open in Hevy",
  };
}

export const ActivitiesContent: React.FC<{
  initialQuery: ActivityListSchemaValues;
}> = ({ initialQuery }) => {
  const queryClient = useQueryClient();

  const formReducer = useFormReducer(initialQuery);

  const [linkAllOpen, setLinkAllOpen] = useState(false);
  const [linkAllError, setLinkAllError] = useState<string | null>(null);
  const [linkAllInfo, setLinkAllInfo] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMarkdown, setUploadMarkdown] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadIssues, setUploadIssues] = useState<
    { line?: number; message: string }[]
  >([]);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const calendarTimeZone = browserTimeZone();

  const unresolvedQuery = useQuery({
    queryKey: queryKeys.unlinkedActivities,
    queryFn: () => activityActions.unlinked(),
  });

  const linkAllMutation = useMutation({
    mutationFn: () =>
      activityActions.linkAll({
        data: { timezone: browserTimeZone() },
      }),
  });

  const deletePlanMutation = useMutation({
    mutationFn: (id: string) => activityActions.deletePlan({ data: { id } }),
    onSuccess: async () => {
      setEditPlanId(null);
      await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
      await queryClient.invalidateQueries({ queryKey: ["completedWorkouts"] });
      await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
    },
  });

  async function confirmLinkAll() {
    setLinkAllError(null);
    setLinkAllInfo(null);
    try {
      const res = await linkAllMutation.mutateAsync();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.unlinkedActivities,
      });
      await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
      await queryClient.invalidateQueries({ queryKey: ["completedWorkouts"] });
      await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
      if (res.linked > 0) {
        setLinkAllOpen(false);
        setLinkAllInfo(null);
      } else {
        setLinkAllInfo("Nothing to link.");
      }
    } catch (e) {
      setLinkAllError(
        e instanceof Error ? e.message : "Could not link sessions",
      );
    }
  }

  useEffect(() => {
    if (!linkAllOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || linkAllMutation.isPending) {
        return;
      }
      setLinkAllOpen(false);
      setLinkAllError(null);
      setLinkAllInfo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkAllOpen, linkAllMutation.isPending]);

  useEffect(() => {
    if (!uploadOpen) {
      setUploadMarkdown("");
      setUploadError(null);
      setUploadIssues([]);
    }
  }, [uploadOpen]);

  useEffect(() => {
    if (!uploadOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || uploadBusy) {
        return;
      }
      setUploadOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [uploadOpen, uploadBusy]);

  const { data: activityList } = useSuspenseQuery({
    queryKey: queryKeys.activitiesList(formReducer.formState.values),
    queryFn: () =>
      activityActions.list({
        data: formReducer.formState.values,
      }),
  });

  const editingPlan =
    editPlanId === null
      ? null
      : activityList.rows.find((r) => r.id === editPlanId);

  const pageCount = Math.max(
    1,
    Math.ceil(activityList.total ?? 0 / formReducer.formState.values.pageSize),
  );

  useEffect(() => {
    if (editPlanId === null) {
      return;
    }
    if (!activityList.rows.some((r) => r.id === editPlanId)) {
      setEditPlanId(null);
    }
  }, [editPlanId, activityList]);

  useEffect(() => {
    if (editPlanId === null) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditPlanId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editPlanId]);

  async function copyMarkdownTemplate() {
    try {
      await navigator.clipboard.writeText(ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE);
    } catch {
      /* ignore */
    }
  }

  async function submitMarkdownImport() {
    setUploadError(null);
    setUploadIssues([]);
    setUploadBusy(true);
    try {
      const result = await markdownActions.importActivitiesMarkdownFn({
        data: { markdown: uploadMarkdown },
      });
      if (!result.ok) {
        setUploadError(result.error);
        setUploadIssues(result.issues);
        return;
      }
      setUploadOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
      await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setUploadBusy(false);
    }
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.unlinkedActivities,
    });
  }

  async function refreshAfterPlanChange() {
    await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
    await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.unlinkedActivities,
    });
  }

  return (
    <div className={`${MAIN_COLUMN} space-y-5`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Activities</h1>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={STRAVA_ACTIVITIES_HOME}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            View all Strava
          </a>
          <a
            href={hevyWebRootUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            View all Hevy
          </a>
          <button
            type="button"
            onClick={refresh}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Refresh
          </button>
          {(unresolvedQuery.data ?? []).length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setLinkAllError(null);
                setLinkAllInfo(null);
                setLinkAllOpen(true);
              }}
              className="rounded border border-violet-600/50 bg-violet-950/35 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-950/55"
            >
              Link all unlinked
            </button>
          ) : null}
        </div>
      </div>

      <ActivityFilters
        formReducer={formReducer}
        openUpload={() => setUploadOpen(true)}
      />

      {activityList.total > 0 ? (
        <div className="sticky top-0 z-30 mt-1 border-b border-zinc-800/80 bg-zinc-950/95 py-2 backdrop-blur-md">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">
              Showing{" "}
              <span className="tabular-nums text-zinc-400">
                {(formReducer.formState.values.page - 1) *
                  formReducer.formState.values.pageSize +
                  1}
              </span>
              –
              <span className="tabular-nums text-zinc-400">
                {Math.min(
                  formReducer.formState.values.page *
                    formReducer.formState.values.pageSize,
                  activityList.total,
                )}
              </span>{" "}
              of{" "}
              <span className="tabular-nums text-zinc-400">
                {activityList.total}
              </span>
            </p>
            {pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={formReducer.formState.values.page <= 1}
                  onClick={() =>
                    formReducer.setField(
                      "page",
                      formReducer.formState.values.page - 1,
                    )
                  }
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs tabular-nums text-zinc-500">
                  {formReducer.formState.values.page} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={formReducer.formState.values.page >= pageCount}
                  onClick={() =>
                    formReducer.setField(
                      "page",
                      formReducer.formState.values.page + 1,
                    )
                  }
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activityList.total ? (
        <p className="text-sm text-zinc-500">
          No planned workouts match these filters.
        </p>
      ) : null}

      {uploadOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 z-0 bg-black/60"
            disabled={uploadBusy}
            onClick={() => {
              if (!uploadBusy) {
                setUploadOpen(false);
              }
            }}
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="activities-upload-md-title"
              className="pointer-events-auto flex max-h-[min(36rem,92vh)] w-full max-w-lg flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl shadow-black/40"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <h2
                id="activities-upload-md-title"
                className="text-lg font-semibold text-zinc-100"
              >
                Upload planned workouts (markdown)
              </h2>
              <p className="text-xs text-zinc-500">
                All rows are checked before anything is saved. Only{" "}
                <span className="text-zinc-400">planned</span> workouts are
                created (same rules as the bulk API).
              </p>
              <textarea
                value={uploadMarkdown}
                onChange={(e) => {
                  const next = e.target.value;
                  setUploadMarkdown(next.trim() === "" ? "" : next);
                }}
                placeholder={ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE}
                rows={14}
                className="min-h-48 w-full resize-y rounded border border-zinc-700/80 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                spellCheck={false}
              />
              {uploadError ? (
                <p className="text-sm text-red-400">{uploadError}</p>
              ) : null}
              {uploadIssues.length > 0 ? (
                <ul className="max-h-32 overflow-y-auto rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-xs text-amber-200/90">
                  {uploadIssues.map((iss) => (
                    <li key={`${iss.line ?? "row"}-${iss.message}`}>
                      {iss.line != null ? (
                        <span className="tabular-nums text-zinc-500">
                          Line {iss.line}:{" "}
                        </span>
                      ) : null}
                      {iss.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800/80 pt-3">
                <button
                  type="button"
                  disabled={uploadBusy}
                  onClick={() => void copyMarkdownTemplate()}
                  className="mr-auto h-8 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy template
                </button>
                <button
                  type="button"
                  disabled={uploadBusy}
                  onClick={() => setUploadOpen(false)}
                  className="h-8 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploadBusy || uploadMarkdown.trim() === ""}
                  onClick={() => void submitMarkdownImport()}
                  className="h-8 rounded border border-emerald-600/60 bg-emerald-950/35 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-950/55 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadBusy ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingPlan ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 z-0 bg-black/60"
            onClick={() => setEditPlanId(null)}
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="activities-edit-plan-title"
              className="pointer-events-auto flex max-h-[min(40rem,92vh)] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl shadow-black/40"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2
                    id="activities-edit-plan-title"
                    className="text-lg font-semibold text-zinc-100"
                  >
                    Edit activity
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatPlanDayKey(editingPlan.dayKey)} ·{" "}
                    <span className="capitalize">{editingPlan.kind}</span>
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  aria-label="Close"
                  onClick={() => setEditPlanId(null)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="size-5"
                    aria-hidden
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4 border-t border-zinc-800/80 pt-3">
                {editingPlan.status === "planned" &&
                !editingPlan.completedWorkout ? (
                  <>
                    <PlanDayKeyField
                      planId={editingPlan.id}
                      dayKey={editingPlan.dayKey}
                      onUpdated={refreshAfterPlanChange}
                    />
                    <PlanKindField
                      planId={editingPlan.id}
                      kind={editingPlan.kind}
                      onUpdated={refreshAfterPlanChange}
                    />
                  </>
                ) : (
                  <p className="text-[11px] leading-snug text-zinc-500">
                    Date and activity type can be edited only when status is
                    planned and no workout is linked.
                  </p>
                )}
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-zinc-500">
                    Status
                  </span>
                  <PlanStatusSelect
                    planId={editingPlan.id}
                    status={editingPlan.status}
                    disabled={Boolean(editingPlan.completedWorkout)}
                    onUpdated={refreshAfterPlanChange}
                    className="block"
                  />
                </div>
                {["run", "bike", "swim"].includes(editingPlan.kind) &&
                !editingPlan.completedWorkout ? (
                  <PlanCardioTargetsField
                    planId={editingPlan.id}
                    kind={editingPlan.kind}
                    distance={editingPlan.distance}
                    distanceUnits={editingPlan.distanceUnits}
                    timeSeconds={editingPlan.timeSeconds}
                    onUpdated={refreshAfterPlanChange}
                  />
                ) : null}
                {editingPlan.completedWorkout ? (
                  <LinkedSessionPanel
                    planId={editingPlan.id}
                    completed={editingPlan.completedWorkout}
                    onUnlinked={refreshAfterPlanChange}
                  />
                ) : !["run", "bike", "swim"].includes(editingPlan.kind) ? (
                  <p className="rounded border border-dashed border-zinc-800/90 bg-zinc-950/40 px-2 py-2 text-xs text-zinc-500">
                    No session linked. Link from Home or the plan calendar.
                  </p>
                ) : null}
                <PlanNotesField
                  planId={editingPlan.id}
                  notes={editingPlan.notes}
                  onUpdated={refreshAfterPlanChange}
                />
                {editingPlan.status === "skipped" ? (
                  <p className="text-[11px] leading-snug text-zinc-500">
                    Skipped — linking hidden. Change status to attach a session.
                  </p>
                ) : null}
              </div>
              {editingPlan.status !== "skipped" ? (
                <div className="border-t border-zinc-800/80 pt-3">
                  <button
                    type="button"
                    disabled={deletePlanMutation.isPending}
                    className="text-[11px] text-red-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => deletePlanMutation.mutate(editingPlan.id)}
                  >
                    {deletePlanMutation.isPending ? "Deleting…" : "Delete plan"}
                  </button>
                </div>
              ) : null}
              <div className="flex justify-end border-t border-zinc-800/80 pt-3">
                <button
                  type="button"
                  onClick={() => setEditPlanId(null)}
                  className="rounded border border-zinc-600/80 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {linkAllOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 z-0 bg-black/60"
            disabled={linkAllMutation.isPending}
            onClick={() => {
              if (!linkAllMutation.isPending) {
                setLinkAllOpen(false);
                setLinkAllError(null);
                setLinkAllInfo(null);
              }
            }}
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="activities-link-all-title"
              className="pointer-events-auto flex max-h-[min(32rem,90vh)] w-full max-w-lg flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl shadow-black/40"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <h2
                id="activities-link-all-title"
                className="text-lg font-semibold text-zinc-100"
              >
                Link all unlinked sessions
              </h2>
              <p className="text-sm text-zinc-500">
                Each activity’s calendar day uses{" "}
                <span className="font-mono text-zinc-400">
                  {calendarTimeZone}
                </span>{" "}
                from its UTC start time. For that day and activity type: if
                there is no plan yet, one is created and linked; if there is
                exactly one open planned workout, it is linked; if there are
                multiple plans, nothing is changed (resolve on Home).
              </p>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {(unresolvedQuery.data ?? []).map((cw) => {
                  const title = completedWorkoutTitle(cw) ?? "Session";
                  const kindLabel =
                    inferPlanKindFromCompletedRow(cw) ?? cw.activityKind;
                  return (
                    <li
                      key={cw.id}
                      className="rounded border border-zinc-800/90 bg-zinc-900/50 px-3 py-2"
                    >
                      <div className="text-sm text-zinc-100">{title}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {cw.vendor === "hevy" ? "Hevy" : "Strava"} ·{" "}
                        <span className="capitalize">{kindLabel}</span>
                        {" · "}
                        <span className="tabular-nums">
                          {toIsoDate(cw.createdAt, calendarTimeZone)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {linkAllInfo ? (
                <p className="text-sm text-zinc-400">{linkAllInfo}</p>
              ) : null}
              {linkAllError ? (
                <p className="text-sm text-red-400">{linkAllError}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800/80 pt-3">
                <button
                  type="button"
                  disabled={linkAllMutation.isPending}
                  onClick={() => {
                    setLinkAllOpen(false);
                    setLinkAllError(null);
                    setLinkAllInfo(null);
                  }}
                  className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    linkAllMutation.isPending ||
                    unresolvedQuery.data?.length === 0
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void confirmLinkAll();
                  }}
                  className="rounded border border-violet-600/60 bg-violet-950/40 px-3 py-1.5 text-sm font-medium text-violet-200 hover:bg-violet-950/65 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {linkAllMutation.isPending ? "Linking…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activityList.rows.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {activityList.rows.map((p) => {
            const linked = Boolean(p.completedWorkout);
            const title =
              linked && p.completedWorkout
                ? completedWorkoutTitle(p.completedWorkout)
                : null;
            const brief =
              linked && p.completedWorkout
                ? formatCompletedSessionBrief(p.completedWorkout)
                : null;
            const planTargets = ["run", "bike", "swim"].includes(p.kind)
              ? formatPlannedCardioTargets(p)
              : null;
            const vendorOpen = p.completedWorkout
              ? completedWorkoutOpenInVendor(p.completedWorkout)
              : null;
            return (
              <li
                key={p.id}
                className="min-w-0 rounded-md border border-zinc-800/80 bg-zinc-950/70 px-2 py-2"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 items-start justify-between gap-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <span className="text-[10px] font-medium capitalize text-zinc-200">
                        {p.kind}
                      </span>
                      <span className="rounded bg-zinc-800/90 px-1 py-px text-[9px] capitalize text-zinc-400">
                        {normalizePlanStatus(p.status)}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Edit ${p.kind} — ${formatPlanDayKey(p.dayKey)}`}
                      className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800/90 hover:text-zinc-300"
                      onClick={() => setEditPlanId(p.id)}
                    >
                      <PencilEditIcon className="size-3.5" />
                    </button>
                  </div>
                  <p
                    className="text-[9px] tabular-nums text-zinc-500"
                    title={p.dayKey}
                  >
                    {formatPlanDayKey(p.dayKey)}
                  </p>
                  {linked && p.completedWorkout ? (
                    <div className="rounded border border-emerald-900/35 bg-emerald-950/20 px-1.5 py-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-emerald-600/85">
                            Linked
                          </p>
                          {title ? (
                            <p className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-300">
                              {title}
                            </p>
                          ) : null}
                          {brief ? (
                            <p className="mt-0.5 text-[9px] text-zinc-500">
                              {brief}
                            </p>
                          ) : null}
                          {planTargets ? (
                            <p className="mt-0.5 text-[9px] text-zinc-600">
                              Target: {planTargets}
                            </p>
                          ) : null}
                        </div>
                        {vendorOpen ? (
                          <a
                            href={vendorOpen.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 pt-0.5 text-right text-[9px] font-medium leading-tight text-emerald-400/95 hover:text-emerald-300 hover:underline"
                          >
                            {vendorOpen.label}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : ["run", "bike", "swim"].includes(p.kind) ? (
                    <p className="text-[10px] text-zinc-500">
                      {planTargets ?? "No targets set"}
                    </p>
                  ) : (
                    <p className="text-[9px] text-zinc-600">
                      No session linked
                    </p>
                  )}
                  {p.notes?.trim() ? (
                    <p className="line-clamp-2 text-[10px] leading-tight text-zinc-500">
                      {p.notes.trim()}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
