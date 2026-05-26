import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useState } from "react";
import { PLAN_KIND_VALUES, type PlanKind } from "@/lib/constants/activities";
import type {
  CompletedWorkoutRow,
  PlannedWorkoutWithCompleted,
} from "@/lib/db/schema.server";
import queryKeys from "@/lib/query-keys";
import { activityActions, dayActions, weightActions } from "@/server-fcts";
import type {
  CreateFromCompletedInput,
  CreatePlanInput,
  UpdatePlanInput,
} from "@/types/requests/activities";
import type { DayItem } from "@/types/responses/activities";
import { ActivityElement } from "../views/activities/element";

export const ActivityModal: React.FC<{
  dayKey: string;
  timeZone: string;
  onClose: () => void;
}> = ({ dayKey, timeZone, onClose }) => {
  const [step, setStep] = useState<"summary" | "add" | "routine">("summary");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

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

  const selectedPlan =
    data?.activities.find((a) => a.id === selectedPlanId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default border-0 bg-black/60 p-0"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-dialog-title"
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
      >
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
              setStep("routine");
            }}
          />
        ) : step === "add" ? (
          <AddModal
            dayKey={dayKey}
            onClose={onClose}
            onBack={() => setStep("summary")}
          />
        ) : step === "routine" && selectedPlan ? (
          <RoutineModal
            dayKey={dayKey}
            plan={selectedPlan}
            linkCandidates={data.linkCandidates}
            onClose={onClose}
            onBack={() => setStep("summary")}
          />
        ) : null}
      </div>
    </div>
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
    mutationFn: (completedWorkoutId: string) =>
      activityActions.createFromCompleted({
        data: { dayKey, completedWorkoutId },
      }),
    onSuccess: () => {
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
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPlan(p.id)}
                    className="block w-full rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-sm text-zinc-200 hover:border-zinc-600"
                  >
                    <span className="capitalize text-zinc-100">{p.kind}</span>
                    <span className="text-zinc-500"> · {p.status}</span>
                    {p.notes?.trim() && (
                      <p className="mt-1.5 whitespace-pre-wrap text-left text-xs leading-snug text-zinc-500">
                        {p.notes.trim()}
                      </p>
                    )}
                  </button>
                </li>
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
                  hideNote={!!p.completedWorkout}
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
              {data.linkCandidates.map((cw) => (
                <li
                  key={cw.id}
                  className="rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2"
                >
                  <div className="text-sm text-zinc-100 capitalize">
                    {cw.activityKind}
                  </div>
                  <div className="mt-0.5 text-xs capitalize text-zinc-500">
                    {cw.vendor}
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={createFromCompletedMutation.isPending}
                      onClick={() => createFromCompletedMutation.mutate(cw.id)}
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
          className="w-full rounded border border-zinc-600 bg-zinc-900/50 px-3 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
        >
          Add plan
        </button>
      </div>

      <div className="border-t border-zinc-800 pt-4">
        <form
          className="flex w-full min-w-0 flex-nowrap items-stretch gap-2"
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
          <span className="shrink-0 self-center text-xs text-zinc-500">
            Weight
          </span>
          <div className="relative min-w-0 flex-1">
            <input
              name="weight"
              type="number"
              step="0.1"
              min="0"
              required
              inputMode="decimal"
              autoComplete="off"
              defaultValue={data.weight?.toFixed(1) ?? ""}
              aria-label="Weight in pounds"
              className="w-full min-w-0 rounded border border-zinc-700 bg-zinc-950 py-1.5 pr-7 pl-2 text-sm tabular-nums text-zinc-100 placeholder:text-zinc-600"
            />
            <span
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-zinc-500"
              aria-hidden
            >
              lb
            </span>
          </div>
          <button
            type="submit"
            disabled={setWeightMutation.isPending}
            className="shrink-0 rounded border border-emerald-600 bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {setWeightMutation.isPending ? "…" : "Save"}
          </button>
          {data.weight != null && (
            <button
              type="button"
              disabled={
                clearWeightMutation.isPending || setWeightMutation.isPending
              }
              className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
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
  const [planErr, setPlanErr] = useState<string | null>(null);

  const dialogTitle = new Date(`${dayKey}T12:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  );

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

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPlanErr(null);
          const fd = new FormData(e.currentTarget);
          const kind = String(fd.get("kind") ?? "") as PlanKind;
          if (!PLAN_KIND_VALUES.includes(kind)) {
            setPlanErr("Choose a type.");
            return;
          }
          createPlanMutation.mutate({
            kind,
            dayKey,
            notes: String(fd.get("notes") ?? "").trim() || undefined,
          });
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm text-zinc-400">Type</span>
          <select
            name="kind"
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
          >
            <option value="" disabled>
              Select type
            </option>
            {PLAN_KIND_VALUES.map((k) => (
              <option key={k} value={k} className="capitalize">
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-400">Notes</span>
          <textarea
            name="notes"
            rows={3}
            placeholder="Optional"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        {planErr && <p className="text-sm text-red-400">{planErr}</p>}
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

const RoutineModal: React.FC<{
  dayKey: string;
  plan: PlannedWorkoutWithCompleted;
  linkCandidates: CompletedWorkoutRow[];
  onClose: () => void;
  onBack: () => void;
}> = ({ dayKey, plan, linkCandidates, onClose, onBack }) => {
  const queryClient = useQueryClient();
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [notes, setNotes] = useState(plan.notes ?? "");

  const dialogTitle = new Date(`${dayKey}T12:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  );

  const updatePlanMutation = useMutation({
    mutationFn: (data: UpdatePlanInput) => activityActions.update({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dayDetails(dayKey) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    },
    onError: (e) =>
      setPlanErr(e instanceof Error ? e.message : "Update failed"),
  });

  const createFromCompletedMutation = useMutation({
    mutationFn: (data: CreateFromCompletedInput) =>
      activityActions.createFromCompleted({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dayDetails(dayKey) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["weight-viz"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
    },
    onError: (e) =>
      setPlanErr(e instanceof Error ? e.message : "Update failed"),
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

  const candidatesForPlan = linkCandidates.filter((cw) => {
    if (plan.kind === "lift") return cw.vendor === "hevy";
    return cw.vendor === "strava";
  });

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

      {planErr && <p className="mb-2 text-sm text-red-400">{planErr}</p>}

      <ActivityElement workout={plan} hideEdit hideNote hideDate />

      <div className="mb-2">
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">Notes</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
      </div>

      <div className="mt-4 border-t border-zinc-800 pt-2.5 flex justify-between">
        <button
          type="button"
          disabled={deletePlanMutation.isPending || !!plan.completedWorkoutId}
          className="text-[11px] text-red-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deletePlanMutation.mutate();
          }}
        >
          {deletePlanMutation.isPending ? "Deleting…" : "Delete plan"}
        </button>
        <button
          type="button"
          disabled={updatePlanMutation.isPending}
          className="text-[11px] text-emerald-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            updatePlanMutation.mutate({ id: plan.id, notes });
          }}
        >
          {updatePlanMutation.isPending ? "Saving…" : "Save notes"}
        </button>
      </div>
    </>
  );
};
