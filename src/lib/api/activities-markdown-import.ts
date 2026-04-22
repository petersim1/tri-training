import type { PlannedWorkoutBulkItem } from "~/lib/api/bulk-planned-workouts";
import type { PlanKind } from "~/lib/db/schema";
import {
  CARDIO_DISTANCE_UNITS,
  type CardioDistanceUnit,
} from "~/lib/plans/cardio-targets";
import { isValidDayKey } from "~/lib/plans/day-key";

const PLAN_KINDS = new Set<PlanKind>([
  "lift",
  "run",
  "bike",
  "swim",
  "recovery",
]);

/** Example for the upload modal placeholder and “copy template”. */
export const ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE = `[2026-04-22]
- run
     - distance: 5 km
     - time: 30 minutes
     - note: Easy, focus on consistent pace.

[2026-04-23]
- lift
     - note: Push day

- swim
     - distance: 800 m
     - time: 45 min

Each date is a calendar day. Start an activity with a bullet and type: - run, - lift, - bike, - swim, or - recovery.
Under each activity, distance / time / note are optional sub-bullets. Omit any you do not need.
Distance uses a number plus unit: km, m, mi, or yd.
Time uses minutes or seconds (e.g. 30 minutes, 45 min, 90 seconds, 120 s, 1:15:00, or 30m / 45s).`;

export type MarkdownImportIssue = { line: number; message: string };

const DAY_HEAD = /^\[(\d{4}-\d{2}-\d{2})\](?:\s*\([^)]*\))?\s*$/;
/** Top-level activity: - run / - lift / - bike / - swim / - recovery (planned is implied). */
const ACTIVITY_LINE = /^(\s*)-\s*(lift|run|bike|swim|recovery)\s*$/i;
const SUB_LINE =
  /^(\s*)[-–]\s*(distance|time|note)\s*:\s*(.*)$/i;

const DIST_VALUE =
  /^(\d+(?:\.\d+)?)\s+(km|mi|yd|m)\b/i;

function parseDistanceValue(
  raw: string,
  line: number,
): { num: number; unit: string } | MarkdownImportIssue {
  const v = raw.trim();
  if (v === "") {
    return { line, message: "distance: needs a value (e.g. 5 km)" };
  }
  const m = DIST_VALUE.exec(v);
  if (!m || m.index !== 0) {
    return {
      line,
      message:
        "distance: expected number and unit (km, m, mi, yd), e.g. 5 km or 800 m",
    };
  }
  const u = m[2].toLowerCase();
  if (!CARDIO_DISTANCE_UNITS.includes(u as CardioDistanceUnit)) {
    return { line, message: `distance: invalid unit "${m[2]}"` };
  }
  const rest = v.slice(m[0].length).trim();
  if (rest !== "") {
    return {
      line,
      message: "distance: extra text after value; put details in note:",
    };
  }
  return { num: parseFloat(m[1]), unit: u };
}

function parseTimeValue(raw: string, line: number): number | MarkdownImportIssue {
  const v = raw.trim();
  if (v === "") {
    return { line, message: "time: needs a value" };
  }

  const hms = /^(\d+):(\d{2}):(\d{2})\s*$/.exec(v);
  if (hms) {
    const h = parseInt(hms[1], 10);
    const min = parseInt(hms[2], 10);
    const s = parseInt(hms[3], 10);
    return h * 3600 + min * 60 + s;
  }

  const minWord =
    /^(\d+(?:\.\d+)?)\s*(minutes?|mins?)\s*$/i.exec(v) ??
    /^(\d+(?:\.\d+)?)\s*min\s*$/i.exec(v);
  if (minWord) {
    return Math.round(parseFloat(minWord[1]) * 60);
  }

  const secWord =
    /^(\d+(?:\.\d+)?)\s*(seconds?|secs?)\s*$/i.exec(v) ??
    /^(\d+(?:\.\d+)?)\s*sec(?:ond)?s?\s*$/i.exec(v);
  if (secWord) {
    return Math.round(parseFloat(secWord[1]));
  }

  const compactM = /^(\d+(?:\.\d+)?)m\s*$/i.exec(v);
  if (compactM) {
    return Math.round(parseFloat(compactM[1]) * 60);
  }

  const compactS = /^(\d+(?:\.\d+)?)s\s*$/i.exec(v);
  if (compactS) {
    return Math.round(parseFloat(compactS[1]));
  }

  const bareS = /^(\d+(?:\.\d+)?)\s+s\s*$/i.exec(v);
  if (bareS) {
    return Math.round(parseFloat(bareS[1]));
  }

  return {
    line,
    message:
      "time: use minutes or seconds (e.g. 30 minutes, 45 min, 90 seconds, 120 s, 1:05:00, 30m, 45s)",
  };
}

