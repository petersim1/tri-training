import { defineConfig } from "drizzle-kit";

const tursoUrl = process.env.DATABASE_TURSO_DATABASE_URL?.trim();
const tursoToken = process.env.DATABASE_TURSO_AUTH_TOKEN?.trim();

export default defineConfig(
  tursoUrl && tursoToken
    ? {
        schema: "./lib/db/schema.server.ts",
        out: "./drizzle",
        dialect: "turso",
        dbCredentials: {
          url: tursoUrl,
          authToken: tursoToken,
        },
      }
    : {
        schema: "./lib/db/schema.server.ts",
        out: "./drizzle",
        dialect: "sqlite",
        dbCredentials: {
          url: process.env.DATABASE_URL ?? "file:./data/workout.db",
        },
      },
);
