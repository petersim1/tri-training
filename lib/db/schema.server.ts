import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  CardioDistanceUnit,
  PlanKind,
  PlanStatus,
  WorkoutVendor,
} from "../constants/activities";
import type {
  SportEventDiscipline,
  SportEventTargetSegment,
} from "../constants/events";
import type { CompletedActivityKind } from "../constants/vendors";

/** JSON value — structured so TanStack Start can serialize server responses. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

const baseTimestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`)
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`)
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

export const completedWorkouts = sqliteTable(
  "completed_workouts",
  {
    id: text("id").primaryKey(),
    vendor: text("vendor").$type<WorkoutVendor>().notNull(),
    /** Strava activity id or Hevy workout id (string). */
    vendorId: text("vendor_id").notNull(),
    /**
     * Normalized activity: Strava `sport_type` lowercased (see `~/lib/strava/sport-types`), or `lift` for Hevy.
     */
    activityKind: text("activity_kind")
      .notNull()
      .$type<CompletedActivityKind>(),
    /**
     * `true` when at least one `planned_workout` references this row. Used for “floating” sessions (webhook-only) and fast filters.
     */
    isResolved: integer("is_resolved", { mode: "boolean" }).notNull(),
    data: text("data", { mode: "json" }).notNull().$type<JsonValue>(),
    ...baseTimestamps,
  },
  (t) => [
    uniqueIndex("completed_workouts_vendor_vendor_id").on(t.vendor, t.vendorId),
    index("completed_workouts_is_resolved").on(t.isResolved),
  ],
);

export type CompletedWorkoutRow = typeof completedWorkouts.$inferSelect;
export type NewCompletedWorkout = typeof completedWorkouts.$inferInsert;

export const plannedWorkouts = sqliteTable("planned_workouts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().$type<PlanKind>(),
  /** Calendar day `YYYY-MM-DD` from the browser (timezone-invariant intention). */
  dayKey: text("day_key").notNull(),
  notes: text("notes"),
  status: text("status").$type<PlanStatus>().notNull().default("planned"),
  routineVendor: text("routine_vendor").$type<WorkoutVendor>().notNull(),
  routineId: text("routine_id"),
  completedWorkoutId: text("completed_workout_id").references(
    () => completedWorkouts.id,
    { onDelete: "set null" },
  ),
  distance: real("distance"),
  distanceUnits: text("distance_units").$type<CardioDistanceUnit | null>(),
  timeSeconds: integer("time_seconds"),
  ...baseTimestamps,
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
  ...baseTimestamps,
});

export type WeightEntryRow = typeof weightEntries.$inferSelect;
export type NewWeightEntryRow = typeof weightEntries.$inferInsert;

/** Singleton row (`id` = 1) for Strava API in webhooks (no browser cookies). */
export const serviceStravaTokens = sqliteTable("service_strava_tokens", {
  id: integer("id").primaryKey(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token").notNull(),
  /** Unix seconds */
  expiresAt: integer("expires_at").notNull(),
  ...baseTimestamps,
});

export type ServiceStravaTokensRow = typeof serviceStravaTokens.$inferSelect;

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  source: text("source").$type<WorkoutVendor>().notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  payloadJson: text("payload_json"),
  outcome: text("outcome").$type<"ok" | "ignored" | "error">().notNull(),
  detail: text("detail"),
  ...baseTimestamps,
});

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

export const planningChatThreads = sqliteTable(
  "planning_chat_threads",
  {
    id: text("id").primaryKey(),
    title: text("title"),
    ...baseTimestamps,
  },
  () => [],
);

export type PlanningChatThreadRow = typeof planningChatThreads.$inferSelect;

export const planningChatMessages = sqliteTable(
  "planning_chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => planningChatThreads.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role").notNull().$type<"user" | "assistant">(),
    content: text("content").notNull(),
    replaySummary: text("replay_summary"),
    metadata: text("metadata", { mode: "json" }).$type<JsonValue>(),
    sportEventId: text("sport_event_id").references(() => sportEvents.id, {
      onDelete: "set null",
    }),
    /** Latest assistant message that holds the pending calendar proposal (cross-turn retrieval). */
    isProposal: integer("is_proposal", { mode: "boolean" })
      .notNull()
      .default(false),
    ...baseTimestamps,
  },
  (t) => [index("planning_chat_messages_thread_seq").on(t.threadId, t.seq)],
);

export type PlanningChatMessageRow = typeof planningChatMessages.$inferSelect;

/**
 * Persisted interpreted coaching truths for planning chat (one row per athlete; `id` = stable user/athlete key).
 * Freeform JSON blobs — sport-agnostic structure lives in prompts / patch model, not the DB column layout.
 */
export const coachingState = sqliteTable("coaching_state", {
  id: text("id").primaryKey(),
  constraints: text("constraints", { mode: "json" })
    .notNull()
    .$type<JsonValue[]>()
    .default(sql`'[]'`),
  preferences: text("preferences", { mode: "json" })
    .notNull()
    .$type<JsonValue>()
    .default(sql`'{}'`),
  disciplineState: text("discipline_state", { mode: "json" })
    .notNull()
    .$type<JsonValue>()
    .default(sql`'{}'`),
  periodization: text("periodization", { mode: "json" })
    .notNull()
    .$type<JsonValue>()
    .default(sql`'{}'`),
  flags: text("flags", { mode: "json" })
    .notNull()
    .$type<JsonValue>()
    .default(sql`'{}'`),
  ...baseTimestamps,
});

export type CoachingStateRow = typeof coachingState.$inferSelect;

/** Future goals / races (e.g. A-race dates) surfaced to planning assistant. */
export const sportEvents = sqliteTable(
  "sport_events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    eventDayKey: text("event_day_key").notNull(),
    status: text("status").$type<PlanStatus>().notNull().default("planned"),
    discipline: text("discipline").$type<SportEventDiscipline | null>(),
    notes: text("notes"),
    targets: text("targets", { mode: "json" })
      .notNull()
      .$type<SportEventTargetSegment[]>(),
    /** Registration or event page (`http` / `https` only when set). */
    url: text("url"),
    ...baseTimestamps,
  },
  (t) => [index("sport_events_event_day_key_idx").on(t.eventDayKey)],
);

export type SportEventRow = typeof sportEvents.$inferSelect;
export type NewSportEventRow = typeof sportEvents.$inferInsert;
