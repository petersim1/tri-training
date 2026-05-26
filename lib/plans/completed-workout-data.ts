import type { PlanKind } from "../constants/activities";
import type {
  CompletedActivityKind,
  StravaSportTypeLowercase,
} from "../constants/vendors";
import type { CompletedWorkoutRow, JsonValue } from "../db/schema.server";
import type {
  HevyExerciseSummary,
  HevySetSummary,
  HevyWorkoutSummary,
} from "../hevy/types";
import type { StravaActivitySummary } from "../strava/types";
import { durationSecondsFromIsoRange, toIsoDate } from "../utils/dates";

/** Full vendor payload as stored in `completed_workouts.data` (JSON). */
export type CompletedWorkoutJson =
  | StravaActivitySummary
  | HevyWorkoutSummary
  | Record<string, unknown>;

export function stravaDataFromActivitySummary(
  a: StravaActivitySummary,
): JsonValue {
  return JSON.parse(JSON.stringify(a)) as JsonValue;
}

export function hevyDataFromWorkoutSummary(w: HevyWorkoutSummary): JsonValue {
  return JSON.parse(JSON.stringify(w)) as JsonValue;
}

function asStravaData(data: unknown): StravaActivitySummary | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== "number" && typeof id !== "string") {
    return null;
  }
  return data as StravaActivitySummary;
}

function asHevyData(data: unknown): HevyWorkoutSummary | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  return data as HevyWorkoutSummary;
}

/**
 * Stored normalized sport (`activity_kind`): Strava `sport_type` lowercased, or `lift` for Hevy.
 * Falls back to JSON for legacy rows if needed.
 */
/** ISO start instant from stored vendor JSON (UTC timestamps from APIs). */
export function completedWorkoutStartIso(
  c: CompletedWorkoutRow,
): string | null {
  if (c.vendor === "strava") {
    const a = asStravaData(c.data);
    const iso = a?.start_date;
    return typeof iso === "string" && iso.trim() !== "" ? iso : null;
  }
  const w = asHevyData(c.data);
  const iso = w?.start_time;
  return typeof iso === "string" && iso.trim() !== "" ? iso : null;
}

/** Like `completedWorkoutLocalDayKey`, but for a specific IANA timezone (e.g. from the browser). */
export function completedWorkoutLocalDayKeyInTimeZone(
  c: CompletedWorkoutRow,
  timeZone: string,
): string | null {
  const iso = completedWorkoutStartIso(c);
  return iso ? toIsoDate(new Date(iso), timeZone) : null;
}

export const activityKindToPlanKind = (
  a: CompletedActivityKind,
): PlanKind | null => {
  switch (a) {
    case "run":
    case "trailrun":
    case "virtualrun":
      return "run";

    case "ride":
    case "ebikeride":
    case "gravelride":
    case "mountainbikeride":
    case "emountainbikeride":
    case "virtualride":
      return "bike";

    case "swim":
      return "swim";

    case "weighttraining":
    case "crossfit":
    case "highintensityintervaltraining":
    case "workout":
    case "lift": // from hevy specifically.
      return "lift";

    case "yoga":
      return "recovery";

    // case "walk":
    // case "hike":
    // case "pilates":
    // case "elliptical":
    // case "stairstepper":
    // case "rowing":
    // case "virtualrow":
    //   return "recovery";

    default:
      return null;
  }
};

export const stravaSportTypeToPlanKind = (
  sportType: string,
): PlanKind | null => {
  const lcase = sportType.toLowerCase() as StravaSportTypeLowercase;
  return activityKindToPlanKind(lcase);
};

export function completedWorkoutTitle(c: CompletedWorkoutRow): string | null {
  const data = c.data;
  if (c.vendor === "strava") {
    const a = asStravaData(data);
    const n = a?.name?.trim();
    return n ? n : null;
  }
  const w = asHevyData(data);
  const t = w?.title?.trim();
  return t ? t : null;
}

export function completedWorkoutDistanceM(
  c: CompletedWorkoutRow,
): number | null {
  if (c.vendor !== "strava") {
    return null;
  }
  const a = asStravaData(c.data);
  const d = a?.distance;
  return d != null && Number.isFinite(d) ? d : null;
}

export function completedWorkoutMovingSeconds(
  c: CompletedWorkoutRow,
): number | null {
  if (c.vendor === "strava") {
    const a = asStravaData(c.data);
    const m = a?.moving_time;
    return m != null && Number.isFinite(m) ? Math.floor(Number(m)) : null;
  }
  const w = asHevyData(c.data);
  const fromRange = durationSecondsFromIsoRange(w?.start_time, w?.end_time);
  if (fromRange != null) {
    return fromRange;
  }
  return null;
}

