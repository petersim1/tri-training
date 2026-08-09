import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { EditEventModal } from "@/components/Modals/event-edit";
import type { SportEventTargetSegment } from "@/lib/constants/events";
import type { SportEventRow } from "@/lib/db/schema.server";
import { formatTargetDurationSec } from "@/lib/plans/cardio-targets";
import { invalidators } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { eventActions } from "@/server-fcts/events";

function targetSummary(target: SportEventTargetSegment): string {
  const summary: string[] = [target.activity];
  if (target.label?.trim()) summary.push(`(${target.label.trim()})`);
  if (target.distance != null && target.distance_units) {
    summary.push(`${target.distance}${target.distance_units}`);
  }
  if (target.time_seconds != null && target.time_seconds > 0) {
    summary.push(formatTargetDurationSec(target.time_seconds));
  }
  return summary.join(" ");
}

export const EventElement: React.FC<{
  event: SportEventRow;
}> = ({ event }) => {
  const queryClient = useQueryClient();
  const deleteEvent = useServerFn(eventActions.remove);
  const [editing, setEditing] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent({ data: { id: event.id } }),
    onSuccess: () => {
      invalidators.events.delete(queryClient, { id: event.id });
    },
  });

  return (
    <>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="shrink-0 text-center">
              <div className="text-lg font-semibold tabular-nums text-zinc-100">
                {event.eventDayKey.slice(8)}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                {new Date(`${event.eventDayKey}T12:00:00Z`).toLocaleDateString("en-US", {
                  month: "short",
                })}
              </div>
            </div>
            <div className="w-px self-stretch bg-zinc-800" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-100">{event.name}</span>
                {event.discipline && (
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] capitalize text-zinc-400">
                    {event.discipline}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] capitalize",
                    event.status === "completed"
                      ? "border-emerald-800 text-emerald-400"
                      : "border-zinc-700 text-zinc-400",
                  )}
                >
                  {event.status}
                </span>
              </div>
              {event.targets.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {event.targets.map((target, index) => (
                    <span key={`${event.id}-${index}`} className="text-xs text-zinc-500">
                      {targetSummary(target)}
                    </span>
                  ))}
                </div>
              )}
              {event.notes?.trim() && <p className="mt-1.5 text-xs text-zinc-500">{event.notes}</p>}
              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 block text-xs text-emerald-400 hover:underline"
                >
                  Open link
                </a>
              )}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 gap-1">
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => setEditing(true)}
              className="rounded px-2 py-1 text-sm text-emerald-400 hover:bg-zinc-800 disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              className="rounded px-2 py-1 text-sm text-rose-400 hover:bg-rose-950/50 disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>

      {editing && <EditEventModal event={event} onClose={() => setEditing(false)} />}
    </>
  );
};
