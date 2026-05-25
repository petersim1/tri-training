import type { PlanStatus } from "@/components/PlanStatusSelect";
import {
  type CardioDistanceUnit,
  PLAN_KIND_VALUES,
  type PlanKind,
} from "@/lib/constants/activities";
import {
  type CompletedSessionMarkdownRow,
  groupedCompletedSessionsMarkdown,
} from "@/lib/plans/activities-markdown-export";
import { activityActions } from "@/server-fcts";
import type { ActivityListSchemaValues } from "@/types/requests/activities";
import type { PlannerCompletedBrief } from "@/types/responses/chats";
import { getMostRecentAssistantProposal } from "../chat/planning-chat-store.server";
import {
  type PlannerPlannedBrief,
  plannerListCompletedWorkouts,
  plannerListPlannedWorkouts,
} from "./agent-queries.server";

function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() : undefined;
}

function asOptionalStr(v: unknown): string | null | undefined {
  if (v === undefined) {
    return undefined;
  }
  if (v === null) {
    return null;
  }
  return typeof v === "string" ? v : String(v);
}

function parseJsonArgs(raw: string): Record<string, unknown> {
  let o: unknown;
  try {
    o = JSON.parse(raw || "{}") as unknown;
  } catch {
    throw new Error("Invalid tool arguments JSON");
  }
  return o !== null && typeof o === "object" && !Array.isArray(o)
    ? (o as Record<string, unknown>)
    : {};
}

function oneLinePreview(s: string | null | undefined, cap: number): string {
  if (!s?.trim()) {
    return "";
  }
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > cap ? `${t.slice(0, cap - 1)}…` : t;
}

function formatPlannerKind(b: PlannerCompletedBrief): string {
  return b.inferredPlanKind ?? b.activityKind ?? "session";
}

/** Same grouping + activity lines as Activities markdown export (`buildActivitiesMarkdownExport`), without plan `status` / `note`. */
function formatCompletedForModel(
  ws: PlannerCompletedBrief[],
  browserTimeZone: string,
): string {
  if (ws.length === 0) {
    return "### Completed workouts\n(No sessions matched the filters.)";
  }
  const rows: CompletedSessionMarkdownRow[] = ws.map((w) => ({
    localDayKey: (w.localDayKey ?? "").trim() || "?",
    kind: formatPlannerKind(w),
    distanceM: w.distanceM,
    movingSeconds: w.movingSeconds,
    avgHeartRateBpm: w.avgHeartRateBpm,
    liftExerciseLines: w.liftExerciseLines,
  }));
  const body = groupedCompletedSessionsMarkdown(rows, browserTimeZone, {
    newestDayFirst: true,
  });
  return `### Completed workouts (grouped by day, newest first)\n\n${body}`;
}

function formatRecentSessionsByKindForModel(
  kindLabel: string,
  ws: PlannerCompletedBrief[],
  browserTimeZone: string,
): string {
  if (ws.length === 0) {
    return `### Recent ${kindLabel} sessions\n(No synced sessions matched.)`;
  }
  const rows: CompletedSessionMarkdownRow[] = ws.map((w) => ({
    localDayKey: (w.localDayKey ?? "").trim() || "?",
    kind: formatPlannerKind(w),
    distanceM: w.distanceM,
    movingSeconds: w.movingSeconds,
    avgHeartRateBpm: w.avgHeartRateBpm,
    liftExerciseLines: w.liftExerciseLines,
  }));
  const body = groupedCompletedSessionsMarkdown(rows, browserTimeZone, {
    newestDayFirst: true,
  });
  return `### Recent ${kindLabel} sessions (latest ${ws.length})\n\n${body}`;
}

/** Readable tool payload for `list_planned_workouts`. */
function formatPlansForModel(plans: PlannerPlannedBrief[]): string {
  if (plans.length === 0) {
    return "### Planned workouts\n(No planned rows matched the filters.)";
  }
  const lines = plans.map((p) => {
    const extras: string[] = [];
    const n = oneLinePreview(p.notes, 140);
    if (n) {
      extras.push(`notes: ${n}`);
    }
    if (p.distance != null && Number.isFinite(p.distance) && p.distanceUnits) {
      extras.push(`distance: ${p.distance} ${p.distanceUnits}`);
    }
    if (
      p.timeSeconds != null &&
      Number.isFinite(p.timeSeconds) &&
      p.timeSeconds > 0
    ) {
      const m = Math.round(p.timeSeconds / 60);
      extras.push(`~${m} min target`);
    }
    const tail = extras.length ? ` ${extras.join(" · ")}` : "";
    const linked = p.hasLinkedSession ? " · logged" : "";
    return `- **${p.dayKey}** · \`${p.status}\` · \`${p.kind}\`${tail}${linked}\n  id=${p.id}`;
  });
  return ["### Planned workouts (by calendar day)", "", ...lines].join("\n");
}

