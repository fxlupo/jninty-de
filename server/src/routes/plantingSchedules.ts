import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { plantingSchedules } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type PlantingScheduleBody = Omit<
  typeof plantingSchedules.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type PlantingSchedulePatch = Partial<PlantingScheduleBody>;

/** GET /api/planting-schedules?seasonId=&bedId=&start=&end= */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const seasonId = c.req.query("seasonId");
  const bedId = c.req.query("bedId");
  const start = c.req.query("start");
  const end = c.req.query("end");

  let rows = await db
    .select()
    .from(plantingSchedules)
    .where(and(eq(plantingSchedules.userId, userId), isNull(plantingSchedules.deletedAt)));

  if (seasonId) rows = rows.filter((r) => r.seasonId === seasonId);
  if (bedId) rows = rows.filter((r) => r.bedId === bedId);
  if (start && end) {
    rows = rows.filter(
      (r) =>
        r.harvestEndDate >= start &&
        (r.seedStartDate ?? r.harvestStartDate) <= end,
    );
  }

  return c.json(rows);
});

/** GET /api/planting-schedules/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(plantingSchedules)
    .where(and(eq(plantingSchedules.id, id), eq(plantingSchedules.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/planting-schedules */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<PlantingScheduleBody>();
  const result = await db
    .insert(plantingSchedules)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/planting-schedules/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<PlantingSchedulePatch>();
  const result = await db
    .update(plantingSchedules)
    .set({ ...body, version: sql`${plantingSchedules.version} + 1`, updatedAt: now() })
    .where(and(eq(plantingSchedules.id, id), eq(plantingSchedules.userId, userId), isNull(plantingSchedules.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/planting-schedules/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(plantingSchedules)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${plantingSchedules.version} + 1` })
    .where(and(eq(plantingSchedules.id, id), eq(plantingSchedules.userId, userId), isNull(plantingSchedules.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
