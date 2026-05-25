import { createFileRoute } from "@tanstack/react-router";
import { APIUserAbortError } from "openai";
import { getSessionOk } from "@/lib/auth/session-server";
import { getPlanningOpenAiClient } from "@/lib/planning-agent/chat/openai-client.server";
import {
  buildOpenAiMessagesFromHistory,
  pendingUserOpenAiTurn,
} from "@/lib/planning-agent/chat/planning-chat-store.server";
import {
  coachingStateSystemBlock,
  PLANNING_CHAT_COACH_USER_ID,
} from "@/lib/planning-agent/context/coaching-state";
import {
  type PlanningSportEventReferenceJson,
  snapshotSportEventBriefForChat,
} from "@/lib/planning-agent/context/sport-event-context";
import { runPlanningAssistantTurn } from "@/lib/planning-agent/stream/stream-run";
import { isValidIanaTimeZone } from "@/lib/utils/dates";
import { chatActions, coachingActions, eventActions } from "@/server-fcts";

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

function jsonResp(status: number, obj: Record<string, unknown>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/planning-chat/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await getSessionOk())) {
          return jsonResp(401, { ok: false, error: "Unauthorized" });
        }
        const apiKey = process.env.OPENAI_KEY?.trim();
        if (!apiKey) {
          return jsonResp(503, {
            ok: false,
            error: "missing_openai_key",
          });
        }

        let bodyJson: Record<string, unknown>;
        try {
          bodyJson = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResp(400, { ok: false, error: "invalid_json" });
        }

        const contentRaw =
          typeof bodyJson.content === "string" ? bodyJson.content.trim() : "";
        if (contentRaw === "" || contentRaw.length > 12_000) {
          return jsonResp(400, { ok: false, error: "invalid_content" });
        }

        let timeZone =
          typeof bodyJson.timeZone === "string" ? bodyJson.timeZone.trim() : "";
        if (!timeZone || !isValidIanaTimeZone(timeZone)) {
          timeZone = "UTC";
        }

        const threadId =
          typeof bodyJson.threadId === "string" ? bodyJson.threadId.trim() : "";

        if (threadId === "") {
          return jsonResp(400, {
            ok: false,
            error: "missing_thread",
          });
        }

        if (!(await chatActions.getThread({ data: { id: threadId } }))) {
          return jsonResp(404, {
            ok: false,
            error: "unknown_thread",
          });
        }

        const sportEventIdRaw =
          typeof bodyJson.sportEventId === "string"
            ? bodyJson.sportEventId.trim()
            : "";
        let sportEventThisTurn: PlanningSportEventReferenceJson | null = null;
        if (sportEventIdRaw !== "") {
          const ev = await eventActions.get({ data: { id: sportEventIdRaw } });
          if (!ev) {
            return jsonResp(404, {
              ok: false,
              error: "unknown_sport_event",
            });
          }
          sportEventThisTurn = snapshotSportEventBriefForChat(ev);
        }

        const userMessageId = crypto.randomUUID();

        const threadPersisted = await chatActions.getThread({
          data: { id: threadId },
        });
        if (!threadPersisted) {
          return jsonResp(500, { ok: false, error: "thread_missing" });
        }

        const persistedMsgs = await chatActions.listMessages({
          data: { threadId },
        });
        const modelMessages = [
          ...buildOpenAiMessagesFromHistory(persistedMsgs),
          pendingUserOpenAiTurn(contentRaw),
        ];

        const userTurnAt = new Date();
        const persistUserTurn = {
          id: userMessageId,
          role: "user" as const,
          content: contentRaw,
          replaySummary: null,
          metadata: null,
          sportEventId: sportEventIdRaw !== "" ? sportEventIdRaw : null,
          createdAt: userTurnAt,
          updatedAt: userTurnAt,
        };

        await coachingActions.ensureCoachingStateRow(
          PLANNING_CHAT_COACH_USER_ID,
        );
        const coachingRow = await coachingActions.getCoachingStateRow(
          PLANNING_CHAT_COACH_USER_ID,
        );
        const coachingStateAppendix =
          coachingRow !== undefined
            ? coachingStateSystemBlock(coachingRow)
            : null;

        const openai = getPlanningOpenAiClient(apiKey);

        const readable = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              controller.enqueue(
                new TextEncoder().encode(
                  `${JSON.stringify({
                    type: "meta",
                    threadId,
                    userMessageId,
                  })}\n`,
                ),
              );

              await runPlanningAssistantTurn({
                openai,
                threadId,
                historyForModel: modelMessages,
                browserTimeZone: timeZone,
                sportEventThisTurn,
                coachingStateAppendix,
                coachUserIdForPatch: PLANNING_CHAT_COACH_USER_ID,
                priorPersistedForTurnSummary: persistedMsgs,
                persistUserTurn,
                signal: request.signal,
                emitLine: async (chunk) => {
                  controller.enqueue(chunk);
                },
              });
              await chatActions.updateTitle({
                data: { id: threadId, title: contentRaw },
              });
            } catch (e) {
              const aborted =
                request.signal.aborted ||
                e instanceof APIUserAbortError ||
                (e instanceof Error && e.name === "AbortError");
              controller.enqueue(
                new TextEncoder().encode(
                  `${JSON.stringify({
                    type: "error",
                    message: aborted
                      ? "aborted"
                      : e instanceof Error
                        ? e.message
                        : "streaming_failed",
                  })}\n`,
                ),
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(readable, {
          status: 200,
          headers: NDJSON_HEADERS,
        });
      },
    },
  },
});
