import { createServerFn } from "@tanstack/react-start";
import { parseActivitiesMarkdownForBulkImport } from "~/lib/api/activities-markdown-import";
import { bulkInsertPlannedWorkoutsFromItems } from "~/lib/api/bulk-planned-workouts";
import { getSessionOk } from "~/lib/auth/session-server";
import type { PlannedWorkoutWithCompleted } from "~/lib/db/schema";
import { buildActivitiesMarkdownExport } from "~/lib/plans/activities-markdown-export";
import {
  type PlannedWorkoutsPageResult,
  selectPlannedWorkoutsWithCompleted,
  selectPlannedWorkoutsWithCompletedFiltered,
  selectPlannedWorkoutsWithCompletedPage,
} from "~/lib/plans/select-with-completed";

const KINDS = new Set(["all", "lift", "run", "bike", "swim", "recovery"]);
const STATUSES = new Set(["all", "planned", "completed", "skipped"]);
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** All planned workouts, newest `day_key` first — home calendar and other full-list callers. */
export const listAllPlannedWorkoutsFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<PlannedWorkoutWithCompleted[]> => {
  return await selectPlannedWorkoutsWithCompleted();
});

/** Activities list: filtered + counted + paginated in the database. */
export const listPlannedWorkoutsPageFn = createServerFn({
  method: "GET",
})
  .inputValidator(
    (d: {
      kind: string;
      status: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    }) => d,
  )
  .handler(async ({ data }): Promise<PlannedWorkoutsPageResult> => {
    if (!KINDS.has(data.kind)) {
      throw new Error("Invalid kind filter");
    }
    if (!STATUSES.has(data.status)) {
      throw new Error("Invalid status filter");
    }
    if (data.from !== undefined && !DAY_KEY.test(data.from)) {
      throw new Error("Invalid from date");
    }
    if (data.to !== undefined && !DAY_KEY.test(data.to)) {
      throw new Error("Invalid to date");
    }
    const page =
      typeof data.page === "number" && Number.isFinite(data.page)
        ? Math.max(1, Math.floor(data.page))
        : 1;
    const pageSize =
      typeof data.pageSize === "number" && Number.isFinite(data.pageSize)
        ? Math.min(100, Math.max(1, Math.floor(data.pageSize)))
        : 20;
    return await selectPlannedWorkoutsWithCompletedPage({
      filters: {
        kind: data.kind,
        status: data.status,
        from: data.from,
        to: data.to,
      },
      page,
      pageSize,
    });
  });

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Full filtered list as markdown for LLM / archival (requires at least one of `from` / `to`). */
export const exportActivitiesMarkdownFn = createServerFn({
  method: "POST",
})
  .inputValidator(
    (d: {
      kind: string;
      status: string;
      from?: string;
      to?: string;
      timeZone: string;
    }) => d,
  )
  .handler(
    async ({
      data,
    }): Promise<{ markdown: string; rowCount: number }> => {
      if (!KINDS.has(data.kind)) {
        throw new Error("Invalid kind filter");
      }
      if (!STATUSES.has(data.status)) {
        throw new Error("Invalid status filter");
      }
      const fromRaw = String(data.from ?? "").trim();
      const toRaw = String(data.to ?? "").trim();
      const hasFrom = fromRaw !== "";
      const hasTo = toRaw !== "";
      if (!hasFrom && !hasTo) {
        throw new Error(
          "Set at least a from date, a to date, or both (YYYY-MM-DD)",
        );
      }
      if (hasFrom && !DAY_KEY.test(fromRaw)) {
        throw new Error("Invalid from date");
      }
      if (hasTo && !DAY_KEY.test(toRaw)) {
        throw new Error("Invalid to date");
      }
      if (hasFrom && hasTo && fromRaw > toRaw) {
        throw new Error("from date must be on or before to date");
      }
      const tz = String(data.timeZone ?? "").trim();
      if (!tz || !isValidIanaTimeZone(tz)) {
        throw new Error("Invalid or missing time zone");
      }
      const rows: PlannedWorkoutWithCompleted[] =
        await selectPlannedWorkoutsWithCompletedFiltered({
          kind: data.kind,
          status: data.status,
          from: hasFrom ? fromRaw : undefined,
          to: hasTo ? toRaw : undefined,
        });
      const markdown = buildActivitiesMarkdownExport(rows, tz);
      return { markdown, rowCount: rows.length };
    },
  );

export type ImportActivitiesMarkdownIssue = {
  line?: number;
  message: string;
};

export type ImportActivitiesMarkdownResult =
  | { ok: true; insertedCount: number }
  | {
      ok: false;
      error: string;
      issues: ImportActivitiesMarkdownIssue[];
    };

/** Parse markdown from the Activities “upload” flow; validates all rows before any insert. */
export const importActivitiesMarkdownFn = createServerFn({
  method: "POST",
})
  .inputValidator((d: { markdown: string }) => d)
  .handler(async ({ data }): Promise<ImportActivitiesMarkdownResult> => {
    if (!(await getSessionOk())) {
      throw new Error("Unauthorized");
    }
    const md = String(data.markdown ?? "");
    const parsed = parseActivitiesMarkdownForBulkImport(md);
    if (!parsed.ok) {
      return {
        ok: false,
        error: "Invalid markdown",
        issues: parsed.issues.map((i) => ({
          line: i.line,
          message: i.message,
        })),
      };
    }
    const inserted = await bulkInsertPlannedWorkoutsFromItems(parsed.items);
    if (!inserted.ok) {
      return {
        ok: false,
        error: inserted.error,
        issues: inserted.issues.map((i) => ({
          message: `Row ${i.index + 1}: ${i.message}`,
        })),
      };
    }
    return { ok: true, insertedCount: inserted.insertedIds.length };
  });
