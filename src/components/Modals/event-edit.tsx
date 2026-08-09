import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import type { SportEventRow } from "@/lib/db/schema.server";
import { eventToFormValues, updateEventInput } from "@/lib/events/form";
import { invalidators } from "@/lib/query-keys";
import { eventActions } from "@/server-fcts/events";
import { Modal, ModalContent } from ".";
import { EventForm } from "./event-form";

export const EditEventModal: React.FC<{
  event: SportEventRow;
  onClose: () => void;
}> = ({ event, onClose }) => {
  const queryClient = useQueryClient();
  const form = useFormReducer(eventToFormValues(event));
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: eventActions.update,
    onSuccess: (updatedEvent) => {
      invalidators.events.update(queryClient, { event: updatedEvent });
      onClose();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    try {
      updateMutation.mutate({
        data: updateEventInput(event.id, form.formState.values),
      });
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid event");
    }
  };

  return (
    <Modal onClose={updateMutation.isPending ? () => {} : onClose}>
      <ModalContent className="sm:max-w-2xl">
        <EventForm
          form={form}
          title="Edit event"
          submitLabel="Save changes"
          error={error}
          pending={updateMutation.isPending}
          showStatus
          onClose={onClose}
          onSubmit={submit}
        />
      </ModalContent>
    </Modal>
  );
};
