import {
  type DehydratedState,
  dehydrate,
  HydrationBoundary,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { LinkedSessionPanel } from "~/components/LinkedSessionPanel";
import { PlanCardioTargetsField } from "~/components/PlanCardioTargetsField";
import { PlanDayKeyField } from "~/components/PlanDayKeyField";
import { PlanKindField } from "~/components/PlanKindField";
import { PlanNotesField } from "~/components/PlanNotesField";
import {
  normalizePlanStatus,
  PlanStatusSelect,
} from "~/components/PlanStatusSelect";
import { ActivityListSkeleton } from "~/components/Skeleton";
import { ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE } from "~/lib/api/activities-markdown-import";
import type { CompletedWorkoutRow } from "~/lib/db/schema";
import {
  hevyWebRootUrl,
  hevyWorkoutWebUrl,
  stravaActivityWebUrl,
} from "~/lib/hevy/links";
import { activitiesUnresolvedCompletedQueryKey } from "~/lib/home/query-keys";
import {
  formatPlannedCardioTargets,
  isCardioKind,
} from "~/lib/plans/cardio-targets";
import {
  completedWorkoutLocalDayKeyInTimeZone,
  completedWorkoutTitle,
  formatCompletedSessionBrief,
  inferPlanKindFromCompletedRow,
} from "~/lib/plans/completed-workout-data";
import {
  fetchAllUnresolvedCompletedWorkoutsFn,
  linkAllUnresolvedCompletedWorkoutsFn,
} from "~/lib/server-fns/home";
import {
  exportActivitiesMarkdownFn,
  importActivitiesMarkdownFn,
  listPlannedWorkoutsPageFn,
} from "~/lib/server-fns/planned-workouts-list";
import { deletePlanFn } from "~/lib/server-fns/plans";

const STRAVA_ACTIVITIES_HOME = "https://www.strava.com/athlete/training";

const KINDS = ["all", "lift", "run", "bike", "swim", "recovery"] as const;
const STATUSES = ["all", "planned", "completed", "skipped"] as const;

const PAGE_SIZE = 20;

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

function PencilEditIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export type ActivitiesSearch = {
  kind: (typeof KINDS)[number];
  status: (typeof STATUSES)[number];
  from: string | undefined;
  to: string | undefined;
  page: number;
};

function activitiesPlannedQueryKey(search: ActivitiesSearch) {
  return [
    "plannedWorkouts",
    "activitiesPage",
    {
      kind: search.kind,
      status: search.status,
      from: search.from,
      to: search.to,
      page: search.page,
      pageSize: PAGE_SIZE,
    },
  ] as const;
}

/** Local display for a plan `day_key` from the browser (calendar intention). */
function formatPlanDayKey(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) {
    return dayKey;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Calendar label for an unlinked session using the same IANA zone sent to the server on confirm. */
function formatCompletedDayInBrowserZone(
  cw: CompletedWorkoutRow,
  timeZone: string,
): string {
  const dk = completedWorkoutLocalDayKeyInTimeZone(cw, timeZone);
  if (!dk) {
    return "—";
  }
  return formatPlanDayKey(dk);
}

function SelectChevron() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function FilterSelect({
  value,
  onChange,
  ariaLabelledBy,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabelledBy: string;
  children: ReactNode;
}) {
  return (
    <div className="relative inline-flex min-w-0">
      <select
        aria-labelledby={ariaLabelledBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full min-w-[6.25rem] max-w-[10rem] cursor-pointer appearance-none rounded border border-zinc-700/80 bg-zinc-900 py-0 pl-2 pr-7 text-xs text-zinc-100 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
      >
        {children}
      </select>
      <SelectChevron />
    </div>
  );
}

function parsePage(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }
  if (typeof raw === "string" && raw !== "") {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) {
      return Math.max(1, n);
    }
  }
  return 1;
}

export const Route = createFileRoute("/_authed/activities")({
  validateSearch: (raw: Record<string, unknown>): ActivitiesSearch => {
    const kind =
      typeof raw.kind === "string" &&
      KINDS.includes(raw.kind as (typeof KINDS)[number])
        ? (raw.kind as (typeof KINDS)[number])
        : "all";
    const status =
      typeof raw.status === "string" &&
      STATUSES.includes(raw.status as (typeof STATUSES)[number])
        ? (raw.status as (typeof STATUSES)[number])
        : "all";
    const from =
      typeof raw.from === "string" &&
      raw.from !== "" &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.from)
        ? raw.from
        : undefined;
    const to =
      typeof raw.to === "string" &&
      raw.to !== "" &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.to)
        ? raw.to
        : undefined;
    const page = parsePage(raw.page);
    return { kind, status, from, to, page };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({
    context,
    deps,
  }): Promise<{
    dehydrated: DehydratedState;
  }> => {
    const { queryClient } = context;
    await queryClient.prefetchQuery({
      queryKey: activitiesPlannedQueryKey(deps),
      queryFn: () =>
        listPlannedWorkoutsPageFn({
          data: {
            kind: deps.kind,
            status: deps.status,
            from: deps.from,
            to: deps.to,
            page: deps.page,
            pageSize: PAGE_SIZE,
          },
        }),
    });
    await queryClient.prefetchQuery({
      queryKey: activitiesUnresolvedCompletedQueryKey,
      queryFn: () => fetchAllUnresolvedCompletedWorkoutsFn(),
    });
    return {
      dehydrated: dehydrate(queryClient),
    };
  },
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const data = Route.useLoaderData();
  return (
    <HydrationBoundary state={data.dehydrated}>
      <ActivitiesContent />
    </HydrationBoundary>
  );
}

function ActivitiesContent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/activities" });
  const search = Route.useSearch();
  const [linkAllOpen, setLinkAllOpen] = useState(false);
  const [linkAllError, setLinkAllError] = useState<string | null>(null);
  const [linkAllInfo, setLinkAllInfo] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
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
    queryKey: activitiesUnresolvedCompletedQueryKey,
    queryFn: () => fetchAllUnresolvedCompletedWorkoutsFn(),
  });

  const linkAllMutation = useMutation({
    mutationFn: () =>
      linkAllUnresolvedCompletedWorkoutsFn({
        data: { timeZone: browserTimeZone() },
      }),
  });

  const deletePlanMutation = useMutation({
    mutationFn: (id: string) => deletePlanFn({ data: { id } }),
    onSuccess: async () => {
      setEditPlanId(null);
      await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
      await queryClient.invalidateQueries({
        queryKey: activitiesUnresolvedCompletedQueryKey,
      });
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
        queryKey: activitiesUnresolvedCompletedQueryKey,
      });
      await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
      await queryClient.invalidateQueries({ queryKey: ["completedWorkouts"] });
      await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
      if (res.linked > 0) {
        setLinkAllOpen(false);
        setLinkAllInfo(null);
      } else if (res.skipped > 0) {
        setLinkAllInfo(
          `No sessions were linked (${res.skipped}). Typical reasons: several plans already exist that day for the same activity type, the lone plan is already linked or not in “planned” status, or the activity type isn’t supported.`,
        );
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

  const plansQuery = useQuery({
    queryKey: activitiesPlannedQueryKey(search),
    queryFn: () =>
      listPlannedWorkoutsPageFn({
        data: {
          kind: search.kind,
          status: search.status,
          from: search.from,
          to: search.to,
          page: search.page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const total = plansQuery.data?.total ?? 0;
  const totalAll = plansQuery.data?.totalAll ?? 0;
  const rows = plansQuery.data?.rows ?? [];
  const editingPlan =
    editPlanId === null
      ? null
      : (rows.find((r) => r.id === editPlanId) ?? null);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, search.page), pageCount);

  useEffect(() => {
    if (search.page !== page) {
      navigate({
        search: (prev) => ({ ...prev, page }),
        replace: true,
      });
    }
  }, [navigate, page, search.page]);

  const hasActiveFilters =
    search.kind !== "all" ||
    search.status !== "all" ||
    Boolean(search.from) ||
    Boolean(search.to);

  const loading = plansQuery.isPending;
  const unresolvedCount = unresolvedQuery.data?.length ?? 0;
  const exportDateRangeOk = Boolean(search.from || search.to);

  useEffect(() => {
    if (editPlanId === null || loading) {
      return;
    }
    if (!rows.some((r) => r.id === editPlanId)) {
      setEditPlanId(null);
    }
  }, [editPlanId, loading, rows]);

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

  async function copyActivitiesMarkdown() {
    if (!search.from && !search.to) {
      return;
    }
    setExportFeedback(null);
    setExportBusy(true);
    try {
      const { markdown, rowCount } = await exportActivitiesMarkdownFn({
        data: {
          kind: search.kind,
          status: search.status,
          from: search.from ?? "",
          to: search.to ?? "",
          timeZone: browserTimeZone(),
        },
      });
      const text =
        markdown.trim() !== "" ? markdown : "_No activities in this range._";
      await navigator.clipboard.writeText(text);
      setExportFeedback({
        kind: "ok",
        text:
          rowCount === 0
            ? "Copied (empty range)."
            : `Copied ${rowCount} activit${rowCount === 1 ? "y" : "ies"}.`,
      });
    } catch (e) {
      setExportFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : "Could not copy export",
      });
    } finally {
      setExportBusy(false);
    }
  }

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
      const result = await importActivitiesMarkdownFn({
        data: { markdown: uploadMarkdown },
      });
      if (!result.ok) {
        setUploadError(result.error);
        setUploadIssues(result.issues);
        return;
      }
      setUploadOpen(false);
      setExportFeedback({
        kind: "ok",
        text: `Imported ${result.insertedCount} planned workout${result.insertedCount === 1 ? "" : "s"}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
      await queryClient.invalidateQueries({
        queryKey: activitiesUnresolvedCompletedQueryKey,
      });
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
      queryKey: activitiesUnresolvedCompletedQueryKey,
    });
  }

  async function refreshAfterPlanChange() {
    await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
    await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
    await queryClient.invalidateQueries({
      queryKey: activitiesUnresolvedCompletedQueryKey,
    });
  }

  function patchSearch(patch: Partial<ActivitiesSearch>) {
    const resetsPage =
      "kind" in patch || "status" in patch || "from" in patch || "to" in patch;
    navigate({
      search: (prev) => ({
        ...prev,
        ...patch,
        ...(resetsPage ? { page: 1 } : {}),
      }),
    });
  }

  function goToPage(next: number) {
    navigate({
      search: (prev) => ({ ...prev, page: next }),
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
          {unresolvedQuery.isSuccess && unresolvedCount > 0 ? (
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

      <section
        aria-label="Filter plans"
        className="rounded-lg border border-zinc-800/90 bg-zinc-950 p-3"
      >
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[11px] font-medium text-zinc-500"
              id="activities-filter-kind-label"
            >
              Kind
            </span>
            <FilterSelect
              ariaLabelledBy="activities-filter-kind-label"
              value={search.kind}
              onChange={(v) =>
                patchSearch({ kind: v as ActivitiesSearch["kind"] })
              }
            >
              <option value="all">All kinds</option>
              <option value="lift">Lift</option>
              <option value="run">Run</option>
              <option value="bike">Bike</option>
              <option value="swim">Swim</option>
              <option value="recovery">Recovery</option>
            </FilterSelect>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[11px] font-medium text-zinc-500"
              id="activities-filter-status-label"
            >
              Status
            </span>
            <FilterSelect
              ariaLabelledBy="activities-filter-status-label"
              value={search.status}
              onChange={(v) =>
                patchSearch({ status: v as ActivitiesSearch["status"] })
              }
            >
              <option value="all">All</option>
              <option value="planned">Planned</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
            </FilterSelect>
          </div>
          <div className="flex flex-wrap items-end gap-1.5">
            <label
              className="flex flex-col gap-0.5"
              htmlFor="activities-day-from"
            >
              <span className="text-[11px] font-medium text-zinc-500">
                Day from
              </span>
              <input
                id="activities-day-from"
                type="date"
                value={search.from ?? ""}
                onChange={(e) =>
                  patchSearch({ from: e.target.value || undefined })
                }
                className="h-8 max-w-[11rem] rounded border border-zinc-700/80 bg-zinc-900 px-2 text-xs text-zinc-100 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
              />
            </label>
            <span className="pb-2 text-xs text-zinc-600" aria-hidden>
              –
            </span>
            <label
              className="flex flex-col gap-0.5"
              htmlFor="activities-day-to"
            >
              <span className="text-[11px] font-medium text-zinc-500">
                Day to
              </span>
              <input
                id="activities-day-to"
                type="date"
                value={search.to ?? ""}
                onChange={(e) =>
                  patchSearch({ to: e.target.value || undefined })
                }
                className="h-8 max-w-[11rem] rounded border border-zinc-700/80 bg-zinc-900 px-2 text-xs text-zinc-100 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!hasActiveFilters}
            onClick={() =>
              navigate({
                search: {
                  kind: "all",
                  status: "all",
                  from: undefined,
                  to: undefined,
                  page: 1,
                },
              })
            }
            className="ml-auto h-8 shrink-0 rounded border border-transparent px-2 text-xs text-emerald-500/90 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-emerald-500/90"
          >
            Reset filters
          </button>
        </div>
        <div className="mt-3 flex w-full flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-800/80 pt-3">
          <span id="activities-export-label" className="sr-only">
            Export and import activities as markdown
          </span>
          <button
            type="button"
            aria-labelledby="activities-export-label"
            disabled={!exportDateRangeOk || exportBusy}
            onClick={() => void copyActivitiesMarkdown()}
            className="h-8 rounded border border-zinc-600/70 bg-zinc-900/80 px-3 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportBusy ? "Generating…" : "Copy markdown"}
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="h-8 rounded border border-zinc-600/70 bg-zinc-900/80 px-3 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Upload markdown
          </button>
          {!exportDateRangeOk ? (
            <span className="text-[11px] text-zinc-600">
              Set day from and/or day to (uses kind + status above; ignores
              pagination).
            </span>
          ) : null}
          {exportFeedback ? (
            <span
              className={
                exportFeedback.kind === "ok"
                  ? "text-[11px] text-emerald-500/90"
                  : "text-[11px] text-red-400"
              }
            >
              {exportFeedback.text}
            </span>
          ) : null}
        </div>
      </section>

      {!loading && total > 0 ? (
        <div className="sticky top-0 z-30 mt-1 border-b border-zinc-800/80 bg-zinc-950/95 py-2 backdrop-blur-md">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">
              Showing{" "}
              <span className="tabular-nums text-zinc-400">
                {(page - 1) * PAGE_SIZE + 1}
              </span>
              –
              <span className="tabular-nums text-zinc-400">
                {Math.min(page * PAGE_SIZE, total)}
              </span>{" "}
              of <span className="tabular-nums text-zinc-400">{total}</span>
            </p>
            {pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs tabular-nums text-zinc-500">
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() => goToPage(page + 1)}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="w-full">
          <ActivityListSkeleton />
        </div>
      ) : null}

      {!loading && totalAll === 0 ? (
        <p className="text-sm text-zinc-500">
          No planned workouts yet. Add some on{" "}
          <Link to="/" className="text-emerald-400 hover:underline">
            Home
          </Link>
          .
        </p>
      ) : null}

      {!loading && totalAll > 0 && total === 0 ? (
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
                className="min-h-[12rem] w-full resize-y rounded border border-zinc-700/80 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
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
                {isCardioKind(editingPlan.kind) &&
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
                ) : !isCardioKind(editingPlan.kind) ? (
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
                          {formatCompletedDayInBrowserZone(
                            cw,
                            calendarTimeZone,
                          )}
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
                  disabled={linkAllMutation.isPending || unresolvedCount === 0}
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

      {!loading && rows.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const linked = Boolean(p.completedWorkout);
            const title =
              linked && p.completedWorkout
                ? completedWorkoutTitle(p.completedWorkout)
                : null;
            const brief =
              linked && p.completedWorkout
                ? formatCompletedSessionBrief(p.completedWorkout)
                : null;
            const planTargets = isCardioKind(p.kind)
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
                  ) : isCardioKind(p.kind) ? (
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
}
