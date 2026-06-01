import { useChat } from "@/providers/chat";
import { Composer } from "./composer";
import { ThreadsHistoryPane } from "./history";

export const Panel = () => {
  const { curView } = useChat();

  return (
    <div
      className="fixed bottom-6 right-4 z-62 flex h-[min(40rem,calc(100vh-6rem))] w-[min(100vw-1.75rem,24rem)] flex-col overflow-hidden rounded-3xl border border-zinc-700/80 bg-zinc-950 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.75)] md:bottom-10 md:right-8"
      role="dialog"
      aria-label="Workout planning assistant"
    >
      {curView === "history" ? <ThreadsHistoryPane /> : <Composer />}
    </div>
  );
};
