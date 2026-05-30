import z from "zod";
import { dayKeySchema } from "./shared";

export const createWeightSchema = z.object({
  ...dayKeySchema.shape,
  weightLb: z.number().gt(0),
});

export type CreateWeightSchemaValues = z.infer<typeof createWeightSchema>;
