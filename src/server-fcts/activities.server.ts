import { and, count, desc, eq, getTableColumns, gte, lte } from "drizzle-orm";
import type { PlanKind, PlanStatus } from "@/lib/constants/activities";
import { getDb } from "@/lib/db/index.server";
import {
  type VendorActivityRow,
  vendorActivities,
  workoutEntries,
} from "@/lib/db/schema.server";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import type { IdSchemaValues } from "@/types/requests/shared";

const get = async ({ id }: IdSchemaValues) => {
  const db = await getDb();
  const row = await db
    .select({
      ...getTableColumns(workoutEntries),
      vendorActivity: vendorActivities,
    })
    .from(workoutEntries)
    .leftJoin(
      vendorActivities,
      eq(workoutEntries.vendorActivityId, vendorActivities.id),
    )
    .where(eq(workoutEntries.id, id))
    .get();
  if (!row) {
    throw new Error("not found");
  }
  return row;
};

const exists = async ({ id }: IdSchemaValues) => {
  const db = await getDb();
  const row = await db
    .select({ id: workoutEntries.id })
    .from(workoutEntries)
    .where(eq(workoutEntries.id, id));
  return !!row;
};

const list = async (data: ActivityListSchemaValues) => {
  const wheres = [];
  if (data.kind) {
    wheres.push(eq(workoutEntries.kind, data.kind as PlanKind));
  }
  if (data.status) {
    wheres.push(eq(workoutEntries.status, data.status as PlanStatus));
  }
  if (data.dateFrom) {
    wheres.push(gte(workoutEntries.dayKey, data.dateFrom));
  }
  if (data.dateTo) {
    wheres.push(lte(workoutEntries.dayKey, data.dateTo));
  }

  const whereClause = and(...wheres);

  const db = await getDb();

  const offset = data.page * data.pageSize;

  const [countFilteredRow] = await db
    .select({ n: count() })
    .from(workoutEntries)
    .where(whereClause)
    .all();
  const totalPages = Math.ceil(
    Number(countFilteredRow?.n ?? 0) / data.pageSize,
  );

  const rows = await db
    .select({
      ...getTableColumns(workoutEntries),
      va: vendorActivities,
    })
    .from(workoutEntries)
    .leftJoin(
      vendorActivities,
      eq(workoutEntries.vendorActivityId, vendorActivities.id),
    )
    .where(whereClause)
    .orderBy(desc(workoutEntries.dayKey))
    .limit(data.pageSize)
    .offset(offset)
    .all();

  const mapped = rows.map((r) => {
    const { va, ...plan } = r;
    const vendorActivity: VendorActivityRow | null = va?.id != null ? va : null;
    return { ...plan, vendorActivity };
  });

  return { rows: mapped, totalPages };
};

export const activityServerFns = {
  get,
  exists,
  list,
};
