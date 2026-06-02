import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import type {
  TypedVendorWorkoutRow,
  VendorActivityRow,
} from "@/lib/db/schema.server";
import { completedWorkoutTitle } from "@/lib/plans/completed-workout-data";
import queryKeys from "@/lib/query-keys";
import { browserTimeZone, toIsoDate } from "@/lib/utils/dates";
import { rawActivityType } from "@/lib/utils/vendors";
import { activityActions } from "@/server-fcts/activities";
import { XIcon } from "../assets";
import { Modal, ModalContent } from ".";

export const LinkModal: React.FC<{
  workouts: VendorActivityRow[];
  onClose: () => void;
}> = ({ workouts, onClose }) => {
  const queryClient = useQueryClient();
  const linkAll = useServerFn(activityActions.linkAll);

  const calendarTimeZone = useMemo(() => browserTimeZone(), []);

  const [linkAllError, setLinkAllError] = useState<string | null>(null);
  const [linkAllInfo, setLinkAllInfo] = useState<string | null>(null);

  const linkAllMutation = useMutation({
    mutationFn: () => linkAll({ data: { timezone: calendarTimeZone } }),
    onMutate: () => {
      setLinkAllError(null);
      setLinkAllInfo(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.unlinkedActivities });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    },
    onError: (e) => {
      setLinkAllError(
        e instanceof Error ? e.message : "Could not link sessions",
      );
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || linkAllMutation.isPending) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkAllMutation.isPending, onClose]);

  return (
    <Modal onClose={onClose}>
      <ModalContent>
        <div className="flex items-start justify-between pb-6">
          <h2
            id="activities-link-all-title"
            className="text-lg font-semibold text-zinc-100"
          >
            Link <span>{workouts.length}</span> sessions
          </h2>
          <button type="button" onClick={onClose}>
            <XIcon className="size-4" />
          </button>
        </div>

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 max-h-78">
          {workouts.map((cw) => {
            const title = completedWorkoutTitle(cw) ?? "Session";
            const kindLabel = rawActivityType(cw as TypedVendorWorkoutRow);
            return (
              <li
                key={cw.id}
                className="rounded border border-zinc-800/90 bg-zinc-900/50 px-3 py-2 h-14"
              >
                <div className="text-sm text-zinc-100">{title}</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {cw.vendor === "hevy" ? "Hevy" : "Strava"} ·{" "}
                  <span className="capitalize">{kindLabel}</span>
                  {" · "}
                  <span className="tabular-nums">
                    {toIsoDate(cw.createdAt, calendarTimeZone)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {linkAllInfo ? (
          <p className="text-sm text-zinc-400">{linkAllInfo}</p>
        ) : null}
        {linkAllError ? (
          <p className="text-sm text-red-400">{linkAllError}</p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800/80 pt-3 mt-3">
          <div>
            {linkAllMutation.isSuccess && (
              <div className="text-zinc-400 text-sm">
                <p>
                  <span>Linked {linkAllMutation.data.nLinked}</span>
                  <span className="mx-1">&middot;</span>
                  <span>Unlinked {linkAllMutation.data.nUnlinked}</span>
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={linkAllMutation.isPending}
              onClick={onClose}
              className="rounded border border-zinc-700 px-3 h-8 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={linkAllMutation.isPending || workouts.length === 0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                linkAllMutation.mutate();
              }}
              className="rounded border border-violet-600/60 bg-violet-950/40 px-3 h-8 text-xs font-medium text-violet-200 hover:bg-violet-950/65 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {linkAllMutation.isPending ? "Linking…" : "Link All"}
            </button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
