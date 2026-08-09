import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CreateEventModal } from "@/components/Modals/event-create";
import { EventElement } from "@/components/views/events/element";
import { getters } from "@/lib/query-keys";

export const EventsContent: React.FC = () => {
  const { data: events } = useSuspenseQuery(getters.events.list());
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-zinc-500">Races and other training targets.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Add event
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">No events yet.</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <EventElement key={event.id} event={event} />
          ))}
        </div>
      )}

      {creating && <CreateEventModal onClose={() => setCreating(false)} />}
    </div>
  );
};
