import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

function resolveDbFilePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/workout.db";
  const raw = url.startsWith("file:") ? url.slice("file:".length) : url;
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

export function getDb() {
  if (!globalForDb.db) {
    const filePath = resolveDbFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const sqlite = new Database(filePath);
    sqlite.pragma("journal_mode = WAL");
    globalForDb.sqlite = sqlite;
    globalForDb.db = drizzle(sqlite, { schema });
  }
  return globalForDb.db;
}

export { schema };
