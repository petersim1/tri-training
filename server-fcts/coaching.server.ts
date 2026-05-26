import { eq } from "drizzle-orm";
import {
  PATCH_TOP_KEYS,
  PLAN_EPHEMERAL_TOP_KEYS,
  WEEKDAYS_LOWER,
} from "@/lib/constants/coaching";
import { getDb } from "@/lib/db/index.server";
import {
  type CoachingStateRow,
  coachingState,
  type JsonValue,
} from "@/lib/db/schema.server";

export async function getCoachingStateRow(
  athleteId: string,
): Promise<CoachingStateRow | undefined> {
  const db = await getDb();
  return db
    .select()
    .from(coachingState)
    .where(eq(coachingState.id, athleteId))
    .get();
}

/** Inserts a row with empty JSON blobs; no-op if PK already exists (migration seed etc.). */
export async function ensureCoachingStateRow(athleteId: string): Promise<void> {
  const now = new Date();
  const db = await getDb();
  await db
    .insert(coachingState)
    .values({
      id: athleteId,
      createdAt: now,
      updatedAt: now,
      constraints: [],
      preferences: {} as JsonValue,
      disciplineState: {} as JsonValue,
      periodization: {} as JsonValue,
      flags: {} as JsonValue,
    })
    .onConflictDoNothing({ target: coachingState.id })
    .run();
}

function stripEphemeralPlannerFromJsonBlob(
  value: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(value)) {
    const kl = k.toLowerCase();
    if (PLAN_EPHEMERAL_TOP_KEYS.has(kl)) {
      continue;
    }
    if (looksLikeWeekdayWorkoutProposalMap(v)) {
      continue;
    }
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const nested = stripEphemeralPlannerFromJsonBlob(
        v as Record<string, JsonValue>,
      );
      if (Object.keys(nested).length > 0) {
        out[k] = nested as JsonValue;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}

function workoutProposalDaySlotShape(v: JsonValue): boolean {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return false;
  }
  const o = v as Record<string, unknown>;
  return typeof o.activity === "string";
}

/** Typical assistant “Mon–Sun schedule” payloads nested under arbitrary keys or mislabeled blobs. */
function looksLikeWeekdayWorkoutProposalMap(v: JsonValue): boolean {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return false;
  }
  const o = v as Record<string, JsonValue>;
  const keys = Object.keys(o);
  if (keys.length < 4) {
    return false;
  }
  let weekdays = 0;
  let slotLike = 0;
  for (const key of keys) {
    if (!WEEKDAYS_LOWER.has(key.toLowerCase())) {
      continue;
    }
    weekdays++;
    if (workoutProposalDaySlotShape(o[key])) {
      slotLike++;
    }
  }
  return weekdays >= 4 && slotLike >= weekdays - 1;
}

function sanitizeShallowMergedPatchBucket(
  v: unknown,
): Record<string, JsonValue> | null {
  const o = asJsonObject(v as JsonValue);
  const cleaned = stripEphemeralPlannerFromJsonBlob(o);
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

/** Drop calendar proposals / weekday schedules mistaken for persisted coaching state. */
function sanitizeCoachingLexicalPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const cp = patch.constraints_patch;
  if (cp !== undefined) {
    out.constraints_patch = cp;
  }

  const pref = sanitizeShallowMergedPatchBucket(patch.preferences);
  if (pref !== null) {
    out.preferences = pref;
  }

  const per = sanitizeShallowMergedPatchBucket(patch.periodization);
  if (per !== null) {
    out.periodization = per;
  }

  const fl = sanitizeShallowMergedPatchBucket(patch.flags);
  if (fl !== null) {
    out.flags = fl;
  }

  const disciplineRaw = patch.discipline_state;
  if (
    disciplineRaw !== null &&
    disciplineRaw !== undefined &&
    typeof disciplineRaw === "object" &&
    !Array.isArray(disciplineRaw)
  ) {
    const discBlob = disciplineRaw as Record<string, JsonValue>;
    const nextDisc: Record<string, JsonValue> = {};
    for (const [disc, blob] of Object.entries(discBlob)) {
      if (looksLikeWeekdayWorkoutProposalMap(blob)) {
        continue;
      }
      const bObj = asJsonObject(blob as JsonValue);
      const cleaned = stripEphemeralPlannerFromJsonBlob(bObj);
      if (Object.keys(cleaned).length > 0) {
        nextDisc[disc] = cleaned as JsonValue;
      }
    }
    if (Object.keys(nextDisc).length > 0) {
      out.discipline_state = nextDisc;
    }
  }

  return out;
}

