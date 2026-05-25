import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { PlanningChatMessageRow } from "@/lib/db/schema.server";
import {
  assistantProposalPersistHints,
  insertPlanningMessages,
  type PlanningChatMessageInsertBody,
} from "../chat/planning-chat-store.server";
import { planningCalendarAnchorInTimeZone } from "../context/calendar-anchor";
import { mergeCoachingStateAfterPlanningTurn } from "../context/coaching-state";
import {
  type PlanningSportEventReferenceJson,
  runwayWeeksParts,
  sportEventAttachedSystemAppendix,
} from "../context/sport-event-context";
import type { PersistedPlanningToolRoundJson } from "../tools/planning-tool-trace-metadata";
import { wrapPlanningToolTraceMetadata } from "../tools/planning-tool-trace-metadata";
import { PLANNING_CHAT_MODEL, PLANNING_TOOLS } from "../tools/tool-definitions";
import { executePlanningTool } from "../tools/tool-runner";
import {
  buildFallbackTurnSummary,
  buildRecentConversationPairsAsciiForSummarizer,
  type PlanningTurnSummary,
  stringifyTurnSummary,
} from "../turn-summary/planning-turn-summary";
import { refineTurnSummaryAfterPlanningTurn } from "../turn-summary/planning-turn-summary-refine";

const MAX_TOOL_ROUNDS = 14;

const PLANNING_SYSTEM_PROMPT_BASE =
  "**Role:** Help the athlete maintain and revise their workout calendar.\n\n" +
  "**Ground truth:** Factual statements about what’s on the calendar or what they completed come only **after** fetching with tools. Do not invent plan rows—but do **not** call tools out of habit when this thread already has what you need.\n\n" +
  "**Personalization:** `### Current coaching state` (when injected) holds constraints, preferences, and periodization—**prioritize those** for modality mix, session shape, stacking, intensity, volume bias, taper style, etc. Prefer that lens over rigid global rules here. Where coaching state is sparse, follow the athlete’s wording.\n\n" +
  "**Target event:** If an attached sport-event appendix appears later, fold it together with completions, plans, and coaching state when shaping advice.\n\n" +
  "**Tools — deliberate:** `list_planned_workouts` for planned rows over a window. `list_completed_workouts` for mixed recent history. `recent_sessions_by_kind` for one modality’s last N completions when that discipline’s progression matters. Prefer the smallest fetch that answers the question; skip redundant repeats if prior tool results in-thread still suffice.\n\n" +
  "**Progression:** **Consider** recent completions, current plans, coaching state, and any target event when you suggest changes—ground adjustments in fetched evidence where possible (or fetch briefly first) and **briefly** note why it fits **their** context.\n\n" +
  "**Writes require consent:** Do **not** call `create_planned_workout`, `update_planned_workout`, or `delete_planned_workout` unless the **same message** or the **immediate prior assistant reply** clearly asked for calendar writes. Praise alone isn’t consent.\n\n" +
  "**Proposal recall:** The server marks the assistant row that publishes a concrete week/day lineup **without** calendar writes in that same turn (`is_proposal`). On the approval turn — when you finally call `create` / `update` / `delete` — call **`get_recent_proposal`** first so summarized chat does not erase exact day keys. You do **not** need `mark_as_proposal` (optional; never effective on write turns).\n\n" +
  "**Schedule wording:** Readable prescriptions work best with weekday + `YYYY-MM-DD`, `kind`, durations (`time_seconds` as minutes × 60) or distances, and `notes` reflecting intent.\n\n" +
  "**Tone/clarity:** Match how this athlete expresses preferences—coaching-state JSON and chat—not a fixed “coach persona” scripted here.\n\n" +
  "**Editing moves:** Inspect surrounding plans (`list_planned_workouts`, `get_planned_workout`) before delete/move.\n\n" +
  '**Tool dates:** Use literal `YYYY-MM-DD` for `since_day`/`until_day`—not the word "today" as a placeholder value.\n\n' +
  "**Activity fields (`create_planned_workout`, etc.):**\n" +
  "- `kind` — lift | run | bike | swim | recovery\n" +
  "- `day_key` — YYYY-MM-DD (required)\n" +
  "- `status` — planned | completed | skipped (default planned)\n" +
  "- `distance` + `distance_units` — run/bike/swim targets (optional, e.g. 5 mi)\n" +
  "- `time_seconds` — aligned with prose (37-minute lift ⇒ 2220).\n" +
  "- `notes` — short intent labels (easy spin, brick, drills, rest, …).\n";

