import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db?: LibSQLDatabase<typeof schema>;
};

function resolveLocalFilePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/workout.db";
  const raw = url.startsWith("file:") ? url.slice("file:".length) : url;
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

/**
 * Turso / libSQL (Vercel, etc.): `DATABASE_TURSO_DATABASE_URL` + `DATABASE_TURSO_AUTH_TOKEN`.
 * Local dev: `DATABASE_URL=file:./data/workout.db` (or omit; default file DB).
 * @see https://orm.drizzle.team/docs/tutorials/drizzle-with-turso
 */
export function getDb(): LibSQLDatabase<typeof schema> {
  if (!globalForDb.db) {
    const tursoUrl = process.env.DATABASE_TURSO_DATABASE_URL?.trim();
    const tursoToken = process.env.DATABASE_TURSO_AUTH_TOKEN?.trim();

    if (tursoUrl) {
      if (!tursoToken) {
        throw new Error(
          "DATABASE_TURSO_AUTH_TOKEN is required when DATABASE_TURSO_DATABASE_URL is set",
        );
      }
      globalForDb.db = drizzle({
        schema,
        connection: {
          url: tursoUrl,
          authToken: tursoToken,
        },
      });
    } else {
      const filePath = resolveLocalFilePath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const fileUrl = pathToFileURL(filePath).href;
      globalForDb.db = drizzle({
        schema,
        connection: {
          url: fileUrl,
        },
      });
    }
  }
  return globalForDb.db;
}

export { schema };
