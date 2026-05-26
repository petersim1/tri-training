import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PlanningChatMessageRow,
  PlanningChatThreadRow,
  SportEventRow,
} from "@/lib/db/schema.server";
import {
  type PlanningSportEventReferenceJson,
  snapshotSportEventBriefForChat,
  sportEventReferenceUiLabel,
} from "@/lib/planning-agent/context/sport-event-context";
import { chatActions, eventActions } from "@/server-fcts";
import { ChatMarkdownBody } from "./chat-markdown-body";

const THREADS_QUERY_KEY = ["planningChat", "threads"] as const;

function messagesQueryKey(threadId: string | null): readonly unknown[] {
  return ["planningChat", "messages", threadId ?? "__none"] as const;
}

/** Last chronological user bubble's FK (possibly empty — last send omitted an event). */
function lastComposerSportEventIdFromMessages(
  msgs: PlanningChatMessageRow[],
): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === "user") {
      return (m.sportEventId ?? "").trim();
    }
  }
  return "";
}

function userMessageSportEventContextLine(
  m: PlanningChatMessageRow,
  sportEventsSorted: SportEventRow[],
): string | null {
  if (m.role !== "user") {
    return null;
  }
  const fk = (m.sportEventId ?? "").trim();
  if (!fk) {
    return null;
  }
  const row = sportEventsSorted.find((e) => e.id === fk);
  if (!row) {
    return "Event · (unknown or removed)";
  }
  return `Event · ${sportEventReferenceUiLabel(snapshotSportEventBriefForChat(row))}`;
}

function browserTimeZoneSafe(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

type PlanningDockContextValue = {
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  selectedThreadId: string | null;
  selectThreadId: (id: string | null) => void;
};

const PlanningDockContext = createContext<PlanningDockContextValue | null>(
  null,
);

export function PlanningChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [selectedThreadId, selectThreadId] = useState<string | null>(null);

  const ctx = useMemo<PlanningDockContextValue>(
    () => ({
      open,
      toggle: () => setOpenState((o) => !o),
      setOpen: (v: boolean) => setOpenState(v),
      selectedThreadId,
      selectThreadId,
    }),
    [open, selectedThreadId],
  );

  return (
    <PlanningDockContext.Provider value={ctx}>
      {children}
      <PlanningChrome />
    </PlanningDockContext.Provider>
  );
}

export function usePlanningChatDock(): PlanningDockContextValue {
  const v = useContext(PlanningDockContext);
  if (!v) {
    throw new Error("usePlanningChatDock outside PlanningChatProvider");
  }
  return v;
}

function PlanningChrome() {
  const { open, setOpen } = usePlanningChatDock();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, setOpen]);

  return (
    <>
      {!open ? <FAB /> : null}
      {open ? <Panel /> : null}
    </>
  );
}

function FAB() {
  const { toggle } = usePlanningChatDock();
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-haspopup="dialog"
      aria-label="Open plan coach chat"
      onClick={() => toggle()}
      className="fixed bottom-8 right-4 z-60 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-950/55 ring ring-emerald-500/40 hover:bg-emerald-500 md:bottom-12 md:right-8"
    >
      <ChatBubbleIcon className="size-7" />
    </button>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4.5-1.3L3 21l2.3-5c-.8-1.5-1.2-3.1-1.2-4.8A8.5 8.5 0 0 1 12.5 3h.2A8.5 8.5 0 0 1 21 11.5z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  );
}

