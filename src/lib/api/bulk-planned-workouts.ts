import { getDb } from "~/lib/db";
import {
  type PlanKind,
  plannedWorkouts,
  WORKOUT_VENDORS,
  type WorkoutVendor,
} from "~/lib/db/schema";
import {
  CARDIO_DISTANCE_UNITS,
  isCardioKind,
  type CardioDistanceUnit,
} from "~/lib/plans/cardio-targets";
import { isValidDayKey } from "~/lib/plans/day-key";

const PLAN_KINDS = [
  "lift",
  "run",
  "bike",
  "swim",
  "recovery",
] as const satisfies readonly PlanKind[];

const MAX_BATCH = 1000;

/** Parsed, typed row ready for business-rule validation and insert. */
export type PlannedWorkoutBulkItem = {
  kind: PlanKind;
  dayKey: string;
  notes: string | null;
  /** Omitted in JSON → derived from `kind` (lift → hevy, else strava). */
  routineVendor: WorkoutVendor | null;
  routineId: string | null;
  distance: number | null;
  distanceUnits: string | null;
  timeSeconds: number | null;
};

export type BulkPlannedWorkoutsBody = {
  plannedWorkouts: PlannedWorkoutBulkItem[];
};

export type BulkValidationIssue = { index: number; message: string };

function isPlanKind(v: unknown): v is PlanKind {
  return (
    typeof v === "string" &&
    (PLAN_KINDS as readonly string[]).includes(v)
  );
}

function isWorkoutVendor(v: unknown): v is WorkoutVendor {
  return (
    typeof v === "string" &&
    (WORKOUT_VENDORS as readonly string[]).includes(v)
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseOptionalNullableString(
  v: unknown,
  index: number,
  field: string,
): { ok: true; value: string | null } | { ok: false; issue: BulkValidationIssue } {
  if (v === undefined || v === null) {
    return { ok: true, value: null };
  }
  if (typeof v !== "string") {
    return {
      ok: false,
      issue: { index, message: `${field} must be a string or null` },
    };
  }
  const t = v.trim();
  return { ok: true, value: t === "" ? null : t };
}

function parseOptionalNullableNumber(
  v: unknown,
  index: number,
  field: string,
): { ok: true; value: number | null } | { ok: false; issue: BulkValidationIssue } {
  if (v === undefined || v === null) {
    return { ok: true, value: null };
  }
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return {
      ok: false,
      issue: { index, message: `${field} must be a finite number or null` },
    };
  }
  return { ok: true, value: v };
}

/**
 * Parse and narrow `unknown` JSON to a typed body. All field shapes are validated before insert logic runs.
 */
export function parseBulkPlannedWorkoutsBody(body: unknown):
  | { ok: true; data: BulkPlannedWorkoutsBody }
  | { ok: false; error: string; issues: BulkValidationIssue[] } {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      error: "Body must be a JSON object",
      issues: [],
    };
  }
  const rawList = body.plannedWorkouts;
  if (!Array.isArray(rawList)) {
    return {
      ok: false,
      error: "plannedWorkouts must be an array",
      issues: [],
    };
  }
  if (rawList.length === 0) {
    return {
      ok: false,
      error: "plannedWorkouts must not be empty",
      issues: [],
    };
  }
  if (rawList.length > MAX_BATCH) {
    return {
      ok: false,
      error: `At most ${MAX_BATCH} rows per request`,
      issues: [],
    };
  }

  const items: PlannedWorkoutBulkItem[] = [];
  const issues: BulkValidationIssue[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const el = rawList[i];
    if (!isPlainObject(el)) {
      issues.push({
        index: i,
        message: "Each item must be a JSON object",
      });
      continue;
    }

    const kindRaw = el.kind;
    if (kindRaw === undefined) {
      issues.push({ index: i, message: "Missing required field \"kind\"" });
      continue;
    }
    if (!isPlanKind(kindRaw)) {
      issues.push({
        index: i,
        message: `kind must be one of: ${PLAN_KINDS.join(", ")}`,
      });
      continue;
    }
    const kind = kindRaw;

    const dayKeyRaw = el.dayKey;
    if (dayKeyRaw === undefined) {
      issues.push({ index: i, message: "Missing required field \"dayKey\"" });
      continue;
    }
    if (typeof dayKeyRaw !== "string") {
      issues.push({ index: i, message: "dayKey must be a string" });
      continue;
    }
    const dayKey = dayKeyRaw.trim();
    if (!isValidDayKey(dayKey)) {
      issues.push({
        index: i,
        message: "dayKey must be a valid calendar date (YYYY-MM-DD)",
      });
      continue;
    }

    const rvRaw = el.routineVendor;
    let routineVendor: WorkoutVendor | null = null;
    if (rvRaw !== undefined && rvRaw !== null) {
      if (typeof rvRaw !== "string") {
        issues.push({ index: i, message: "routineVendor must be a string" });
        continue;
      }
      const rvNorm = rvRaw.trim().toLowerCase();
      if (rvNorm === "") {
        routineVendor = null;
      } else if (!isWorkoutVendor(rvNorm)) {
        issues.push({
          index: i,
          message: `routineVendor must be one of: ${WORKOUT_VENDORS.join(", ")}`,
        });
        continue;
      } else {
        routineVendor = rvNorm;
      }
    }

    const notesP = parseOptionalNullableString(el.notes, i, "notes");
    if (!notesP.ok) {
      issues.push(notesP.issue);
      continue;
    }

    const routineIdP = parseOptionalNullableString(
      el.routineId,
      i,
      "routineId",
    );
    if (!routineIdP.ok) {
      issues.push(routineIdP.issue);
      continue;
    }

    const distanceP = parseOptionalNullableNumber(el.distance, i, "distance");
    if (!distanceP.ok) {
      issues.push(distanceP.issue);
      continue;
    }

    const duP = parseOptionalNullableString(
      el.distanceUnits,
      i,
      "distanceUnits",
    );
    if (!duP.ok) {
      issues.push(duP.issue);
      continue;
    }
    let distanceUnits: string | null = duP.value;
    if (distanceUnits !== null) {
      const u = distanceUnits.trim().toLowerCase();
      if (
        !CARDIO_DISTANCE_UNITS.includes(u as CardioDistanceUnit)
      ) {
        issues.push({
          index: i,
          message: `distanceUnits must be one of: ${CARDIO_DISTANCE_UNITS.join(", ")}`,
        });
        continue;
      }
      distanceUnits = u;
    }

    const timeP = parseOptionalNullableNumber(
      el.timeSeconds,
      i,
      "timeSeconds",
    );
    if (!timeP.ok) {
      issues.push(timeP.issue);
      continue;
    }

    items.push({
      kind,
      dayKey,
      notes: notesP.value,
      routineVendor,
      routineId: routineIdP.value,
      distance: distanceP.value,
      distanceUnits,
      timeSeconds:
        timeP.value === null ? null : Math.floor(timeP.value),
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: "Validation failed",
      issues,
    };
  }

  return { ok: true, data: { plannedWorkouts: items } };
}

