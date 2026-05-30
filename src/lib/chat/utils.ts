import type {
  CoachingStateSchemaValues,
  ReplaySummaryStoredSchemaValues,
} from "@/types/db";
import type { SportEventTargetSegment } from "../constants/events";
import type { SportEventRow } from "../db/schema.server";

export const formatReplaySummary = (
  summary: ReplaySummaryStoredSchemaValues,
): string => {
  const lines: string[] = [
    `Intent: ${summary.userIntent}`,
    `Summary: ${summary.assistantSummary}`,
  ];

  if (summary.decisions?.length) {
    lines.push("Decisions:");
    for (const decision of summary.decisions) {
      lines.push(`  - ${decision}`);
    }
  }

  if (summary.openQuestions?.length) {
    lines.push("Open questions:");
    for (const question of summary.openQuestions) {
      lines.push(`  - ${question}`);
    }
  }

  return lines.join("\n");
};

export const buildCoachingStateBlock = (
  state: CoachingStateSchemaValues,
): string | null => {
  const parts: string[] = [];

  const activePhysical = state.physicalState.filter(
    (p) => p.status !== "resolved",
  );
  if (activePhysical.length > 0) {
    parts.push(
      `Physical state:\n${activePhysical.map((p) => `- [${p.status}] ${p.area}: ${p.note}`).join("\n")}`,
    );
  }

  if (state.disciplineState.length > 0) {
    parts.push(
      `Discipline state:\n${state.disciplineState.map((d) => `- ${d}`).join("\n")}`,
    );
  }

  if (state.preferences.length > 0) {
    parts.push(
      `Preferences:\n${state.preferences.map((p) => `- ${p}`).join("\n")}`,
    );
  }

  const activeDirectives = state.directives.filter(
    (d) => d.status === "active",
  );
  if (activeDirectives.length > 0) {
    parts.push(
      `Directives:\n${activeDirectives.map((d) => `- ${d.instruction} (${d.source})`).join("\n")}`,
    );
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
};

export const buildEventBlock = (
  event: SportEventRow,
  todayKey: string,
): string => {
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const [ey, em, ed] = event.eventDayKey.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const eventDate = new Date(ey, em - 1, ed);
  const daysOut = Math.round(
    (eventDate.getTime() - today.getTime()) / 86_400_000,
  );
  const weeksOut = Math.floor(daysOut / 7);

  const lines = [
    `- Name: ${event.name}`,
    `- Date: ${event.eventDayKey} (${daysOut} days / ~${weeksOut} weeks away)`,
    `- Status: ${event.status}`,
  ];

  if (event.discipline) lines.push(`- Discipline: ${event.discipline}`);
  if (event.notes) lines.push(`- Notes: ${event.notes}`);

  const targets = event.targets as SportEventTargetSegment[];
  if (targets.length > 0) {
    lines.push("- Targets:");
    for (const t of targets) {
      const parts: string[] = [t.activity];
      if (t.distance && t.distance_units)
        parts.push(`${t.distance} ${t.distance_units}`);
      if (t.time_seconds) parts.push(`${Math.round(t.time_seconds / 60)} min`);
      if (t.notes) parts.push(t.notes);
      lines.push(`  • ${parts.join(" — ")}`);
    }
  }

  return lines.join("\n");
};
