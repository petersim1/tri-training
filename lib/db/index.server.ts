import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.server";

const globalForDb = globalThis as unknown as {
  db?: LibSQLDatabase<typeof schema>;
};

async function resolveLocalFilePath(): Promise<string> {
  const { default: path } = await import("node:path");
  const url = process.env.DATABASE_URL ?? "file:./data/workout.db";
  const raw = url.startsWith("file:") ? url.slice("file:".length) : url;
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

export async function getDb(): Promise<LibSQLDatabase<typeof schema>> {
  if (!globalForDb.db) {
    const tursoUrl = process.env.DATABASE_TURSO_DATABASE_URL?.trim();
    const tursoToken = process.env.DATABASE_TURSO_AUTH_TOKEN?.trim();

    if (tursoUrl) {
      if (!tursoToken)
        throw new Error(
          "DATABASE_TURSO_AUTH_TOKEN is required when DATABASE_TURSO_DATABASE_URL is set",
        );
      globalForDb.db = drizzle({
        schema,
        connection: { url: tursoUrl, authToken: tursoToken },
      });
    } else {
      const { default: fs } = await import("node:fs");
      const { pathToFileURL } = await import("node:url");
      const { default: path } = await import("node:path");
      const filePath = await resolveLocalFilePath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const fileUrl = pathToFileURL(filePath).href;
      globalForDb.db = drizzle({ schema, connection: { url: fileUrl } });
    }
  }
  return globalForDb.db;
}
