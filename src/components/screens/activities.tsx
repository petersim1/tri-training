import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import { hevyWebRootUrl } from "@/lib/hevy/links";
import queryKeys from "@/lib/query-keys";
import { activityActions } from "@/server-fcts/activities";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import { EditModal } from "../Modals/edit";
import { LinkModal } from "../Modals/link";
import { MarkdownModal } from "../Modals/markdown";
import { ActivityElement } from "../views/activities/element";
import { ActivityFilters } from "../views/activities/filters";

const STRAVA_ACTIVITIES_HOME = "https://www.strava.com/athlete/training";
const MAIN_COLUMN = "mx-auto w-full max-w-6xl";

export const ActivitiesContent: React.FC<{
  initialQuery: ActivityListSchemaValues;
}> = ({ initialQuery }) => {
  const queryClient = useQueryClient();

  const formReducer = useFormReducer(initialQuery);

  const [linkAllOpen, setLinkAllOpen] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);

  const unresolvedQuery = useSuspenseQuery({
    queryKey: queryKeys.unlinkedActivities,
    queryFn: () => activityActions.unlinked(),
  });

  const {
    data: activityList = {
      totalPages: 0,
      rows: [],
    },
  } = useQuery({
    queryKey: queryKeys.activitiesList(formReducer.formState.values),
    queryFn: () =>
      activityActions.list({
        data: formReducer.formState.values,
      }),
    placeholderData: keepPreviousData,
  });

  const editingPlan =
    editPlanId === null
      ? null
      : activityList.rows.find((r) => r.id === editPlanId);

  useEffect(() => {
    if (editPlanId === null) {
      return;
    }
    if (!activityList.rows.some((r) => r.id === editPlanId)) {
      setEditPlanId(null);
    }
  }, [editPlanId, activityList]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
    queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    queryClient.invalidateQueries({
      queryKey: queryKeys.unlinkedActivities,
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
          {unresolvedQuery.data.length > 0 ? (
            <button
              type="button"
              onClick={() => setLinkAllOpen(true)}
              className="rounded border border-violet-600/50 bg-violet-950/35 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-950/55"
            >
              Link all unlinked
            </button>
          ) : null}
        </div>
      </div>

      <ActivityFilters
        formReducer={formReducer}
        openUpload={() => setUploadOpen(true)}
      />

      <div className="sticky top-0 z-30 mt-1 border-b border-zinc-800/80 bg-zinc-950/95 py-2 backdrop-blur-md">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {activityList.totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={formReducer.formState.values.page === 0}
                onClick={() =>
                  formReducer.setField(
                    "page",
                    formReducer.formState.values.page - 1,
                  )
                }
                className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs tabular-nums text-zinc-500">
                {formReducer.formState.values.page + 1} /{" "}
                {activityList.totalPages}
              </span>
              <button
                type="button"
                disabled={
                  formReducer.formState.values.page ===
                  activityList.totalPages - 1
                }
                onClick={() =>
                  formReducer.setField(
                    "page",
                    formReducer.formState.values.page + 1,
                  )
                }
                className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {activityList.rows.length === 0 && (
        <p className="text-sm text-zinc-500">
          No planned workouts match these filters.
        </p>
      )}

      {activityList.rows.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {activityList.rows.map((p) => (
            <ActivityElement
              key={p.id}
              workout={p}
              onEdit={() => setEditPlanId(p.id)}
              isCard
            />
          ))}
        </div>
      )}

      {uploadOpen && <MarkdownModal onClose={() => setUploadOpen(false)} />}

      {editingPlan && (
        <EditModal workout={editingPlan} onClose={() => setEditPlanId(null)} />
      )}

      {linkAllOpen && (
        <LinkModal
          workouts={unresolvedQuery.data ?? []}
          onClose={() => setLinkAllOpen(false)}
        />
      )}
    </div>
  );
};
