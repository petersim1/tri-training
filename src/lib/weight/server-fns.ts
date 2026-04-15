import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getSessionOk } from "~/lib/auth/session-server";
import { getDb } from "~/lib/db";
import { weightEntries } from "~/lib/db/schema";

async function requireAuth() {
  if (!(await getSessionOk())) {
    throw new Error("Unauthorized");
  }
}

function parseDayKey(
  dayKey: string,
): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) {
    return null;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return { y, m: mo - 1, d };
}

/** Set or replace the single weight for a calendar day (`YYYY-MM-DD`). */
export const setWeightForDayFn = createServerFn({ method: "POST" })
  .inputValidator((d: { dayKey: string; weightLb: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const parsed = parseDayKey(data.dayKey);
    if (!parsed) {
      throw new Error("Invalid day");
    }
    const w = data.weightLb;
    if (!Number.isFinite(w) || w <= 0) {
      throw new Error("Enter a positive weight in pounds");
    }
    const { y, m, d } = parsed;
    const measuredAt = new Date(y, m, d, 12, 0, 0, 0).toISOString();
    const now = new Date();
    const id = crypto.randomUUID();
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .delete(weightEntries)
        .where(eq(weightEntries.dayKey, data.dayKey))
        .run();
      await tx
        .insert(weightEntries)
        .values({
          id,
          dayKey: data.dayKey,
          measuredAt,
          weightLb: w,
          notes: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
    return { id };
  });

export const clearWeightForDayFn = createServerFn({ method: "POST" })
  .inputValidator((d: { dayKey: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    if (!parseDayKey(data.dayKey)) {
      throw new Error("Invalid day");
    }
    const db = getDb();
    await db
      .delete(weightEntries)
      .where(eq(weightEntries.dayKey, data.dayKey))
      .run();
    return { ok: true };
  });
