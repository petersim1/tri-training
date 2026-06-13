import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSendIcon,
  ChatHistoryOutlineIcon,
  PlusIcon,
} from "@/components/assets";
import type { ChatMessageRow } from "@/lib/db/schema.server";
import queryKeys from "@/lib/query-keys";
import { useChat } from "@/providers/chat";
import { useDay } from "@/providers/day";
import { chatActions } from "@/server-fcts/chat";
import { eventActions } from "@/server-fcts/events";
import type { ChatMessage } from "@/types/responses/chat";
import type { ChatMessageItem } from "@/types/responses/chats";
import {
  displayChatHeading,
  sportEventContextLine,
  userMessageSportEventContextLine,
} from "./displays";
import { TypingDotsBubble } from "./loader";
import { MessageBubble } from "./message";

const lastSportEventIdFromMessages = (msgs: ChatMessageRow[]): string => {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") return (msgs[i].sportEventId ?? "").trim();
  }
  return "";
};

export const Composer: React.FC = () => {
  const qc = useQueryClient();
  const {
    createThreadAsync,
    selectedThreadId,
    selectThreadId,
    threadsQuery,
    setCurView,
    setOpen,
  } = useChat();
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sportEventContextId, setSportEventContextId] = useState("");
  const [optimisticText, setOptimisticText] = useState<string | null>(null);

  const chatFn = useServerFn(chatActions.chat);

  const { todayKey, timeZone } = useDay();

  const abortRef = useRef<AbortController | null>(null);
  const activeStreamThreadRef = useRef<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const pickerDirtyRef = useRef(false);
  const prevThreadIdRef = useRef<string>("");
  const shouldAutoScrollRef = useRef(true);

  const runListSportEvents = useServerFn(eventActions.list);

  const onScroll = () => {
    const el = paneRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distFromBottom < 80;
  };

  // Reset on thread switch, but not mid-stream
  useEffect(() => {
    const tid = selectedThreadId ?? "";
    if (tid !== "" && tid === activeStreamThreadRef.current) return;
    shouldAutoScrollRef.current = true; // add this
    setDraft("");
    setStreaming("");
    setBusy(false);
    setError(null);
    setOptimisticText(null);
    pickerDirtyRef.current = false;
    prevThreadIdRef.current = "";
    if (!tid) setSportEventContextId("");
    abortRef.current?.abort();
    abortRef.current = null;
  }, [selectedThreadId]);

  const messagesQuery = useQuery({
    queryKey: queryKeys.messagesQueryKey(selectedThreadId),
    queryFn: () =>
      selectedThreadId
        ? chatActions.listMessages({
            data: { threadId: selectedThreadId },
          })
        : [],
    enabled: selectedThreadId !== null,
    staleTime: Infinity,
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

  // Sync picker to last user message event when thread changes
  useEffect(() => {
    const tid = selectedThreadId?.trim() ?? "";
    if (!tid || busy || !messagesQuery.isFetched) return;
    if (tid === prevThreadIdRef.current && pickerDirtyRef.current) return;
    prevThreadIdRef.current = tid;
    setSportEventContextId(
      lastSportEventIdFromMessages(messagesQuery.data ?? []),
    );
  }, [selectedThreadId, messagesQuery.isFetched, messagesQuery.data, busy]);

  // Scroll to bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll pane
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      paneRef.current?.scrollTo({
        top: paneRef.current.scrollHeight,
        behavior: busy || streaming ? "auto" : "smooth",
      });
    });
  }, [messagesQuery.data, streaming, optimisticText]);

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
          setStreaming(value.text);
        }
        if (value.type === "approval") {
          // setPendingApproval(true);
        }
        if (value.type === "reset") {
          setStreaming("");
        }
        if (value.type === "message") {
          qc.setQueryData(
            queryKeys.messagesQueryKey(threadId),
            (old: ChatMessageItem[] | undefined) => {
              if (!old) return old;
              if (old.some((m) => m.id === value.message.id)) return old;
              return [...old, value.message];
            },
          );
          if (value.message.role === "user") setOptimisticText(null);
          if (value.message.role === "assistant") setStreaming("");
        }
        if (value.type === "done" || value.type === "error") {
          if (value.type === "error") {
            setError(value.message);
            setOptimisticText(null);
            setStreaming("");
          }
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

    let threadId = selectedThreadId?.trim() ?? null;

    try {
      if (!threadId) {
        threadId = await createThreadAsync();
      }

      activeStreamThreadRef.current = threadId;

      const stream = await chatFn({
        data: {
          type: "message",
          message: text,
          threadId,
          dayKey: todayKey,
          timezone: timeZone,
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
    const tid = selectedThreadId?.trim();
    if (!tid) return;
    setBusy(true);
    try {
      await chatActions.chat({
        data: {
          type: "approval",
          approved,
          threadId: tid,
          dayKey: todayKey,
          timezone: timeZone,
        },
      });
      if (approved) {
        qc.invalidateQueries({ queryKey: ["calendar"] });
        qc.invalidateQueries({ queryKey: ["activities"] });
        qc.invalidateQueries({ queryKey: ["weight-viz"] });
        qc.invalidateQueries({ queryKey: ["activity-viz"] });
      }

      const status = approved ? "approved" : "rejected";
      qc.setQueryData(
        queryKeys.messagesQueryKey(tid),
        (old: ChatMessageItem[] | undefined) => {
          if (!old) return old;
          return old.map((m) => {
            if (!m.proposalSet?.length) return m;
            return {
              ...m,
              proposalSet: m.proposalSet.map((p) => ({ ...p, status })),
            };
          });
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "approval_failed");
    } finally {
      setBusy(false);
    }
  };

  const attachedEvent =
    sportEventsSorted.find((e) => e.id === sportEventContextId) ?? null;
  const canSend = !!draft.trim() && !busy;

  const currentThread =
    selectedThreadId === null
      ? undefined
      : threadsQuery.data?.find((t) => t.id === selectedThreadId);
  const headingText = displayChatHeading(selectedThreadId, currentThread);

  return (
    <>
      <header className="shrink-0 border-b border-zinc-800/90 bg-zinc-950 px-4 py-3 shadow-sm shadow-black/25">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2
              title={headingText}
              className="truncate text-[17px] font-semibold tracking-tight text-zinc-50"
            >
              {headingText}
            </h2>
            <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Plan coach
            </p>
          </div>
          <button
            type="button"
            aria-label="Chat history"
            onClick={() => setCurView("history")}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/90 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <ChatHistoryOutlineIcon className="size-5" ariaHidden />
          </button>
          <button
            type="button"
            aria-label="New conversation"
            onClick={() => selectThreadId(null)}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/90 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <PlusIcon className="size-5" ariaHidden />
          </button>
          <button
            type="button"
            aria-label="Close planning assistant panel"
            onClick={() => setOpen(false)}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/90 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <span aria-hidden className="text-[1.1875rem] leading-none">
              ✕
            </span>
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col bg-[#131315]">
        <div
          ref={paneRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[13.75px] leading-snug text-zinc-50"
        >
          <div className="flex flex-col gap-3 pb-2 pt-1">
            {(messagesQuery.data ?? []).map((m) => (
              <MessageBubble
                key={m.id}
                bubble={m.role === "user" ? "user" : "assistant"}
                contextLine={
                  m.role === "user"
                    ? userMessageSportEventContextLine(m, sportEventsSorted)
                    : undefined
                }
                text={m.content}
                proposalSet={m.proposalSet}
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
    </>
  );
};