export async function executePlanningTool(options: {
  name: string;
  argumentsJson: string;
  timeZoneDefault: string;
  /** Planning chat thread — required for proposal tools. */
  threadId?: string;
  /** When the model invokes `mark_as_proposal`, the stream runner flags this turn’s assistant message. */
  onMarkAsProposal?: () => void;
}): Promise<string> {
  const name = options.name.trim();
  const obj = parseJsonArgs(options.argumentsJson);

  switch (name) {
    case "list_completed_workouts": {
      const tz = options.timeZoneDefault;
      const kindRaw = asStr(obj.kind);
      const kind =
        kindRaw &&
        ["lift", "run", "bike", "swim", "recovery", "all"].includes(kindRaw)
          ? (kindRaw as "lift" | "run" | "bike" | "swim" | "recovery" | "all")
          : undefined;
      const workouts = await plannerListCompletedWorkouts({
        timeZone: tz,
        sinceDay: asStr(obj.since_day),
        untilDay: asStr(obj.until_day),
        limit: typeof obj.limit === "number" ? obj.limit : undefined,
        kind,
      });
      return formatCompletedForModel(workouts.workouts, tz);
    }
    case "recent_sessions_by_kind": {
      const tz = options.timeZoneDefault;
      const kindRaw = (asStr(obj.kind) ?? "").toLowerCase();
      const singles = ["lift", "run", "bike", "swim", "recovery"] as const;
      if (!(singles as readonly string[]).includes(kindRaw)) {
        throw new Error(
          "recent_sessions_by_kind requires kind: lift | run | bike | swim | recovery",
        );
      }
      const kind = kindRaw as (typeof singles)[number];
      let limit = 15;
      if (typeof obj.limit === "number" && Number.isFinite(obj.limit)) {
        limit = Math.min(40, Math.max(1, Math.floor(obj.limit)));
      }
      const workouts = await plannerListCompletedWorkouts({
        timeZone: tz,
        limit,
        kind,
      });
      return formatRecentSessionsByKindForModel(kind, workouts.workouts, tz);
    }
    case "list_planned_workouts": {
      const filters: ActivityListSchemaValues = {
        page: 0,
        pageSize: 100,
        kind: obj.kind as PlanKind,
        status: obj.status as PlanStatus,
        dateFrom: asStr(obj.since_day),
        dateTo: asStr(obj.until_day),
      };
      const plans = await plannerListPlannedWorkouts({
        filters,
        limit: typeof obj.limit === "number" ? obj.limit : undefined,
      });
      return formatPlansForModel(plans.plans);
    }
    case "get_planned_workout": {
      const id = asStr(obj.id) ?? "";
      if (!id) {
        throw new Error("missing id");
      }
      const row = await activityActions.get({ data: { id } });
      if (!row) {
        return JSON.stringify({ ok: false, error: "not_found", id });
      }
      return JSON.stringify({
        ok: true,
        plan: {
          id: row.id,
          kind: row.kind,
          dayKey: row.dayKey,
          notes: row.notes,
          status: row.status,
          routineVendor: row.routineVendor,
          routineId: row.routineId,
          completedWorkoutId: row.completedWorkoutId,
          distance: row.distance,
          distanceUnits: row.distanceUnits,
          timeSeconds: row.timeSeconds,
          has_linked_session: row.completedWorkoutId != null,
        },
      });
    }
    case "create_planned_workout": {
      const kind = (asStr(obj.kind) ?? "") as PlanKind;
      if (!PLAN_KIND_VALUES.includes(kind as PlanKind)) {
        throw new Error(`${kind} is not a valid plan kind`);
      }
      const res = await activityActions.create({
        data: {
          kind,
          dayKey: obj.day_key as string,
          notes: obj.notes ? String(obj.notes) : undefined,
          distance: obj.distance ? Number(obj.distance) : undefined,
          distanceUnits: obj.distance_units
            ? (obj.distance_units as CardioDistanceUnit)
            : undefined,
          timeSeconds: obj.time_seconds
            ? Math.floor(Number(obj.time_seconds))
            : undefined,
        },
      });
      return JSON.stringify({
        ok: true,
        id: res.id,
      });
    }
    case "update_planned_workout": {
      const id = asStr(obj.id) ?? "";
      await activityActions.update({
        data: {
          id,
          notes: obj.notes === undefined ? undefined : asOptionalStr(obj.notes),
          dayKey: obj.day_key === undefined ? undefined : asStr(obj.day_key),
          kind: obj.kind ? (obj.kind as PlanKind) : undefined,
          status: obj.status ? (obj.status as PlanStatus) : undefined,
          hevyRoutineId: obj.hevy_routine_id
            ? String(obj.hevy_routine_id)
            : undefined,
          distance: obj.distance ? Number(obj.distance) : undefined,
          distanceUnits: obj.distance_units
            ? (obj.distance_units as CardioDistanceUnit)
            : undefined,
          timeSeconds: obj.time_seconds
            ? Math.floor(Number(obj.time_seconds))
            : undefined,
        },
      });
      return JSON.stringify({
        ok: true,
        id,
      });
    }
    case "delete_planned_workout": {
      const id = asStr(obj.id) ?? "";
      await activityActions.deletePlan({ data: { id } });
      return JSON.stringify({
        ok: true,
        id,
      });
    }
    case "mark_as_proposal": {
      options.onMarkAsProposal?.();
      return JSON.stringify({
        ok: true,
        note: "Logged for persist. The server auto-detects proposal turns from the saved reply when this turn has no calendar writes; optional override if you also signaled here.",
      });
    }
    case "get_recent_proposal": {
      const tid = options.threadId?.trim() ?? "";
      if (tid === "") {
        throw new Error(
          "get_recent_proposal requires an active planning thread",
        );
      }
      const row = await getMostRecentAssistantProposal(tid);
      if (!row) {
        return [
          "### Recent calendar proposal",
          "",
          "_No assistant message has `is_proposal`. When you propose a schedule before writes, call **mark_as_proposal** in that same turn._",
        ].join("\n");
      }
      return [
        "### Recent calendar proposal (`is_proposal`)",
        "",
        `message_id=${row.id}`,
        "",
        row.content.trim(),
      ].join("\n");
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
