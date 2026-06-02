import { getDb } from "@/lib/db/index.server";
import { type CoachingStateRow, coachingState } from "@/lib/db/schema.server";

const get = async (): Promise<CoachingStateRow> => {
  const db = await getDb();
  const state = await db.select().from(coachingState).get();
  if (state) return state;

  await db.insert(coachingState).values({}).run();
  const newState = await db.select().from(coachingState).get();
  return newState as CoachingStateRow;
};

export const coachingServerFns = {
  get,
};
