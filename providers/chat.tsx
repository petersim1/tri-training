import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ChatBubbleIcon } from "@/components/assets";
import { Panel } from "@/components/views/chat/panel";

type PlanningDockContextValue = {
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  selectedThreadId: string | null;
  selectThreadId: (id: string | null) => void;
};

export const PlanningDockContext =
  createContext<PlanningDockContextValue | null>(null);

export const PlanningChrome: React.FC = () => {
  const { open, toggle } = usePlanningChatDock();

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-haspopup="dialog"
        aria-label="Open plan coach chat"
        onClick={toggle}
        className="fixed bottom-8 right-4 z-60 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-950/55 ring ring-emerald-500/40 hover:bg-emerald-500 md:bottom-12 md:right-8"
      >
        <ChatBubbleIcon className="size-7" />
      </button>
    );
  }

  return <Panel />;
};

export const PlanningChatProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpenState] = useState(false);
  const [selectedThreadId, selectThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenState(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

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
};

export const usePlanningChatDock = (): PlanningDockContextValue => {
  const v = useContext(PlanningDockContext);
  if (!v) {
    throw new Error("usePlanningChatDock outside PlanningChatProvider");
  }
  return v;
};