function normalizeDistanceUnit(raw: string | null): string | null {
  if (raw === null || raw === "") {
    return null;
  }
  const s = raw.trim().toLowerCase();
  if (s === "") {
    return null;
  }
  if (
    !CARDIO_DISTANCE_UNITS.includes(s as CardioDistanceUnit)
  ) {
    throw new Error(
      `Invalid distance unit (use ${CARDIO_DISTANCE_UNITS.join(", ")})`,
    );
  }
  return s;
}

function normalizeOptionalDistance(raw: number | null): number | null {
  if (raw === null || Number.isNaN(raw)) {
    return null;
  }
  if (raw < 0) {
    throw new Error("Distance must be non-negative");
  }
  return raw;
}

function normalizeOptionalTimeSeconds(raw: number | null): number | null {
  if (raw === null || Number.isNaN(raw)) {
    return null;
  }
  const t = Math.floor(raw);
  if (t < 0) {
    throw new Error("Time must be non-negative");
  }
  return t;
}

function validateAndBuildRow(
  raw: PlannedWorkoutBulkItem,
  index: number,
  now: Date,
): { row: typeof plannedWorkouts.$inferInsert } | BulkValidationIssue {
  try {
    const { kind, dayKey } = raw;
    const rv =
      raw.routineVendor ??
      (raw.kind === "lift" ? "hevy" : "strava");

    if (kind === "lift" && rv !== "hevy") {
      return { index, message: "lift plans must use routineVendor \"hevy\"" };
    }
    if (kind !== "lift" && rv !== "strava") {
      return {
        index,
        message: "non-lift plans must use routineVendor \"strava\"",
      };
    }
    const isLift = kind === "lift";
    const routineId =
      isLift && raw.routineId && raw.routineId.trim() !== ""
        ? raw.routineId.trim()
        : null;

    const cardio = isCardioKind(kind);
    let distance: number | null = null;
    let distanceUnits: string | null = null;
    let timeSeconds: number | null = null;
    try {
      distance = cardio
        ? normalizeOptionalDistance(raw.distance)
        : null;
      distanceUnits = cardio
        ? normalizeDistanceUnit(raw.distanceUnits)
        : null;
      timeSeconds = cardio
        ? normalizeOptionalTimeSeconds(raw.timeSeconds)
        : null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid distance/time";
      return { index, message: msg };
    }

    return {
      row: {
        id: crypto.randomUUID(),
        kind,
        dayKey,
        notes: raw.notes,
        status: "planned",
        routineVendor: rv,
        routineId,
        completedWorkoutId: null,
        distance,
        distanceUnits,
        timeSeconds,
        createdAt: now,
        updatedAt: now,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid row";
    return { index, message: msg };
  }
}

export async function bulkInsertPlannedWorkoutsFromItems(
  list: PlannedWorkoutBulkItem[],
): Promise<
  | { ok: true; insertedIds: string[] }
  | { ok: false; error: string; issues: BulkValidationIssue[] }
> {
  if (list.length === 0) {
    return {
      ok: false,
      error: "No workouts to insert",
      issues: [],
    };
  }
  if (list.length > MAX_BATCH) {
    return {
      ok: false,
      error: `At most ${MAX_BATCH} rows per request`,
      issues: [],
    };
  }

  const now = new Date();
  const issues: BulkValidationIssue[] = [];
  const rows: (typeof plannedWorkouts.$inferInsert)[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item === undefined) {
      continue;
    }
    const built = validateAndBuildRow(item, i, now);
    if ("message" in built) {
      issues.push(built);
      continue;
    }
    rows.push(built.row);
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: "Validation failed",
      issues,
    };
  }

  const db = getDb();

  try {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx.insert(plannedWorkouts).values(row).run();
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insert failed";
    return {
      ok: false,
      error: msg,
      issues: [],
    };
  }

  return { ok: true, insertedIds: rows.map((r) => r.id) };
}

export async function bulkInsertPlannedWorkoutsFromApi(
  body: unknown,
): Promise<
  | { ok: true; insertedIds: string[] }
  | { ok: false; error: string; issues: BulkValidationIssue[] }
> {
  const parsed = parseBulkPlannedWorkoutsBody(body);
  if (!parsed.ok) {
    return parsed;
  }
  return bulkInsertPlannedWorkoutsFromItems(parsed.data.plannedWorkouts);
}
