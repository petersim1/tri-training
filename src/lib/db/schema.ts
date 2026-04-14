import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Linked session (Strava activity or Hevy workout) — actual metrics from the list row at link time. */
export const completedWorkouts = sqliteTable("completed_workouts", {
  id: text("id").primaryKey(),
  vendor: text("vendor").$type<"strava" | "hevy">().notNull(),
  externalId: text("external_id").notNull(),
  distanceM: real("distance_m"),
  movingTimeSeconds: integer("moving_time_seconds"),
  elapsedTimeSeconds: integer("elapsed_time_seconds"),
  calories: real("calories"),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

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
