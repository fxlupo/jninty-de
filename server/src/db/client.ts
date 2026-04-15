import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH =
  process.env["DATABASE_URL"] ??
  path.resolve(__dirname, "../../../data/jninty.db");

const MIGRATIONS_PATH = path.resolve(__dirname, "../../migrations");

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance and FK enforcement
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

/**
 * Run pending Drizzle migrations on startup.
 * Safe to call multiple times — only applies new migrations.
 */
export function runMigrations(): void {
  migrate(db, { migrationsFolder: MIGRATIONS_PATH });
}
