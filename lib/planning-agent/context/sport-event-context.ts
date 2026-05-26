import type { SportEventTargetSegment } from "@/lib/constants/events";
import type { SportEventRow } from "@/lib/db/schema.server";
import { formatTargetDurationSec } from "@/lib/plans/cardio-targets";

const DAY_YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Snapshot persisted on planning chat user `metadata`. */
export type PlanningSportEventReferenceJson = {
  id: string;
  name: string;
  event_day_key: string;
  status: string;
  discipline: string | null;
  legs: string[];
  notes_preview: string | null;
  url: string | null;
};

/** Whole calendar weeks and leftover days until race; both inputs `YYYY-MM-DD` (logical calendar dates). */
export function runwayWeeksParts(
  todayYmd: string,
  eventYmd: string,
): { wholeWeeks: number; remainderDays: number; totalDays: number } | null {
  if (!DAY_YMD.test(todayYmd) || !DAY_YMD.test(eventYmd)) {
    return null;
  }
  const [ty, tm, td] = todayYmd.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [ey, em, ed] = eventYmd.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const t0 = Date.UTC(ty, tm - 1, td);
  const t1 = Date.UTC(ey, em - 1, ed);
  if (!(Number.isFinite(t0) && Number.isFinite(t1)) || t1 < t0) {
    return null;
  }
  const totalDays = Math.floor((t1 - t0) / 86_400_000);
  return {
    totalDays,
    wholeWeeks: Math.floor(totalDays / 7),
    remainderDays: totalDays % 7,
  };
}

export function snapshotSportEventBriefForChat(
  ev: SportEventRow,
): PlanningSportEventReferenceJson {
  return {
    id: ev.id,
    name: ev.name,
    event_day_key: ev.eventDayKey,
    status: ev.status,
    discipline: ev.discipline ?? null,
    legs: ev.targets.map(segmentSummaryLine),
    notes_preview: ev.notes?.trim() ? ev.notes.trim().slice(0, 520) : null,
    url: ev.url ?? null,
  };
}

function segmentSummaryLine(seg: SportEventTargetSegment): string {
  const bits: string[] = [seg.activity];
  const lbl = seg.label?.trim();
  if (lbl) {
    bits.push(`(${lbl})`);
  }
  if (
    seg.distance != null &&
    Number.isFinite(seg.distance) &&
    seg.distance_units
  ) {
    bits.push(`${seg.distance}${seg.distance_units}`);
  }
  if (seg.time_seconds != null && seg.time_seconds > 0) {
    bits.push(formatTargetDurationSec(seg.time_seconds));
  }
  return bits.join(" ");
}

/** Factual bullet block (shared: system appendix vs. archived user-turn context). */
function sportEventReferenceFactsMarkdown(
  ref: PlanningSportEventReferenceJson,
): string {
  const lines: string[] = [
    `- Name: ${ref.name}`,
    `- Event date: ${ref.event_day_key}`,
    `- Status: ${ref.status}`,
  ];
  if (ref.discipline) {
    lines.push(`- Overview tag: ${ref.discipline}`);
  }
  lines.push("", "Leg targets:");
  if (ref.legs.length > 0) {
    for (const l of ref.legs) {
      lines.push(`  • ${l}`);
    }
  } else {
    lines.push("  • (none specified)");
  }
  if (ref.notes_preview) {
    lines.push("", `Notes: ${ref.notes_preview}`);
  }
  return lines.join("\n");
}

/**
 * Appended to the system prompt when a target sport event drives this inference pass.
 * @param runway — from calendar anchor today → `event_day_key` (omit if unknown).
 */
export function sportEventAttachedSystemAppendix(
  ref: PlanningSportEventReferenceJson,
  runway: {
    wholeWeeks: number;
    remainderDays: number;
    totalDays: number;
  } | null,
): string {
  const modalityHints =
    "**Context:** Use this appendix with **`### Current coaching state`** and tool data—coach preferences outweigh generic training clichés.\n\n" +
    "**Tools:** Prefer `recent_sessions_by_kind` for per-leg history when helpful; broader `list_completed_workouts` only if mixed pulls actually matter.\n\n";

  const runwayLine =
    runway !== null
      ? `_Runway: ~${runway.wholeWeeks} weeks + ${runway.remainderDays} days (${runway.totalDays} days) to race—interpret alongside coaching preferences (specificity, bricks, stacking, taper, intensity, etc.)._\n\n`
      : "";

  return (
    "### Attached sport event (primary planning anchor)\n" +
    modalityHints +
    runwayLine +
    sportEventReferenceFactsMarkdown(ref)
  );
}

/** Short UI label for bubbles / picker helper text. */
export function sportEventReferenceUiLabel(
  ref: PlanningSportEventReferenceJson,
): string {
  const dk = ref.event_day_key.trim();
  const nm = ref.name.trim();
  const cap = nm.length > 52 ? `${nm.slice(0, 49)}…`.trimEnd() : nm;
  return dk ? `${dk} — ${cap}` : cap;
}
