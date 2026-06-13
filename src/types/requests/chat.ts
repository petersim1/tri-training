import z from "zod";
import { dayKeySchema, timezoneSchema } from "./shared";

export const listMessagesSchema = z.object({
  threadId: z.uuid(),
  limit: z.number().int().positive().optional(),
  orderBy: z.enum(["asc", "desc"]).default("asc"),
});

export const chatSchema = z
  .object({
    ...dayKeySchema.shape,
    ...timezoneSchema.shape,
    threadId: z.uuid(),
    eventId: z.string().optional(),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("message"), message: z.string() }),
      z.object({ type: z.literal("approval"), approved: z.boolean() }),
    ]),
  );

export type ListMessagesSchemaValues = z.infer<typeof listMessagesSchema>;
export type ChatSchemaValues = z.infer<typeof chatSchema>;
