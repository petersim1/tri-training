import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/index.server";
import { chatMessages, workoutEntries } from "@/lib/db/schema.server";

export const handleApproval = async (
  threadId: string,
  isApproved: boolean,
): Promise<boolean> => {
  const db = await getDb();

  // get the most recent seq
  const latestSeq = await db
    .select({ seq: chatMessages.seq })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.seq))
    .limit(1)
    .get();

  if (!latestSeq) throw new Error("no messages found");

  // get all tool rows with proposals for that seq
  const rows = await db
    .select({ id: chatMessages.id, proposal: chatMessages.proposal })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.threadId, threadId),
        eq(chatMessages.seq, latestSeq.seq),
        eq(chatMessages.role, "tool"),
        isNotNull(chatMessages.proposal),
      ),
    )
    .all();

  if (!rows.length) throw new Error("no proposals found for latest seq");

  if (isApproved) {
    for (const row of rows) {
      if (!row.proposal) continue;
      const proposal = row.proposal;
      const item = proposal.item;

      if (item.op === "delete") {
        await db.delete(workoutEntries).where(eq(workoutEntries.id, item.id));
      }
      if (item.op === "update") {
        const { id, op, ...fields } = item;
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
      if (item.op === "create") {
        const { op, ...fields } = item;
        await db.insert(workoutEntries).values(fields);
      }
    }
  }

  const ids = rows.map((r) => r.id);
  const newStatus = isApproved ? "approved" : "rejected";

  await db
    .update(chatMessages)
    .set({
      proposal: sql`json_set(proposal, '$.status', ${newStatus})`,
    })
    .where(inArray(chatMessages.id, ids));

  return true;
};