function planningSystemPromptWithClock(opts: {
  browserTimeZone: string;
  todayYmd: string;
  weekdayLong: string;
  sportEventThisTurn?: PlanningSportEventReferenceJson | null;
  coachingStateAppendix?: string | null;
}): string {
  let text =
    PLANNING_SYSTEM_PROMPT_BASE +
    "\n### Calendar anchor (infer day-key bounds from this)\n" +
    `- IANA timezone: ${opts.browserTimeZone}\n` +
    `- Today: ${opts.todayYmd} (${opts.weekdayLong})\n` +
    'For vague week requests ("this week", "next week", "upcoming week"), query/plan starting **tomorrow\'s calendar date** through **seven days forward** inclusive unless the user gave explicit dates—in tools always send literal `since_day` / `until_day`.\n';
  const coaching = (opts.coachingStateAppendix ?? "").trim();
  if (coaching !== "") {
    text += `\n${coaching}\n`;
  }
  const ev = opts.sportEventThisTurn ?? null;
  if (ev) {
    const runway = runwayWeeksParts(opts.todayYmd, ev.event_day_key);
    text += `\n${sportEventAttachedSystemAppendix(ev, runway)}\n`;
  }
  return text;
}

type ToolAccumulator = Map<
  number,
  {
    id?: string;
    type?: string;
    function?: { name: string; arguments: string };
  }
>;

function applyToolDelta(acc: ToolAccumulator, deltaTc: unknown): void {
  if (!deltaTc || typeof deltaTc !== "object" || Array.isArray(deltaTc)) {
    return;
  }
  const d = deltaTc as Record<string, unknown>;
  const index =
    typeof d.index === "number" && Number.isFinite(d.index) ? d.index : 0;
  const prev = acc.get(index) ?? {};
  const slot = { ...prev };
  const idSlice = typeof d.id === "string" ? d.id : undefined;
  if (idSlice) {
    slot.id = idSlice;
  }
  const tp = typeof d.type === "string" ? d.type : undefined;
  if (tp) {
    slot.type = tp;
  }
  const fn = d.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn)) {
    const fo = fn as Record<string, unknown>;
    const nameFrag = typeof fo.name === "string" ? fo.name : "";
    const argFrag = typeof fo.arguments === "string" ? fo.arguments : "";
    const priorFn = slot.function ?? { name: "", arguments: "" };
    slot.function = {
      name: priorFn.name + nameFrag,
      arguments: priorFn.arguments + argFrag,
    };
  }
  acc.set(index, slot);
}

function finalizeToolCalls(acc: ToolAccumulator): Array<{
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}> {
  const keys = [...acc.keys()].sort((a, b) => a - b);
  const out: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];
  for (const k of keys) {
    const s = acc.get(k);
    if (
      !s?.id ||
      !s.function ||
      s.function.name.trim() === "" ||
      s.type !== "function"
    ) {
      continue;
    }
    out.push({
      id: s.id,
      type: "function",
      function: {
        name: s.function.name,
        arguments: s.function.arguments || "{}",
      },
    });
  }
  return out;
}

function truncateAt(s: string, cap: number): string {
  if (s.length <= cap) {
    return s;
  }
  return `${s.slice(0, cap - 1)}…`;
}

/**
 * DB + coaching / summaries should receive only what the athlete would read as "the reply" —
 * the final conversational segment, never pre-tool preambles that only existed to steer tool calls.
 */
