import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Field, Input, Label, Select, Textarea } from "@/components/Forms";
import {
  CARDIO_DISTANCE_UNITS,
  type CardioDistanceUnit,
  PLAN_KIND_VALUES,
  PLAN_STATUS_VALUES,
  type PlanKind,
  type PlanStatus,
} from "@/lib/constants/activities";
import {
  SPORT_EVENT_DISCIPLINES,
  type SportEventDiscipline,
  type SportEventTargetSegment,
} from "@/lib/constants/events";
import type { SportEventRow } from "@/lib/db/schema.server";
import { formatTargetDurationSec } from "@/lib/plans/cardio-targets";
import { cn } from "@/lib/utils";
import { eventActions } from "@/server-fcts/events";

const QUERY_KEY = ["sportEvents"] as const;

export const Route = createFileRoute("/_authed/events")({
  component: EventsPage,
});

type SegmentDraft = {
  draftId: string;
  activity: PlanKind;
  label: string;
  distance: string;
  distance_units: string;
  time_seconds: string;
  notes: string;
};

function newSegmentDraft(overrides: Partial<SegmentDraft> = {}): SegmentDraft {
  return {
    draftId: crypto.randomUUID(),
    activity: overrides.activity ?? "run",
    label: overrides.label ?? "",
    distance: overrides.distance ?? "",
    distance_units: overrides.distance_units ?? "km",
    time_seconds: overrides.time_seconds ?? "",
    notes: overrides.notes ?? "",
  };
}

function segmentsToDrafts(segments: SportEventTargetSegment[]): SegmentDraft[] {
  if (!segments.length) {
    return [newSegmentDraft()];
  }
  return segments.map((s) =>
    newSegmentDraft({
      activity: s.activity,
      label: s.label ?? "",
      distance: s.distance != null ? String(s.distance) : "",
      distance_units: s.distance_units ?? "km",
      time_seconds: s.time_seconds != null ? String(s.time_seconds) : "",
      notes: s.notes ?? "",
    }),
  );
}

function draftsToTargetsPayload(
  drafts: SegmentDraft[],
): SportEventTargetSegment[] {
  const payloads: SportEventTargetSegment[] = [];
  for (const d of drafts) {
    const timeRaw = d.time_seconds.trim();
    let timeSecs: number | undefined;
    if (timeRaw !== "") {
      const t = Number(timeRaw);
      if (!Number.isFinite(t) || t < 0) {
        throw new Error("Time (seconds) must be a valid non-negative number");
      }
      timeSecs = Math.floor(t);
    }

    const distRaw = d.distance.trim();

    const seg: SportEventTargetSegment = {
      activity: d.activity,
    };

    const lbl = d.label.trim();
    if (lbl) {
      seg.label = lbl;
    }

    if (distRaw !== "") {
      const distNum = Number(distRaw);
      if (!Number.isFinite(distNum) || distNum < 0) {
        throw new Error("Distance must be a valid non-negative number");
      }
      const u = (d.distance_units ?? "km").trim().toLowerCase();
      seg.distance = distNum;
      seg.distance_units = (
        (CARDIO_DISTANCE_UNITS as readonly string[]).includes(u) ? u : "km"
      ) as CardioDistanceUnit;
    }

    if (timeSecs !== undefined) {
      seg.time_seconds = timeSecs;
    }

    const legNotes = d.notes.trim();
    if (legNotes) {
      seg.notes = legNotes;
    }

    payloads.push(seg);
  }
  return payloads;
}

function segmentSummaryLine(seg: SportEventTargetSegment): string {
  const bits: string[] = [seg.activity];
  const lbl = seg.label?.trim();
  if (lbl) {
    bits.push(`(${lbl})`);
  }
  if (
    seg.distance != null &&
    Number.isFinite(seg.distance) &&
    seg.distance_units
  ) {
    bits.push(`${seg.distance}${seg.distance_units}`);
  }
  if (seg.time_seconds != null && seg.time_seconds > 0) {
    bits.push(formatTargetDurationSec(seg.time_seconds));
  }
  return bits.join(" ");
}

