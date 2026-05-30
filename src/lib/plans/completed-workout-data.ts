import type {
  TypedVendorWorkoutRow,
  VendorActivityRow,
} from "../db/schema.server";
import { durationSecondsFromIsoRange, toIsoDate } from "../utils/dates";

/**
 * Stored normalized sport (`activity_kind`): Strava `sport_type` lowercased, or `lift` for Hevy.
 * Falls back to JSON for legacy rows if needed.
 */
/** ISO start instant from stored vendor JSON (UTC timestamps from APIs). */
export function completedWorkoutStartIso(c: VendorActivityRow): string | null {
  const typedActivity = c as TypedVendorWorkoutRow;
  if (typedActivity.vendor === "strava") {
    return typedActivity.data.start_date;
  }
  if (typedActivity.vendor === "hevy") {
    return typedActivity.data.start_time;
  }
  return null;
}

/** Like `completedWorkoutLocalDayKey`, but for a specific IANA timezone (e.g. from the browser). */
export function completedWorkoutLocalDayKeyInTimeZone(
  c: VendorActivityRow,
  timeZone: string,
): string | null {
  const iso = completedWorkoutStartIso(c);
  return iso ? toIsoDate(new Date(iso), timeZone) : null;
}

export function completedWorkoutTitle(c: VendorActivityRow): string | null {
  const typedActivity = c as TypedVendorWorkoutRow;
  if (typedActivity.vendor === "strava") {
    return typedActivity.data.name.trim();
  }
  if (typedActivity.vendor === "hevy") {
    return typedActivity.data.title.trim();
  }
  return null;
}

export function completedWorkoutDistanceM(c: VendorActivityRow): number | null {
  const typedActivity = c as TypedVendorWorkoutRow;
  if (typedActivity.vendor === "strava") {
    return typedActivity.data.distance;
  }
  return null;
}

export function completedWorkoutMovingSeconds(
  c: VendorActivityRow,
): number | null {
  const typedActivity = c as TypedVendorWorkoutRow;

  if (typedActivity.vendor === "strava") {
    return typedActivity.data.moving_time;
  }
  if (typedActivity.vendor === "hevy") {
    return durationSecondsFromIsoRange(
      typedActivity.data.start_time,
      typedActivity.data.end_time,
    );
  }
  return null;
}

function completedWorkoutCalories(c: VendorActivityRow): number | null {
  const typedActivity = c as TypedVendorWorkoutRow;
  if (typedActivity.vendor === "strava") {
    return typedActivity.data.calories ?? null;
  }
  return null;
}

/** Strava-only; BPM when the activity JSON includes HR. */
export function completedWorkoutAverageHeartrateBpm(
  c: VendorActivityRow,
): number | null {
  const typedActivity = c as TypedVendorWorkoutRow;
  if (typedActivity.vendor === "strava") {
    return typedActivity.data.average_heartrate ?? null;
  }
  return null;
}

const MAX_PLANNER_LIFT_EXERCISES = 14;
const MAX_PLANNER_LIFT_SETS_PER_EXERCISE = 10;

/** Compact Hevy lift lines for planning / tooling (movement + set previews). */
export function completedWorkoutHevyLiftExerciseLinesPlanner(
  c: VendorActivityRow,
): string[] {
  const typedActivity = c as TypedVendorWorkoutRow;
  if (typedActivity.vendor === "strava") {
    return [];
  }

  const exercises = typedActivity.data.exercises;
  if (!Array.isArray(exercises)) {
    return [];
  }
  const out: string[] = [];
  for (const exercise of exercises) {
    if (out.length >= MAX_PLANNER_LIFT_EXERCISES) {
      break;
    }

    const labelRaw = exercise.title.trim();
    const label = labelRaw || "Exercise";

    const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    const parts: string[] = [];
    for (const setObj of sets) {
      if (parts.length >= MAX_PLANNER_LIFT_SETS_PER_EXERCISE) {
        break;
      }
      const reps = setObj.reps ?? Number.NaN;
      if (!Number.isFinite(reps) || reps <= 0) {
        continue;
      }
      const kg = setObj.weight_kg ?? Number.NaN;
      if (kg != null && Number.isFinite(kg) && kg > 0) {
        const k = Math.round(kg * 10) / 10;
        parts.push(`${reps}@${k}kg`);
      } else {
        parts.push(`${reps} reps BW`);
      }
    }
    const detail =
      parts.length > 0
        ? `${parts.join(", ")}${sets.length > parts.length ? ", …" : ""}`
        : sets.length > 0
          ? `${sets.length} sets`
          : "";
    const line = detail !== "" ? `${label}: ${detail}` : label;
    out.push(line.length > 200 ? `${line.slice(0, 199)}…` : line);
  }
  return out;
}

