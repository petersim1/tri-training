import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatBubbleIcon } from "@/components/assets";
import { Panel } from "@/components/views/chat/panel";
import type { ChatThreadRow } from "@/lib/db/schema.server";
import queryKeys from "@/lib/query-keys";
import { chatActions } from "@/server-fcts/chat";

export type PlanningDockContextValue = {
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  selectedThreadId: string | null;
  selectThreadId: (id: string | null) => void;
  threadsQuery: UseQueryResult<ChatThreadRow[], Error>;
  deleteThread: UseMutationResult<
    {
      deleted: boolean;
    },
    Error,
    string,
    unknown
  >;
  createThreadAsync: () => Promise<string>;
};

export const PlanningDockContext =
  createContext<PlanningDockContextValue | null>(null);

export const PlanningChrome: React.FC = () => {
  const { open, toggle } = useChat();

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
  const qc = useQueryClient();
  const deleteThreadFn = useServerFn(chatActions.deleteThread);
  const createThreadFn = useServerFn(chatActions.createThread);
  const [open, setOpenState] = useState(false);
  const [selectedThreadId, selectThreadId] = useState<string | null>(null);

  const justDeletedRef = useRef(false);

  const threadsQuery = useQuery({
    queryKey: queryKeys.chatThreads,
    queryFn: () => chatActions.listThreads(),
  });

  const createThreadAsync = async (): Promise<string> => {
    const tid = await createThreadFn();
    console.log("setting in create");
    window.localStorage.setItem("recent_chat", tid);
    selectThreadId(tid);
    void qc.invalidateQueries({ queryKey: queryKeys.chatThreads });
    return tid;
  };

  const deleteThread = useMutation({
    mutationFn: (threadId: string) => deleteThreadFn({ data: { threadId } }),
    onSuccess: (res, threadId) => {
      if (res.deleted) {
        justDeletedRef.current = true;
        if (selectedThreadId === threadId) {
          selectThreadId(null);
          window.localStorage.removeItem("recent_chat");
        }
        void qc.invalidateQueries({ queryKey: queryKeys.chatThreads });
        const tid = threadId?.trim();
        if (tid) {
          void qc.invalidateQueries({
            queryKey: queryKeys.messagesQueryKey(tid),
          });
        }
        void qc.invalidateQueries({
          predicate: ({ queryKey }) =>
            queryKey.length > 0 && queryKey[0] === "activities",
        });
      }
    },
  });

  useEffect(() => {
    if (justDeletedRef.current) {
      justDeletedRef.current = false;
      return;
    }
    if (
      selectedThreadId ||
      !threadsQuery.data?.length ||
      threadsQuery.isPending
    )
      return;
    const recentChat = window.localStorage.getItem("recent_chat");
    let isSet = false;
    if (recentChat) {
      const exists = threadsQuery.data.some((c) => c.id === recentChat);
      if (exists) {
        selectThreadId(recentChat);
        isSet = true;
      } else {
        window.localStorage.removeItem("recent_chat");
      }
    }
    if (!isSet) {
      console.log("setting here");
      window.localStorage.setItem("recent_chat", threadsQuery.data[0].id);
      selectThreadId(threadsQuery.data[0].id);
    }
  }, [selectedThreadId, threadsQuery.data, threadsQuery.isPending]);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: <>
  const ctx = useMemo<PlanningDockContextValue>(
    () => ({
      open,
      toggle: () => setOpenState((o) => !o),
      setOpen: (v: boolean) => setOpenState(v),
      selectedThreadId,
      selectThreadId,
      threadsQuery,
      deleteThread,
      createThreadAsync,
    }),
    [open, selectedThreadId, threadsQuery, deleteThread],
  );

  return (
    <PlanningDockContext.Provider value={ctx}>
      {children}
      <PlanningChrome />
    </PlanningDockContext.Provider>
  );
};

export const useChat = (): PlanningDockContextValue => {
  const v = useContext(PlanningDockContext);
  if (!v) {
    throw new Error("usePlanningChatDock outside PlanningChatProvider");
  }
  return v;
};
