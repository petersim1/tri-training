import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import { ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE } from "@/lib/api/activities-markdown-import";
import type { TypedVendorWorkoutRow } from "@/lib/db/schema.server";
import { hevyWebRootUrl } from "@/lib/hevy/links";
import { completedWorkoutTitle } from "@/lib/plans/completed-workout-data";
import queryKeys from "@/lib/query-keys";
import {
  browserTimeZone,
  formatPlanDayKey,
  toIsoDate,
} from "@/lib/utils/dates";
import { rawActivityType } from "@/lib/utils/vendors";
import { activityActions } from "@/server-fcts/activities";
import { markdownActions } from "@/server-fcts/markdown";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import { LinkedSessionPanel } from "../LinkedSessionPanel";
import { PlanCardioTargetsField } from "../PlanCardioTargetsField";
import { PlanDayKeyField } from "../PlanDayKeyField";
import { PlanKindField } from "../PlanKindField";
import { PlanNotesField } from "../PlanNotesField";
import { PlanStatusSelect } from "../PlanStatusSelect";
import { ActivityElement } from "../views/activities/element";
import { ActivityFilters } from "../views/activities/filters";

const STRAVA_ACTIVITIES_HOME = "https://www.strava.com/athlete/training";
const MAIN_COLUMN = "mx-auto w-full max-w-6xl";

