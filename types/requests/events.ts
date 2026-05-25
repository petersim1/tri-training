import z from "zod";
import { PLAN_STATUSES } from "@/components/PlanStatusSelect";
import {
  CARDIO_DISTANCE_UNITS,
  PLAN_KIND_VALUES,
} from "@/lib/constants/activities";
import { SPORT_EVENT_DISCIPLINES } from "@/lib/constants/events";
import { dayKeySchema, idSchema } from "./shared";

export const eventTargetSchema = z.object({});

const sportEventTargetSegmentSchema = z.object({
  activity: z.enum(PLAN_KIND_VALUES),
  label: z.string().nullable().optional(),
  distance: z.number().nullable().optional(),
  distance_units: z.enum(CARDIO_DISTANCE_UNITS).nullable().optional(),
  time_seconds: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const createSportEventSchema = z.object({
  ...dayKeySchema.shape,
  name: z.string().min(1),
  discipline: z.enum(SPORT_EVENT_DISCIPLINES).nullable().optional(),
  notes: z.string().nullable().optional(),
  targets: z.array(sportEventTargetSegmentSchema),
  url: z.url().nullable().optional(),
});

export const updateSportEventSchema = createSportEventSchema.partial().extend({
  ...idSchema.shape,
  status: z.enum(PLAN_STATUSES).optional(),
});

export type SportEventTargetSchemaValues = z.infer<
  typeof sportEventTargetSegmentSchema
>;
export type CreateSportEventSchemaValues = z.infer<
  typeof createSportEventSchema
>;
export type UpdateSportEventSchemaValues = z.infer<
  typeof updateSportEventSchema
>;
