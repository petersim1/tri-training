import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** JSON value — structured so TanStack Start can serialize server responses. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Linked session: full Strava activity or Hevy workout JSON from vendor APIs.
 * @see `~/lib/plans/completed-workout-data.ts` for field accessors.
 */
export const completedWorkouts = sqliteTable(
  "completed_workouts",
  {
    id: text("id").primaryKey(),
    vendor: text("vendor").$type<"strava" | "hevy">().notNull(),
    /** Strava activity id or Hevy workout id (string). */
    vendorId: text("vendor_id").notNull(),
    data: text("data", { mode: "json" }).notNull().$type<JsonValue>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("completed_workouts_vendor_vendor_id").on(t.vendor, t.vendorId),
  ],
);

export type CompletedWorkoutRow = typeof completedWorkouts.$inferSelect;
export type NewCompletedWorkout = typeof completedWorkouts.$inferInsert;

export const plannedWorkouts = sqliteTable("planned_workouts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("planned"),
  routineVendor: text("routine_vendor").$type<"strava" | "hevy">().notNull(),
  routineId: text("routine_id"),
  completedWorkoutId: text("completed_workout_id").references(
    () => completedWorkouts.id,
    { onDelete: "set null" },
  ),
  distance: real("distance"),
  distanceUnits: text("distance_units"),
  timeSeconds: integer("time_seconds"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type PlannedWorkoutRow = typeof plannedWorkouts.$inferSelect;
export type NewPlannedWorkout = typeof plannedWorkouts.$inferInsert;

export type PlannedWorkoutWithCompleted = PlannedWorkoutRow & {
  completedWorkout: CompletedWorkoutRow | null;
};

export const weightEntries = sqliteTable("weight_entries", {
  id: text("id").primaryKey(),
  dayKey: text("day_key").notNull().unique(),
  measuredAt: text("measured_at").notNull(),
  weightLb: real("weight_lbs").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type WeightEntryRow = typeof weightEntries.$inferSelect;

/** Singleton row (`id` = 1) for Strava API in webhooks (no browser cookies). */
export const serviceStravaTokens = sqliteTable("service_strava_tokens", {
  id: integer("id").primaryKey(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token").notNull(),
  /** Unix seconds */
  expiresAt: integer("expires_at").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type ServiceStravaTokensRow = typeof serviceStravaTokens.$inferSelect;

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  source: text("source").$type<"hevy" | "strava">().notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  payloadJson: text("payload_json"),
  outcome: text("outcome").$type<"ok" | "ignored" | "error">().notNull(),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
