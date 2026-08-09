import { useEffect } from "react";
import { Field, Input, Label, Select, Textarea } from "@/components/Forms";
import type { FormReducerT } from "@/hooks/useFormReducer";
import {
  CARDIO_DISTANCE_UNITS,
  PLAN_KIND_VALUES,
  PLAN_STATUS_VALUES,
  type PlanKind,
  type PlanStatus,
} from "@/lib/constants/activities";
import { SPORT_EVENT_DISCIPLINES, type SportEventDiscipline } from "@/lib/constants/events";
import {
  createEventTargetDraft,
  type EventFormValues,
  type EventTargetDraft,
} from "@/lib/events/form";

type EventFormProps = {
  form: FormReducerT<EventFormValues>;
  title: string;
  submitLabel: string;
  error: string | null;
  pending: boolean;
  showStatus?: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export const EventForm: React.FC<EventFormProps> = ({
  form,
  title,
  submitLabel,
  error,
  pending,
  showStatus = false,
  onClose,
  onSubmit,
}) => {
  const { values } = form.formState;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  const updateTarget = (id: string, update: (target: EventTargetDraft) => EventTargetDraft) => {
    form.setField(
      "targets",
      values.targets.map((target) => (target.id === id ? update(target) : target)),
    );
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-50"
        >
          Close
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <Label>Name</Label>
            <Input
              required
              autoComplete="off"
              value={values.name}
              onChange={(event) => form.setField("name", event.target.value)}
            />
          </Field>
          <Field>
            <Label>Event date</Label>
            <Input
              required
              type="date"
              value={values.dayKey}
              onChange={(event) => form.setField("dayKey", event.target.value)}
            />
          </Field>
          <Field>
            <Label>Discipline</Label>
            <Select
              value={values.discipline}
              onChange={(event) =>
                form.setField("discipline", event.target.value as SportEventDiscipline | "")
              }
            >
              <option value="">None</option>
              {SPORT_EVENT_DISCIPLINES.map((discipline) => (
                <option key={discipline} value={discipline}>
                  {discipline}
                </option>
              ))}
            </Select>
          </Field>
          {showStatus && (
            <Field>
              <Label>Status</Label>
              <Select
                value={values.status}
                onChange={(event) => form.setField("status", event.target.value as PlanStatus)}
              >
                {PLAN_STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field className="sm:col-span-2">
            <Label>URL</Label>
            <Input
              type="url"
              autoComplete="off"
              placeholder="https://…"
              value={values.url}
              onChange={(event) => form.setField("url", event.target.value)}
            />
          </Field>
          <Field className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={values.notes}
              onChange={(event) => form.setField("notes", event.target.value)}
            />
          </Field>
        </div>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-zinc-300">Legs & targets</h3>
            <button
              type="button"
              onClick={() =>
                form.setField("targets", [...values.targets, createEventTargetDraft()])
              }
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Add leg
            </button>
          </div>

          <ul className="mt-3 divide-y divide-zinc-800 rounded border border-zinc-800">
            {values.targets.map((target, index) => (
              <li key={target.id} className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
                <Field>
                  <Label>Activity</Label>
                  <Select
                    value={target.activity}
                    onChange={(event) =>
                      updateTarget(target.id, (current) => ({
                        ...current,
                        activity: event.target.value as PlanKind,
                      }))
                    }
                  >
                    {PLAN_KIND_VALUES.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Label</Label>
                  <Input
                    value={target.label}
                    onChange={(event) =>
                      updateTarget(target.id, (current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <Label>Distance</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={target.distance}
                    onChange={(event) =>
                      updateTarget(target.id, (current) => ({
                        ...current,
                        distance: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <Label>Units</Label>
                  <Select
                    value={target.distanceUnits}
                    onChange={(event) =>
                      updateTarget(target.id, (current) => ({
                        ...current,
                        distanceUnits: event.target.value,
                      }))
                    }
                  >
                    {CARDIO_DISTANCE_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Time (seconds)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={target.timeSeconds}
                    onChange={(event) =>
                      updateTarget(target.id, (current) => ({
                        ...current,
                        timeSeconds: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <Label>Notes</Label>
                  <Input
                    value={target.notes}
                    onChange={(event) =>
                      updateTarget(target.id, (current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </Field>
                {values.targets.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove leg ${index + 1}`}
                    onClick={() =>
                      form.setField(
                        "targets",
                        values.targets.filter((row) => row.id !== target.id),
                      )
                    }
                    className="ml-auto rounded px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/50"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="flex gap-2 border-t border-zinc-800 pt-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? "Saving…" : submitLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
};
