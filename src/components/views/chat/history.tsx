import type { ChatThreadRow } from "@/lib/db/schema.server";
import { formatChatListTime, threadListTitle } from "./displays";

export const ThreadsHistoryPane = (props: {
  rows: ChatThreadRow[];
  busy: boolean;
  deletingThreadId?: string;
  onPickThread: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
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
};
