import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  type SQL,
  sql,
} from "drizzle-orm";
import { getDb } from "~/lib/db";
import {
  type CompletedWorkoutRow,
  completedWorkouts,
  type PlanKind,
  type PlannedWorkoutWithCompleted,
  type PlanStatus,
  plannedWorkouts,
} from "~/lib/db/schema";

/** Filters for the activities list — same semantics as the old client-side filter. */
export type PlannedWorkoutsListFilters = {
  kind: string;
  status: string;
  from?: string;
  to?: string;
};

function plannedWorkoutsWhere(
  filters: PlannedWorkoutsListFilters,
): SQL | undefined {
  const parts: SQL[] = [];
  if (filters.kind !== "all") {
    parts.push(eq(plannedWorkouts.kind, filters.kind as PlanKind));
  }
  if (filters.status !== "all") {
    parts.push(eq(plannedWorkouts.status, filters.status as PlanStatus));
  }
  if (filters.from) {
    parts.push(
      sql`date(${plannedWorkouts.scheduledAt}, 'localtime') >= ${filters.from}`,
    );
  }
  if (filters.to) {
    parts.push(
      sql`date(${plannedWorkouts.scheduledAt}, 'localtime') <= ${filters.to}`,
    );
  }
  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return and(...parts);
}

export type PlannedWorkoutsPageResult = {
  rows: PlannedWorkoutWithCompleted[];
  total: number;
  /** Total rows with no filters — only differs from `total` when filters are active. */
  totalAll: number;
};

export async function selectPlannedWorkoutsWithCompletedPage(input: {
  filters: PlannedWorkoutsListFilters;
  page: number;
  pageSize: number;
}): Promise<PlannedWorkoutsPageResult> {
  const { filters, pageSize } = input;
  const page = Math.max(1, Math.floor(input.page));
  const size = Math.min(100, Math.max(1, Math.floor(pageSize)));

  const hasFilters =
    filters.kind !== "all" ||
    filters.status !== "all" ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  const whereFiltered = plannedWorkoutsWhere(filters);

  const db = getDb();

  const countFilteredQ = db.select({ n: count() }).from(plannedWorkouts);
  const [countFilteredRow] = whereFiltered
    ? await countFilteredQ.where(whereFiltered).all()
    : await countFilteredQ.all();

  const total = Number(countFilteredRow?.n ?? 0);

  const totalAll = hasFilters
    ? Number(
        (await db.select({ n: count() }).from(plannedWorkouts).all())[0]?.n ??
          0,
      )
    : total;

  const pageCount = Math.max(1, Math.ceil(total / size));
  const pageSafe = Math.min(page, pageCount);
  const offset = (pageSafe - 1) * size;

  const pageBase = db
    .select({
      ...getTableColumns(plannedWorkouts),
      cw: completedWorkouts,
    })
    .from(plannedWorkouts)
    .leftJoin(
      completedWorkouts,
      eq(plannedWorkouts.completedWorkoutId, completedWorkouts.id),
    );
  const rows = whereFiltered
    ? await pageBase
        .where(whereFiltered)
        .orderBy(desc(plannedWorkouts.scheduledAt))
        .limit(size)
        .offset(offset)
        .all()
    : await pageBase
        .orderBy(desc(plannedWorkouts.scheduledAt))
        .limit(size)
        .offset(offset)
        .all();

  const mapped = rows.map((r) => {
    const { cw, ...plan } = r;
    const completedWorkout: CompletedWorkoutRow | null =
      cw?.id != null ? cw : null;
    return { ...plan, completedWorkout };
  });

  return { rows: mapped, total, totalAll };
}

export async function selectPlannedWorkoutsWithCompleted(): Promise<
  PlannedWorkoutWithCompleted[]
> {
  const db = getDb();
  const rows = await db
    .select({
      ...getTableColumns(plannedWorkouts),
      cw: completedWorkouts,
    })
    .from(plannedWorkouts)
    .leftJoin(
      completedWorkouts,
      eq(plannedWorkouts.completedWorkoutId, completedWorkouts.id),
    )
    .orderBy(desc(plannedWorkouts.scheduledAt))
    .all();

  return rows.map((r) => {
    const { cw, ...plan } = r;
    const completedWorkout: CompletedWorkoutRow | null =
      cw?.id != null ? cw : null;
    return { ...plan, completedWorkout };
  });
}
