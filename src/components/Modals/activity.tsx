import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import {
  CARDIO_DISTANCE_UNITS,
  type CardioDistanceUnit,
  PLAN_KIND_VALUES,
  PLAN_STATUS_VALUES,
  type PlanKind,
  type PlanStatus,
} from "@/lib/constants/activities";
import type { WorkoutEntryWithCompleted } from "@/lib/db/schema.server";
import queryKeys from "@/lib/query-keys";
import { convertTime } from "@/lib/utils/calculations";
import { rawActivityType } from "@/lib/utils/vendors";
import { activityActions } from "@/server-fcts/activities";
import { dayActions } from "@/server-fcts/days";
import { vendorActions } from "@/server-fcts/vendors";
import { weightActions } from "@/server-fcts/weights";
import {
  type CreatePlanInput,
  createPlanSchema,
  type UpdatePlanInput,
  updatePlanSchema,
} from "@/types/requests/activities";
import type { DayItem } from "@/types/responses/activities";
import { PlusIcon } from "../assets";
import { Field, Input, Label, Select, Textarea } from "../Forms";
import { ActivityElement } from "../views/activities/element";
import { Modal, ModalContent } from ".";

export const ActivityModal: React.FC<{
  dayKey: string;
  timeZone: string;
  onClose: () => void;
}> = ({ dayKey, timeZone, onClose }) => {
  const [step, setStep] = useState<"summary" | "add" | "workout">("summary");
  const [SelectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dayDetails(dayKey),
    queryFn: () =>
      dayActions.dayInfo({
        data: {
          dayKey,
          timezone: timeZone,
        },
      }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const SelectedPlan =
    data?.activities.find((a) => a.id === SelectedPlanId) ?? null;

  return (
    <Modal onClose={onClose}>
      <ModalContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          </div>
        ) : !data ? null : step === "summary" ? (
          <SummaryModal
            dayKey={dayKey}
            data={data}
            onClose={onClose}
            onAddPlan={() => setStep("add")}
            onOpenPlan={(id) => {
              setSelectedPlanId(id);
              setStep("workout");
            }}
          />
        ) : step === "add" ? (
          <AddModal
            dayKey={dayKey}
            onClose={onClose}
            onBack={() => setStep("summary")}
          />
        ) : step === "workout" && SelectedPlan ? (
          <WorkoutModal
            dayKey={dayKey}
            plan={SelectedPlan}
            onClose={onClose}
            onBack={() => setStep("summary")}
          />
        ) : null}
      </ModalContent>
    </Modal>
  );
};

