import z from "zod";
import {
  CARDIO_DISTANCE_UNITS,
  PLAN_KIND_VALUES,
  PLAN_STATUS_VALUES,
} from "@/lib/constants/activities";
import {
  CHART_AGG_VALUES,
  CHART_METRIC_VALUES,
  CHART_RANGE_VALUES,
} from "@/lib/constants/visuals";
import { dayKeySchema, idSchema } from "./shared";

export type CalendarScope = "month" | "week";

export const calendarSchema = z.object({
  period: z.enum(["month", "week"]),
  anchor: z.iso.date(),
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
  agg: z.enum(CHART_AGG_VALUES).optional(),
  kind: z.enum(PLAN_KIND_VALUES).optional(),
  metric: z.enum(CHART_METRIC_VALUES).optional(),
  cumulative: z.boolean().optional(),
});

export type VizSchemaValues = z.infer<typeof vizSchema>;

export const stackedVizSchema = z.object({
  ...baseVizSchema.shape,
  agg: z.enum(CHART_AGG_VALUES).optional(),
  metric: z.enum(CHART_METRIC_VALUES).optional(),
  proportional: z.boolean().optional(),
  cumulative: z.boolean().optional(),
});

export type StackedVizSchemaValues = z.infer<typeof stackedVizSchema>;

export const createPlanBaseSchema = z.object({
  ...dayKeySchema.shape,
  kind: z.enum(PLAN_KIND_VALUES),
  notes: z.string().nullable().optional(),
  distance: z.number().gt(0).nullable().optional(),
  distanceUnits: z.enum(CARDIO_DISTANCE_UNITS).nullable().optional(),
  timeSeconds: z.number().int().gt(0).nullable().optional(),
  routineId: z.string().nullable().optional(),
});

export const createPlanSchema = createPlanBaseSchema
  .refine(
    (data) => {
      if (data.distance != null) return data.distanceUnits != null;
      return true;
    },
    {
      message: "Distance units are required when distance is provided.",
      path: ["distanceUnits"],
    },
  )
  .transform((data) => ({
    ...data,
    routineId: data.kind === "lift" ? data.routineId : null,
    distanceUnits: data.distance != null ? data.distanceUnits : null,
  }));

export type CreatePlanInput = z.input<typeof createPlanSchema>;
export type CreatePlanOutput = z.output<typeof createPlanSchema>;

export const createFromCompletedSchema = z.object({
  dayKey: z.iso.date(),
  vendorActivityId: z.string(),
});

export type CreateFromCompletedInput = z.infer<
  typeof createFromCompletedSchema
>;

export const updatePlanBaseSchema = z.object({
  ...idSchema.shape,
  ...dayKeySchema.partial().shape,
  notes: z.string().nullable().optional(),
  kind: z.enum(PLAN_KIND_VALUES).optional(),
  status: z.enum(PLAN_STATUS_VALUES).optional(),
  routineId: z.string().nullable().optional(),
  distance: z.number().nullable().optional(),
  distanceUnits: z.enum(CARDIO_DISTANCE_UNITS).nullable().optional(),
  timeSeconds: z.number().int().nullable().optional(),
});

export const updatePlanSchema = updatePlanBaseSchema
  .refine(
    (data) => {
      if (data.distance != null) return data.distanceUnits != null;
      return true;
    },
    {
      message: "Distance units are required when distance is provided.",
      path: ["distanceUnits"],
    },
  )
  .transform((data) => ({
    ...data,
    routineId: data.kind === "lift" ? data.routineId : null,
    distanceUnits: data.distance != null ? data.distanceUnits : null,
  }));

export type UpdatePlanInput = z.input<typeof updatePlanSchema>;
export type UpdatePlanOutput = z.output<typeof updatePlanSchema>;
