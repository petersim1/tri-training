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
import type { HevyWorkout } from "../hevy/types";
import type { StravaActivity } from "../strava/types";

/** JSON value — structured so TanStack Start can serialize server responses. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

const pkUUIDField = {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
};

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

export const vendorActivities = sqliteTable(
  "vendor_activities",
  {
    ...pkUUIDField,
    ...baseTimestamps,
    vendor: text("vendor").$type<WorkoutVendor>().notNull(),
    vendorId: text("vendor_id").notNull(),
    data: text("data", { mode: "json" })
      .notNull()
      .$type<StravaActivity | HevyWorkout>(),
  },
  (t) => [
    uniqueIndex("completed_workouts_vendor_vendor_id").on(t.vendor, t.vendorId),
  ],
);

export type VendorActivityRow = typeof vendorActivities.$inferSelect;
export type NewVendorActivityRow = typeof vendorActivities.$inferInsert;

export type StravaActivityRow = Omit<VendorActivityRow, "vendor" | "data"> & {
  vendor: "strava";
  data: StravaActivity;
};

export type HevyWorkoutRow = Omit<VendorActivityRow, "vendor" | "data"> & {
  vendor: "hevy";
  data: HevyWorkout;
};

export type TypedVendorWorkoutRow = StravaActivityRow | HevyWorkoutRow;

export const workoutEntries = sqliteTable(
  "workout_entries",
  {
    ...pkUUIDField,
    ...baseTimestamps,
    kind: text("kind").notNull().$type<PlanKind>(),
    /** Calendar day `YYYY-MM-DD` from the browser (timezone-invariant intention). */
    dayKey: text("day_key").notNull(),
    notes: text("notes"),
    status: text("status").$type<PlanStatus>().notNull().default("planned"),
    routineVendor: text("routine_vendor").$type<WorkoutVendor>(),
    routineId: text("routine_id"),
    vendorActivityId: text("vendor_activity_id").references(
      () => vendorActivities.id,
      { onDelete: "set null" },
    ),
    distance: real("distance"),
    distanceUnits: text("distance_units").$type<CardioDistanceUnit | null>(),
    timeSeconds: integer("time_seconds"),
  },
  (t) => [index("ix_workout_entries_day_key").on(t.dayKey)],
);

export type WorkoutEntryRow = typeof workoutEntries.$inferSelect;
export type NewWorkoutEntryRow = typeof workoutEntries.$inferInsert;

export type WorkoutEntryWithCompleted = WorkoutEntryRow & {
  vendorActivity: VendorActivityRow | null;
};

export const weightEntries = sqliteTable(
  "weight_entries",
  {
    ...pkUUIDField,
    ...baseTimestamps,
    dayKey: text("day_key").notNull().unique(),
    weightLb: real("weight_lbs").notNull(),
    notes: text("notes"),
  },
  (t) => [index("ix_weight_entries_day_key").on(t.dayKey)],
);

export type WeightEntryRow = typeof weightEntries.$inferSelect;
export type NewWeightEntryRow = typeof weightEntries.$inferInsert;

/** Singleton row (`id` = 1) for Strava API in webhooks (no browser cookies). */
export const serviceStravaTokens = sqliteTable("service_strava_tokens", {
  ...baseTimestamps,
  id: integer("id").primaryKey(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token").notNull(),
  /** Unix seconds */
  expiresAt: integer("expires_at").notNull(),
});

export type ServiceStravaTokensRow = typeof serviceStravaTokens.$inferSelect;

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  ...pkUUIDField,
  ...baseTimestamps,
  source: text("source").$type<WorkoutVendor>().notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  payloadJson: text("payload_json"),
  outcome: text("outcome").$type<"ok" | "ignored" | "error">().notNull(),
  detail: text("detail"),
});

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

export const planningChatThreads = sqliteTable(
  "planning_chat_threads",
  {
    ...pkUUIDField,
    ...baseTimestamps,
    title: text("title"),
  },
  () => [],
);

export type PlanningChatThreadRow = typeof planningChatThreads.$inferSelect;

export const planningChatMessages = sqliteTable(
  "planning_chat_messages",
  {
    ...pkUUIDField,
    ...baseTimestamps,
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
  },
  (t) => [index("planning_chat_messages_thread_seq").on(t.threadId, t.seq)],
);

export type PlanningChatMessageRow = typeof planningChatMessages.$inferSelect;

/**
 * Persisted interpreted coaching truths for planning chat (one row per athlete; `id` = stable user/athlete key).
 * Freeform JSON blobs — sport-agnostic structure lives in prompts / patch model, not the DB column layout.
 */
export const coachingState = sqliteTable("coaching_state", {
  ...pkUUIDField,
  ...baseTimestamps,
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
});

export type CoachingStateRow = typeof coachingState.$inferSelect;

/** Future goals / races (e.g. A-race dates) surfaced to planning assistant. */
export const sportEvents = sqliteTable(
  "sport_events",
  {
    ...pkUUIDField,
    ...baseTimestamps,
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
  },
  (t) => [index("sport_events_event_day_key_idx").on(t.eventDayKey)],
);

export type SportEventRow = typeof sportEvents.$inferSelect;
export type NewSportEventRow = typeof sportEvents.$inferInsert;