export function completedWorkoutCalories(
  c: CompletedWorkoutRow,
): number | null {
  if (c.vendor !== "strava") {
    return null;
  }
  const a = asStravaData(c.data);
  const cal = a?.calories;
  return cal != null && Number.isFinite(cal) ? cal : null;
}

/** Strava-only; BPM when the activity JSON includes HR. */
export function completedWorkoutAverageHeartrateBpm(
  c: CompletedWorkoutRow,
): number | null {
  if (c.vendor !== "strava") {
    return null;
  }
  const a = asStravaData(c.data);
  const hr = a?.average_heartrate;
  return hr != null && Number.isFinite(hr) && Number(hr) > 0
    ? Number(hr)
    : null;
}

const MAX_PLANNER_LIFT_EXERCISES = 14;
const MAX_PLANNER_LIFT_SETS_PER_EXERCISE = 10;

/** Compact Hevy lift lines for planning / tooling (movement + set previews). */
export function completedWorkoutHevyLiftExerciseLinesPlanner(
  c: CompletedWorkoutRow,
): string[] {
  if (c.vendor !== "hevy") {
    return [];
  }
  const w = asHevyData(c.data);
  const exercises = w?.exercises;
  if (!Array.isArray(exercises)) {
    return [];
  }
  const out: string[] = [];
  for (const raw of exercises) {
    if (out.length >= MAX_PLANNER_LIFT_EXERCISES) {
      break;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const ex = raw as HevyExerciseSummary & Record<string, unknown>;
    const labelRaw =
      (typeof ex.title === "string" && ex.title.trim()) ||
      (typeof ex.name === "string" && ex.name.trim()) ||
      "";
    const label = labelRaw || "Exercise";

    const sets = Array.isArray(ex.sets) ? ex.sets : [];
    const parts: string[] = [];
    for (const setObj of sets) {
      if (parts.length >= MAX_PLANNER_LIFT_SETS_PER_EXERCISE) {
        break;
      }
      if (!setObj || typeof setObj !== "object" || Array.isArray(setObj)) {
        continue;
      }
      const s = setObj as HevySetSummary;
      const repsRaw = s.reps;
      const reps =
        typeof repsRaw === "number"
          ? repsRaw
          : typeof repsRaw === "string"
            ? Number.parseInt(repsRaw, 10)
            : Number.NaN;
      if (!Number.isFinite(reps) || reps <= 0) {
        continue;
      }
      const wRaw = s.weight_kg;
      const kg =
        typeof wRaw === "number" && Number.isFinite(wRaw) ? wRaw : Number.NaN;
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

const LB_TO_KG = 0.45359237;

/** Strongest scale reading in the diary (lb → kg) — used as load for Hevy bodyweight sets. */
export function maxSelfRecordedWeightKgFromLbEntries(
  entries: readonly { weightLb: number }[],
): number | null {
  if (entries.length === 0) {
    return null;
  }
  const m = Math.max(...entries.map((e) => e.weightLb));
  if (!Number.isFinite(m) || m <= 0) {
    return null;
  }
  return m * LB_TO_KG;
}

/**
 * Hevy `data.exercises[].sets[]`: each set has `reps` and optional `weight_kg`.
 * Bodyweight sets (`weight_kg` null) use `surrogateBodyWeightKg` when provided; otherwise skipped.
 * Returns Σ (effective kg × reps), or null if nothing countable.
 */
export function completedWorkoutHevyLiftVolumeKgReps(
  c: CompletedWorkoutRow,
  surrogateBodyWeightKg: number | null,
): number | null {
  if (c.vendor !== "hevy") {
    return null;
  }
  const w = asHevyData(c.data);
  const exercises = w?.exercises;
  if (!Array.isArray(exercises)) {
    return null;
  }
  let total = 0;
  let any = false;
  for (const ex of exercises) {
    if (!ex || typeof ex !== "object") {
      continue;
    }
    const sets = ex.sets;
    if (!Array.isArray(sets)) {
      continue;
    }
    for (const s of sets) {
      if (!s || typeof s !== "object") {
        continue;
      }
      const repsRaw = s.reps;
      const reps =
        typeof repsRaw === "number"
          ? repsRaw
          : typeof repsRaw === "string"
            ? Number.parseInt(repsRaw, 10)
            : Number.NaN;
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
  c: CompletedWorkoutRow,
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
