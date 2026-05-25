import { createServerFn } from "@tanstack/react-start";
import { parseActivitiesMarkdownForBulkImport } from "@/lib/api/activities-markdown-import";
import {
  type BulkValidationIssue,
  validateAndBuildRow,
} from "@/lib/api/bulk-planned-workouts";
import {
  PLAN_KIND_VALUES,
  PLAN_STATUS_VALUES,
} from "@/lib/constants/activities";
import { getDb } from "@/lib/db/index.server";
import {
  type NewPlannedWorkout,
  plannedWorkouts,
} from "@/lib/db/schema.server";
import { buildActivitiesMarkdownExport } from "@/lib/plans/activities-markdown-export";
import { activityActions } from "@/server-fcts";
import { activityListSchema } from "@/types/requests/activities";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const MAX_BATCH = 1000;

/** Full filtered list as markdown for LLM / archival (requires at least one of `from` / `to`). */
export const exportActivitiesMarkdownFn = createServerFn({
  method: "POST",
})
  .inputValidator(activityListSchema)
  .handler(
    async ({ data }): Promise<{ markdown: string; rowCount: number }> => {
      if (!!data.kind && !PLAN_KIND_VALUES.includes(data.kind)) {
        throw new Error("Invalid kind filter");
      }
      if (!!data.status && !PLAN_STATUS_VALUES.includes(data.status)) {
        throw new Error("Invalid status filter");
      }
      const fromRaw = String(data.dateFrom ?? "").trim();
      const toRaw = String(data.dateTo ?? "").trim();
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
      const rows = await activityActions.list({ data });
      const markdown = buildActivitiesMarkdownExport(rows.rows);
      return { markdown, rowCount: rows.total };
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

    if (parsed.items.length === 0) {
      return {
        ok: false,
        error: "No workouts to insert",
        issues: [],
      };
    }
    if (parsed.items.length > MAX_BATCH) {
      return {
        ok: false,
        error: `At most ${MAX_BATCH} rows per request`,
        issues: [],
      };
    }

    const now = new Date();
    const issues: BulkValidationIssue[] = [];
    const rows: NewPlannedWorkout[] = [];

    for (let i = 0; i < parsed.items.length; i++) {
      const item = parsed.items[i];
      if (item === undefined) {
        continue;
      }
      const built = validateAndBuildRow(item, i, now);
      if ("message" in built) {
        issues.push(built);
        continue;
      }
      rows.push(built);
    }

    if (issues.length > 0) {
      return {
        ok: false,
        error: "Validation failed",
        issues,
      };
    }

    const db = await getDb();

    try {
      await db.transaction(async (tx) => {
        for (const row of rows) {
          await tx.insert(plannedWorkouts).values(row).run();
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Insert failed";
      return {
        ok: false,
        error: msg,
        issues: [],
      };
    }

    return { ok: true, insertedCount: rows.length };
  });
