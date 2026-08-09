import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type React from "react";
import { Suspense, useDeferredValue, useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import { WorkoutEntryWithCompleted } from "@/lib/db/schema.server";
import { hevyWebRootUrl } from "@/lib/hevy/links";
import { getters, invalidators } from "@/lib/query-keys";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import { Modal, ModalContent } from "../Modals";
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
  const { data } = useSuspenseQuery(getters.activities.unlinked());

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
  handleSelect: (plan: WorkoutEntryWithCompleted) => void;
}> = ({ filter, handleSelect }) => {
  const { data } = useSuspenseQuery(getters.activities.list(filter));

  if (data.rows.length === 0) {
    return <p className="text-sm text-zinc-500">No planned workouts match these filters.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {data.rows.map((p) => (
        <ActivityElement key={p.id} workout={p} onEdit={(_id: string) => handleSelect(p)} isCard />
      ))}
    </div>
  );
};

const ActivityToggle: React.FC<{
  filter: ActivityListSchemaValues;
  incPage: () => void;
  decPage: () => void;
}> = ({ filter, incPage, decPage }) => {
  const { data } = useSuspenseQuery(getters.activities.list(filter));

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

  const [modalOpen, setModalOpen] = useState<"link" | "upload" | "edit" | undefined>(undefined);
  const [selectedPlan, setSelectedPlan] = useState<WorkoutEntryWithCompleted | undefined>(
    undefined,
  );

  const handleSelect = (plan: WorkoutEntryWithCompleted) => {
    setSelectedPlan(plan);
    setModalOpen("edit");
  };

  const closeModal = () => {
    setModalOpen(undefined);
    setSelectedPlan(undefined);
  };

  const refresh = () => invalidators.activities.refresh(queryClient);

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
            <LinkAllButton setOpen={() => setModalOpen("link")} />
          </Suspense>
        </div>
      </div>

      <ActivityFilters formReducer={formReducer} openUpload={() => setModalOpen("upload")} />

      <div className="sticky top-0 z-30 mt-1 border-b border-zinc-800/80 bg-zinc-950/95 py-2 backdrop-blur-md">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Suspense fallback={null}>
            <ActivityToggle
              filter={defferredFilter}
              decPage={() => formReducer.setField("page", formReducer.formState.values.page - 1)}
              incPage={() => formReducer.setField("page", formReducer.formState.values.page + 1)}
            />
          </Suspense>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-30" />
            ))}
          </div>
        }
      >
        <ActivityList filter={defferredFilter} handleSelect={handleSelect} />
      </Suspense>

      {modalOpen === "upload" && <MarkdownModal onClose={closeModal} />}
      {modalOpen === "link" && <LinkModal onClose={closeModal} />}
      {modalOpen === "edit" && selectedPlan && (
        <Modal onClose={closeModal}>
          <ModalContent>
            <EditModal plan={selectedPlan} onClose={closeModal} />
          </ModalContent>
        </Modal>
      )}
    </div>
  );
};
