import {
  defaultShouldDehydrateQuery,
  dehydrate,
  HydrationBoundary,
  QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo } from "react";
import { PlanCardioTargetsField } from "~/components/PlanCardioTargetsField";
import { PlanNotesField } from "~/components/PlanNotesField";
import { PlanStatusSelect } from "~/components/PlanStatusSelect";
import { ActivityListSkeleton } from "~/components/Skeleton";
import type {
  CompletedWorkoutRow,
  PlannedWorkoutWithCompleted,
} from "~/lib/db/schema";
import {
  hevyWebRootUrl,
  hevyWorkoutWebUrl,
  stravaActivityWebUrl,
} from "~/lib/hevy/links";
import { isCardioKind } from "~/lib/plans/cardio-targets";
import {
  completedWorkoutCalories,
  completedWorkoutDistanceM,
  completedWorkoutMovingSeconds,
} from "~/lib/plans/completed-workout-data";
import { listAllPlannedWorkoutsFn } from "~/lib/plans/list-planned-fns";
import { updatePlanFn } from "~/lib/plans/server-fns";

const STRAVA_ACTIVITIES_HOME = "https://www.strava.com/athlete/training";

const KINDS = ["all", "lift", "run", "bike", "swim"] as const;
const STATUSES = ["all", "planned", "completed", "skipped"] as const;

const PAGE_SIZE = 25;

export type ActivitiesSearch = {
  kind: (typeof KINDS)[number];
  status: (typeof STATUSES)[number];
  from: string | undefined;
  to: string | undefined;
  page: number;
};

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const dist = completedWorkoutDistanceM(c);
  const distLabel =
    dist != null && Number.isFinite(dist)
      ? dist >= 1000
        ? `${(dist / 1000).toFixed(2)} km`
        : `${Math.round(dist)} m`
      : null;
  const dur = formatActualDurationSec(completedWorkoutMovingSeconds(c));
  const kcalRaw = completedWorkoutCalories(c);
  const kcal =
    kcalRaw != null && Number.isFinite(kcalRaw) ? Math.round(kcalRaw) : null;
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

function filterPlans(
  plans: PlannedWorkoutWithCompleted[],
  criteria: Pick<ActivitiesSearch, "kind" | "status" | "from" | "to">,
): PlannedWorkoutWithCompleted[] {
  return plans.filter((p) => {
    if (criteria.kind !== "all" && p.kind !== criteria.kind) {
      return false;
    }
    if (criteria.status !== "all" && p.status !== criteria.status) {
      return false;
    }
    const dk = localDayKey(p.scheduledAt);
    if (criteria.from && dk < criteria.from) {
      return false;
    }
    if (criteria.to && dk > criteria.to) {
      return false;
    }
    return true;
  });
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
  loader: async () => {
    const queryClient = new QueryClient();
    await queryClient.prefetchQuery({
      queryKey: ["plannedWorkouts", "list"],
      queryFn: () => listAllPlannedWorkoutsFn(),
    });
    return {
      dehydratedState: dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.state.status === "pending" ||
          defaultShouldDehydrateQuery(query),
      }),
    };
  },
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const { dehydratedState } = Route.useLoaderData() as {
    dehydratedState: ReturnType<typeof dehydrate>;
  };
  return (
    <HydrationBoundary state={dehydratedState}>
      <ActivitiesContent />
    </HydrationBoundary>
  );
}

function ActivitiesContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate({ from: "/activities" });
  const search = Route.useSearch();

  const plansQuery = useQuery({
    queryKey: ["plannedWorkouts", "list"] as const,
    queryFn: () => listAllPlannedWorkoutsFn(),
  });

  const filtered = useMemo(
    () =>
      filterPlans(plansQuery.data ?? [], {
        kind: search.kind,
        status: search.status,
        from: search.from,
        to: search.to,
      }),
    [plansQuery.data, search.kind, search.status, search.from, search.to],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, search.page), pageCount);

  useEffect(() => {
    if (search.page !== page) {
      navigate({
        search: (prev) => ({ ...prev, page }),
        replace: true,
      });
    }
  }, [navigate, page, search.page]);

  const pageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalCount = plansQuery.data?.length ?? 0;
  const hasActiveFilters =
    search.kind !== "all" ||
    search.status !== "all" ||
    Boolean(search.from) ||
    Boolean(search.to);

  const loading = plansQuery.isPending;

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["plannedWorkouts", "list"],
    });
  }

  async function refreshAfterPlanChange() {
    await queryClient.invalidateQueries({ queryKey: ["planLinkCandidates"] });
    await queryClient.invalidateQueries({
      queryKey: ["plannedWorkouts", "list"],
    });
    await router.invalidate();
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
        <div className="flex flex-col gap-3">
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
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-2.5">
            {!loading && totalCount > 0 ? (
              <p className="text-xs text-zinc-500">
                {hasActiveFilters ? (
                  <>
                    <span className="tabular-nums text-zinc-400">
                      {filtered.length}
                    </span>{" "}
                    match
                    {filtered.length !== totalCount ? (
                      <>
                        {" "}
                        (
                        <span className="tabular-nums text-zinc-500">
                          {totalCount}
                        </span>{" "}
                        total)
                      </>
                    ) : null}
                    {filtered.length > 0 ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="tabular-nums text-zinc-400">
                          {PAGE_SIZE}
                        </span>
                        /page
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="tabular-nums text-zinc-400">
                      {totalCount}
                    </span>{" "}
                    {totalCount === 1 ? "plan" : "plans"}
                    {totalCount > PAGE_SIZE ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="tabular-nums text-zinc-400">
                          {PAGE_SIZE}
                        </span>
                        /page
                      </>
                    ) : null}
                  </>
                )}
              </p>
            ) : (
              <span />
            )}
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
              className="shrink-0 text-xs text-emerald-500/90 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-emerald-500/90"
            >
              Reset filters
            </button>
          </div>
        </div>
      </section>

      {loading ? <ActivityListSkeleton /> : null}

      {!loading && (plansQuery.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-zinc-500">
          No planned workouts yet. Add some on{" "}
          <Link to="/" className="text-emerald-400 hover:underline">
            Home
          </Link>
          .
        </p>
      ) : null}

      {!loading &&
      (plansQuery.data?.length ?? 0) > 0 &&
      filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No planned workouts match these filters.
        </p>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="overflow-hidden rounded border border-zinc-800">
          <ul className="divide-y divide-zinc-800">
            {pageSlice.map((p) => (
              <li key={p.id} className="px-3 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm capitalize text-zinc-200">
                        {p.kind}
                      </span>
                      <PlanStatusSelect
                        planId={p.id}
                        status={p.status}
                        onUpdated={refreshAfterPlanChange}
                      />
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {localDayKey(p.scheduledAt)} ·{" "}
                      {new Date(p.scheduledAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                    {isCardioKind(p.kind) ? (
                      <div className="mt-1.5 max-w-xl space-y-1.5">
                        <PlanCardioTargetsField
                          planId={p.id}
                          kind={p.kind}
                          distance={p.distance}
                          distanceUnits={p.distanceUnits}
                          timeSeconds={p.timeSeconds}
                          onUpdated={refreshAfterPlanChange}
                        />
                        {p.completedWorkout ? (
                          <CardioActualFromCompleted c={p.completedWorkout} />
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-1.5 max-w-xl">
                      <PlanNotesField
                        planId={p.id}
                        notes={p.notes}
                        onUpdated={refreshAfterPlanChange}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-1 text-[11px] sm:items-end">
                    {p.completedWorkout ? (
                      <>
                        {p.completedWorkout.vendor === "strava" ? (
                          <a
                            href={stravaActivityWebUrl(
                              p.completedWorkout.vendorId,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400/90 hover:underline"
                          >
                            Open Strava activity
                          </a>
                        ) : (
                          <a
                            href={hevyWorkoutWebUrl(
                              p.completedWorkout.vendorId,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400/90 hover:underline"
                          >
                            Open Hevy workout
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            await updatePlanFn({
                              data: {
                                id: p.id,
                                stravaActivityId: null,
                                hevyWorkoutId: null,
                              },
                            });
                            await refreshAfterPlanChange();
                          }}
                          className="text-amber-400/90 hover:underline"
                        >
                          Unlink session
                        </button>
                      </>
                    ) : (
                      <span className="text-zinc-600">No session linked</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {pageCount > 1 ? (
            <div className="flex flex-col gap-2 border-t border-zinc-800 bg-zinc-950/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zinc-500">
                Showing{" "}
                <span className="tabular-nums text-zinc-400">
                  {(page - 1) * PAGE_SIZE + 1}
                </span>
                –
                <span className="tabular-nums text-zinc-400">
                  {Math.min(page * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of{" "}
                <span className="tabular-nums text-zinc-400">
                  {filtered.length}
                </span>
              </p>
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
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
