import type { PlannedWorkoutWithCompleted } from "../db/schema.server";
import {
  completedWorkoutAverageHeartrateBpm,
  completedWorkoutDistanceM,
  completedWorkoutMovingSeconds,
  completedWorkoutTitle,
} from "./completed-workout-data";

/** Indent for YAML-style sub-lines (matches `activities-markdown-import`). */
export const ACTIVITIES_MARKDOWN_SUB_INDENT = "     ";

/** Activity `time:` line — same semantics as Activities markdown upload. */
export function formatElapsedDurationMarkdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${sec}s`;
}

/** `distance:` lines from stored metres (linked Strava sessions). */
export function formatDistanceMetersMarkdown(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) {
    return "";
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

/** Logged-session row for markdown that mirrors `exportActivityBlock` minus plan fields (`status`, `note`). */
export type CompletedSessionMarkdownRow = {
  /** Local calendar `YYYY-MM-DD` in viewer TZ; `"?"` if unknown. */
  localDayKey: string;
  kind: string;
  distanceM: number | null;
  movingSeconds: number | null;
  avgHeartRateBpm: number | null;
  liftExerciseLines: readonly string[];
};

export function completedSessionMarkdownLines(
  row: CompletedSessionMarkdownRow,
): string[] {
  const SUB = ACTIVITIES_MARKDOWN_SUB_INDENT;
  const EXER_SUB = `${SUB}${SUB}`;
  const lines: string[] = [`- ${row.kind}`];
  if (
    row.distanceM != null &&
    Number.isFinite(row.distanceM) &&
    row.distanceM > 0
  ) {
    const distLbl = formatDistanceMetersMarkdown(row.distanceM);
    if (distLbl !== "") {
      lines.push(`${SUB}- distance: ${distLbl}`);
    }
  }
  if (
    row.movingSeconds != null &&
    Number.isFinite(row.movingSeconds) &&
    row.movingSeconds > 0
  ) {
    lines.push(
      `${SUB}- time: ${formatElapsedDurationMarkdown(row.movingSeconds)}`,
    );
  }
  if (
    row.avgHeartRateBpm != null &&
    Number.isFinite(row.avgHeartRateBpm) &&
    row.avgHeartRateBpm > 0
  ) {
    lines.push(`${SUB}- avg_heartrate: ${Math.round(row.avgHeartRateBpm)} bpm`);
  }
  if (row.kind === "lift" && row.liftExerciseLines.length > 0) {
    lines.push(`${SUB}- exercises:`);
    for (const ex of row.liftExerciseLines) {
      lines.push(`${EXER_SUB}- ${ex}`);
    }
  }
  return lines;
}

function comparePlannerDayKeysAsc(a: string, b: string): number {
  const unk = "?";
  if (a === unk && b === unk) {
    return 0;
  }
  if (a === unk) {
    return 1;
  }
  if (b === unk) {
    return -1;
  }
  return a.localeCompare(b);
}

export function groupedCompletedSessionsMarkdown(
  sessions: CompletedSessionMarkdownRow[],
  timeZone: string,
  options?: { newestDayFirst?: boolean },
): string {
  if (sessions.length === 0) {
    return "";
  }
  const newestDayFirst = options?.newestDayFirst ?? false;
  const byDay = new Map<string, CompletedSessionMarkdownRow[]>();
  const tz = timeZone.trim();
  for (const s of sessions) {
    const dk = (s.localDayKey ?? "").trim() || "?";
    const bucket = byDay.get(dk);
    if (bucket) {
      bucket.push(s);
    } else {
      byDay.set(dk, [s]);
    }
  }
  let dayKeys = [...byDay.keys()].sort(comparePlannerDayKeysAsc);
  if (newestDayFirst) {
    dayKeys = dayKeys.reverse();
  }
  const chunks: string[] = [];
  for (const dk of dayKeys) {
    const wd = new Date(`${dk}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
    });
    const head = wd !== "" ? `[${dk}] (${wd})` : `[${dk}]`;
    chunks.push(head);
    for (const row of byDay.get(dk) ?? []) {
      chunks.push(...completedSessionMarkdownLines(row));
    }
    chunks.push("");
  }
  return chunks.join("\n").trimEnd();
}

function formatDistanceForExport(
  p: PlannedWorkoutWithCompleted,
): string | null {
  const cw = p.completedWorkout;
  if (cw) {
    const dist = completedWorkoutDistanceM(cw);
    if (dist != null && Number.isFinite(dist)) {
      const lbl = formatDistanceMetersMarkdown(dist);
      return lbl !== "" ? lbl : null;
    }
  }
  if (
    ["run", "swim", "bike"].includes(p.kind) &&
    p.distance != null &&
    p.distanceUnits
  ) {
    const u = String(p.distanceUnits).trim();
    return `${p.distance} ${u}`;
  }
  return null;
}

function formatTimeForExport(p: PlannedWorkoutWithCompleted): string | null {
  if (p.completedWorkout) {
    const sec = completedWorkoutMovingSeconds(p.completedWorkout);
    if (sec != null && sec > 0) {
      return formatElapsedDurationMarkdown(sec);
    }
  }
  if (p.timeSeconds != null && p.timeSeconds > 0) {
    return formatElapsedDurationMarkdown(p.timeSeconds);
  }
  return null;
}

function formatNameForExport(p: PlannedWorkoutWithCompleted): string | null {
  if (p.completedWorkout) {
    const t = completedWorkoutTitle(p.completedWorkout);
    return t?.trim() ? t : null;
  }
  const n = p.notes?.trim();
  return n ? n : null;
}

function exportActivityBlock(p: PlannedWorkoutWithCompleted): string[] {
  const SUB = ACTIVITIES_MARKDOWN_SUB_INDENT;
  const lines: string[] = [`- ${p.kind}`];
  lines.push(`${SUB}- status: ${p.status}`);
  const distance = formatDistanceForExport(p);
  if (distance) {
    lines.push(`${SUB}- distance: ${distance}`);
  }
  const time = formatTimeForExport(p);
  if (time) {
    lines.push(`${SUB}- time: ${time}`);
  }
  const cw = p.completedWorkout;
  if (cw) {
    const hr = completedWorkoutAverageHeartrateBpm(cw);
    if (hr != null && Number.isFinite(hr)) {
      lines.push(`${SUB}- avg_heartrate: ${Math.round(hr)} bpm`);
    }
  }
  const note = formatNameForExport(p);
  if (note) {
    lines.push(`${SUB}- note: ${note}`);
  }
  return lines;
}

/**
 * Markdown grouped by `day_key`, with weekday labels in the given IANA timezone.
 * Same shape as upload markdown, plus a required `status` sub-bullet on each activity.
 */
export function buildActivitiesMarkdownExport(
  rows: PlannedWorkoutWithCompleted[],
): string {
  if (rows.length === 0) {
    return "";
  }
  const byDay = new Map<string, PlannedWorkoutWithCompleted[]>();
  for (const p of rows) {
    const dk = p.dayKey;
    const list = byDay.get(dk);
    if (list) {
      list.push(p);
    } else {
      byDay.set(dk, [p]);
    }
  }
  const days = [...byDay.keys()].sort();
  const chunks: string[] = [];
  for (const dayKey of days) {
    const list = byDay.get(dayKey) ?? [];
    const wd = new Date(`${dayKey}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
    });
    const head = wd !== "" ? `[${dayKey}] (${wd})` : `[${dayKey}]`;
    chunks.push(head);
    for (const p of list) {
      chunks.push(...exportActivityBlock(p));
    }
    chunks.push("");
  }
  return chunks.join("\n").trimEnd();
}
