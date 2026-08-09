import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useFormReducer } from "@/hooks/useFormReducer";
import {
  CARDIO_DISTANCE_UNITS,
  type CardioDistanceUnit,
  PLAN_STATUS_VALUES,
  type PlanStatus,
} from "@/lib/constants/activities";
import type { WorkoutEntryWithCompleted } from "@/lib/db/schema.server";
import { getters, invalidators } from "@/lib/query-keys";
import { convertTime } from "@/lib/utils/calculations";
import { activityActions } from "@/server-fcts/activities";
import {
  type CreatePlanInput,
  type UpdatePlanInput,
  updatePlanSchema,
} from "@/types/requests/activities";
import { Field, Input, Label, Select, Textarea } from "../Forms";
import { ActivityElement } from "../views/activities/element";

export const EditModal: React.FC<{
  plan: WorkoutEntryWithCompleted;
  onClose: () => void;
  onBack?: () => void;
}> = ({ plan, onClose, onBack }) => {
  const queryClient = useQueryClient();
  const updatePlan = useServerFn(activityActions.update);
  const deletePlan = useServerFn(activityActions.deletePlan);

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

  const routineQuery = useQuery(getters.routines.list());

  const selectedRoutine = useMemo(() => {
    if (!routineQuery.data) return null;
    if (!formReducer.formState.values.routineId) return null;
    const allRoutines = [
      ...(routineQuery.data.unfoldered ?? []),
      ...(routineQuery.data.groups.flatMap((g) => g.routines) ?? []),
    ];
    return allRoutines.find((r) => r.id === formReducer.formState.values.routineId);
  }, [formReducer.formState.values.routineId, routineQuery.data]);

  const updatePlanMutation = useMutation({
    mutationFn: (data: UpdatePlanInput) => updatePlan({ data }),
    onSuccess: (newPlan) => {
      invalidators.activities.update(queryClient, { plan: newPlan });
    },
    onError: (e) => console.error(e),
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => deletePlan({ data: { id: plan.id } }),
    onSuccess: () => {
      invalidators.activities.delete(queryClient, { plan });
      onClose();
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || updatePlanMutation.isPending) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [updatePlanMutation.isPending, onClose]);

  return (
    <>
      <div className="mb-4 flex items-center gap-2 justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Back
          </button>
        ) : (
          <h2 id="activities-link-all-title" className="text-lg font-semibold text-zinc-100">
            Edit Workout
          </h2>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      <ActivityElement workout={plan} hideEdit hideNote isCard />

      <form className="space-y-3 mt-2" onSubmit={handleSubmit}>
        {!vendorActivity && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Status</Label>
                <Select
                  name="status"
                  required
                  value={formReducer.formState.values.status}
                  onChange={(e) => formReducer.setField("status", e.target.value as PlanStatus)}
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

            {formReducer.formState.values.kind === "lift" && routineQuery.data && (
              <Field>
                <Label>Routine</Label>
                <Select
                  name="routineId"
                  value={formReducer.formState.values.routineId ?? ""}
                  onChange={(e) => formReducer.setField("routineId", e.target.value ?? null)}
                  isError={isError("routineId")}
                >
                  <option value="">No routine</option>
                  {routineQuery.data.unfoldered.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                  {routineQuery.data.groups.map(({ folder, routines: folderRoutines }) => (
                    <optgroup key={folder.id} label={folder.title}>
                      {folderRoutines.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
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
                      <div key={i} className="flex items-center justify-between gap-2">
                        <p className="text-sm text-zinc-300 min-w-0 truncate">{ex.title}</p>
                        <p className="text-xs text-zinc-500 shrink-0">{setLine}</p>
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
                        formReducer.setField("distanceUnits", e.target.value as CardioDistanceUnit)
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

        <div className="flex flex-wrap justify-between gap-2 border-t border-zinc-800/80 pt-3 mt-3">
          <button
            type="button"
            disabled={deletePlanMutation.isPending || !!plan.vendorActivityId}
            className="text-[11px] text-red-400/90 hover:not-disabled:underline disabled:opacity-50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deletePlanMutation.mutate();
            }}
          >
            {deletePlanMutation.isPending ? "Deleting…" : "Delete plan"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="reset"
              disabled={updatePlanMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                formReducer.reset();
              }}
              className="rounded border border-zinc-700 px-3 h-8 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={updatePlanMutation.isPending}
              className="rounded border border-emerald-600/60 bg-emerald-950/40 px-3 h-8 text-xs font-medium text-emerald-200 hover:bg-emerald-950/65 disabled:opacity-50"
            >
              {updatePlanMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
};
