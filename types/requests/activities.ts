import z from "zod";
import {
  CARDIO_DISTANCE_UNITS,
  PLAN_KIND_VALUES,
  PLAN_STATUS_VALUES,
} from "@/lib/constants/activities";
import {
  CHART_METRIC_VALUES,
  CHART_RANGE_VALUES,
} from "@/lib/constants/visuals";
import { dayKeySchema, idSchema, timezoneSchema } from "./shared";

export type CalendarScope = "month" | "week";

export const candidateLinkSchema = z.object({
  ...timezoneSchema.shape,
  planId: z.string(),
});

export type CandidateLinkSchemaValues = z.infer<typeof candidateLinkSchema>;

export const calendarSchema = z.object({
  period: z.enum(["month", "week"]),
  anchor: z.iso.date(),
  ...timezoneSchema.shape,
});

export type CalendarSchemaValues = z.infer<typeof calendarSchema>;

export const activityListSchema = z.object({
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  kind: z.enum(PLAN_KIND_VALUES).optional(),
  status: z.enum(PLAN_STATUS_VALUES).optional(),
  page: z.number().gte(0).default(0),
  pageSize: z.number().gt(0).lte(100).default(20),
});

export type ActivityListSchemaValues = z.infer<typeof activityListSchema>;

export const baseVizSchema = z.object({
  range: z.enum(CHART_RANGE_VALUES).optional(),
});

export type BaseVizSchemaValues = z.infer<typeof baseVizSchema>;

export const vizSchema = z.object({
  ...baseVizSchema.shape,
  kind: z.enum(PLAN_KIND_VALUES).optional(),
  metric: z.enum(CHART_METRIC_VALUES).optional(),
  cumulative: z.boolean().optional(),
});

export type VizSchemaValues = z.infer<typeof vizSchema>;

export const createPlanSchema = z.object({
  ...dayKeySchema.shape,
  kind: z.enum(PLAN_KIND_VALUES),
  notes: z.string().optional(),
  distance: z.number().nullable().optional(),
  distanceUnits: z.enum(CARDIO_DISTANCE_UNITS).nullable().optional(),
  timeSeconds: z.number().int().nullable().optional(),
  routineId: z.string().optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const createFromCompletedSchema = z.object({
  dayKey: z.iso.date(),
  completedWorkoutId: z.string(),
});

export type CreateFromCompletedInput = z.infer<
  typeof createFromCompletedSchema
>;

export const updatePlanSchema = z.object({
  ...idSchema.shape,
  ...dayKeySchema.partial().shape,
  notes: z.string().nullable().optional(),
  kind: z.enum(PLAN_KIND_VALUES).optional(),
  status: z.enum(PLAN_STATUS_VALUES).optional(),
  hevyRoutineId: z.string().nullable().optional(),
  distance: z.number().nullable().optional(),
  distanceUnits: z.enum(CARDIO_DISTANCE_UNITS).nullable().optional(),
  timeSeconds: z.number().int().nullable().optional(),
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
