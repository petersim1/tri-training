import type {
  ChatThreadRow,
  CoachingStateRow,
  SportEventRow,
} from "@/lib/db/schema.server";
import type { ToolName } from "@/types/chats/tools";
import type { ChatProposal, ToolCallSchemaValues } from "@/types/db";

export type ChatRunContext = {
  runStart: Date;
  // Generic
  dayKey: string;

  // Thread
  thread: ChatThreadRow;

  // Event
  event?: SportEventRow;

  // Training context (injected upfront)
  coachingState: CoachingStateRow;

  // Tool availability — dynamic based on state
  availableTools: Set<ToolName>;

  toolsCalled: ToolCallSchemaValues[];

  // Dynamically injected according to certain tools, which we'll store on the sys message for next turn.
  proposals?: ChatProposal;

  // Round tracking, for a single call.
  round: number;
  maxRounds: number;
};
