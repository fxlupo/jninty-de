import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.resolve(process.cwd(), "server/migrations");

function hasSqlite3(): boolean {
  try {
    execFileSync("sqlite3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runSql(dbPath: string, statements: string[]): string {
  return execFileSync("sqlite3", [dbPath, ...statements], {
    encoding: "utf8",
  }).trim();
}

function withDatabase<T>(fn: (dbPath: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), "jninty-irrigation-"));
  const dbPath = path.join(dir, "test.sqlite");
  try {
    return fn(dbPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const describeIfSqlite = hasSqlite3() ? describe : describe.skip;

describeIfSqlite("irrigation migration 0010", () => {
  it("applies cleanly after the initial irrigation migration", () => {
    withDatabase((dbPath) => {
      runSql(dbPath, [
        `.read ${path.join(migrationsDir, "0009_irrigation_module.sql")}`,
        `.read ${path.join(migrationsDir, "0010_harsh_baron_zemo.sql")}`,
      ]);

      const indexes = runSql(dbPath, [
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('irrigation_zone_user_valve_idx', 'irrigation_command_user_status_idx') ORDER BY name;",
      ]);

      expect(indexes.split("\n")).toEqual([
        "irrigation_command_user_status_idx",
        "irrigation_zone_user_valve_idx",
      ]);
    });
  });

  it("normalizes legacy command statuses during the table rebuild", () => {
    withDatabase((dbPath) => {
      runSql(dbPath, [
        `.read ${path.join(migrationsDir, "0009_irrigation_module.sql")}`,
        `INSERT INTO irrigation_command (id, created_at, updated_at, user_id, zone_number, command, status, requested_at, completed_at)
         VALUES ('cmd-done', '2026-05-06T05:00:00.000Z', '2026-05-06T05:00:00.000Z', 'user-1', 1, 'open', 'unexpected', '2026-05-06T05:00:00.000Z', '2026-05-06T05:01:00.000Z');`,
        `INSERT INTO irrigation_command (id, created_at, updated_at, user_id, zone_number, command, status, requested_at, acked_at)
         VALUES ('cmd-acked', '2026-05-06T05:00:00.000Z', '2026-05-06T05:00:00.000Z', 'user-1', 1, 'open', 'also-unexpected', '2026-05-06T05:00:00.000Z', '2026-05-06T05:00:10.000Z');`,
        `INSERT INTO irrigation_command (id, created_at, updated_at, user_id, zone_number, command, status, requested_at)
         VALUES ('cmd-pending', '2026-05-06T05:00:00.000Z', '2026-05-06T05:00:00.000Z', 'user-1', 1, 'open', 'strange', '2026-05-06T05:00:00.000Z');`,
        `.read ${path.join(migrationsDir, "0010_harsh_baron_zemo.sql")}`,
      ]);

      const statuses = runSql(dbPath, [
        "SELECT id || ':' || status FROM irrigation_command ORDER BY id;",
      ]);

      expect(statuses.split("\n")).toEqual([
        "cmd-acked:acked",
        "cmd-done:done",
        "cmd-pending:pending",
      ]);
    });
  });
});
