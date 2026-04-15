import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { journalEntries } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type JournalBody = Omit<
  typeof journalEntries.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type JournalPatch = Partial<JournalBody>;

/** GET /api/journal?seasonId=&plantId=&activityType=&start=&end=&limit= */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const seasonId = c.req.query("seasonId");
  const plantId = c.req.query("plantId");
  const activityType = c.req.query("activityType");
  const start = c.req.query("start");
  const end = c.req.query("end");
  const limitParam = c.req.query("limit");

  let rows = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)));

  if (seasonId) rows = rows.filter((r) => r.seasonId === seasonId);
  if (plantId) rows = rows.filter((r) => r.plantInstanceId === plantId);
  if (activityType) rows = rows.filter((r) => r.activityType === activityType);
  if (start) rows = rows.filter((r) => r.createdAt >= start);
  if (end) rows = rows.filter((r) => r.createdAt <= end);

  // Sort by createdAt descending (most recent first)
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (limitParam) {
    const limit = parseInt(limitParam, 10);
    if (!isNaN(limit) && limit > 0) rows = rows.slice(0, limit);
  }

  return c.json(rows);
});

/** GET /api/journal/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/journal */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<JournalBody>();
  const result = await db
    .insert(journalEntries)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/journal/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<JournalPatch>();
  const result = await db
    .update(journalEntries)
    .set({ ...body, version: sql`${journalEntries.version} + 1`, updatedAt: now() })
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/journal/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(journalEntries)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${journalEntries.version} + 1` })
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
