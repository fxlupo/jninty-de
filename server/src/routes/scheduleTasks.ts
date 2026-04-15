import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { scheduleTasks } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type ScheduleTaskBody = Omit<
  typeof scheduleTasks.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type ScheduleTaskPatch = Partial<ScheduleTaskBody>;

/** GET /api/schedule-tasks?scheduleId=&start=&end= */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const scheduleId = c.req.query("scheduleId");
  const start = c.req.query("start");
  const end = c.req.query("end");

  let rows = await db
    .select()
    .from(scheduleTasks)
    .where(and(eq(scheduleTasks.userId, userId), isNull(scheduleTasks.deletedAt)));

  if (scheduleId) rows = rows.filter((r) => r.plantingScheduleId === scheduleId);
  if (start) rows = rows.filter((r) => r.scheduledDate >= start);
  if (end) rows = rows.filter((r) => r.scheduledDate <= end);

  return c.json(rows);
});

/** GET /api/schedule-tasks/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(scheduleTasks)
    .where(and(eq(scheduleTasks.id, id), eq(scheduleTasks.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/schedule-tasks */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<ScheduleTaskBody>();
  const result = await db
    .insert(scheduleTasks)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** POST /api/schedule-tasks/batch — create multiple tasks */
router.post("/batch", requireAuth, async (c) => {
  const userId = c.get("userId");
  const bodies = await c.req.json<ScheduleTaskBody[]>();
  const timestamp = now();
  const rows = bodies.map((b) => ({
    ...b,
    id: crypto.randomUUID(),
    userId,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const result = await db.insert(scheduleTasks).values(rows).returning();
  return c.json(result, 201);
});

/** PATCH /api/schedule-tasks/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<ScheduleTaskPatch>();
  const result = await db
    .update(scheduleTasks)
    .set({ ...body, version: sql`${scheduleTasks.version} + 1`, updatedAt: now() })
    .where(and(eq(scheduleTasks.id, id), eq(scheduleTasks.userId, userId), isNull(scheduleTasks.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** PATCH /api/schedule-tasks/:id/complete
 * Uses PATCH (not POST) to avoid a Hono 4 router conflict:
 * having both a static POST sub-path (/batch) AND parameterised POST sub-paths
 * (/:id/complete) on the same router corrupts the parent **-wildcard for auth.
 */
router.patch("/:id/complete", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const ts = now();
  let body: { completedDate?: string } = {};
  try { body = await c.req.json<{ completedDate?: string }>(); } catch { /* no body */ }
  const dateStr = body.completedDate ?? ts.slice(0, 10);
  const result = await db
    .update(scheduleTasks)
    .set({ isCompleted: true, completedDate: dateStr, completedAt: ts, version: sql`${scheduleTasks.version} + 1`, updatedAt: ts })
    .where(and(eq(scheduleTasks.id, id), eq(scheduleTasks.userId, userId), isNull(scheduleTasks.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** PATCH /api/schedule-tasks/:id/uncomplete */
router.patch("/:id/uncomplete", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(scheduleTasks)
    .set({ isCompleted: false, completedDate: null, completedAt: null, version: sql`${scheduleTasks.version} + 1`, updatedAt: now() })
    .where(and(eq(scheduleTasks.id, id), eq(scheduleTasks.userId, userId), isNull(scheduleTasks.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/schedule-tasks/:id — soft delete one task.
 *  DELETE /api/schedule-tasks/bulk?scheduleId=<id> — soft delete all tasks for a schedule.
 *  Note: the /by-schedule/:scheduleId sub-path pattern causes a Hono routing conflict
 *  with the wildcard auth handler; query-param bulk delete avoids this.
 */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";

  // Bulk delete by scheduleId query param (id param will be "bulk")
  if (id === "bulk") {
    const scheduleId = c.req.query("scheduleId") ?? "";
    await db
      .update(scheduleTasks)
      .set({ deletedAt: now(), updatedAt: now() })
      .where(
        and(
          eq(scheduleTasks.plantingScheduleId, scheduleId),
          eq(scheduleTasks.userId, userId),
          isNull(scheduleTasks.deletedAt),
        ),
      );
    return c.json({ ok: true });
  }

  const result = await db
    .update(scheduleTasks)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${scheduleTasks.version} + 1` })
    .where(and(eq(scheduleTasks.id, id), eq(scheduleTasks.userId, userId), isNull(scheduleTasks.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