/**
 * Hevy `data.exercises[].sets[]`: each set has `reps` and optional `weight_kg`.
 * Bodyweight sets (`weight_kg` null) use `surrogateBodyWeightKg` when provided; otherwise skipped.
 * Returns Σ (effective kg × reps), or null if nothing countable.
 */
export function completedWorkoutHevyLiftVolumeKgReps(
  c: VendorActivityRow,
  surrogateBodyWeightKg: number | null,
): number | null {
  const typedActivity = c as TypedVendorWorkoutRow;
  if (typedActivity.vendor === "strava") {
    return null;
  }
  let total = 0;
  let any = false;
  for (const ex of typedActivity.data.exercises) {
    for (const s of ex.sets) {
      const reps = s.reps ?? Number.NaN;
      if (!Number.isFinite(reps) || reps <= 0) {
        continue;
      }
      const wRaw = s.weight_kg;
      let kg: number | null = null;
      if (wRaw == null) {
        kg = surrogateBodyWeightKg;
      } else if (typeof wRaw === "number" && Number.isFinite(wRaw)) {
        kg = wRaw;
      } else if (typeof wRaw === "string") {
        const p = Number.parseFloat(wRaw);
        kg = Number.isFinite(p) ? p : null;
      }
      if (kg == null || !Number.isFinite(kg) || kg < 0) {
        continue;
      }
      any = true;
      total += kg * reps;
    }
  }
  return any ? total : null;
}

/** One-line distance · duration · kcal · (Strava avg HR | Hevy volume) for list UI. */
export function formatCompletedSessionBrief(
  c: VendorActivityRow,
  opts?: { surrogateBodyWeightKg?: number | null },
): string | null {
  const dist = completedWorkoutDistanceM(c);
  const distLabel =
    dist != null && Number.isFinite(dist)
      ? dist >= 1000
        ? `${(dist / 1000).toFixed(2)} km`
        : `${Math.round(dist)} m`
      : null;
  const durSec = completedWorkoutMovingSeconds(c);
  let dur: string | null = null;
  if (durSec != null && Number.isFinite(durSec)) {
    const s = Math.floor(durSec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    dur =
      h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${m}:${String(sec).padStart(2, "0")}`;
  }
  const kcalRaw = completedWorkoutCalories(c);
  const kcal =
    kcalRaw != null && Number.isFinite(kcalRaw) ? Math.round(kcalRaw) : null;
  const parts: string[] = [];
  if (distLabel) {
    parts.push(distLabel);
  }
  if (dur) {
    parts.push(dur);
  }
  if (kcal != null) {
    parts.push(`${kcal} kcal`);
  }
  if (c.vendor === "strava") {
    const hr = completedWorkoutAverageHeartrateBpm(c);
    if (hr != null && Number.isFinite(hr)) {
      parts.push(`${Math.round(hr)} bpm avg`);
    }
  } else if (c.vendor === "hevy") {
    const vol = completedWorkoutHevyLiftVolumeKgReps(
      c,
      opts?.surrogateBodyWeightKg ?? null,
    );
    if (vol != null && Number.isFinite(vol) && vol > 0) {
      parts.push(`${Math.round(vol).toLocaleString()} kg×reps`);
    }
  }
  return parts.length === 0 ? null : parts.join(" · ");
}