const SummaryModal: React.FC<{
  dayKey: string;
  data: DayItem;
  onClose: () => void;
  onAddPlan: () => void;
  onOpenPlan: (id: string) => void;
}> = ({ dayKey, data, onClose, onAddPlan, onOpenPlan }) => {
  const queryClient = useQueryClient();
  const [weightErr, setWeightErr] = useState<string | null>(null);

  const dialogTitle = new Date(`${dayKey}T12:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  );

  const planned = data.activities.filter(
    (a) => a.status === "planned" || a.status === "skipped",
  );
  const completed = data.activities.filter((a) => a.status === "completed");

  const setWeightMutation = useMutation({
    mutationFn: (weightLb: number) =>
      weightActions.set({ data: { dayKey, weightLb } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dayDetails(dayKey) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    },
  });

  const clearWeightMutation = useMutation({
    mutationFn: () => weightActions.remove({ data: { dayKey } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dayDetails(dayKey) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    },
  });

  const createFromCompletedMutation = useMutation({
    mutationFn: (vendorActivityId: string) =>
      activityActions.createFromCompleted({
        data: { dayKey, vendorActivityId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.unlinkedActivities });
      queryClient.invalidateQueries({ queryKey: queryKeys.dayDetails(dayKey) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    },
  });

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2
            id="day-dialog-title"
            className="text-lg font-semibold text-zinc-100"
          >
            {dialogTitle}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      <div className="mb-6 space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-medium text-zinc-200">Plans</h3>
          {planned.length === 0 ? (
            <p className="text-sm text-zinc-500">None for this day.</p>
          ) : (
            <ul className="space-y-2">
              {planned.map((p) => (
                <ActivityElement
                  key={p.id}
                  workout={p}
                  onEdit={() => onOpenPlan(p.id)}
                  hideDate
                  hideNote={!!p.vendorActivityId}
                  isCard
                />
              ))}
            </ul>
          )}
        </section>

        {completed.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium text-zinc-200">
              Completed
            </h3>
            <ul className="space-y-2">
              {completed.map((p) => (
                <ActivityElement
                  key={p.id}
                  workout={p}
                  onEdit={() => onOpenPlan(p.id)}
                  hideDate
                  hideNote={!!p.vendorActivityId}
                  isCard
                />
              ))}
            </ul>
          </section>
        )}

        {data.linkCandidates.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium text-zinc-200">
              Completed (no plan)
            </h3>
            <ul className="space-y-3">
              {data.linkCandidates.map((va) => (
                <li
                  key={va.id}
                  className="rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2"
                >
                  <div className="text-sm text-zinc-100 capitalize">
                    {rawActivityType(va)}
                  </div>
                  <div className="mt-0.5 text-xs capitalize text-zinc-500">
                    {va.vendor}
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={createFromCompletedMutation.isPending}
                      onClick={() => createFromCompletedMutation.mutate(va.id)}
                      className="rounded border border-violet-500/60 bg-violet-950/40 px-2.5 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-950/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {createFromCompletedMutation.isPending
                        ? "Linking…"
                        : "Link activity"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={onAddPlan}
          className="w-full flex gap-2 items-center justify-center rounded border border-zinc-600 bg-zinc-900/50 px-3 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
        >
          <PlusIcon className="size-4" />
          Add plan
        </button>
      </div>

      <div className="border-t border-zinc-800 pt-4">
        <form
          className="flex w-full min-w-0 flex-nowrap gap-2 items-end justify-between"
          onSubmit={(e) => {
            e.preventDefault();
            setWeightErr(null);
            const fd = new FormData(e.currentTarget);
            const w = Number.parseFloat(String(fd.get("weight") ?? ""));
            if (!Number.isFinite(w) || w <= 0) {
              setWeightErr("Enter a valid weight");
              return;
            }
            setWeightMutation.mutate(w);
          }}
        >
          <Field>
            <Label>Weight</Label>
            <div className="relative min-w-0 flex-1">
              <Input
                name="weight"
                type="number"
                step="0.1"
                min="0"
                required
                inputMode="decimal"
                autoComplete="off"
                defaultValue={data.weight?.toFixed(1) ?? ""}
                aria-label="Weight in pounds"
              />
              <span
                className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-zinc-500"
                aria-hidden
              >
                lb
              </span>
            </div>
          </Field>
          <button
            type="submit"
            disabled={setWeightMutation.isPending}
            className="ml-auto h-10 shrink-0 rounded border border-emerald-600 bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {setWeightMutation.isPending ? "…" : "Save"}
          </button>
          {data.weight != null && (
            <button
              type="button"
              disabled={
                clearWeightMutation.isPending || setWeightMutation.isPending
              }
              className="h-10 shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                setWeightErr(null);
                clearWeightMutation.mutate();
              }}
            >
              {clearWeightMutation.isPending ? "…" : "Clear"}
            </button>
          )}
        </form>
        {weightErr && <p className="mt-2 text-xs text-red-400">{weightErr}</p>}
      </div>
    </>
  );
};

const AddModal: React.FC<{
  dayKey: string;
  onClose: () => void;
  onBack: () => void;
}> = ({ dayKey, onClose, onBack }) => {
  const queryClient = useQueryClient();

  const formReducer = useFormReducer<CreatePlanInput>({
    dayKey,
    kind: "run",
  });
  const [planErr, setPlanErr] = useState<
    {
      field: keyof CreatePlanInput;
      description: string;
    }[]
  >([]);

  const dialogTitle = new Date(`${dayKey}T12:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  );

  const routineQuery = useQuery({
    queryKey: queryKeys.routines,
    queryFn: () => vendorActions.listRoutines(),
  });

  const createPlanMutation = useMutation({
    mutationFn: (data: CreatePlanInput) => activityActions.create({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dayDetails(dayKey) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
      onBack();
    },
  });

  const selectedRoutine = useMemo(() => {
    if (!routineQuery.data) return null;
    if (!formReducer.formState.values.routineId) return null;
    const allRoutines = [
      ...(routineQuery.data.unfoldered ?? []),
      ...(routineQuery.data.groups.flatMap((g) => g.routines) ?? []),
    ];
    return allRoutines.find(
      (r) => r.id === formReducer.formState.values.routineId,
    );
  }, [formReducer.formState.values.routineId, routineQuery.data]);

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setPlanErr([]);
    const parsed = createPlanSchema.safeParse(formReducer.formState.values);
    if (!parsed.success) {
      setPlanErr(
        parsed.error.issues.map((e) => {
          return {
            field: e.path[0].toString() as keyof CreatePlanInput,
            description: e.message,
          };
        }),
      );
      return;
    }

    const { timeSeconds, ...rest } = parsed.data;

    const dataSubmit: CreatePlanInput = {
      ...rest,
      timeSeconds: timeSeconds ? convertTime(timeSeconds, "m", "s") : undefined,
    };

    createPlanMutation.mutate(dataSubmit);
  };

  const isError = (field: keyof CreatePlanInput): boolean => {
    return planErr.some((e) => e.field === field);
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Back
        </button>
        <div className="min-w-0 flex-1">
          <h2
            id="day-dialog-title"
            className="text-lg font-semibold text-zinc-100"
          >
            Add plan
          </h2>
          <p className="truncate text-sm text-zinc-400">{dialogTitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        {/* Type */}
        <Field>
          <Label>Type</Label>
          <Select
            name="kind"
            required
            value={formReducer.formState.values.kind}
            onChange={(e) =>
              formReducer.setField("kind", e.target.value as PlanKind)
            }
            isError={isError("kind")}
          >
            <option value="" disabled>
              Select type
            </option>
            {PLAN_KIND_VALUES.map((k) => (
              <option key={k} value={k} className="capitalize">
                {k}
              </option>
            ))}
          </Select>
        </Field>

        {formReducer.formState.values.kind === "lift" && routineQuery.data && (
          <Field>
            <Label>Routine</Label>
            <Select
              name="routineId"
              value={formReducer.formState.values.routineId ?? ""}
              onChange={(e) =>
                formReducer.setField("routineId", e.target.value ?? null)
              }
              isError={isError("routineId")}
            >
              <option value="">No routine</option>
              {routineQuery.data.unfoldered.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
              {routineQuery.data.groups.map(
                ({ folder, routines: folderRoutines }) => (
                  <optgroup key={folder.id} label={folder.title}>
                    {folderRoutines.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </optgroup>
                ),
              )}
            </Select>
          </Field>
        )}
        {formReducer.formState.values.kind === "lift" && selectedRoutine && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Exercises
            </p>
            <div className="space-y-1">
              {selectedRoutine.exercises.map((ex, i) => {
                const workingSets = ex.sets.filter((s) => s.type === "normal");
                const first = workingSets[0];
                const reps = first?.rep_range
                  ? `${first.rep_range.start ?? "?"}–${first.rep_range.end ?? "?"}`
                  : first?.reps != null
                    ? String(first.reps)
                    : null;
                const setLine = reps
                  ? `${workingSets.length}×${reps}`
                  : `${workingSets.length} sets`;

                return (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2"
                  >
                    <p className="text-sm text-zinc-300 min-w-0 truncate">
                      {ex.title}
                    </p>
                    <p className="text-xs text-zinc-500 shrink-0">{setLine}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {formReducer.formState.values.kind !== "lift" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field>
                <Label>Distance</Label>
                <Input
                  name="distance"
                  type="number"
                  step="any"
                  placeholder="—"
                  value={formReducer.formState.values.distance ?? ""}
                  onChange={(e) =>
                    formReducer.setField(
                      "distance",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  isError={isError("distance")}
                />
              </Field>
              <Field>
                <Label>Units</Label>
                <Select
                  name="distanceUnits"
                  value={formReducer.formState.values.distanceUnits ?? ""}
                  onChange={(e) =>
                    formReducer.setField(
                      "distanceUnits",
                      e.target.value as CardioDistanceUnit,
                    )
                  }
                  isError={isError("distanceUnits")}
                >
                  <option value="">—</option>
                  {CARDIO_DISTANCE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field>
              <Label>Time (mins)</Label>
              <Input
                name="time"
                type="number"
                placeholder="—"
                value={formReducer.formState.values.timeSeconds ?? ""}
                onChange={(e) =>
                  formReducer.setField(
                    "timeSeconds",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                isError={isError("timeSeconds")}
              />
            </Field>
          </>
        )}

        <Field>
          <Label>Notes</Label>
          <Textarea
            name="notes"
            rows={3}
            placeholder="Optional"
            value={formReducer.formState.values.notes ?? ""}
            onChange={(e) => formReducer.setField("notes", e.target.value)}
            isError={isError("notes")}
          />
        </Field>

        {planErr.length > 0 && (
          <p className="rounded-lg border border-rose-800/85 bg-rose-950/50 px-3 py-2 text-sm text-rose-100">
            {planErr[0].description}
          </p>
        )}
        <button
          type="submit"
          disabled={createPlanMutation.isPending}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createPlanMutation.isPending ? "Creating…" : "Create plan"}
        </button>
      </form>
    </>
  );
};

export const WorkoutModal: React.FC<{
  dayKey: string;
  plan: WorkoutEntryWithCompleted;
  onClose: () => void;
  onBack: () => void;
}> = ({ dayKey, plan, onClose, onBack }) => {
  const queryClient = useQueryClient();

  const { vendorActivity, timeSeconds, ...rest } = plan;

  const formReducer = useFormReducer<UpdatePlanInput>({
    ...rest,
    timeSeconds: timeSeconds ? convertTime(timeSeconds, "s", "m") : undefined,
  });
  const [planErr, setPlanErr] = useState<
    {
      field: keyof UpdatePlanInput;
      description: string;
    }[]
  >([]);

  const dialogTitle = new Date(`${dayKey}T12:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  );

  const routineQuery = useQuery({
    queryKey: queryKeys.routines,
    queryFn: () => vendorActions.listRoutines(),
  });

  const selectedRoutine = useMemo(() => {
    if (!routineQuery.data) return null;
    if (!formReducer.formState.values.routineId) return null;
    const allRoutines = [
      ...(routineQuery.data.unfoldered ?? []),
      ...(routineQuery.data.groups.flatMap((g) => g.routines) ?? []),
    ];
    return allRoutines.find(
      (r) => r.id === formReducer.formState.values.routineId,
    );
  }, [formReducer.formState.values.routineId, routineQuery.data]);

  const updatePlanMutation = useMutation({
    mutationFn: (data: UpdatePlanInput) => activityActions.update({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dayDetails(dayKey) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    },
    onError: (e) => console.error(e),
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => activityActions.deletePlan({ data: { id: plan.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dayDetails(dayKey) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
      onBack();
    },
  });

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setPlanErr([]);
    const parsed = updatePlanSchema.safeParse(formReducer.formState.values);
    if (!parsed.success) {
      setPlanErr(
        parsed.error.issues.map((e) => {
          return {
            field: e.path[0].toString() as keyof CreatePlanInput,
            description: e.message,
          };
        }),
      );
      return;
    }

    const { timeSeconds, ...rest } = parsed.data;

    const dataSubmit: UpdatePlanInput = {
      ...rest,
      timeSeconds: timeSeconds ? convertTime(timeSeconds, "m", "s") : undefined,
    };

    updatePlanMutation.mutate(dataSubmit);
  };

  const isError = (field: keyof UpdatePlanInput): boolean => {
    return planErr.some((e) => e.field === field);
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Back
        </button>
        <div className="min-w-0 flex-1">
          <h2
            id="day-dialog-title"
            className="text-lg font-semibold capitalize text-zinc-100"
          >
            {plan.kind} plan
          </h2>
          <p className="text-sm leading-snug text-zinc-400">{dialogTitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      <ActivityElement workout={plan} hideEdit hideNote hideDate />

      <form className="space-y-3 mt-2" onSubmit={handleSubmit}>
        {!vendorActivity && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Type</Label>
                <Select
                  name="kind"
                  required
                  value={formReducer.formState.values.kind}
                  onChange={(e) =>
                    formReducer.setField("kind", e.target.value as PlanKind)
                  }
                  isError={isError("kind")}
                >
                  <option value="" disabled>
                    Select type
                  </option>
                  {PLAN_KIND_VALUES.map((k) => (
                    <option key={k} value={k} className="capitalize">
                      {k}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Status</Label>
                <Select
                  name="status"
                  required
                  value={formReducer.formState.values.status}
                  onChange={(e) =>
                    formReducer.setField("status", e.target.value as PlanStatus)
                  }
                  isError={isError("status")}
                >
                  {PLAN_STATUS_VALUES.map((k) => (
                    <option key={k} value={k} className="capitalize">
                      {k}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {formReducer.formState.values.kind === "lift" &&
              routineQuery.data && (
                <Field>
                  <Label>Routine</Label>
                  <Select
                    name="routineId"
                    value={formReducer.formState.values.routineId ?? ""}
                    onChange={(e) =>
                      formReducer.setField("routineId", e.target.value ?? null)
                    }
                    isError={isError("routineId")}
                  >
                    <option value="">No routine</option>
                    {routineQuery.data.unfoldered.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                    {routineQuery.data.groups.map(
                      ({ folder, routines: folderRoutines }) => (
                        <optgroup key={folder.id} label={folder.title}>
                          {folderRoutines.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.title}
                            </option>
                          ))}
                        </optgroup>
                      ),
                    )}
                  </Select>
                </Field>
              )}
            {formReducer.formState.values.kind === "lift" &&
              selectedRoutine && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Exercises
                  </p>
                  <div className="space-y-1">
                    {selectedRoutine.exercises.map((ex, i) => {
                      const workingSets = ex.sets.filter(
                        (s) => s.type === "normal",
                      );
                      const first = workingSets[0];
                      const reps = first?.rep_range
                        ? `${first.rep_range.start ?? "?"}–${first.rep_range.end ?? "?"}`
                        : first?.reps != null
                          ? String(first.reps)
                          : null;
                      const setLine = reps
                        ? `${workingSets.length}×${reps}`
                        : `${workingSets.length} sets`;

                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2"
                        >
                          <p className="text-sm text-zinc-300 min-w-0 truncate">
                            {ex.title}
                          </p>
                          <p className="text-xs text-zinc-500 shrink-0">
                            {setLine}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {formReducer.formState.values.kind !== "lift" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <Label>Distance</Label>
                    <Input
                      name="distance"
                      type="number"
                      step="any"
                      placeholder="—"
                      value={formReducer.formState.values.distance ?? ""}
                      onChange={(e) =>
                        formReducer.setField(
                          "distance",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      isError={isError("distance")}
                    />
                  </Field>
                  <Field>
                    <Label>Units</Label>
                    <Select
                      name="distanceUnits"
                      value={formReducer.formState.values.distanceUnits ?? ""}
                      onChange={(e) =>
                        formReducer.setField(
                          "distanceUnits",
                          e.target.value as CardioDistanceUnit,
                        )
                      }
                      isError={isError("distanceUnits")}
                    >
                      <option value="">—</option>
                      {CARDIO_DISTANCE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field>
                  <Label>Time (mins)</Label>
                  <Input
                    name="time"
                    type="number"
                    placeholder="—"
                    value={formReducer.formState.values.timeSeconds ?? ""}
                    onChange={(e) =>
                      formReducer.setField(
                        "timeSeconds",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    isError={isError("timeSeconds")}
                  />
                </Field>
              </>
            )}
          </>
        )}
        <Field>
          <Label>Notes</Label>
          <Textarea
            name="notes"
            rows={3}
            placeholder="Optional"
            value={formReducer.formState.values.notes ?? ""}
            onChange={(e) => formReducer.setField("notes", e.target.value)}
            isError={isError("notes")}
          />
        </Field>

        {planErr.length > 0 && (
          <p className="rounded-lg border border-rose-800/85 bg-rose-950/50 px-3 py-2 text-sm text-rose-100">
            {planErr[0].description}
          </p>
        )}
        {(updatePlanMutation.isError || deletePlanMutation.isError) && (
          <p className="rounded-lg border border-rose-800/85 bg-rose-950/50 px-3 py-2 text-sm text-rose-100">
            something went wrong
          </p>
        )}

        <div className="mt-4 border-t border-zinc-800 pt-2.5 flex justify-between">
          <button
            type="button"
            disabled={deletePlanMutation.isPending || !!plan.vendorActivityId}
            className="text-[11px] text-red-400/90 hover:[not-[disabled]]:underline disabled:opacity-50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deletePlanMutation.mutate();
            }}
          >
            {deletePlanMutation.isPending ? "Deleting…" : "Delete plan"}
          </button>
          <button
            type="submit"
            disabled={updatePlanMutation.isPending}
            className="text-[11px] text-emerald-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updatePlanMutation.isPending ? "Saving…" : "Save Workout"}
          </button>
        </div>
      </form>
    </>
  );
};