function persistedAssistantReplyForUser(opts: {
  fullTranscript: string;
  finalRoundTrim: string;
}): string {
  const final = opts.finalRoundTrim.trim();
  if (final !== "") {
    return final;
  }
  const t = opts.fullTranscript.trim();
  if (t === "") {
    return "";
  }
  const blocks = t
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  return blocks.length > 0 ? (blocks.at(-1) ?? t) : t;
}

function consoleLogPlanningTool(payload: {
  threadId: string;
  round: number;
  toolCallId: string;
  tool: string;
  args: string;
  response: string;
}): void {
  console.log("[planning-chat:tool]", {
    threadId: payload.threadId,
    round: payload.round,
    toolCallId: payload.toolCallId,
    tool: payload.tool,
    args: truncateAt(payload.args, 100_000),
    response: truncateAt(payload.response, 150_000),
  });
}

async function finalizeAssistantCatchAll(options: {
  openai: OpenAI;
  assembledAssistantVisibleText: string;
  /** Trimmed prose from the last model completion (possibly empty when only tools fired). */
  finalRoundAssistantChunk: string;
  threadId: string;
  persistUserTurn: PlanningChatMessageInsertBody;
  toolTrace: PersistedPlanningToolRoundJson[];
  recentContextBlock: string;
  turnTimestampIso: string;
  emitLine: (line: Uint8Array) => void | Promise<void>;
  coachUserIdForPatch?: string | null;
  signal?: AbortSignal;
  /** Model called `mark_as_proposal` — OR server may still auto-flag from prose when no writes this turn */
  markAssistantAsProposal: boolean;
}): Promise<string> {
  const rawTranscript = options.assembledAssistantVisibleText.trim();
  const persisted = persistedAssistantReplyForUser({
    fullTranscript: rawTranscript,
    finalRoundTrim: options.finalRoundAssistantChunk.trim(),
  }).trim();
  const msg =
    persisted.length > 0
      ? persisted
      : "[Assistant stopped early — try simplifying the request]";
  const id = crypto.randomUUID();
  const fallbackTurn = buildFallbackTurnSummary({
    userMessage: options.persistUserTurn.content,
    assistantMessage: msg,
    turnTimestampIso: options.turnTimestampIso,
  });
  options.signal?.throwIfAborted();
  const proposalHints = await assistantProposalPersistHints({
    threadId: options.threadId,
    trace: options.toolTrace,
    markFromTool: options.markAssistantAsProposal,
    persistedAssistantContent: msg,
  });
  await insertPlanningMessages(options.threadId, [
    options.persistUserTurn,
    {
      id,
      role: "assistant",
      content: msg,
      replaySummary: stringifyTurnSummary(fallbackTurn),
      metadata: wrapPlanningToolTraceMetadata(options.toolTrace),
      isProposal: proposalHints.insertIsProposal,
    },
  ]);
  if (options.coachUserIdForPatch) {
    void mergeCoachingStateAfterPlanningTurn(options.openai, {
      userId: options.coachUserIdForPatch,
      userMessage: options.persistUserTurn.content,
      assistantMessage: msg,
      signal: options.signal,
    }).catch((err) => console.error("[planning-chat:coaching-state]", err));
  }
  void refineTurnSummaryAfterPlanningTurn(options.openai, {
    assistantMessageId: id,
    recentContextBlock: options.recentContextBlock,
    turnTimestampIso: options.turnTimestampIso,
    userMessage: options.persistUserTurn.content,
    assistantMessage: msg,
    traceRounds: options.toolTrace,
    signal: options.signal,
  }).catch((err) => console.error("[planning-chat:turn-summary]", err));
  await options.emitLine(
    new TextEncoder().encode(
      `${JSON.stringify({
        type: "done",
        assistantMessageId: id,
      })}\n`,
    ),
  );
  return msg;
}

