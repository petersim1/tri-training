import type { PlanKind, WorkoutVendor } from "@/lib/constants/activities";
import type { ChatMessageRow } from "@/lib/db/schema.server";
import type { ChatProposal } from "../db";

export type PlannerCompletedBrief = {
  id: string;
  vendor: WorkoutVendor;
  activityKind: string;
  inferredPlanKind: PlanKind | null;
  localDayKey: string | null;
  isoStart: string | null;
  distanceM: number | null;
  movingSeconds: number | null;
  avgHeartRateBpm: number | null;
  liftExerciseLines: string[];
};

export type ChatMessageItem = Omit<ChatMessageRow, "role"> & {
  role: "user" | "assistant";
  proposalSet?: {
    op: ChatProposal["item"]["op"];
    status: ChatProposal["status"];
  }[];
};
