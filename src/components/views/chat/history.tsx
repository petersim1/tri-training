import { PlusIcon } from "@/components/assets";
import { cn } from "@/lib/utils";
import { useChat } from "@/providers/chat";
import { formatChatListTime, threadListTitle } from "./displays";

export const ThreadsHistoryPane: React.FC = () => {
  const {
    threadsQuery,
    deleteThread,
    selectedThreadId,
    selectThreadId,
    setOpen,
    setCurView,
  } = useChat();

  const handleSelect = (tid: string) => {
    selectThreadId(tid);
    setCurView("chat");
  };

  if (threadsQuery.isPending) {
    return (
      <div className="flex min-h-48 items-center justify-center px-4 text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  if (!threadsQuery.data || threadsQuery.data.length === 0) {
    return (
      <div className="px-4 py-6 text-[13px] leading-relaxed text-zinc-400">
        No saved threads yet — send your first message to start one.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <button
          type="button"
          aria-label="Back to chat"
          onClick={() => setCurView("chat")}
          className="-ml-1 shrink-0 rounded p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
        >
          ←
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-white">
          Chats
        </h2>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            aria-label="New conversation"
            onClick={() => {
              selectThreadId(null);
              setCurView("chat");
            }}
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
      <ul className="min-h-0 flex-1 list-none divide-y divide-zinc-800/95 overflow-auto p-2">
        {threadsQuery.data.map((t) => (
          <li key={t.id} className="flex items-stretch gap-1 py-2">
            <button
              type="button"
              className={cn(
                "min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-900 focus:outline-none focus:ring-2",
                "focus:ring-emerald-600/35",
                selectedThreadId === t.id && "ring-2 ring-blue-500/80",
              )}
              onClick={() => handleSelect(t.id)}
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
              onClick={(e) => {
                e.stopPropagation();
                deleteThread.mutate(t.id);
              }}
              className="shrink-0 self-center rounded p-2 text-zinc-500 hover:bg-rose-950/60 hover:text-rose-200 disabled:opacity-40"
            >
              ⌫
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
