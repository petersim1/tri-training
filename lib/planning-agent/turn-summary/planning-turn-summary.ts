import type OpenAI from "openai";

import type { PlanningChatMessageRow } from "@/lib/db/schema.server";
import type { PersistedPlanningToolRoundJson } from "../tools/planning-tool-trace-metadata";
import { deriveReplaySummaryFromAssistant } from "./replay-summary";

const PLANNING_TURN_SUMMARY_MODEL = "gpt-4o-mini";

const TURN_SUMMARY_RECENT_PAIRS_CAP = 5;
const TURN_SUMMARY_RECENT_PAIR_ROLE_CAP = 12_000;

export type PlanningTurnTopic =
  | "planning"
  | "logging"
  | "coaching_discussion"
  | "correction"
  | "general";

export type PlanningTurnSummary = {
  timestamp: string;
  topic: PlanningTurnTopic;
  summary: string;
  athlete_intent?: string;
  disagreement?: string;
  open_questions?: string[];
};

const VALID_TOPICS = new Set<string>([
  "planning",
  "logging",
  "coaching_discussion",
  "correction",
  "general",
]);

function normalizeTopic(raw: unknown): PlanningTurnTopic {
  if (typeof raw === "string" && VALID_TOPICS.has(raw)) {
    return raw as PlanningTurnTopic;
  }
  return "general";
}

function stripJsonFence(raw: string): string {
  const s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(s);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return s;
}

function truncateMiddle(s: string, cap: number): string {
  if (s.length <= cap) {
    return s;
  }
  return `${s.slice(0, Math.max(0, cap - 40))}\n…[truncated]…\n${s.slice(-30)}`;
}

function clipForPrompt(s: string, cap: number): string {
  const t = s.trim();
  if (t.length <= cap) {
    return t;
  }
  return `${t.slice(0, Math.max(0, cap - 33))}\n…[truncated ${t.length - cap} chars]…`;
}

function extractUserAssistantPairsAscending(
  rows: PlanningChatMessageRow[],
): { user: string; assistant: string }[] {
  const out: { user: string; assistant: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    if (cur.role !== "user") {
      continue;
    }
    const next = rows[i + 1];
    if (!next || next.role !== "assistant") {
      continue;
    }
    out.push({
      user: clipForPrompt(cur.content ?? "", TURN_SUMMARY_RECENT_PAIR_ROLE_CAP),
      assistant: clipForPrompt(
        next.content ?? "",
        TURN_SUMMARY_RECENT_PAIR_ROLE_CAP,
      ),
    });
    i++;
  }
  return out;
}

/**
 * Prior complete user/assistant exchanges (verbatim content), for turn-summary extraction (up to 5 newest pairs = ~last 3–5 turns).
 */
export function buildRecentConversationPairsAsciiForSummarizer(
  priorPersistedAscending: PlanningChatMessageRow[],
): string {
  const pairs = extractUserAssistantPairsAscending(priorPersistedAscending);
  if (pairs.length === 0) {
    return "(No prior complete user↔assistant turns in this thread before the current exchange.)";
  }
  const window = pairs.slice(-TURN_SUMMARY_RECENT_PAIRS_CAP);
  const lines: string[] = [];
  lines.push(
    `Below are the ${window.length} most recent **prior** exchanges (verbatim user + assistant), oldest first within this block.`,
  );
  for (let ei = 0; ei < window.length; ei++) {
    const p = window[ei];
    const n = pairs.length - window.length + ei + 1;
    lines.push(
      `\n### Prior exchange ${n}\nUSER:\n${p.user}\n\nASSISTANT:\n${p.assistant}`,
    );
  }
  return lines.join("\n").trim();
}

/** Compact digest for the summarizer only — never written to thread memory. */
export function buildToolTraceDigestForSummarizer(
  rounds: PersistedPlanningToolRoundJson[],
): string {
  if (rounds.length === 0) {
    return "(no tools this turn)";
  }
  const parts: string[] = [];
  for (let ri = 0; ri < rounds.length; ri++) {
    const r = rounds[ri];
    const names = [...new Set(r.toolCalls.map((tc) => tc.function.name))].join(
      ", ",
    );
    parts.push(`Round ${ri + 1}: tools [${names}]`);
    for (let ti = 0; ti < r.toolResults.length; ti++) {
      const tr = r.toolResults[ti];
      parts.push(
        `  • ${tr.toolName}: ${truncateMiddle(tr.content.replace(/\s+/g, " ").trim(), 900)}`,
      );
    }
  }
  return parts.join("\n");
}