function parseKind(
  inner: string,
  line: number,
): PlanKind | MarkdownImportIssue {
  const k = inner.trim().toLowerCase();
  if (k === "") {
    return {
      line,
      message:
        "Missing activity type; use - run, - lift, - bike, - swim, or - recovery",
    };
  }
  if (!PLAN_KINDS.has(k as PlanKind)) {
    return {
      line,
      message: `Unknown activity type "${inner.trim()}". Use: lift, run, bike, swim, recovery`,
    };
  }
  return k as PlanKind;
}

type Draft = {
  kind: PlanKind;
  dayKey: string;
  distance: number | null;
  distanceUnits: string | null;
  timeSeconds: number | null;
  notes: string | null;
  distanceLine: number | null;
  timeLine: number | null;
  noteLine: number | null;
};

function emptyDraft(kind: PlanKind, dayKey: string): Draft {
  return {
    kind,
    dayKey,
    distance: null,
    distanceUnits: null,
    timeSeconds: null,
    notes: null,
    distanceLine: null,
    timeLine: null,
    noteLine: null,
  };
}

function draftToItem(d: Draft): PlannedWorkoutBulkItem {
  return {
    kind: d.kind,
    dayKey: d.dayKey,
    notes: d.notes,
    routineVendor: null,
    routineId: null,
    distance: d.distance,
    distanceUnits: d.distanceUnits,
    timeSeconds: d.timeSeconds,
  };
}

/**
 * Parse nested markdown into bulk insert rows. Validates structure only;
 * business rules run in `bulkInsertPlannedWorkoutsFromItems`.
 */
export function parseActivitiesMarkdownForBulkImport(markdown: string):
  | { ok: true; items: PlannedWorkoutBulkItem[] }
  | { ok: false; issues: MarkdownImportIssue[] } {
  const issues: MarkdownImportIssue[] = [];
  const items: PlannedWorkoutBulkItem[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let currentDay: string | null = null;
  let draft: Draft | null = null;

  function flushDraft() {
    if (draft !== null) {
      items.push(draftToItem(draft));
      draft = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const dayM = DAY_HEAD.exec(trimmed);
    if (dayM) {
      flushDraft();
      const dk = dayM[1];
      if (!isValidDayKey(dk)) {
        issues.push({
          line: lineNum,
          message: `Invalid date in header: ${dk}`,
        });
        continue;
      }
      currentDay = dk;
      continue;
    }

    if (currentDay === null) {
      issues.push({
        line: lineNum,
        message: "Add a day header first: [YYYY-MM-DD]",
      });
      continue;
    }

    const subM = SUB_LINE.exec(line);
    if (subM) {
      if (draft === null) {
        issues.push({
          line: lineNum,
          message:
            "Put distance / time / note under an activity: - run … then indented - distance: …",
        });
        continue;
      }
      const key = subM[2].toLowerCase();
      const value = subM[3] ?? "";

      if (key === "distance") {
        if (draft.distanceLine !== null) {
          issues.push({ line: lineNum, message: "Only one distance: per activity" });
          continue;
        }
        const d = parseDistanceValue(value, lineNum);
        if (!("num" in d)) {
          issues.push(d);
          continue;
        }
        draft.distance = d.num;
        draft.distanceUnits = d.unit;
        draft.distanceLine = lineNum;
        continue;
      }

      if (key === "time") {
        if (draft.timeLine !== null) {
          issues.push({ line: lineNum, message: "Only one time: per activity" });
          continue;
        }
        const t = parseTimeValue(value, lineNum);
        if (typeof t !== "number") {
          issues.push(t);
          continue;
        }
        draft.timeSeconds = t;
        draft.timeLine = lineNum;
        continue;
      }

      if (key === "note") {
        if (draft.noteLine !== null) {
          issues.push({ line: lineNum, message: "Only one note: per activity" });
          continue;
        }
        const n = value.trim();
        draft.notes = n === "" ? null : n;
        draft.noteLine = lineNum;
        continue;
      }
    }

    const actM = ACTIVITY_LINE.exec(line);
    if (actM) {
      const kindOrErr = parseKind(actM[2], lineNum);
      if (typeof kindOrErr === "object") {
        issues.push(kindOrErr);
        continue;
      }
      flushDraft();
      draft = emptyDraft(kindOrErr, currentDay);
      continue;
    }

    issues.push({
      line: lineNum,
      message:
        "Expected [YYYY-MM-DD], a line like - run / - lift, or - distance:/time:/note:",
    });
  }

  flushDraft();

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (items.length === 0) {
    return {
      ok: false,
      issues: [
        {
          line: 1,
          message:
            "No activities found. Under each date add lines like - run with optional sub-bullets.",
        },
      ],
    };
  }

  return { ok: true, items };
}
