import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type React from "react";
import { Suspense, useDeferredValue, useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import type { WorkoutEntryWithCompleted } from "@/lib/db/schema.server";
import { hevyWebRootUrl } from "@/lib/hevy/links";
import queryKeys from "@/lib/query-keys";
import { activityActions } from "@/server-fcts/activities";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import { EditModal } from "../Modals/edit";
import { LinkModal } from "../Modals/link";
import { MarkdownModal } from "../Modals/markdown";
import { Skeleton } from "../Skeleton";
import { ActivityElement } from "../views/activities/element";
import { ActivityFilters } from "../views/activities/filters";

const STRAVA_ACTIVITIES_HOME = "https://www.strava.com/athlete/training";
const MAIN_COLUMN = "mx-auto w-full max-w-6xl";

const LinkAllButton: React.FC<{
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ setOpen }) => {
  const { data } = useSuspenseQuery({
    queryKey: queryKeys.unlinkedActivities,
    queryFn: () => activityActions.unlinked(),
  });

  if (data.length === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="rounded border border-violet-600/50 bg-violet-950/35 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-950/55"
    >
      Link all unlinked
    </button>
  );
};

const ActivityList: React.FC<{
  filter: ActivityListSchemaValues;
  setEditPlan: React.Dispatch<
    React.SetStateAction<WorkoutEntryWithCompleted | undefined>
  >;
}> = ({ filter, setEditPlan }) => {
  const { data } = useSuspenseQuery({
    queryKey: queryKeys.activitiesList(filter),
    queryFn: () =>
      activityActions.list({
        data: filter,
      }),
  });

  if (data.rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No planned workouts match these filters.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {data.rows.map((p) => (
        <ActivityElement
          key={p.id}
          workout={p}
          onEdit={() => setEditPlan(p)}
          isCard
        />
      ))}
    </div>
  );
};

const ActivityToggle: React.FC<{
  filter: ActivityListSchemaValues;
  incPage: () => void;
  decPage: () => void;
}> = ({ filter, incPage, decPage }) => {
  const { data } = useSuspenseQuery({
    queryKey: queryKeys.activitiesList(filter),
    queryFn: () =>
      activityActions.list({
        data: filter,
      }),
  });

  if (data.totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={filter.page === 0}
        onClick={() => decPage()}
        className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-xs tabular-nums text-zinc-500">
        {filter.page + 1} / {data.totalPages}
      </span>
      <button
        type="button"
        disabled={filter.page === data.totalPages - 1}
        onClick={() => incPage()}
        className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
};

export const ActivitiesContent: React.FC<{
  initialQuery: ActivityListSchemaValues;
}> = ({ initialQuery }) => {
  const queryClient = useQueryClient();

  const formReducer = useFormReducer(initialQuery);

  const defferredFilter = useDeferredValue(formReducer.formState.values);

  const [linkAllOpen, setLinkAllOpen] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<
    WorkoutEntryWithCompleted | undefined
  >(undefined);

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
          <Suspense fallback={null}>
            <LinkAllButton setOpen={setLinkAllOpen} />
          </Suspense>
        </div>
      </div>

      <ActivityFilters
        formReducer={formReducer}
        openUpload={() => setUploadOpen(true)}
      />

      <div className="sticky top-0 z-30 mt-1 border-b border-zinc-800/80 bg-zinc-950/95 py-2 backdrop-blur-md">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Suspense fallback={null}>
            <ActivityToggle
              filter={defferredFilter}
              decPage={() =>
                formReducer.setField(
                  "page",
                  formReducer.formState.values.page - 1,
                )
              }
              incPage={() =>
                formReducer.setField(
                  "page",
                  formReducer.formState.values.page + 1,
                )
              }
            />
          </Suspense>
        </div>
      </div>

      <Suspense
        fallback={Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-50" />
        ))}
      >
        <ActivityList filter={defferredFilter} setEditPlan={setEditPlan} />
      </Suspense>

      {uploadOpen && <MarkdownModal onClose={() => setUploadOpen(false)} />}

      {editPlan && (
        <EditModal plan={editPlan} onClose={() => setEditPlan(undefined)} />
      )}

      {linkAllOpen && <LinkModal onClose={() => setLinkAllOpen(false)} />}
    </div>
  );
};
