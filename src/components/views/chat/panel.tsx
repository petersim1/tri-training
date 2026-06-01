import { useMemo, useState } from "react";
import { ChatHistoryOutlineIcon, PlusIcon } from "@/components/assets";
import { useChat } from "@/providers/chat";
import { Composer } from "./composer";
import { displayChatHeading } from "./displays";
import { ThreadsHistoryPane } from "./history";

export const Panel = () => {
  const [panelView, setPanelView] = useState<"chat" | "history">("chat");
  const {
    selectedThreadId,
    selectThreadId,
    setOpen,
    threadsQuery,
    deleteThread,
  } = useChat();
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  function startNewChat() {
    selectThreadId(null);
    setPanelView("chat");
  }

  const currentThread =
    selectedThreadId === null
      ? undefined
      : threadsQuery.data?.find((t) => t.id === selectedThreadId);
  const headingText = displayChatHeading(selectedThreadId, currentThread);

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
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/90 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              >
                <ChatHistoryOutlineIcon className="size-5" ariaHidden />
              </button>
              <button
                type="button"
                aria-label="New conversation"
                onClick={startNewChat}
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

          <Composer timeZone={tz} />
        </>
      )}
    </div>
  );
};