export function buildFallbackTurnSummary(input: {
  userMessage: string;
  assistantMessage: string;
  /** Matches assistant replay JSON "timestamp"; defaults to wall clock now. */
  turnTimestampIso?: string;
}): PlanningTurnSummary {
  const g = deriveReplaySummaryFromAssistant(input.assistantMessage);
  const ts =
    typeof input.turnTimestampIso === "string" &&
    input.turnTimestampIso.trim() !== ""
      ? input.turnTimestampIso.trim()
      : new Date().toISOString();
  return {
    timestamp: ts,
    topic: "general",
    summary: g,
    athlete_intent: undefined,
    disagreement: undefined,
    open_questions: undefined,
  };
}

export function stringifyTurnSummary(ts: PlanningTurnSummary): string {
  return JSON.stringify(ts);
}

export function parseTurnSummaryFromReplay(
  raw: string | null | undefined,
): PlanningTurnSummary | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const o = parsed as Record<string, unknown>;
    const ts = typeof o.timestamp === "string" ? o.timestamp : "";
    const sum = typeof o.summary === "string" ? o.summary : "";
    if (ts.trim() === "" || sum.trim() === "") {
      return null;
    }
    const out: PlanningTurnSummary = {
      timestamp: ts,
      topic: normalizeTopic(o.topic),
      summary: sum,
    };
    if (
      typeof o.athlete_intent === "string" &&
      o.athlete_intent.trim() !== ""
    ) {
      out.athlete_intent = o.athlete_intent.trim();
    }
    if (typeof o.disagreement === "string" && o.disagreement.trim() !== "") {
      out.disagreement = o.disagreement.trim();
    }
    if (Array.isArray(o.open_questions)) {
      const qs = o.open_questions.filter(
        (x) => typeof x === "string" && x.trim() !== "",
      ) as string[];
      if (qs.length > 0) {
        out.open_questions = qs;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** OpenAI replay role content — structured, not verbatim assistant prose. */
export function formatTurnSummaryForOpenAiHistory(
  ts: PlanningTurnSummary,
): string {
  return `[Earlier assistant reply — distilled]\n${JSON.stringify(ts, null, 2)}`;
}

const TURN_SUMMARY_INPUT_CAP = 52_000;

function buildSummarizerUserPrompt(input: {
  recentContextBlock: string;
  /** Authoritative anchor for this planning turn — use as JSON "timestamp". */
  turnTimestampIso: string;
  toolDigest: string;
  userMessage: string;
  assistantMessage: string;
}): string {
  const user = clipForPrompt(input.userMessage, TURN_SUMMARY_INPUT_CAP);
  const assistant = clipForPrompt(
    input.assistantMessage,
    TURN_SUMMARY_INPUT_CAP,
  );

  return `You extract LONG-TERM COACHING SIGNAL from one planning-chat turn — not prose polish.

TASK
Given (A) a short window of **prior verbatim exchanges**, (B) this turn’s tool digest for grounding only, (C) this turn’s athlete message, (D) this turn’s full assistant reply, produce ONE JSON object the app will replay later INSTEAD OF the assistant verbatim. Readers must reconstruct what mattered medically / athletically / calendrical without reading the dialogue.

AUTHORITATIVE TURN CLOCK
Use this EXACT string for the JSON field "timestamp" (do not substitute):
${input.turnTimestampIso.trim()}

REQUIRED OUTPUT SHAPE
Return ONLY a JSON object:
{
  "timestamp": "(must equal the authoritative line above verbatim)",
  "topic": "planning" | "logging" | "coaching_discussion" | "correction" | "general",
  "summary": "...",
  "athlete_intent": "...",
  "disagreement": "...",
  "open_questions": ["..."]
}
Omit optional keys **entirely** when absent: disagreement, open_questions. Never emit null for omit-table fields.

FIELD RULES — summary & intent
• "summary": 2–4 tight sentences naming **decisions**, **constraints**, **prescriptions**, or factual outcomes. Embed **explicit numbers**: HR Zones / BPM, distances (with units), durations (minutes/hours), reps/load if stated. Forbidden alone: fluff like "balanced plan", "building volume", "focused on technique" unless the **same sentence** ties to countable prescription (e.g. "…45 min Z2 bike…").
• If THIS turn introduced or revised a calendar **week/multi-day lineup**, encode it as ONE LINE PER DAY inside "summary", newline-separated; each line: weekday optional + ISO date + modality + durations/distances/Zones cited.
• "athlete_intent": Infer what they were trying to achieve (prior goals + implicit drivers), not quoting their wording.

FIELD RULES — disagreement & openness
• "disagreement": ONLY if athlete pushed back, corrected the agent, or agent had to undo/pivot—state **what diverged**, **whose claim won**, WHY (injury clarification, pacing dispute, factual fix). Missing field if none — do NOT invent conflict.
• "open_questions": concrete unresolved items blocking next-session planning — ONLY if plainly left open in the exchange.

CRITICAL — DO NOT JUST RE-SUMMARIZE THE ASSISTANT
• The assistant reply below is RAW INPUT FACT for parsing — **not** a document to shorten or elegantly rephrase.
• **DO NOT produce a gist that merely parrots assistant cadence.** Extract cross-message meaning: bridging prior context + athlete pushback + deltas this turn justified.
• **Weight athlete words & corrections MORE than polite assistant framing.** If they corrected workload, modality, intensities, health limits, THAT correction is FIRST-CLASS summary signal (also mirror concise detail in disagreement when appropriate).
• **Never invent physiology, splits, approvals, metrics, injuries, races, HR, or prescriptions** absent from prior context block, athlete message, assistant reply, or tool digest literal facts.

topic "correction" when athlete directly fixes factual claims about goals, readiness, logistics, boundaries, preference.

TOOL DIGEST — internal grounding only — never cite tool NAMES or dump raw payloads in JSON; use only what they prove factually happened (e.g. "three planned rows inserted"):

---
${input.toolDigest.trim()}
---

———————— PRIOR CONTEXT (verbatim)— last up to five complete exchanges before this athlete message —————————
${input.recentContextBlock}

———————— THIS TURN — athlete message (verbatim)
USER:
---
${user}
---

———————— THIS TURN — assistant reply — FULL verbatim (primary structural detail for extraction; DO NOT mimic its tone)
ASSISTANT:
---
${assistant}
---

Return ONLY the JSON object. No markdown fences, no preamble, no commentary.`;
}

/** LLM extract — distill never shown verbatim in replay; merges authoritative timestamp after parse. */
export async function extractStructuredPlanningTurnSummaryFromOpenAi(
  openai: OpenAI,
  input: {
    recentContextBlock: string;
    turnTimestampIso: string;
    toolDigest: string;
    userMessage: string;
    assistantMessage: string;
    signal?: AbortSignal;
  },
): Promise<PlanningTurnSummary> {
  const userPrompt = buildSummarizerUserPrompt(input);
  const extra =
    input.signal !== undefined ? { signal: input.signal } : undefined;
  const completion = await openai.chat.completions.create(
    {
      model: PLANNING_TURN_SUMMARY_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract durable coaching signal from planner dialogue. Never parrot or lightly reword assistant prose: synthesize causal facts the athlete/agent established, emphasizing athlete-authored constraints and corrections. Ban vague placeholders without numbers.",
        },
        { role: "user", content: userPrompt },
      ],
    },
    extra,
  );
  const text = completion.choices[0]?.message?.content ?? "{}";
  const stripped = stripJsonFence(text);
  const parsed = JSON.parse(stripped || "{}") as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const normalized = normalizeTurnSummaryParsed(
      parsed as Record<string, unknown>,
    );
    if (normalized) {
      return {
        ...normalized,
        timestamp: input.turnTimestampIso.trim(),
      };
    }
  }
  throw new Error("invalid_turn_summary_json");
}

