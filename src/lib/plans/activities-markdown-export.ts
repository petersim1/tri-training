import type { PlannedWorkoutWithCompleted } from "~/lib/db/schema";
import { isCardioKind } from "~/lib/plans/cardio-targets";
import {
  completedWorkoutDistanceM,
  completedWorkoutMovingSeconds,
  completedWorkoutTitle,
} from "~/lib/plans/completed-workout-data";

function weekdayLongForDayKeyInTimeZone(
  dayKey: string,
  timeZone: string,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) {
    return "";
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const cal = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekdayFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  });
  const t0 = Date.UTC(y, mo - 1, d, 0, 0, 0);
  for (let h = 0; h < 72; h++) {
    const t = t0 + h * 3600 * 1000;
    if (cal.format(new Date(t)) === dayKey) {
      return weekdayFmt.format(new Date(t));
    }
  }
  return "";
}

function formatDurationForExport(totalSeconds: number): string {
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

function formatDistanceForExport(
  p: PlannedWorkoutWithCompleted,
): string | null {
  const cw = p.completedWorkout;
  if (cw) {
    const dist = completedWorkoutDistanceM(cw);
    if (dist != null && Number.isFinite(dist)) {
      if (dist >= 1000) {
        return `${(dist / 1000).toFixed(2)} km`;
      }
      return `${Math.round(dist)} m`;
    }
  }
  if (isCardioKind(p.kind) && p.distance != null && p.distanceUnits) {
    const u = String(p.distanceUnits).trim();
    return `${p.distance} ${u}`;
  }
  return null;
}

function formatTimeForExport(p: PlannedWorkoutWithCompleted): string | null {
  if (p.completedWorkout) {
    const sec = completedWorkoutMovingSeconds(p.completedWorkout);
    if (sec != null && sec > 0) {
      return formatDurationForExport(sec);
    }
  }
  if (p.timeSeconds != null && p.timeSeconds > 0) {
    return formatDurationForExport(p.timeSeconds);
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

/** Matches Activities markdown upload indent (`activities-markdown-import` template). */
const SUB_BULLET = "     ";

function exportActivityBlock(p: PlannedWorkoutWithCompleted): string[] {
  const lines: string[] = [`- ${p.kind}`];
  lines.push(`${SUB_BULLET}- status: ${p.status}`);
  const distance = formatDistanceForExport(p);
  if (distance) {
    lines.push(`${SUB_BULLET}- distance: ${distance}`);
  }
  const time = formatTimeForExport(p);
  if (time) {
    lines.push(`${SUB_BULLET}- time: ${time}`);
  }
  const note = formatNameForExport(p);
  if (note) {
    lines.push(`${SUB_BULLET}- note: ${note}`);
  }
  return lines;
}

/**
 * Markdown grouped by `day_key`, with weekday labels in the given IANA timezone.
 * Same shape as upload markdown, plus a required `status` sub-bullet on each activity.
 */
export function buildActivitiesMarkdownExport(
  rows: PlannedWorkoutWithCompleted[],
  timeZone: string,
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
    const wd = weekdayLongForDayKeyInTimeZone(dayKey, timeZone);
    const head = wd !== "" ? `[${dayKey}] (${wd})` : `[${dayKey}]`;
    chunks.push(head);
    for (const p of list) {
      chunks.push(...exportActivityBlock(p));
    }
    chunks.push("");
  }
  return chunks.join("\n").trimEnd();
}
