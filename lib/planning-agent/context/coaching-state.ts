import type OpenAI from "openai";

import type { CoachingStateRow, JsonValue } from "@/lib/db/schema.server";
import { coachingActions } from "@/server-fcts";

/** Same athlete as Strava OAuth allowlist (`ALLOWED_STRAVA_ATHLETE_ID`). */
export const PLANNING_CHAT_COACH_USER_ID = "88244635";

export const COACHING_STATE_PATCH_MODEL = "gpt-4o-mini";

function nonEmptyArray(v: JsonValue): v is JsonValue[] {
  return Array.isArray(v) && v.length > 0;
}

function nonEmptyObject(v: JsonValue): v is Record<string, JsonValue> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v as object).length > 0
  );
}

export function coachingStateRowToPromptSnapshot(
  row: CoachingStateRow,
): Record<string, unknown> {
  return {
    constraints: row.constraints,
    preferences: row.preferences,
    discipline_state: row.disciplineState,
    periodization: row.periodization,
    flags: row.flags,
  };
}

export function coachingStateSystemBlock(row: CoachingStateRow): string {
  const lines: string[] = [
    "",
    "### Current coaching state",
    "Interpreted preferences and truths from prior turns — prioritize these over generic training rules.",
    "",
  ];

  if (nonEmptyArray(row.constraints)) {
    lines.push("**Constraints**", JSON.stringify(row.constraints, null, 2), "");
  }

  if (nonEmptyObject(row.preferences)) {
    lines.push("**Preferences**", JSON.stringify(row.preferences, null, 2), "");
  }

  if (nonEmptyObject(row.disciplineState)) {
    lines.push(
      "**Discipline state**",
      JSON.stringify(row.disciplineState, null, 2),
      "",
    );
  }

  if (nonEmptyObject(row.periodization)) {
    lines.push(
      "**Periodization**",
      JSON.stringify(row.periodization, null, 2),
      "",
    );
  }

  if (nonEmptyObject(row.flags)) {
    lines.push("**Flags**", JSON.stringify(row.flags, null, 2), "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function buildCoachingStatePatchPrompt(input: {
  currentCoachingState: Record<string, unknown>;
  userMessage: string;
  assistantMessage: string;
}): string {
  return `You are maintaining a persisted coaching-state document for planning chat.
Given the conversation turn, return ONLY a JSON patch object whose top-level keys are a subset of:
constraints_patch, preferences, discipline_state, periodization, flags.
Use these exact snake_case names. Omit keys that did not change. Return {} if nothing changed.

constraints_patch (NOT a full constraints list): ordered array of operations. Each item:
- op: "add" | "replace" | "resolve"
- match: { "type": string, "description_contains": string } — find an existing constraint where type matches (case-insensitive) and description contains this substring (case-insensitive). Required for "replace" and "resolve". Omit for "add".
- value: full constraint object { type, description, resolved?, ... } — required for "add" and "replace". Omit for "resolve" (sets resolved: true on the matched row).

Use "replace" when the user is correcting an existing constraint (wrong side, wrong movement, etc.). If a match is found, that row becomes value; if none, value is appended (same as add).
Use "add" only for a genuinely new constraint with no reasonable existing match.
Use "resolve" when the user says something is healed or no longer applies.
Never duplicate rows: if unsure whether the turn is new info or a correction, prefer "replace" with a match on the shared keyword (e.g. type "injury" and description_contains "shoulder").

Other keys (shallow merge into stored JSON except where noted):
- preferences: durable athlete **style / defaults**—standing likes (preferred long-run day philosophy, modality bias, tooling notes), pacing defaults, cueing preferences—not day-by-day plans. **Never** weekday schedules, a "workout_plan" tree, "weekly_plan", or anything that duplicates the calendar assistant’s ephemeral proposal language.
- discipline_state: sport-keyed blobs; one sport key shallow-merges into its blob only. Same rule: never stash a full week roster here.
- periodization: object
- flags: object

Rules:
- **Never persist ephemeral calendar proposals** in coaching state: weekday maps (Monday–Sunday with activities/details), "workout_plan", week-specific sets of sessions, or prose that is only “here is this week’s lineup.” Those are already in chat + calendar tools—omit preferences / periodization / flags / discipline_state updates for that content.
- Descriptions and facts must come only from this turn's User/Assistant text—never copy canned examples or invent clinical detail.
- Never paste placeholder text from instructions into output.
- Do not echo unchanged blobs; only include keys that truly changed on this turn.

Current coaching state:
${JSON.stringify(input.currentCoachingState, null, 2)}

Conversation turn:
User: ${input.userMessage}
Assistant: ${input.assistantMessage}

Return only a JSON object. No explanation, no markdown.`;
}

function stripJsonFence(raw: string): string {
  const s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(s);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return s;
}

export async function extractCoachingStatePatchJson(
  openai: OpenAI,
  opts: {
    currentCoachingState: Record<string, unknown>;
    userMessage: string;
    assistantMessage: string;
    signal?: AbortSignal;
  },
): Promise<Record<string, unknown>> {
  const prompt = buildCoachingStatePatchPrompt({
    currentCoachingState: opts.currentCoachingState,
    userMessage: opts.userMessage.trim().slice(0, 28_000),
    assistantMessage: opts.assistantMessage.trim().slice(0, 28_000),
  });
  const extra = opts.signal !== undefined ? { signal: opts.signal } : undefined;
  const completion = await openai.chat.completions.create(
    {
      model: COACHING_STATE_PATCH_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return one JSON object. Top-level keys only: constraints_patch | preferences | discipline_state | periodization | flags. Use constraints_patch as diff ops (add/replace/resolve)—never return a full constraints array. Do not encode concrete weekly calendars or workout_plan payloads as preferences—they are ephemeral plans, not persisted coaching blobs.",
        },
        { role: "user", content: prompt },
      ],
    },
    extra,
  );
  const text = completion.choices[0]?.message?.content ?? "{}";
  const stripped = stripJsonFence(text);
  try {
    const parsed = JSON.parse(stripped || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return {};
}

export async function mergeCoachingStateAfterPlanningTurn(
  openai: OpenAI,
  input: {
    userId: string;
    userMessage: string;
    assistantMessage: string;
    signal?: AbortSignal;
  },
): Promise<void> {
  await coachingActions.ensureCoachingStateRow(input.userId);
  const row = await coachingActions.getCoachingStateRow(input.userId);
  if (!row) {
    return;
  }
  const patch = await extractCoachingStatePatchJson(openai, {
    currentCoachingState: coachingStateRowToPromptSnapshot(row),
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
    signal: input.signal,
  });
  await coachingActions.applyCoachingStatePatchInDb(input.userId, patch, row);
}
