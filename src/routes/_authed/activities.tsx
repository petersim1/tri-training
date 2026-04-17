import {
  type DehydratedState,
  dehydrate,
  HydrationBoundary,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { LinkedSessionPanel } from "~/components/LinkedSessionPanel";
import { PlanCardioTargetsField } from "~/components/PlanCardioTargetsField";
import { PlanNotesField } from "~/components/PlanNotesField";
import { PlanStatusSelect } from "~/components/PlanStatusSelect";
import { ActivityListSkeleton } from "~/components/Skeleton";
import { hevyWebRootUrl } from "~/lib/hevy/links";
import { isCardioKind } from "~/lib/plans/cardio-targets";
import { listPlannedWorkoutsPageFn } from "~/lib/server-fns/planned-workouts-list";

const STRAVA_ACTIVITIES_HOME = "https://www.strava.com/athlete/training";

const KINDS = ["all", "lift", "run", "bike", "swim"] as const;
const STATUSES = ["all", "planned", "completed", "skipped"] as const;

const PAGE_SIZE = 20;

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

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
  }

  async function refreshAfterPlanChange() {
    await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
    await queryClient.invalidateQueries({ queryKey: ["plannedWorkouts"] });
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
    <div className="space-y-8">
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
      </section>

      {!loading && total > 0 ? (
        <div className="sticky top-0 z-30 -mx-4 mt-4 border-b border-zinc-800/80 bg-zinc-950/95 px-4 py-2 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="mx-auto w-full max-w-4xl">
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

      {!loading && rows.length > 0 ? (
        <div className="mx-auto w-full max-w-4xl">
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-5 md:gap-y-5">
            {rows.map((p) => {
              const linked = Boolean(p.completedWorkout);
              return (
                <li
                  key={p.id}
                  className="min-w-0 rounded-lg border border-zinc-800/90 bg-zinc-950/50 px-3 py-3 shadow-sm shadow-black/30"
                >
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-zinc-800/80 pb-2.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[11px] font-medium capitalize text-zinc-200">
                          {p.kind}
                        </span>
                        <PlanStatusSelect
                          planId={p.id}
                          status={p.status}
                          disabled={linked}
                          onUpdated={refreshAfterPlanChange}
                          className="inline-flex items-center"
                        />
                      </div>
                      <span
                        className="shrink-0 text-[10px] tabular-nums text-zinc-500"
                        title={p.dayKey}
                      >
                        {formatPlanDayKey(p.dayKey)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-3">
                      {isCardioKind(p.kind) && !linked ? (
                        <PlanCardioTargetsField
                          planId={p.id}
                          kind={p.kind}
                          distance={p.distance}
                          distanceUnits={p.distanceUnits}
                          timeSeconds={p.timeSeconds}
                          compact
                          onUpdated={refreshAfterPlanChange}
                        />
                      ) : null}

                      {linked && p.completedWorkout ? (
                        <LinkedSessionPanel
                          planId={p.id}
                          completed={p.completedWorkout}
                          onUnlinked={refreshAfterPlanChange}
                        />
                      ) : !isCardioKind(p.kind) ? (
                        <p className="rounded border border-dashed border-zinc-800/90 bg-zinc-950/40 px-2 py-1.5 text-[10px] text-zinc-500">
                          No session linked
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-3 border-t border-zinc-800/80 pt-3">
                      <PlanNotesField
                        planId={p.id}
                        notes={p.notes}
                        compact
                        onUpdated={refreshAfterPlanChange}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
