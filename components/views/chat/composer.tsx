import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowSendIcon } from "@/components/assets";
import type { ChatMessageRow } from "@/lib/db/schema.server";
import queryKeys from "@/lib/query-keys";
import { chatActions, eventActions } from "@/server-fcts";
import type { ChatMessage } from "@/types/responses/chat";
import {
  sportEventContextLine,
  userMessageSportEventContextLine,
} from "./displays";
import { TypingDotsBubble } from "./loader";
import { MessageBubble } from "./message";

const today = (): string => new Date().toISOString().slice(0, 10);

const invalidateCoach = (qc: QueryClient, threadId: string | null) => {
  void qc.invalidateQueries({ queryKey: queryKeys.chatThreads });
  const tid = threadId?.trim();
  if (tid) {
    void qc.invalidateQueries({ queryKey: queryKeys.messagesQueryKey(tid) });
  }
  void qc.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey.length > 0 && queryKey[0] === "activities",
  });
};

const isSilentToolCarrier = (m: ChatMessageRow): boolean =>
  m.role === "assistant" &&
  !(m.content ?? "").trim() &&
  Array.isArray(m.tools) &&
  m.tools.length > 0;

const lastSportEventIdFromMessages = (msgs: ChatMessageRow[]): string => {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") return (msgs[i].sportEventId ?? "").trim();
  }
  return "";
};

