import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import { createEventInput, emptyEventFormValues } from "@/lib/events/form";
import { invalidators } from "@/lib/query-keys";
import { eventActions } from "@/server-fcts/events";
import { Modal, ModalContent } from ".";
import { EventForm } from "./event-form";

export const CreateEventModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const form = useFormReducer(emptyEventFormValues());
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: eventActions.add,
    onSuccess: (event) => {
      invalidators.events.create(queryClient, { event });
      onClose();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    try {
      createMutation.mutate({ data: createEventInput(form.formState.values) });
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid event");
    }
  };

  return (
    <Modal onClose={createMutation.isPending ? () => {} : onClose}>
      <ModalContent className="sm:max-w-2xl">
        <EventForm
          form={form}
          title="Add event"
          submitLabel="Add event"
          error={error}
          pending={createMutation.isPending}
          onClose={onClose}
          onSubmit={submit}
        />
      </ModalContent>
    </Modal>
  );
};