function asJsonObject(v: JsonValue): Record<string, JsonValue> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, JsonValue>) };
  }
  return {};
}

function shallowMergeRecords(
  base: Record<string, JsonValue>,
  patch: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return { ...base, ...patch };
}

function normalizeConstraints(prev: JsonValue[]): JsonValue[] {
  const out: JsonValue[] = [];
  for (const x of prev) {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      out.push({ ...(x as Record<string, JsonValue>) });
    }
  }
  return out;
}

function typeMatches(
  row: Record<string, unknown>,
  matchType: unknown,
): boolean {
  return (
    String(row.type ?? "")
      .toLowerCase()
      .trim() ===
    String(matchType ?? "")
      .toLowerCase()
      .trim()
  );
}

function descriptionContains(haystack: unknown, needle: unknown): boolean {
  const n = String(needle ?? "")
    .toLowerCase()
    .trim();
  if (n.length === 0) {
    return false;
  }
  return String(haystack ?? "")
    .toLowerCase()
    .includes(n);
}

function matchRecordUsable(m: Record<string, unknown>): boolean {
  if (!("type" in m)) {
    return false;
  }
  const dc = m.description_contains;
  if (dc === undefined || dc === null) {
    return false;
  }
  const s = String(dc).trim();
  return s.length > 0;
}

function findConstraintIdx(
  existing: JsonValue[],
  match: Record<string, unknown>,
): number {
  return existing.findIndex((c) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      return false;
    }
    const row = c as Record<string, unknown>;
    return (
      typeMatches(row, match.type) &&
      descriptionContains(row.description, match.description_contains)
    );
  });
}

function asConstraintValue(v: unknown): Record<string, JsonValue> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return null;
  }
  const o = v as Record<string, unknown>;
  if (typeof o.type !== "string" || o.type.trim() === "") {
    return null;
  }
  if (typeof o.description !== "string" || o.description.trim() === "") {
    return null;
  }
  return { ...(o as Record<string, JsonValue>) };
}

/** Apply ordered diff ops; mutates a clone of `prevConstraints`. */
function applyConstraintsPatch(
  prevConstraints: JsonValue[],
  patchUnknown: unknown,
): JsonValue[] {
  const existing = normalizeConstraints(prevConstraints);
  if (!Array.isArray(patchUnknown) || patchUnknown.length === 0) {
    return existing;
  }

  for (const raw of patchUnknown) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const rec = raw as Record<string, unknown>;
    const op = String(rec.op ?? "")
      .toLowerCase()
      .trim();

    if (op === "add") {
      const value = asConstraintValue(rec.value);
      if (!value) {
        continue;
      }
      existing.push({ ...value } as JsonValue);
      continue;
    }

    if (op === "replace") {
      const match = rec.match;
      if (!match || typeof match !== "object" || Array.isArray(match)) {
        continue;
      }
      const m = match as Record<string, unknown>;
      if (!matchRecordUsable(m)) {
        continue;
      }
      const value = asConstraintValue(rec.value);
      if (!value) {
        continue;
      }
      const idx = findConstraintIdx(existing, m);
      const nextVal = { ...value } as JsonValue;
      if (idx !== -1) {
        existing[idx] = nextVal;
      } else {
        existing.push(nextVal);
      }
      continue;
    }

    if (op === "resolve") {
      const match = rec.match;
      if (!match || typeof match !== "object" || Array.isArray(match)) {
        continue;
      }
      const m = match as Record<string, unknown>;
      if (!matchRecordUsable(m)) {
        continue;
      }
      const idx = findConstraintIdx(existing, m);
      if (idx === -1) {
        continue;
      }
      const cur = existing[idx] as Record<string, JsonValue>;
      existing[idx] = { ...cur, resolved: true } as JsonValue;
    }
  }

  return existing;
}

