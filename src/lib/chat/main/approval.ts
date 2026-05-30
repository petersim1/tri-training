import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index.server";
import { chatMessages, workoutEntries } from "@/lib/db/schema.server";

export const handleApproval = async (
  threadId: string,
  isApproved: boolean,
): Promise<boolean> => {
  const db = await getDb();

  const row = await db
    .select({ proposals: chatMessages.proposals, id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.threadId, threadId),
        eq(chatMessages.role, "assistant"),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1)
    .get();
  if (!row) {
    throw new Error("not found");
  }
  const proposals = row.proposals;
  if (!proposals) {
    throw new Error("last message was not a proposal.");
  }
  if (!proposals.items.length) {
    throw new Error("no proposal items.");
  }
  if (proposals.status !== "pending") {
    throw new Error("last proposal was already acted on.");
  }

  if (!isApproved) {
    proposals.status = "rejected";
    await db
      .update(chatMessages)
      .set({ proposals })
      .where(eq(chatMessages.id, row.id))
      .run();
    return false;
  }

  for (const proposal of proposals.items) {
    if (proposal.op === "delete") {
      const { id } = proposal;
      console.log("approved deletion of", id);
      await db.delete(workoutEntries).where(eq(workoutEntries.id, id));
    }
    if (proposal.op === "update") {
      const { id, op, ...fields } = proposal;
      console.log("approved update of", id);
      await db
        .update(workoutEntries)
        .set({
          ...(!!fields.notes && { notes: fields.notes }),
          ...(!!fields.dayKey && { dayKey: fields.dayKey }),
          ...(!!fields.kind && { kind: fields.kind }),
          ...(!!fields.status && { status: fields.status }),
          ...(!!fields.distance && { distance: fields.distance }),
          ...(!!fields.distanceUnits && {
            distanceUnits: fields.distanceUnits,
          }),
          ...(fields.timeSeconds && {
            timeSeconds: fields.timeSeconds,
          }),
        })
        .where(eq(workoutEntries.id, id));
    }

    if (proposal.op === "create") {
      const { op, ...fields } = proposal;
      console.log("approved creation of workout", fields);
      await db.insert(workoutEntries).values(fields);
    }
  }

  proposals.status = "approved";
  await db
    .update(chatMessages)
    .set({ proposals })
    .where(eq(chatMessages.id, row.id))
    .run();

  return true;
};