export const Composer = (props: {
  timeZone: string;
  selectedThreadId: string | null;
  assignThread: (id: string) => void;
  qc: QueryClient;
}) => {
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sportEventContextId, setSportEventContextId] = useState("");
  const [optimisticText, setOptimisticText] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const activeStreamThreadRef = useRef<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const pickerDirtyRef = useRef(false);
  const prevThreadIdRef = useRef<string>("");
  const shouldAutoScrollRef = useRef(true);

  const runListSportEvents = useServerFn(eventActions.list);
  const runCreateThread = useServerFn(chatActions.createThread);

  const onScroll = () => {
    const el = paneRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distFromBottom < 80;
  };

  // Reset on thread switch, but not mid-stream
  useEffect(() => {
    const tid = props.selectedThreadId?.trim() ?? "";
    if (tid !== "" && tid === activeStreamThreadRef.current) return;
    setDraft("");
    setStreaming("");
    setBusy(false);
    setError(null);
    setOptimisticText(null);
    setPendingApproval(false);
    pickerDirtyRef.current = false;
    prevThreadIdRef.current = "";
    if (!tid) setSportEventContextId("");
    abortRef.current?.abort();
    abortRef.current = null;
  }, [props.selectedThreadId]);

  const messagesQuery = useQuery({
    queryKey: queryKeys.messagesQueryKey(props.selectedThreadId),
    queryFn: () =>
      props.selectedThreadId
        ? chatActions.listMessages({
            data: { threadId: props.selectedThreadId },
          })
        : [],
    enabled: props.selectedThreadId !== null,
    staleTime: 15_000,
  });

  const sportEventsQuery = useQuery({
    queryKey: ["sportEvents"] as const,
    queryFn: async () => {
      const rows = await runListSportEvents();
      if (!Array.isArray(rows))
        throw new Error("Unexpected response loading events.");
      return rows;
    },
    staleTime: 60_000,
  });

  const sportEventsSorted = useMemo(
    () =>
      [...(sportEventsQuery.data ?? [])].sort((a, b) =>
        a.eventDayKey.localeCompare(b.eventDayKey),
      ),
    [sportEventsQuery.data],
  );

  // Clear picker if selected event is removed
  useEffect(() => {
    if (
      sportEventContextId &&
      sportEventsQuery.data &&
      !sportEventsQuery.data.some((e) => e.id === sportEventContextId)
    ) {
      setSportEventContextId("");
    }
  }, [sportEventsQuery.data, sportEventContextId]);

  const messages = useMemo(
    () => (messagesQuery.data ?? []).filter((m) => !isSilentToolCarrier(m)),
    [messagesQuery.data],
  );

  // Sync picker to last user message event when thread changes
  useEffect(() => {
    const tid = props.selectedThreadId?.trim() ?? "";
    if (!tid || busy || !messagesQuery.isFetched) return;
    if (tid === prevThreadIdRef.current && pickerDirtyRef.current) return;
    prevThreadIdRef.current = tid;
    setSportEventContextId(
      lastSportEventIdFromMessages(messagesQuery.data ?? []),
    );
  }, [
    props.selectedThreadId,
    messagesQuery.isFetched,
    messagesQuery.data,
    busy,
  ]);

  // Scroll to bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll pane
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    queueMicrotask(() => {
      paneRef.current?.scrollTo({
        top: paneRef.current.scrollHeight,
        behavior: busy || streaming ? "auto" : "smooth",
      });
    });
  }, [messages, streaming, busy, optimisticText]);

  const consumeStream = async (
    stream: ReadableStream<ChatMessage> | undefined,
    threadId: string,
  ) => {
    if (!stream) return;
    const reader = (stream as ReadableStream<ChatMessage>).getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (value.type === "delta") {
          setStreaming((prev) => prev + value.text);
        }
        if (value.type === "approval") {
          setPendingApproval(true);
        }
        if (value.type === "done" || value.type === "error") {
          if (value.type === "error") {
            setError(value.message);
            setOptimisticText(null);
          }
          queueMicrotask(() => invalidateCoach(props.qc, threadId));
          setStreaming("");
          setOptimisticText(null);
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setBusy(true);
    setError(null);
    setOptimisticText(text);
    setStreaming("");
    setDraft("");
    setPendingApproval(false);

    let threadId = props.selectedThreadId?.trim() ?? null;

    try {
      if (!threadId) {
        threadId = await runCreateThread();
        void props.qc.invalidateQueries({ queryKey: queryKeys.chatThreads });
      }

      activeStreamThreadRef.current = threadId;
      props.assignThread(threadId);

      const stream = await chatActions.chat({
        data: {
          type: "message",
          message: text,
          threadId,
          dayKey: today(),
          ...(sportEventContextId ? { eventId: sportEventContextId } : {}),
        },
      });

      await consumeStream(stream, threadId);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "send_failed");
      setOptimisticText(null);
      setStreaming("");
    } finally {
      activeStreamThreadRef.current = null;
      abortRef.current = null;
      setBusy(false);
    }
  };

  const submitApproval = async (approved: boolean) => {
    const tid = props.selectedThreadId?.trim();
    if (!tid) return;
    setPendingApproval(false);
    setBusy(true);
    try {
      await chatActions.chat({
        data: { type: "approval", approved, threadId: tid, dayKey: today() },
      });
      props.qc.invalidateQueries({ queryKey: ["calendar"] });
      props.qc.invalidateQueries({ queryKey: ["activities"] });
      props.qc.invalidateQueries({ queryKey: ["weight-viz"] });
      props.qc.invalidateQueries({ queryKey: ["activity-viz"] });
      queueMicrotask(() => invalidateCoach(props.qc, tid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "approval_failed");
    } finally {
      setBusy(false);
    }
  };

  const attachedEvent =
    sportEventsSorted.find((e) => e.id === sportEventContextId) ?? null;
  const canSend = !!draft.trim() && !busy && !pendingApproval;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#131315]">
      <div
        ref={paneRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[13.75px] leading-snug text-zinc-50"
      >
        <div className="flex flex-col gap-3 pb-2 pt-1">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              bubble={m.role === "user" ? "user" : "assistant"}
              contextLine={
                m.role === "user"
                  ? userMessageSportEventContextLine(m, sportEventsSorted)
                  : undefined
              }
              text={m.content}
              proposal={m.proposals}
              onProposalSubmit={submitApproval}
            />
          ))}

          {optimisticText && (
            <MessageBubble
              bubble="user"
              contextLine={sportEventContextLine(attachedEvent)}
              text={optimisticText}
            />
          )}

          {streaming && <MessageBubble bubble="assistant" text={streaming} />}

          {busy && !streaming && <TypingDotsBubble />}
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-3 py-3">
        {error && (
          <p className="mb-2 rounded-xl border border-rose-800/85 bg-rose-950/50 px-3 py-2 text-[12px] text-rose-100">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
            <select
              value={sportEventContextId}
              onChange={(e) => {
                pickerDirtyRef.current = true;
                setSportEventContextId(e.target.value);
              }}
              aria-label="Optional event reference for next message"
              className="w-full truncate rounded-xl border border-zinc-700/90 bg-zinc-900 px-3 py-1.5 text-[11px] leading-tight text-zinc-300 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            >
              <option value="">No event context</option>
              {sportEventsSorted.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.eventDayKey} —{" "}
                  {ev.name.length > 52 ? `${ev.name.slice(0, 50)}…` : ev.name}
                </option>
              ))}
            </select>
            <textarea
              value={draft}
              aria-label="Message for planning assistant"
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canSend) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Message"
              disabled={pendingApproval}
              className="max-h-[min(38vh,11rem)] min-h-12.5 w-full shrink-0 resize-none rounded-[1.15rem] border border-zinc-700 bg-zinc-900/97 px-[0.9rem] py-2 text-[13.75px] leading-snug text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/90 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
            />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {busy && (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop generating"
                className="rounded-full border border-zinc-600/95 bg-zinc-900 px-3 py-1.75 text-[11px] font-semibold uppercase tracking-wide text-zinc-200 hover:bg-zinc-800 hover:text-white"
              >
                Stop
              </button>
            )}
            <button
              type="button"
              aria-label={busy ? "Sending" : "Send message"}
              disabled={!canSend}
              onClick={() => void submit()}
              className={
                canSend
                  ? "relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-black/55 ring-[0.0625rem] ring-emerald-400/55 transition-colors hover:bg-emerald-500"
                  : "inline-flex size-11 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-zinc-800 text-zinc-600 opacity-95"
              }
            >
              {busy ? (
                <span
                  aria-hidden
                  className="size-5 animate-spin rounded-full border-2 border-white/25 border-t-white"
                />
              ) : (
                <ArrowSendIcon className="size-[1.45rem]" />
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