function mergeNestedDisciplineBlobs(
  prev: JsonValue,
  patchUnknown: unknown,
): JsonValue {
  const baseObj = asJsonObject(prev);
  const patchObj = asJsonObject(patchUnknown as JsonValue);
  if (Object.keys(patchObj).length === 0) {
    return prev;
  }
  const out: Record<string, JsonValue> = { ...baseObj };
  for (const [disc, patchVal] of Object.entries(patchObj)) {
    const existing = baseObj[disc];
    if (
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      patchVal &&
      typeof patchVal === "object" &&
      !Array.isArray(patchVal)
    ) {
      out[disc] = shallowMergeRecords(
        existing as Record<string, JsonValue>,
        patchVal as Record<string, JsonValue>,
      ) as JsonValue;
    } else {
      out[disc] = patchVal;
    }
  }
  return out;
}

function jsonStable(v: unknown): string {
  return JSON.stringify(v);
}

export async function applyCoachingStatePatchInDb(
  athleteId: string,
  patchRaw: Record<string, unknown>,
  previousRow?: CoachingStateRow,
): Promise<void> {
  const patchLex = sanitizeCoachingLexicalPatch(patchRaw);
  if (Object.keys(patchLex).length === 0) {
    return;
  }

  let dirty = false;

  let prev = previousRow;
  if (!prev) {
    const db = await getDb();
    prev = await db
      .select()
      .from(coachingState)
      .where(eq(coachingState.id, athleteId))
      .get();
  }
  if (!prev) {
    return;
  }

  let constraints = Array.isArray(prev.constraints) ? prev.constraints : [];
  let preferences = asJsonObject(prev.preferences);
  let disciplineState = prev.disciplineState;
  let periodization = asJsonObject(prev.periodization);
  let flags = asJsonObject(prev.flags);

  for (const k of Object.keys(patchLex)) {
    if (!PATCH_TOP_KEYS.has(k)) {
      continue;
    }

    switch (k) {
      case "constraints_patch": {
        const next = applyConstraintsPatch(constraints, patchLex[k]);
        if (jsonStable(next) !== jsonStable(constraints)) {
          constraints = next;
          dirty = true;
        }
        break;
      }
      case "preferences": {
        const patch = asJsonObject(patchLex[k] as JsonValue);
        if (Object.keys(patch).length === 0) {
          break;
        }
        const next = shallowMergeRecords(preferences, patch);
        if (jsonStable(next) !== jsonStable(preferences)) {
          preferences = next;
          dirty = true;
        }
        break;
      }
      case "discipline_state": {
        const next = mergeNestedDisciplineBlobs(disciplineState, patchLex[k]);
        if (jsonStable(next) !== jsonStable(disciplineState)) {
          disciplineState = next;
          dirty = true;
        }
        break;
      }
      case "periodization": {
        const patch = asJsonObject(patchLex[k] as JsonValue);
        if (Object.keys(patch).length === 0) {
          break;
        }
        const next = shallowMergeRecords(periodization, patch);
        if (jsonStable(next) !== jsonStable(periodization)) {
          periodization = next;
          dirty = true;
        }
        break;
      }
      case "flags": {
        const patch = asJsonObject(patchLex[k] as JsonValue);
        if (Object.keys(patch).length === 0) {
          break;
        }
        const next = shallowMergeRecords(flags, patch);
        if (jsonStable(next) !== jsonStable(flags)) {
          flags = next;
          dirty = true;
        }
        break;
      }
    }
  }

  if (!dirty) {
    return;
  }

  const db = await getDb();
  await db
    .update(coachingState)
    .set({
      constraints,
      preferences: preferences as JsonValue,
      disciplineState,
      periodization: periodization as JsonValue,
      flags: flags as JsonValue,
      updatedAt: new Date(),
    })
    .where(eq(coachingState.id, athleteId))
    .run();
}
