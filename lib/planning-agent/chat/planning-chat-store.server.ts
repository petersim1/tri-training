import { and, desc, eq, sql } from "drizzle-orm";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getDb } from "@/lib/db/index.server";
import {
  type PlanningChatMessageRow,
  planningChatMessages,
} from "@/lib/db/schema.server";
import type { PersistedPlanningToolRoundJson } from "../tools/planning-tool-trace-metadata";
import { persistedTraceHasCalendarWriteTools } from "../tools/planning-tool-trace-metadata";
import {
  formatTurnSummaryForOpenAiHistory,
  parseTurnSummaryFromReplay,
} from "../turn-summary/planning-turn-summary";
import { looksLikeScheduleProposalAwaitingConsent } from "./proposal-detect";

const PLANNING_HISTORY_MAX_USER_TURNS = 3;
const PLANNING_HISTORY_MAX_ASSISTANT_TURNS = 3;
const USER_CONTENT_CAP = 10_000;

async function clearAssistantProposalFlagsInThread(
  threadId: string,
): Promise<void> {
  const tid = threadId.trim();
  if (tid === "") {
    return;
  }
  const db = await getDb();
  await db
    .update(planningChatMessages)
    .set({ isProposal: false })
    .where(
      and(
        eq(planningChatMessages.threadId, tid),
        eq(planningChatMessages.role, "assistant"),
      ),
    )
    .run();
}

/**
 * Persisted `is_proposal` for the row we are about to insert.
 * - Turns with calendar writes never get the flag; any `mark_as_proposal` in that loop is ignored.
 * - Otherwise we flag when the assistant published a week-style schedule awaiting consent, detected
 *   from the persisted reply text, or optionally when the model calls `mark_as_proposal`.
 */
export async function assistantProposalPersistHints(opts: {
  threadId: string;
  trace: PersistedPlanningToolRoundJson[];
  /** True when `mark_as_proposal` was invoked—ignored if this turn also ran calendar writes */
  markFromTool: boolean;
  persistedAssistantContent: string;
}): Promise<{ insertIsProposal: boolean }> {
  if (persistedTraceHasCalendarWriteTools(opts.trace)) {
    return { insertIsProposal: false };
  }

  const autoProposal = looksLikeScheduleProposalAwaitingConsent(
    opts.persistedAssistantContent,
  );
  const effective = opts.markFromTool || autoProposal;

  if (!effective) {
    return { insertIsProposal: false };
  }

  await clearAssistantProposalFlagsInThread(opts.threadId);
  return { insertIsProposal: true };
}

/** Latest assistant row flagged as the calendar proposal, for `get_recent_proposal`. */
export async function getMostRecentAssistantProposal(
  threadId: string,
): Promise<{ content: string; id: string } | undefined> {
  const tid = threadId.trim();
  if (tid === "") {
    return undefined;
  }
  const db = await getDb();
  const row = await db
    .select({
      id: planningChatMessages.id,
      content: planningChatMessages.content,
    })
    .from(planningChatMessages)
    .where(
      and(
        eq(planningChatMessages.threadId, tid),
        eq(planningChatMessages.role, "assistant"),
        eq(planningChatMessages.isProposal, true),
      ),
    )
    .orderBy(desc(planningChatMessages.seq))
    .get();
  if (!row) {
    return undefined;
  }
  return { id: row.id, content: row.content };
}

async function nextMessageSeq(threadId: string): Promise<number> {
  const db = await getDb();
  const row = await db
    .select({
      m: sql<number>`coalesce(max(${planningChatMessages.seq}), -1)`,
    })
    .from(planningChatMessages)
    .where(eq(planningChatMessages.threadId, threadId))
    .get();
  const maxSeq = typeof row?.m === "number" ? row.m : Number(row?.m ?? -1);
  return Number.isFinite(maxSeq) ? Math.floor(maxSeq) + 1 : 0;
}

export async function insertPlanningMessages(
  threadId: string,
  inserts: Array<
    Omit<typeof planningChatMessages.$inferInsert, "threadId" | "seq">
  >,
): Promise<void> {
  if (inserts.length === 0) {
    return;
  }
  let seqBase = await nextMessageSeq(threadId);
  const db = await getDb();
  const values = inserts.map((r) => ({
    ...r,
    threadId,
    seq: seqBase++,
  }));
  await db.insert(planningChatMessages).values(values).run();
}

export async function updatePlanningMessageReplaySummary(
  messageId: string,
  replaySummary: string,
): Promise<void> {
  const id = messageId.trim();
  if (id === "") {
    return;
  }
  const db = await getDb();
  await db
    .update(planningChatMessages)
    .set({ replaySummary })
    .where(eq(planningChatMessages.id, id))
    .run();
}

export type PlanningChatMessageInsertBody = Omit<
  typeof planningChatMessages.$inferInsert,
  "threadId" | "seq"
> & {
  id: string;
};

/** Model input for the current user utterance before it is persisted. */
export function pendingUserOpenAiTurn(
  content: string,
): ChatCompletionMessageParam {
  return {
    role: "user",
    content: truncateText(content, USER_CONTENT_CAP),
  };
}

function truncateText(s: string, cap: number): string {
  if (s.length <= cap) {
    return s;
  }
  return `${s.slice(0, Math.max(0, cap - 1))}…`;
}

/** Walk newest → oldest until we hit the user cap, assistant cap, or the start — keeps a contiguous suffix. */
function sliceRecentUserAndAssistantTurns(
  persistedAsc: PlanningChatMessageRow[],
): PlanningChatMessageRow[] {
  let userCount = 0;
  let assistantCount = 0;
  const pickedNewestFirst: PlanningChatMessageRow[] = [];
  for (let i = persistedAsc.length - 1; i >= 0; i--) {
    const row = persistedAsc[i];
    if (row.role === "user") {
      if (userCount >= PLANNING_HISTORY_MAX_USER_TURNS) {
        break;
      }
      userCount++;
    } else if (row.role === "assistant") {
      if (assistantCount >= PLANNING_HISTORY_MAX_ASSISTANT_TURNS) {
        break;
      }
      assistantCount++;
    }
    pickedNewestFirst.push(row);
  }
  pickedNewestFirst.reverse();
  return pickedNewestFirst;
}

/** Build model replay: last few user verbatim + assistant `replay_summary` JSON only (capped counts). */
export function buildOpenAiMessagesFromHistory(
  persisted: PlanningChatMessageRow[],
): ChatCompletionMessageParam[] {
  const tail = sliceRecentUserAndAssistantTurns(persisted);
  const out: ChatCompletionMessageParam[] = [];

  for (const row of tail) {
    if (row.role === "user") {
      out.push({
        role: "user",
        content: truncateText(row.content, USER_CONTENT_CAP),
      });
      continue;
    }
    if (row.role === "assistant") {
      const distilled = parseTurnSummaryFromReplay(row.replaySummary);
      if (distilled) {
        out.push({
          role: "assistant",
          content: truncateText(
            formatTurnSummaryForOpenAiHistory(distilled),
            USER_CONTENT_CAP,
          ),
        });
        continue;
      }
      const legacy = (row.replaySummary ?? "").trim();
      const gist =
        legacy !== ""
          ? legacy
          : truncateText(row.content ?? "", 480) || "[earlier reply]";
      out.push({
        role: "assistant",
        content: gist,
      });
    }
  }
  return out;
}
