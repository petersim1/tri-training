import type {
  ChatThreadRow,
  CoachingStateRow,
  SportEventRow,
} from "@/lib/db/schema.server";
import type { ToolName } from "@/types/chats/tools";

export type ChatRunContext = {
  seq: number;

  runStart: Date;
  // Generic
  dayKey: string;
  timeZone: string;

  // Thread
  thread: ChatThreadRow;

  // Event
  event?: SportEventRow;

  // Training context (injected upfront)
  coachingState: CoachingStateRow;

  // whether >= 1 proposal exists by the end of all turns.
  hasProposal: boolean;

  // Tool availability — dynamic based on state
  availableTools: Set<ToolName>;

  // Round tracking, for a single call.
  maxRounds: number;
};
