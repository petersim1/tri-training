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
import { useMemo } from "react";
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
import { listAllPlannedWorkoutsFn } from "~/lib/plans/list-planned-fns";
import { updatePlanFn } from "~/lib/plans/server-fns";

const STRAVA_ACTIVITIES_HOME = "https://www.strava.com/activities";

const KINDS = ["all", "lift", "run", "bike", "swim"] as const;
const STATUSES = ["all", "planned", "completed", "skipped"] as const;

export type ActivitiesSearch = {
  kind: (typeof KINDS)[number];
  status: (typeof STATUSES)[number];
  from: string | undefined;
  to: string | undefined;
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

function filterPlans(
  plans: PlannedWorkoutWithCompleted[],
  search: ActivitiesSearch,
): PlannedWorkoutWithCompleted[] {
  return plans.filter((p) => {
    if (search.kind !== "all" && p.kind !== search.kind) {
      return false;
    }
    if (search.status !== "all" && p.status !== search.status) {
      return false;
    }
    const dk = localDayKey(p.scheduledAt);
    if (search.from && dk < search.from) {
      return false;
    }
    if (search.to && dk > search.to) {
      return false;
    }
    return true;
  });
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
    return { kind, status, from, to };
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
    () => filterPlans(plansQuery.data ?? [], search),
    [plansQuery.data, search],
  );

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

  function setSearch(patch: Partial<ActivitiesSearch>) {
    navigate({
      search: (prev) => ({ ...prev, ...patch }),
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activities</h1>
          <p className="text-sm text-zinc-400">
            Filtered list of planned workouts. Session trends (all time, by
            type) live on{" "}
            <Link to="/" className="text-emerald-400 hover:underline">
              Home
            </Link>
            ; use Home to add or link sessions too.
          </p>
        </div>
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
        className="rounded-xl border border-zinc-800/90 bg-zinc-950 p-5 shadow-sm"
      >
        <div className="mb-4 flex flex-col gap-3 border-b border-zinc-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">Filters</h2>
            {!loading && totalCount > 0 ? (
              <p className="mt-0.5 text-xs text-zinc-500">
                {hasActiveFilters ? (
                  <>
                    Showing{" "}
                    <span className="tabular-nums text-zinc-300">
                      {filtered.length}
                    </span>{" "}
                    of{" "}
                    <span className="tabular-nums text-zinc-300">
                      {totalCount}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="tabular-nums text-zinc-300">
                      {totalCount}
                    </span>{" "}
                    {totalCount === 1 ? "plan" : "plans"}
                  </>
                )}
              </p>
            ) : null}
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
                },
              })
            }
            className="self-start text-sm text-emerald-500/90 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-emerald-500/90 sm:self-auto"
          >
            Reset filters
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-12 lg:gap-x-6 lg:gap-y-0">
          <label className="sm:col-span-1 lg:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-zinc-500">
              Kind
            </span>
            <select
              value={search.kind}
              onChange={(e) =>
                setSearch({ kind: e.target.value as ActivitiesSearch["kind"] })
              }
              className="h-10 w-full min-w-0 rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 text-sm text-zinc-100 shadow-inner focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            >
              <option value="all">All kinds</option>
              <option value="lift">Lift</option>
              <option value="run">Run</option>
              <option value="bike">Bike</option>
              <option value="swim">Swim</option>
            </select>
          </label>
          <label className="sm:col-span-1 lg:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-zinc-500">
              Status
            </span>
            <select
              value={search.status}
              onChange={(e) =>
                setSearch({
                  status: e.target.value as ActivitiesSearch["status"],
                })
              }
              className="h-10 w-full min-w-0 rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 text-sm text-zinc-100 shadow-inner focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            >
              <option value="all">All statuses</option>
              <option value="planned">Planned</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
            </select>
          </label>
          <div className="sm:col-span-2 lg:col-span-8">
            <p className="mb-1.5 text-xs font-medium text-zinc-500">
              Scheduled day (local)
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="min-w-0 flex-1">
                <span className="sr-only">From date</span>
                <input
                  type="date"
                  value={search.from ?? ""}
                  onChange={(e) =>
                    setSearch({ from: e.target.value || undefined })
                  }
                  className="h-10 w-full rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 text-sm text-zinc-100 shadow-inner focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
              </label>
              <span
                className="hidden shrink-0 text-center text-sm text-zinc-600 sm:block sm:pt-0.5"
                aria-hidden
              >
                →
              </span>
              <label className="min-w-0 flex-1">
                <span className="sr-only">To date</span>
                <input
                  type="date"
                  value={search.to ?? ""}
                  onChange={(e) =>
                    setSearch({ to: e.target.value || undefined })
                  }
                  className="h-10 w-full rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 text-sm text-zinc-100 shadow-inner focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
              Filters by the calendar day of each plan’s scheduled time (your
              local timezone).
            </p>
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
        <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
          {filtered.map((p) => (
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
                            p.completedWorkout.externalId,
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
                            p.completedWorkout.externalId,
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
      ) : null}
    </div>
  );
}
