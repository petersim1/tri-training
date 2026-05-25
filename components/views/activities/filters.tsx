import { useState } from "react";
import type { PlanStatus } from "@/components/PlanStatusSelect";
import type { FormReducerT } from "@/hooks/useFormReducer";
import type { PlanKind } from "@/lib/constants/activities";
import { markdownActions } from "@/server-fcts";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import { FilterSelect } from "./filter";

export const ActivityFilters: React.FC<{
  formReducer: FormReducerT<ActivityListSchemaValues>;
  openUpload: () => void;
}> = ({ formReducer, openUpload }) => {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const hasActiveFilters =
    !!formReducer.formState.values.kind ||
    !!formReducer.formState.values.status ||
    !!formReducer.formState.values.dateFrom ||
    !!formReducer.formState.values.dateTo;

  const exportDateRangeOk = Boolean(
    !!formReducer.formState.values.dateFrom ||
      !!formReducer.formState.values.dateTo,
  );

  async function copyActivitiesMarkdown() {
    if (
      !(
        !!formReducer.formState.values.dateFrom ||
        !!formReducer.formState.values.dateTo
      )
    ) {
      return;
    }
    setExportFeedback(null);
    setExportBusy(true);
    try {
      const { markdown, rowCount } =
        await markdownActions.exportActivitiesMarkdownFn({
          data: formReducer.formState.values,
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

  return (
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
            value={formReducer.formState.values.kind ?? ""}
            onChange={(v) => formReducer.setField("kind", v as PlanKind)}
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
            value={formReducer.formState.values.status ?? ""}
            onChange={(v) => formReducer.setField("status", v as PlanStatus)}
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
              value={formReducer.formState.values.dateFrom ?? ""}
              onChange={(e) => formReducer.setField("dateFrom", e.target.value)}
              className="h-8 max-w-44 rounded border border-zinc-700/80 bg-zinc-900 px-2 text-xs text-zinc-100 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            />
          </label>
          <span className="pb-2 text-xs text-zinc-600" aria-hidden>
            –
          </span>
          <label className="flex flex-col gap-0.5" htmlFor="activities-day-to">
            <span className="text-[11px] font-medium text-zinc-500">
              Day to
            </span>
            <input
              id="activities-day-to"
              type="date"
              value={formReducer.formState.values.dateTo ?? ""}
              onChange={(e) => formReducer.setField("dateTo", e.target.value)}
              className="h-8 max-w-44 rounded border border-zinc-700/80 bg-zinc-900 px-2 text-xs text-zinc-100 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!hasActiveFilters}
          onClick={() => formReducer.reset()}
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
          onClick={openUpload}
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
  );
};