export const ActivitiesContent: React.FC<{
  initialQuery: ActivityListSchemaValues;
}> = ({ initialQuery }) => {
  const queryClient = useQueryClient();

  const linkAll = useServerFn(activityActions.linkAll);
  const deletePlan = useServerFn(activityActions.deletePlan);
  const importMarkdown = useServerFn(markdownActions.importActivitiesMarkdown);

  const formReducer = useFormReducer(initialQuery);

  const [linkAllOpen, setLinkAllOpen] = useState(false);
  const [linkAllError, setLinkAllError] = useState<string | null>(null);
  const [linkAllInfo, setLinkAllInfo] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMarkdown, setUploadMarkdown] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadIssues, setUploadIssues] = useState<
    { line?: number; message: string }[]
  >([]);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const calendarTimeZone = browserTimeZone();

  const unresolvedQuery = useSuspenseQuery({
    queryKey: queryKeys.unlinkedActivities,
    queryFn: () => activityActions.unlinked(),
  });

  const linkAllMutation = useMutation({
    mutationFn: () => linkAll({ data: { timezone: browserTimeZone() } }),
    onMutate: () => {
      setLinkAllError(null);
      setLinkAllInfo(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.unlinkedActivities,
      });
      queryClient.invalidateQueries({
        queryKey: ["activities"],
      });
      queryClient.invalidateQueries({
        queryKey: ["calendar"],
      });
    },
    onError: (e) => {
      setLinkAllError(
        e instanceof Error ? e.message : "Could not link sessions",
      );
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: (id: string) => deletePlan({ data: { id } }),
    onSuccess: async () => {
      setEditPlanId(null);
      queryClient.invalidateQueries({
        queryKey: ["activities"],
      });
      queryClient.invalidateQueries({
        queryKey: ["calendar"],
      });
    },
  });

  const importMarkdownMutation = useMutation({
    mutationFn: () => importMarkdown({ data: { markdown: uploadMarkdown } }),
    onMutate: () => {
      setUploadError(null);
      setUploadIssues([]);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setUploadError(result.error);
        setUploadIssues(result.issues);
        return;
      }
      setUploadOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["activities"],
      });
      queryClient.invalidateQueries({
        queryKey: ["calendar"],
      });
    },
    onError: (e) => {
      setUploadError(e instanceof Error ? e.message : "Import failed");
    },
  });

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
      if (e.key !== "Escape" || importMarkdownMutation.isPending) {
        return;
      }
      setUploadOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [uploadOpen, importMarkdownMutation.isPending]);

  const {
    data: activityList = {
      totalPages: 0,
      rows: [],
    },
  } = useQuery({
    queryKey: queryKeys.activitiesList(formReducer.formState.values),
    queryFn: () =>
      activityActions.list({
        data: formReducer.formState.values,
      }),
    placeholderData: keepPreviousData,
  });

  const editingPlan =
    editPlanId === null
      ? null
      : activityList.rows.find((r) => r.id === editPlanId);

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

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
    queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    queryClient.invalidateQueries({
      queryKey: queryKeys.unlinkedActivities,
    });
  }

  async function refreshAfterPlanChange() {
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
    queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    queryClient.invalidateQueries({
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
          {unresolvedQuery.data.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setLinkAllError(null);
                setLinkAllInfo(null);
                setLinkAllOpen(true);
                linkAllMutation.reset();
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

      <div className="sticky top-0 z-30 mt-1 border-b border-zinc-800/80 bg-zinc-950/95 py-2 backdrop-blur-md">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {activityList.totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={formReducer.formState.values.page === 0}
                onClick={() =>
                  formReducer.setField(
                    "page",
                    formReducer.formState.values.page - 1,
                  )
                }
                className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs tabular-nums text-zinc-500">
                {formReducer.formState.values.page + 1} /{" "}
                {activityList.totalPages}
              </span>
              <button
                type="button"
                disabled={
                  formReducer.formState.values.page ===
                  activityList.totalPages - 1
                }
                onClick={() =>
                  formReducer.setField(
                    "page",
                    formReducer.formState.values.page + 1,
                  )
                }
                className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {activityList.rows.length === 0 && (
        <p className="text-sm text-zinc-500">
          No planned workouts match these filters.
        </p>
      )}

      {uploadOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 z-0 bg-black/60"
            disabled={importMarkdownMutation.isPending}
            onClick={() => setUploadOpen(false)}
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
                  disabled={importMarkdownMutation.isPending}
                  onClick={() => void copyMarkdownTemplate()}
                  className="mr-auto h-8 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy template
                </button>
                <button
                  type="button"
                  disabled={importMarkdownMutation.isPending}
                  onClick={() => setUploadOpen(false)}
                  className="h-8 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    importMarkdownMutation.isPending ||
                    uploadMarkdown.trim() === ""
                  }
                  onClick={() => importMarkdownMutation.mutate()}
                  className="h-8 rounded border border-emerald-600/60 bg-emerald-950/35 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-950/55 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importMarkdownMutation.isPending ? "Importing…" : "Import"}
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
                !editingPlan.vendorActivity ? (
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
                    disabled={Boolean(editingPlan.vendorActivity)}
                    onUpdated={refreshAfterPlanChange}
                    className="block"
                  />
                </div>
                {["run", "bike", "swim"].includes(editingPlan.kind) &&
                !editingPlan.vendorActivity ? (
                  <PlanCardioTargetsField
                    planId={editingPlan.id}
                    kind={editingPlan.kind}
                    distance={editingPlan.distance}
                    distanceUnits={editingPlan.distanceUnits}
                    timeSeconds={editingPlan.timeSeconds}
                    onUpdated={refreshAfterPlanChange}
                  />
                ) : null}
                {editingPlan.vendorActivity ? (
                  <LinkedSessionPanel
                    planId={editingPlan.id}
                    completed={editingPlan.vendorActivity}
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
                  const kindLabel = rawActivityType(
                    cw as TypedVendorWorkoutRow,
                  );
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
              <div className="flex flex-wrap justify-between items-center gap-2 border-t border-zinc-800/80 pt-3">
                <div>
                  {linkAllMutation.isSuccess && (
                    <div className="text-zinc-400 text-sm">
                      <p>
                        <span>Linked {linkAllMutation.data.nLinked}</span>
                        <span className="mx-1">&middot;</span>
                        <span>Unlinked {linkAllMutation.data.nUnlinked}</span>
                      </p>
                    </div>
                  )}
                </div>
                <div>
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
                      linkAllMutation.mutate();
                    }}
                    className="rounded border border-violet-600/60 bg-violet-950/40 px-3 py-1.5 text-sm font-medium text-violet-200 hover:bg-violet-950/65 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {linkAllMutation.isPending ? "Linking…" : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activityList.rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {activityList.rows.map((p) => (
            <ActivityElement
              key={p.id}
              workout={p}
              onEdit={() => setEditPlanId(p.id)}
              isCard
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