function normalizeTurnSummaryParsed(
  o: Record<string, unknown>,
): PlanningTurnSummary | null {
  const ts =
    typeof o.timestamp === "string" && o.timestamp.trim() !== ""
      ? o.timestamp.trim()
      : new Date().toISOString();
  let sum =
    typeof o.summary === "string"
      ? o.summary
          .trim()
          .replace(/\r\n/g, "\n")
          .split("\n")
          .map((line) => line.replace(/[ \t]+/g, " ").trim())
          .join("\n")
          .trim()
      : "";
  if (!sum) {
    return null;
  }
  if (sum.length > 5600) {
    sum = `${sum.slice(0, 5597)}…`;
  }
  const topic = normalizeTopic(o.topic);
  const out: PlanningTurnSummary = {
    timestamp: ts,
    topic,
    summary: sum,
  };
  if (typeof o.athlete_intent === "string" && o.athlete_intent.trim() !== "") {
    out.athlete_intent = o.athlete_intent.trim();
  }
  if (typeof o.disagreement === "string" && o.disagreement.trim() !== "") {
    out.disagreement = o.disagreement.trim();
  }
  if (Array.isArray(o.open_questions)) {
    const qs = o.open_questions.filter(
      (x): x is string => typeof x === "string" && x.trim() !== "",
    );
    if (qs.length > 0) {
      out.open_questions = qs.slice(0, 8);
    }
  }
  return out;
}
