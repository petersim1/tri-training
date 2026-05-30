import type {
  ChatMessageRow,
  ChatThreadRow,
  SportEventRow,
} from "@/lib/db/schema.server";

export const threadListTitle = (t: ChatThreadRow): string => {
  const raw = (t.title ?? "").trim();
  if (raw.length > 0) {
    return raw.slice(0, 96);
  }
  return `Chat • ${t.id.slice(0, 8)}`;
};

export const displayChatHeading = (
  selectedId: string | null,
  thread: ChatThreadRow | undefined,
): string => {
  if (selectedId === null) {
    return "New chat";
  }
  return thread ? threadListTitle(thread) : `Chat · ${selectedId.slice(0, 8)}`;
};

export const formatChatListTime = (d: Date): string => {
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
};

export const sportEventContextLine = (
  row: SportEventRow | null | undefined,
): string | null => {
  if (!row) return null;
  return `Event · ${row.eventDayKey} — ${row.name}`;
};

export const userMessageSportEventContextLine = (
  m: ChatMessageRow,
  sportEventsSorted: SportEventRow[],
): string | null => {
  if (m.role !== "user") return null;
  const fk = (m.sportEventId ?? "").trim();
  if (!fk) return null;
  const row = sportEventsSorted.find((e) => e.id === fk);
  if (!row) return "Event · (unknown or removed)";
  return sportEventContextLine(row);
};
