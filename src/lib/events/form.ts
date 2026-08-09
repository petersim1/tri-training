import type { PlanKind, PlanStatus } from "@/lib/constants/activities";
import type { SportEventDiscipline, SportEventTargetSegment } from "@/lib/constants/events";
import type { SportEventRow } from "@/lib/db/schema.server";
import { normalizeSportEventTargetsArray } from "@/lib/plans/sport-event-targets";
import {
  type CreateSportEventSchemaValues,
  createSportEventSchema,
  type UpdateSportEventSchemaValues,
  updateSportEventSchema,
} from "@/types/requests/events";

export type EventTargetDraft = {
  id: string;
  activity: PlanKind;
  label: string;
  distance: string;
  distanceUnits: string;
  timeSeconds: string;
  notes: string;
};

export type EventFormValues = {
  name: string;
  dayKey: string;
  discipline: SportEventDiscipline | "";
  status: PlanStatus;
  notes: string;
  url: string;
  targets: EventTargetDraft[];
};

export function createEventTargetDraft(
  overrides: Partial<EventTargetDraft> = {},
): EventTargetDraft {
  return {
    id: crypto.randomUUID(),
    activity: overrides.activity ?? "run",
    label: overrides.label ?? "",
    distance: overrides.distance ?? "",
    distanceUnits: overrides.distanceUnits ?? "km",
    timeSeconds: overrides.timeSeconds ?? "",
    notes: overrides.notes ?? "",
  };
}

export function emptyEventFormValues(): EventFormValues {
  return {
    name: "",
    dayKey: "",
    discipline: "",
    status: "planned",
    notes: "",
    url: "",
    targets: [createEventTargetDraft()],
  };
}

export function eventToFormValues(event: SportEventRow): EventFormValues {
  return {
    name: event.name,
    dayKey: event.eventDayKey,
    discipline: event.discipline ?? "",
    status: event.status,
    notes: event.notes ?? "",
    url: event.url ?? "",
    targets:
      event.targets.length > 0
        ? event.targets.map((target) =>
            createEventTargetDraft({
              activity: target.activity,
              label: target.label ?? "",
              distance: target.distance == null ? "" : String(target.distance),
              distanceUnits: target.distance_units ?? "km",
              timeSeconds: target.time_seconds == null ? "" : String(target.time_seconds),
              notes: target.notes ?? "",
            }),
          )
        : [createEventTargetDraft()],
  };
}

function targetsFromDrafts(drafts: EventTargetDraft[]): SportEventTargetSegment[] {
  return normalizeSportEventTargetsArray(
    drafts.map((draft) => ({
      activity: draft.activity,
      label: draft.label,
      distance: draft.distance,
      distance_units: draft.distanceUnits,
      time_seconds: draft.timeSeconds === "" ? undefined : draft.timeSeconds,
      notes: draft.notes,
    })),
  );
}

function sharedEventInput(values: EventFormValues) {
  return {
    name: values.name.trim(),
    dayKey: values.dayKey.trim(),
    discipline: values.discipline || null,
    notes: values.notes.trim() || null,
    targets: targetsFromDrafts(values.targets),
    url: values.url.trim() || null,
  };
}

export function createEventInput(values: EventFormValues): CreateSportEventSchemaValues {
  return createSportEventSchema.parse(sharedEventInput(values));
}

export function updateEventInput(
  id: string,
  values: EventFormValues,
): UpdateSportEventSchemaValues {
  return updateSportEventSchema.parse({
    id,
    ...sharedEventInput(values),
    status: values.status,
  });
}