function emptyFormSegments(): SegmentDraft[] {
  return [newSegmentDraft()];
}

function EventsPage() {
  const queryClient = useQueryClient();
  const runList = useServerFn(eventActions.list);
  const runInsert = useServerFn(eventActions.add);
  const runPatch = useServerFn(eventActions.update);
  const runRemove = useServerFn(eventActions.remove);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const rows = await runList();
      if (!Array.isArray(rows)) {
        throw new Error("Unexpected response when loading events.");
      }
      return rows;
    },
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [eventDayKey, setEventDayKey] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<PlanStatus>("planned");
  const [segmentDrafts, setSegmentDrafts] = useState<SegmentDraft[]>(() =>
    emptyFormSegments(),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const sortedEvents = useMemo(() => {
    const rows = query.data ?? [];
    return [...rows].sort((a, b) => a.eventDayKey.localeCompare(b.eventDayKey));
  }, [query.data]);

  const resetForm = useCallback(() => {
    setEditId(null);
    setCreating(false);
    setName("");
    setEventDayKey("");
    setDiscipline("");
    setNotes("");
    setUrl("");
    setStatus("planned");
    setSegmentDrafts(emptyFormSegments());
    setFormError(null);
  }, []);

  const openCreateForm = useCallback(() => {
    setEditId(null);
    setCreating(true);
    setName("");
    setEventDayKey("");
    setDiscipline("");
    setNotes("");
    setUrl("");
    setStatus("planned");
    setSegmentDrafts(emptyFormSegments());
    setFormError(null);
  }, []);

  const startEdit = useCallback((e: SportEventRow) => {
    setCreating(false);
    setEditId(e.id);
    setName(e.name);
    setEventDayKey(e.eventDayKey);
    setDiscipline(e.discipline ?? "");
    setNotes(e.notes ?? "");
    setUrl(e.url ?? "");
    setStatus(e.status);
    setSegmentDrafts(segmentsToDrafts(e.targets));
    setFormError(null);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let targets: SportEventTargetSegment[];
      try {
        targets = draftsToTargetsPayload(segmentDrafts);
      } catch (err) {
        throw err instanceof Error
          ? err
          : new Error("Invalid targets on one or more legs");
      }

      const dis: SportEventDiscipline | undefined =
        discipline.trim() === ""
          ? undefined
          : (discipline.trim() as SportEventDiscipline);

      if (editId) {
        return runPatch({
          data: {
            id: editId,
            name: name.trim(),
            dayKey: eventDayKey.trim(),
            status,
            discipline: dis ?? null,
            notes: notes.trim() === "" ? null : notes.trim(),
            targets,
            url: url.trim() === "" ? null : url.trim(),
          },
        });
      }
      return runInsert({
        data: {
          name: name.trim(),
          dayKey: eventDayKey.trim(),
          discipline: dis ?? null,
          notes: notes.trim() === "" ? null : notes.trim(),
          targets,
          url: url.trim() === "" ? null : url.trim(),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      resetForm();
    },
    onError: (e: Error) => {
      setFormError(e.message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => runRemove({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const updating = editId !== null;
  const formOpen = creating || updating;
  const submitting = saveMutation.isPending;

  const hasStoredNotes =
    sortedEvents.some((ev) => (ev.notes ?? "").trim()) === true;

  useEffect(() => {
    if (!formOpen) {
      return;
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        resetForm();
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [formOpen, submitting, resetForm]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Events & goals
          </h1>
          <p className="mt-1 max-w-xl text-[13px] text-zinc-500">
            Races and other targets — multiple legs per event (triathlon swim /
            bike / run, etc.).
          </p>
        </div>
        <Link to="/" className="text-[13px] text-emerald-400 hover:underline">
          ← Home
        </Link>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-zinc-200">Your events</h2>
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-[13px] font-medium text-white hover:bg-emerald-600"
          >
            Add event
          </button>
        </div>

        {query.isLoading ? (
          <p className="text-[13px] text-zinc-500">Loading…</p>
        ) : query.isError ? (
          <p className="text-[13px] text-rose-400">
            {query.error instanceof Error
              ? query.error.message
              : "Failed to load events."}
          </p>
        ) : sortedEvents.length === 0 ? (
          <p className="text-[13px] text-zinc-500">
            No events yet. Use <span className="text-zinc-400">Add event</span>{" "}
            to create one.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sortedEvents.map((eventRow) => (
              <li
                key={eventRow.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex gap-4 items-start">
                    <div className="shrink-0 text-center">
                      <div className="text-lg font-semibold tabular-nums text-zinc-100">
                        {eventRow.eventDayKey.slice(8)}
                      </div>
                      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                        {new Date(
                          `${eventRow.eventDayKey}T12:00:00Z`,
                        ).toLocaleDateString("en-US", { month: "short" })}
                      </div>
                    </div>
                    <div className="w-px self-stretch bg-zinc-800" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-zinc-100">
                          {eventRow.name}
                        </span>
                        {eventRow.discipline && (
                          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] capitalize text-zinc-400">
                            {eventRow.discipline}
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] capitalize",
                            eventRow.status === "completed"
                              ? "border-emerald-800 text-emerald-400"
                              : "border-zinc-700 text-zinc-400",
                          )}
                        >
                          {eventRow.status}
                        </span>
                      </div>
                      {eventRow.targets.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                          {eventRow.targets.map((segment) => (
                            <span
                              key={`${eventRow.id}`}
                              className="text-xs text-zinc-500"
                            >
                              {segmentSummaryLine(segment)}
                            </span>
                          ))}
                        </div>
                      )}
                      {eventRow.url && (
                        <a
                          href={eventRow.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 block text-xs text-emerald-400 underline decoration-emerald-500/55 underline-offset-2 hover:text-emerald-300"
                        >
                          Open link
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 ml-auto">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => startEdit(eventRow)}
                      className="rounded px-2 py-1 text-sm text-emerald-400 hover:bg-zinc-800 disabled:opacity-45"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={removeMutation.isPending || submitting}
                      onClick={() => {
                        if (
                          confirm("Delete this event? This cannot be undone.")
                        ) {
                          removeMutation.mutate(eventRow.id);
                        }
                      }}
                      className="rounded px-2 py-1 text-sm text-rose-400 hover:bg-rose-950/50 disabled:opacity-45"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-80">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 z-0 bg-black/60"
            disabled={submitting}
            onClick={() => {
              if (!submitting) {
                resetForm();
              }
            }}
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-4 sm:items-center">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="events-form-title"
              className="pointer-events-auto flex max-h-[min(92vh,52rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/40"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-zinc-800/90 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="events-form-title"
                    className="text-[17px] font-semibold tracking-tight text-zinc-100"
                  >
                    {updating ? "Edit event" : "Add event"}
                  </h2>
                  <button
                    type="button"
                    aria-label="Close"
                    disabled={submitting}
                    onClick={() => resetForm()}
                    className="-m-1 shrink-0 rounded p-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-45"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2 items-center">
                  <Field>
                    <Label>Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="June Olympic triathlon"
                      autoComplete="off"
                    />
                  </Field>
                  <Field>
                    <Label>Event date (YYYY-MM-DD)</Label>
                    <Input
                      value={eventDayKey}
                      onChange={(e) => setEventDayKey(e.target.value)}
                      placeholder="2026-06-21"
                      autoComplete="off"
                    />
                  </Field>
                  <Field>
                    <Label>Overview tag (optional)</Label>
                    <Select
                      value={discipline}
                      onChange={(e) => setDiscipline(e.target.value)}
                    >
                      <option value=""> — </option>
                      {SPORT_EVENT_DISCIPLINES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <Label>Status</Label>
                    <Select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as PlanStatus)}
                    >
                      {PLAN_STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field className="col-span-full">
                    <Label>URL (optional)</Label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://…"
                      autoComplete="off"
                    />
                  </Field>
                  <Field className="col-span-full">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </Field>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-zinc-300">
                      Legs & targets
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSegmentDrafts((d) => [...d, newSegmentDraft()])
                      }
                      className="rounded-lg border border-zinc-700  px-3 py-1.5 text-[12px] font-medium text-zinc-200 hover:bg-zinc-800"
                    >
                      + Add leg
                    </button>
                  </div>

                  <ul className="mt-3 divide-y divide-zinc-800/90 rounded-lg border border-zinc-800 bg-zinc-950/85">
                    {segmentDrafts.map((row, idx) => (
                      <li
                        key={row.draftId}
                        className="grid grid-cols-2 gap-2 sm:grid-cols-3 gap-x-3 gap-y-3 p-4"
                      >
                        <Field>
                          <Label>Activity</Label>
                          <Select
                            value={row.activity}
                            onChange={(e) =>
                              setSegmentDrafts((ds) =>
                                ds.map((r) =>
                                  r.draftId === row.draftId
                                    ? {
                                        ...r,
                                        activity: e.target.value
                                          .trim()
                                          .toLowerCase() as PlanKind,
                                      }
                                    : r,
                                ),
                              )
                            }
                          >
                            {PLAN_KIND_VALUES.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field>
                          <Label>Label</Label>
                          <Input
                            value={row.label}
                            placeholder="SWIM"
                            onChange={(e) =>
                              setSegmentDrafts((ds) =>
                                ds.map((r) =>
                                  r.draftId === row.draftId
                                    ? { ...r, label: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field>
                          <Label>Distance</Label>
                          <Input
                            value={row.distance}
                            inputMode="decimal"
                            onChange={(e) =>
                              setSegmentDrafts((ds) =>
                                ds.map((r) =>
                                  r.draftId === row.draftId
                                    ? { ...r, distance: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field>
                          <Label>Units</Label>
                          <Select
                            value={row.distance_units}
                            onChange={(e) =>
                              setSegmentDrafts((ds) =>
                                ds.map((r) =>
                                  r.draftId === row.draftId
                                    ? {
                                        ...r,
                                        distance_units: e.target.value,
                                      }
                                    : r,
                                ),
                              )
                            }
                          >
                            {CARDIO_DISTANCE_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field>
                          <Label>Time (s)</Label>
                          <Input
                            value={row.time_seconds}
                            inputMode="numeric"
                            onChange={(e) =>
                              setSegmentDrafts((ds) =>
                                ds.map((r) =>
                                  r.draftId === row.draftId
                                    ? {
                                        ...r,
                                        time_seconds: e.target.value,
                                      }
                                    : r,
                                ),
                              )
                            }
                            placeholder={`${3600}`}
                          />
                        </Field>
                        <Field>
                          <Label>Notes</Label>
                          <Input
                            value={row.notes}
                            onChange={(e) =>
                              setSegmentDrafts((ds) =>
                                ds.map((r) =>
                                  r.draftId === row.draftId
                                    ? { ...r, notes: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </Field>

                        {segmentDrafts.length > 1 ? (
                          <button
                            type="button"
                            aria-label={`Remove leg ${idx + 1}`}
                            onClick={() =>
                              setSegmentDrafts((ds) =>
                                ds.filter((r) => r.draftId !== row.draftId),
                              )
                            }
                            className="ml-auto shrink-0 rounded p-2 text-zinc-500 hover:bg-rose-950/50 hover:text-rose-200"
                          >
                            ✕
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-zinc-600">
                    Distance + units pair only when distance is filled.
                    Time-only legs are allowed.
                  </p>
                </div>

                {formError ? (
                  <p className="mt-3 text-[13px] text-rose-400">{formError}</p>
                ) : null}
              </div>

              <div className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={
                      submitting ||
                      name.trim() === "" ||
                      eventDayKey.trim() === ""
                    }
                    onClick={() => saveMutation.mutate()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting
                      ? "Saving…"
                      : updating
                        ? "Save changes"
                        : "Add event"}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => resetForm()}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-[13px] text-zinc-200 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-45"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {hasStoredNotes ? (
        <p className="text-[12px] text-zinc-500">
          Notes are saved per row but not repeated in this table — use Edit to
          view them.
        </p>
      ) : null}
    </div>
  );
}
