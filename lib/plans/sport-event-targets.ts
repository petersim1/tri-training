import {
  CARDIO_DISTANCE_UNITS,
  type CardioDistanceUnit,
  PLAN_KIND_VALUES,
  type PlanKind,
} from "../constants/activities";
import type { SportEventTargetSegment } from "../constants/events";

const MAX_SEGMENTS = 24;
const LABEL_CAP = 96;
const SEGMENT_NOTE_CAP = 400;

export const EMPTY_SPORT_EVENT_TARGETS: SportEventTargetSegment[] = [];

function isPlainObject(o: unknown): o is Record<string, unknown> {
  return typeof o === "object" && o !== null && !Array.isArray(o);
}

function unwrapSegmentArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isPlainObject(parsed) && Array.isArray(parsed.segments)) {
    return parsed.segments;
  }
  throw new Error(
    "targets must be a JSON array of segments (or an object with a segments array)",
  );
}

function coerceNonNegativeDistance(raw: unknown, segLabel: string): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${segLabel}distance must be a non-negative number`);
  }
  return n;
}

function coerceOptionalIntSeconds(
  raw: unknown,
  segLabel: string,
): number | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  const t = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(t)) {
    throw new Error(`${segLabel}time_seconds must be a number`);
  }
  const ti = Math.floor(t);
  if (ti < 0) {
    throw new Error(`${segLabel}time_seconds must be non-negative`);
  }
  return ti;
}

/** Safe read from DB/client: legacy `{ segments: [...] }` is accepted (version field ignored). */
export function coerceSportEventTargetsPayload(
  input: unknown,
): SportEventTargetSegment[] {
  if (input === undefined || input === null) {
    return EMPTY_SPORT_EVENT_TARGETS;
  }
  let parsed: unknown = input;
  if (typeof input === "string") {
    const s = input.trim();
    if (s === "") {
      return EMPTY_SPORT_EVENT_TARGETS;
    }
    try {
      parsed = JSON.parse(s) as unknown;
    } catch {
      throw new Error("targets must be valid JSON");
    }
  }

  return normalizeSportEventTargetsArray(parsed);
}

export function normalizeSportEventTargetsArray(
  raw: unknown,
): SportEventTargetSegment[] {
  const segmentsRaw = unwrapSegmentArray(raw);
  if (segmentsRaw.length > MAX_SEGMENTS) {
    throw new Error(`targets may have at most ${MAX_SEGMENTS} segments`);
  }
  return segmentsRaw.map((seg, i) => normalizeSegment(seg, i + 1));
}

function normalizeSegment(raw: unknown, num: number): SportEventTargetSegment {
  const p = `Segment ${num}: `;

  if (!isPlainObject(raw)) {
    throw new Error(`${p}must be an object`);
  }

  const act = raw.activity;
  if (
    typeof act !== "string" ||
    !(PLAN_KIND_VALUES as readonly string[]).includes(act.trim().toLowerCase())
  ) {
    throw new Error(
      `${p}activity must be one of: ${PLAN_KIND_VALUES.join(", ")}`,
    );
  }
  const activity = act.trim().toLowerCase() as PlanKind;

  const labelRaw = raw.label;
  const label =
    labelRaw === undefined || labelRaw === null
      ? null
      : String(labelRaw).trim().slice(0, LABEL_CAP) || null;

  const notesRaw = raw.notes;
  const notes =
    notesRaw === undefined || notesRaw === null
      ? null
      : String(notesRaw).trim().slice(0, SEGMENT_NOTE_CAP) || null;

  const wantsDistance =
    raw.distance !== undefined && raw.distance !== null && raw.distance !== "";

  let distanceN: number | null = null;
  if (wantsDistance) {
    distanceN = coerceNonNegativeDistance(raw.distance, p);
  }

  let units: CardioDistanceUnit | null = null;
  if (
    "distance_units" in raw &&
    raw.distance_units !== undefined &&
    raw.distance_units !== null
  ) {
    const s = String(raw.distance_units).trim().toLowerCase();
    if (!(CARDIO_DISTANCE_UNITS as readonly string[]).includes(s)) {
      throw new Error(
        `${p}distance_units must be one of: ${CARDIO_DISTANCE_UNITS.join(", ")}`,
      );
    }
    units = s as CardioDistanceUnit;
  }

  if (distanceN != null && units === null) {
    throw new Error(`${p}distance_units is required when distance is set`);
  }

  let timeSecondsResolved: number | null | undefined;
  if ("time_seconds" in raw) {
    timeSecondsResolved = coerceOptionalIntSeconds(raw.time_seconds, p) as
      | number
      | null
      | undefined;
  }

  return {
    activity,
    ...(distanceN != null
      ? { distance: distanceN, distance_units: units }
      : {}),
    ...(timeSecondsResolved !== undefined
      ? { time_seconds: timeSecondsResolved ?? null }
      : {}),
    ...(label ? { label } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** Best-effort for briefs / flaky stored JSON. */
export function safeSportEventTargetsFromStored(
  stored: unknown,
): SportEventTargetSegment[] {
  try {
    return coerceSportEventTargetsPayload(stored);
  } catch {
    return EMPTY_SPORT_EVENT_TARGETS;
  }
}