function ChatHistoryOutlineIcon({
  className,
  ariaHidden,
}: {
  className?: string;
  ariaHidden?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden ?? true}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function PlusIcon({
  className,
  ariaHidden,
}: {
  className?: string;
  ariaHidden?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden ?? true}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function ArrowSendIcon({
  className,
  ariaHidden,
}: {
  className?: string;
  ariaHidden?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden ?? true}
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function invalidateCoach(qc: QueryClient, threadId: string | null) {
  void qc.invalidateQueries({ queryKey: THREADS_QUERY_KEY });
  const tid = threadId?.trim();
  if (tid) {
    void qc.invalidateQueries({ queryKey: messagesQueryKey(tid) });
  }
  void qc.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey.length > 0 && queryKey[0] === "activities",
  });
}

function threadListTitle(t: PlanningChatThreadRow): string {
  const raw = (t.title ?? "").trim();
  if (raw.length > 0) {
    return raw.slice(0, 96);
  }
  return `Chat • ${t.id.slice(0, 8)}`;
}

function displayChatHeading(
  selectedId: string | null,
  thread: PlanningChatThreadRow | undefined,
): string {
  if (selectedId === null) {
    return "New chat";
  }
  return thread ? threadListTitle(thread) : `Chat · ${selectedId.slice(0, 8)}`;
}

function formatChatListTime(d: Date): string {
  try {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function Panel() {
  const [panelView, setPanelView] = useState<"chat" | "history">("chat");
  const { selectedThreadId, selectThreadId, setOpen } = usePlanningChatDock();
  const qc = useQueryClient();
  const timeZone = browserTimeZoneSafe();

  const threadsQuery = useQuery({
    queryKey: THREADS_QUERY_KEY,
    queryFn: () => chatActions.listThreads(),
    staleTime: 8000,
  });

  const deleteThread = useMutation({
    mutationFn: (threadId: string) =>
      chatActions.deleteThread({ data: { threadId } }),
    onSuccess: (res, threadId) => {
      if (res.deleted) {
        if (selectedThreadId === threadId) {
          selectThreadId(null);
        }
        invalidateCoach(qc, threadId);
      }
    },
  });

  function startNewChat() {
    selectThreadId(null);
    setPanelView("chat");
  }

  const currentThread =
    selectedThreadId === null
      ? undefined
      : threadsQuery.data?.find((t) => t.id === selectedThreadId);
  const headingText = displayChatHeading(selectedThreadId, currentThread);

  const iconToolbarBtn =
    "flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/90 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50";

  return (
    <div
      className="fixed bottom-6 right-4 z-62 flex h-[min(40rem,calc(100vh-6rem))] w-[min(100vw-1.75rem,24rem)] flex-col overflow-hidden rounded-3xl border border-zinc-700/80 bg-zinc-950 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.75)] md:bottom-10 md:right-8"
      role="dialog"
      aria-label="Workout planning assistant"
    >
      {panelView === "history" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-3">
            <button
              type="button"
              aria-label="Back to chat"
              onClick={() => setPanelView("chat")}
              className="-ml-1 shrink-0 rounded p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              ←
            </button>
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-white">
              Chats
            </h2>
            <button
              type="button"
              aria-label="Close planning assistant panel"
              onClick={() => setOpen(false)}
              className="-m-1 shrink-0 rounded p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            >
              ✕
            </button>
          </header>
          <ThreadsHistoryPane
            rows={threadsQuery.data ?? []}
            busy={threadsQuery.isPending}
            deletingThreadId={
              deleteThread.isPending ? deleteThread.variables : undefined
            }
            onPickThread={(id) => {
              selectThreadId(id);
              setPanelView("chat");
            }}
            onDelete={(id) => {
              if (
                !window.confirm(
                  "Delete this chat and its messages? This cannot be undone.",
                )
              ) {
                return;
              }
              deleteThread.mutate(id);
            }}
          />
        </div>
      ) : (
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
                onClick={() => setPanelView("history")}
                className={iconToolbarBtn}
              >
                <ChatHistoryOutlineIcon className="size-5" ariaHidden />
              </button>
              <button
                type="button"
                aria-label="New conversation"
                onClick={startNewChat}
                className={iconToolbarBtn}
              >
                <PlusIcon className="size-5" ariaHidden />
              </button>
              <button
                type="button"
                aria-label="Close planning assistant panel"
                onClick={() => setOpen(false)}
                className={iconToolbarBtn}
              >
                <span aria-hidden className="text-[1.1875rem] leading-none">
                  ✕
                </span>
              </button>
            </div>
          </header>

          <Composer
            timeZone={timeZone}
            selectedThreadId={selectedThreadId}
            assignThread={(id) => selectThreadId(id)}
            qc={qc}
          />
        </>
      )}
    </div>
  );
}

function ThreadsHistoryPane(props: {
  rows: PlanningChatThreadRow[];
  busy: boolean;
  deletingThreadId?: string;
  onPickThread: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (props.busy) {
    return (
      <div className="flex min-h-48 items-center justify-center px-4 text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  if (props.rows.length === 0) {
    return (
      <div className="px-4 py-6 text-[13px] leading-relaxed text-zinc-400">
        No saved threads yet — send your first message to start one.
      </div>
    );
  }

  return (
    <ul className="min-h-0 flex-1 list-none divide-y divide-zinc-800/95 overflow-auto p-2">
      {props.rows.map((t) => (
        <li key={t.id} className="flex items-stretch gap-1 py-2">
          <button
            type="button"
            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/35"
            onClick={() => props.onPickThread(t.id)}
          >
            <div className="truncate text-[13px] font-medium text-zinc-100">
              {threadListTitle(t)}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              <time
                dateTime={
                  t.updatedAt instanceof Date
                    ? t.updatedAt.toISOString()
                    : undefined
                }
              >
                {formatChatListTime(t.updatedAt)}
              </time>
            </div>
          </button>
          <button
            type="button"
            aria-label="Delete chat"
            disabled={props.deletingThreadId === t.id}
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete(t.id);
            }}
            className="shrink-0 self-center rounded p-2 text-zinc-500 hover:bg-rose-950/60 hover:text-rose-200 disabled:opacity-40"
          >
            ⌫
          </button>
        </li>
      ))}
    </ul>
  );
}

function planningMessageHasToolCalls(
  meta: PlanningChatMessageRow["metadata"],
): boolean {
  if (meta === null || meta === undefined) {
    return false;
  }
  if (typeof meta !== "object" || Array.isArray(meta)) {
    return false;
  }
  const raw = (meta as { toolCalls?: unknown }).toolCalls;
  return Array.isArray(raw) && raw.length > 0;
}

function shouldHideAssistantSilentToolCarrier(
  m: PlanningChatMessageRow,
): boolean {
  return (
    m.role === "assistant" &&
    !(m.content ?? "").trim() &&
    planningMessageHasToolCalls(m.metadata)
  );
}

function TypingDotsBubble() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex justify-start pr-9 pl-0.5 pt-1"
    >
      <span className="sr-only">Thinking</span>
      <div className="inline-flex items-center gap-1.25 rounded-[1.125rem] border border-zinc-700/50 bg-zinc-900/80 px-[0.9rem] py-2 shadow-inner shadow-black/35">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="size-1.75 animate-bounce rounded-full bg-zinc-500"
            style={{
              animationDuration: "0.65s",
              animationDelay: `${i * 130}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Composer(props: {
  timeZone: string;
  selectedThreadId: string | null;
  assignThread: (id: string) => void;
  qc: QueryClient;
}) {
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticUserText, setOptimisticUserText] = useState<string | null>(
    null,
  );
  const [serverUserMessageId, setServerUserMessageId] = useState<string | null>(
    null,
  );
  const [assistantHydrateHoldId, setAssistantHydrateHoldId] = useState<
    string | null
  >(null);
  const [sportEventContextId, setSportEventContextId] = useState("");
  const [optimisticEventAttach, setOptimisticEventAttach] =
    useState<PlanningSportEventReferenceJson | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** When selection matches this id, thread-change reset skipped (in-flight stream for that thread). Cleared in submit `finally`. */
  const activeStreamThreadRef = useRef<string | null>(null);
  const pickerDirtyRef = useRef(false);
  const prevThreadPickRef = useRef<string>("");
  const runListSportEvents = useServerFn(eventActions.list);
  const runCreatePlanningChatThread = useServerFn(chatActions.createThread);

  useEffect(() => {
    const tid = props.selectedThreadId?.trim() ?? "";
    if (tid !== "" && tid === activeStreamThreadRef.current) {
      return;
    }
    setDraft("");
    setStreaming("");
    setBusy(false);
    setError(null);
    setOptimisticUserText(null);
    setServerUserMessageId(null);
    setAssistantHydrateHoldId(null);
    pickerDirtyRef.current = false;
    prevThreadPickRef.current = "";
    if (!props.selectedThreadId?.trim()) {
      setSportEventContextId("");
    }
    setOptimisticEventAttach(null);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [props.selectedThreadId]);

  const messagesQuery = useQuery({
    queryKey: messagesQueryKey(props.selectedThreadId),
    queryFn: async () =>
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
      if (!Array.isArray(rows)) {
        throw new Error("Unexpected response when loading events.");
      }
      return rows;
    },
    staleTime: 60_000,
  });

  const sportEventsSorted = useMemo(() => {
    const rows = sportEventsQuery.data ?? [];
    return [...rows].sort((a, b) => a.eventDayKey.localeCompare(b.eventDayKey));
  }, [sportEventsQuery.data]);

  useEffect(() => {
    const data = sportEventsQuery.data;
    if (
      sportEventContextId.trim() !== "" &&
      data &&
      !data.some((e) => e.id === sportEventContextId)
    ) {
      setSportEventContextId("");
    }
  }, [sportEventsQuery.data, sportEventContextId]);

  const rows = messagesQuery.data ?? [];

  const filteredPersistedMessages = useMemo(
    () => rows.filter((m) => !shouldHideAssistantSilentToolCarrier(m)),
    [rows],
  );

  const userEchoHydrated =
    serverUserMessageId !== null &&
    filteredPersistedMessages.some((m) => m.id === serverUserMessageId);

  const showOptimisticUser =
    optimisticUserText !== null &&
    !userEchoHydrated &&
    optimisticUserText !== "";

  useEffect(() => {
    if (userEchoHydrated) {
      pickerDirtyRef.current = false;
      setOptimisticUserText(null);
      setServerUserMessageId(null);
      setOptimisticEventAttach(null);
    }
  }, [userEchoHydrated]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `userEchoHydrated` must re-run after send so we resync from DB once `pickerDirtyRef` is cleared in the prior effect.
  useEffect(() => {
    const tid = props.selectedThreadId?.trim() ?? "";
    const switched = tid !== prevThreadPickRef.current;
    const prevPick = prevThreadPickRef.current;

    if (!tid) {
      return;
    }

    // Don't reshape composer event picker mid-send; empty thread fetch finishes after done.
    if (busy) {
      return;
    }

    if (!messagesQuery.isFetched) {
      if (switched && prevPick !== "") {
        setSportEventContextId("");
      }
      return;
    }

    if (!switched && pickerDirtyRef.current) {
      return;
    }

    prevThreadPickRef.current = tid;
    setSportEventContextId(
      lastComposerSportEventIdFromMessages(messagesQuery.data ?? []),
    );
  }, [
    props.selectedThreadId,
    messagesQuery.isFetched,
    messagesQuery.data,
    userEchoHydrated,
    busy,
  ]);

  const assistantEchoHydrated =
    assistantHydrateHoldId !== null &&
    rows.some((m) => m.id === assistantHydrateHoldId);

  useEffect(() => {
    if (assistantEchoHydrated) {
      setAssistantHydrateHoldId(null);
      setStreaming("");
    }
  }, [assistantEchoHydrated]);

  const streamedAssistantDisplayed = assistantEchoHydrated
    ? ""
    : streaming.trim();

  const showTypingDots =
    (busy && streamedAssistantDisplayed === "") ||
    (!!assistantHydrateHoldId &&
      !assistantEchoHydrated &&
      streamedAssistantDisplayed === "");

  const scrollBehavior: "auto" | "smooth" =
    busy || streamedAssistantDisplayed !== "" ? "auto" : "smooth";

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll pane
  useEffect(() => {
    queueMicrotask(() => {
      const el = paneRef.current;
      if (!el) {
        return;
      }
      el.scrollTo({
        top: el.scrollHeight,
        behavior: scrollBehavior,
      });
    });
  }, [
    filteredPersistedMessages,
    streamedAssistantDisplayed,
    busy,
    showTypingDots,
    showOptimisticUser,
    scrollBehavior,
    optimisticEventAttach,
  ]);

  async function submit() {
    abortRef.current?.abort();
    const text = draft.trim();
    if (!text) {
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let streamThreadId: string | null = props.selectedThreadId?.trim() ?? null;

    const ctxId = sportEventContextId.trim();
    const attachRow =
      ctxId !== "" ? sportEventsSorted.find((e) => e.id === ctxId) : undefined;
    const attachSnap =
      attachRow !== undefined
        ? snapshotSportEventBriefForChat(attachRow)
        : null;

    setBusy(true);
    setError(null);
    setAssistantHydrateHoldId(null);
    setServerUserMessageId(null);
    setOptimisticUserText(text);
    setOptimisticEventAttach(attachSnap);
    setStreaming("");
    setDraft("");
    try {
      if (!streamThreadId) {
        try {
          const newThread = await runCreatePlanningChatThread();
          streamThreadId = newThread.id;
          void props.qc.invalidateQueries({ queryKey: THREADS_QUERY_KEY });
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not start a new chat.",
          );
          setOptimisticUserText(null);
          setOptimisticEventAttach(null);
          return;
        }
      }

      if (!streamThreadId) {
        return;
      }

      activeStreamThreadRef.current = streamThreadId;
      if (props.selectedThreadId?.trim() !== streamThreadId) {
        props.assignThread(streamThreadId);
      }

      const res = await fetch("/api/planning-chat/stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: streamThreadId,
          content: text,
          timeZone: props.timeZone,
          ...(ctxId !== "" ? { sportEventId: ctxId } : {}),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        setError(t.slice(0, 280) || `HTTP ${res.status}`);
        setOptimisticUserText(null);
        setOptimisticEventAttach(null);
        setServerUserMessageId(null);
        setAssistantHydrateHoldId(null);
        setStreaming("");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n");
        buf = chunks.pop() ?? "";

        for (const rawLine of chunks) {
          const line = rawLine.trim();
          if (line === "") {
            continue;
          }

          try {
            const evt = JSON.parse(line) as {
              type?: string;
              text?: unknown;
              message?: unknown;
              threadId?: unknown;
              userMessageId?: unknown;
              assistantMessageId?: unknown;
            };

            if (
              evt.type === "meta" &&
              typeof evt.threadId === "string" &&
              evt.threadId.trim() !== ""
            ) {
              streamThreadId = evt.threadId.trim();
              props.assignThread(streamThreadId);
              if (
                typeof evt.userMessageId === "string" &&
                evt.userMessageId.trim() !== ""
              ) {
                setServerUserMessageId(evt.userMessageId.trim());
              }
            }

            if (evt.type === "delta" && typeof evt.text === "string") {
              setStreaming((prev) => prev + evt.text);
            }

            if (evt.type === "done") {
              if (
                typeof evt.assistantMessageId === "string" &&
                evt.assistantMessageId.trim() !== ""
              ) {
                setAssistantHydrateHoldId(evt.assistantMessageId.trim());
              }
            }

            if (evt.type === "error") {
              const msg = typeof evt.message === "string" ? evt.message : "";
              const isStopped = msg === "aborted";
              if (!isStopped) {
                if (msg !== "") {
                  setError(msg);
                }
                setOptimisticUserText(null);
                setOptimisticEventAttach(null);
                setServerUserMessageId(null);
                setAssistantHydrateHoldId(null);
                setStreaming("");
              } else {
                setAssistantHydrateHoldId(null);
                setServerUserMessageId(null);
              }
            }

            if (
              evt.type === "meta" ||
              evt.type === "done" ||
              evt.type === "error"
            ) {
              queueMicrotask(() => invalidateCoach(props.qc, streamThreadId));
            }
          } catch {}
        }
      }
      queueMicrotask(() => invalidateCoach(props.qc, streamThreadId));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setAssistantHydrateHoldId(null);
        setServerUserMessageId(null);
      } else {
        setOptimisticUserText(null);
        setOptimisticEventAttach(null);
        setServerUserMessageId(null);
        setAssistantHydrateHoldId(null);
        setStreaming("");
        setError(e instanceof Error ? e.message : "send_failed");
      }
    } finally {
      activeStreamThreadRef.current = null;
      abortRef.current = null;
      setBusy(false);
    }
  }

  const canSend = !!draft.trim() && !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#131315]">
      <div
        ref={paneRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[13.75px] leading-snug text-zinc-50"
      >
        <div className="flex flex-col gap-3 pb-2 pt-1">
          {filteredPersistedMessages.map((m) => (
            <MessageBubble
              key={m.id}
              bubble={m.role === "user" ? "user" : "assistant"}
              contextLine={
                m.role === "user"
                  ? userMessageSportEventContextLine(m, sportEventsSorted)
                  : undefined
              }
              text={m.content}
            />
          ))}
          {showOptimisticUser && optimisticUserText ? (
            <MessageBubble
              bubble="user"
              contextLine={
                optimisticEventAttach !== null
                  ? `Event · ${sportEventReferenceUiLabel(optimisticEventAttach)}`
                  : undefined
              }
              text={optimisticUserText}
            />
          ) : null}
          {streamedAssistantDisplayed !== "" ? (
            <MessageBubble
              bubble="assistant"
              text={streamedAssistantDisplayed}
            />
          ) : null}
          {showTypingDots ? <TypingDotsBubble /> : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-3 py-3">
        {error ? (
          <p className="mb-2 rounded-xl border border-rose-800/85 bg-rose-950/50 px-3 py-2 text-[12px] text-rose-100">
            {error}
          </p>
        ) : null}
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
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  draft.trim().length > 0 &&
                  !busy
                ) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Message"
              className="max-h-[min(38vh,11rem)] min-h-12.5 w-full shrink-0 resize-none rounded-[1.15rem] border border-zinc-700 bg-zinc-900/97 px-[0.9rem] py-2 text-[13.75px] leading-snug text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/90 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop generating"
                className="rounded-full border border-zinc-600/95 bg-zinc-900 px-3 py-1.75 text-[11px] font-semibold uppercase tracking-wide text-zinc-200 hover:bg-zinc-800 hover:text-white"
              >
                Stop
              </button>
            ) : null}
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
}

function MessageBubble(props: {
  bubble: "user" | "assistant";
  text: string;
  /** Shown beneath user bubbles when a sport event was attached to that message. */
  contextLine?: string | null;
}) {
  const user = props.bubble === "user";
  const body =
    props.text.trim() !== "" ? (
      <ChatMarkdownBody tone={props.bubble} text={props.text} />
    ) : null;
  const showCtx = Boolean(props.contextLine?.trim());
  return (
    <div
      className={
        user
          ? showCtx
            ? "flex flex-col items-end gap-1 pl-10 pr-0.5"
            : "flex justify-end pl-10 pr-0.5"
          : "flex justify-start pr-9 pl-0.5"
      }
    >
      <div
        className={
          user
            ? "inline-block max-w-[min(19rem,calc(100vw-8rem))] rounded-[20px] rounded-br-md bg-emerald-600 px-[0.9rem] py-[0.65rem] text-[13.75px] font-normal leading-snug text-white shadow-[0_10px_30px_-12px_rgba(16,185,129,0.55)] ring-[0.5px] ring-emerald-300/55"
            : "inline-block max-w-[min(21rem,calc(100vw-8rem))] rounded-[20px] rounded-bl-md border border-zinc-700/60 bg-zinc-800/94 px-[0.92rem] py-[0.65rem] text-[13.75px] font-normal leading-snug text-zinc-100 shadow-sm shadow-black/40"
        }
      >
        {body}
      </div>
      {showCtx ? (
        <p className="max-w-[min(19rem,calc(100vw-8rem))] text-right text-[10px] leading-snug tracking-tight text-zinc-400">
          {props.contextLine}
        </p>
      ) : null}
    </div>
  );
}
