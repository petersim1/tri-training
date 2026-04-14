import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const url = process.env.DATABASE_URL ?? "file:./data/workout.db";
const raw = url.startsWith("file:") ? url.slice("file:".length) : url;
const filePath = path.isAbsolute(raw) ? raw : path.join(root, raw);
fs.mkdirSync(path.dirname(filePath), { recursive: true });