export async function runPlanningAssistantTurn(opts: {
  openai: OpenAI;
  threadId: string;
  historyForModel: ChatCompletionMessageParam[];
  browserTimeZone: string;
  emitLine: (line: Uint8Array) => void | Promise<void>;
  /** Present only when `/stream` received `sportEventId` — DB snapshot for this inference pass. */
  sportEventThisTurn?: PlanningSportEventReferenceJson | null;
  /** Rich coaching layer — stitched under race appendix before thread memory facts. */
  coachingStateAppendix?: string | null;
  coachUserIdForPatch?: string | null;
  /** Persisted with a single assistant row once this turn succeeds. */
  persistUserTurn: PlanningChatMessageInsertBody;
  /** Rows already stored before this request’s user insert — omit current turn messages. */
  priorPersistedForTurnSummary?: PlanningChatMessageRow[];
  signal?: AbortSignal;
}): Promise<string> {
  const { browserTimeZone, threadId } = opts;
  const recentContextBlock = buildRecentConversationPairsAsciiForSummarizer(
    opts.priorPersistedForTurnSummary ?? [],
  );
  const turnTimestampIso =
    opts.persistUserTurn.createdAt instanceof Date &&
    !Number.isNaN(opts.persistUserTurn.createdAt.getTime())
      ? opts.persistUserTurn.createdAt.toISOString()
      : new Date().toISOString();
  const traceRoundsPersist: PersistedPlanningToolRoundJson[] = [];
  let assembledAssistantText = "";
  let markAssistantTurnAsProposal = false;

  async function persistTurnSuccess(
    assistantInsert: PlanningChatMessageInsertBody,
    fallbackTurn: PlanningTurnSummary,
  ): Promise<void> {
    opts.signal?.throwIfAborted();
    const proposalHints = await assistantProposalPersistHints({
      threadId,
      trace: traceRoundsPersist,
      markFromTool: markAssistantTurnAsProposal,
      persistedAssistantContent: assistantInsert.content.trim(),
    });
    await insertPlanningMessages(threadId, [
      opts.persistUserTurn,
      {
        ...assistantInsert,
        replaySummary: stringifyTurnSummary(fallbackTurn),
        isProposal: proposalHints.insertIsProposal,
      },
    ]);
    if (opts.coachUserIdForPatch) {
      void mergeCoachingStateAfterPlanningTurn(opts.openai, {
        userId: opts.coachUserIdForPatch,
        userMessage: opts.persistUserTurn.content,
        assistantMessage: assistantInsert.content.trim(),
        signal: opts.signal,
      }).catch((err) => console.error("[planning-chat:coaching-state]", err));
    }
    void refineTurnSummaryAfterPlanningTurn(opts.openai, {
      assistantMessageId: assistantInsert.id,
      recentContextBlock,
      turnTimestampIso,
      userMessage: opts.persistUserTurn.content,
      assistantMessage: assistantInsert.content.trim(),
      traceRounds: traceRoundsPersist,
      signal: opts.signal,
    }).catch((err) => console.error("[planning-chat:turn-summary]", err));
    await opts.emitLine(
      new TextEncoder().encode(
        `${JSON.stringify({
          type: "done",
          assistantMessageId: assistantInsert.id,
        })}\n`,
      ),
    );
  }

  const anchor = planningCalendarAnchorInTimeZone(browserTimeZone);
  const systemPromptText = planningSystemPromptWithClock({
    browserTimeZone,
    todayYmd: anchor.todayYmd,
    weekdayLong: anchor.weekdayLong,
    sportEventThisTurn: opts.sportEventThisTurn,
    coachingStateAppendix: opts.coachingStateAppendix ?? null,
  });

  console.log("SYS PROMPT", systemPromptText);
  console.log("HISTORY", opts.historyForModel);

  const messagesWorking: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPromptText,
    },
    ...opts.historyForModel,
  ];

  opts.signal?.throwIfAborted();

  let assistantMessageOutId: string | null = null;
  let lastRoundAssistantChunk = "";
  let persistedAssistantForTurn = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    opts.signal?.throwIfAborted();

    const toolAcc: ToolAccumulator = new Map();

    let contentBuf = "";

    const streamRequestOpts =
      opts.signal !== undefined ? { signal: opts.signal } : undefined;

    const streamResp = await opts.openai.chat.completions.create(
      {
        model: PLANNING_CHAT_MODEL,
        messages: messagesWorking,
        tools: PLANNING_TOOLS,
        stream: true,
        temperature: 0.2,
      },
      streamRequestOpts,
    );

    for await (const chunk of streamResp) {
      opts.signal?.throwIfAborted();
      const delta = chunk.choices[0]?.delta;
      if (!delta) {
        continue;
      }
      if (delta.content) {
        contentBuf += delta.content;
        await opts.emitLine(
          new TextEncoder().encode(
            `${JSON.stringify({ type: "delta", text: delta.content })}\n`,
          ),
        );
      }
      const tcs = delta.tool_calls;
      if (Array.isArray(tcs)) {
        for (const tc of tcs) {
          applyToolDelta(toolAcc, tc);
        }
      }
    }

    const toolCalls = finalizeToolCalls(toolAcc);

    opts.signal?.throwIfAborted();

    const chunkTrim = contentBuf.trim();
    lastRoundAssistantChunk = chunkTrim;
    if (chunkTrim !== "") {
      assembledAssistantText =
        assembledAssistantText === ""
          ? chunkTrim
          : `${assembledAssistantText}\n\n${chunkTrim}`;
    }

    if (toolCalls.length > 0) {
      messagesWorking.push({
        role: "assistant",
        content: chunkTrim !== "" ? contentBuf : null,
        tool_calls: toolCalls,
      });

      const toolResults: PersistedPlanningToolRoundJson["toolResults"] = [];
      for (const tc of toolCalls) {
        opts.signal?.throwIfAborted();
        const name = tc.function.name;
        const argsJson = tc.function.arguments ?? "{}";

        let resultText = "";
        try {
          resultText = await executePlanningTool({
            name,
            argumentsJson: argsJson,
            timeZoneDefault: browserTimeZone,
            threadId,
            onMarkAsProposal: () => {
              markAssistantTurnAsProposal = true;
            },
          });
        } catch (e) {
          resultText = JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "tool_failure",
          });
        }

        consoleLogPlanningTool({
          threadId,
          round,
          toolCallId: tc.id,
          tool: name,
          args: argsJson,
          response: resultText,
        });

        messagesWorking.push({
          role: "tool",
          tool_call_id: tc.id,
          content: resultText,
        });

        toolResults.push({
          toolCallId: tc.id,
          toolName: name,
          content: truncateAt(resultText, 24_000),
        });
      }

      traceRoundsPersist.push({
        assistantPreamble: chunkTrim !== "" ? chunkTrim : null,
        toolCalls,
        toolResults,
      });

      continue;
    }

    opts.signal?.throwIfAborted();

    persistedAssistantForTurn =
      persistedAssistantReplyForUser({
        fullTranscript: assembledAssistantText,
        finalRoundTrim: chunkTrim,
      }).trim() || "(no text)";
    const fallbackTurn = buildFallbackTurnSummary({
      userMessage: opts.persistUserTurn.content,
      assistantMessage: persistedAssistantForTurn,
      turnTimestampIso,
    });
    assistantMessageOutId = crypto.randomUUID();
    await persistTurnSuccess(
      {
        id: assistantMessageOutId,
        role: "assistant",
        content: persistedAssistantForTurn,
        metadata: wrapPlanningToolTraceMetadata(traceRoundsPersist),
      },
      fallbackTurn,
    );
    break;
  }

  if (!assistantMessageOutId) {
    return await finalizeAssistantCatchAll({
      openai: opts.openai,
      assembledAssistantVisibleText: assembledAssistantText,
      finalRoundAssistantChunk: lastRoundAssistantChunk,
      threadId,
      persistUserTurn: opts.persistUserTurn,
      toolTrace: traceRoundsPersist,
      recentContextBlock,
      turnTimestampIso,
      emitLine: opts.emitLine,
      coachUserIdForPatch: opts.coachUserIdForPatch ?? null,
      signal: opts.signal,
      markAssistantAsProposal: markAssistantTurnAsProposal,
    });
  }
  return persistedAssistantForTurn;
}
