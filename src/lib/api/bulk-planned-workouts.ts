import {
  CARDIO_DISTANCE_UNITS,
  type CardioDistanceUnit,
} from "../constants/activities";
import type { NewWorkoutEntryRow } from "../db/schema.server";

export type BulkValidationIssue = { index: number; message: string };

function normalizeDistanceUnit(raw: string | null): CardioDistanceUnit | null {
  if (raw === null || raw === "") {
    return null;
  }
  const s = raw.trim().toLowerCase();
  if (s === "") {
    return null;
  }
  if (!CARDIO_DISTANCE_UNITS.includes(s as CardioDistanceUnit)) {
    throw new Error(
      `Invalid distance unit (use ${CARDIO_DISTANCE_UNITS.join(", ")})`,
    );
  }
  return s as CardioDistanceUnit;
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

export const validateAndBuildRow = (
  raw: NewWorkoutEntryRow,
  index: number,
  now: Date,
): NewWorkoutEntryRow | BulkValidationIssue => {
  try {
    const { kind, dayKey } = raw;
    const rv = raw.routineVendor ?? (raw.kind === "lift" ? "hevy" : "strava");

    if (kind === "lift" && rv !== "hevy") {
      return { index, message: 'lift plans must use routineVendor "hevy"' };
    }
    if (kind !== "lift" && rv !== "strava") {
      return {
        index,
        message: 'non-lift plans must use routineVendor "strava"',
      };
    }
    const isLift = kind === "lift";
    const routineId =
      isLift && raw.routineId && raw.routineId.trim() !== ""
        ? raw.routineId.trim()
        : null;

    const cardio = ["swim", "bike", "run"].includes(kind);
    let distance: number | null = null;
    let distanceUnits: CardioDistanceUnit | null = null;
    let timeSeconds: number | null = null;
    try {
      distance =
        cardio && raw.distance ? normalizeOptionalDistance(raw.distance) : null;
      distanceUnits =
        cardio && raw.distanceUnits
          ? normalizeDistanceUnit(raw.distanceUnits)
          : null;
      timeSeconds =
        cardio && raw.timeSeconds
          ? normalizeOptionalTimeSeconds(raw.timeSeconds)
          : null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid distance/time";
      return { index, message: msg };
    }

    return {
      id: crypto.randomUUID(),
      kind,
      dayKey,
      notes: raw.notes,
      status: "planned",
      routineVendor: rv,
      routineId,
      vendorActivityId: null,
      distance,
      distanceUnits,
      timeSeconds,
      createdAt: now,
      updatedAt: now,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid row";
    return { index, message: msg };
  }
};
