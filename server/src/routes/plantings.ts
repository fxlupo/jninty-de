import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { plantings } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type PlantingBody = Omit<
  typeof plantings.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type PlantingPatch = Partial<PlantingBody>;

/** GET /api/plantings?seasonId=&plantId=&bedId= */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const seasonId = c.req.query("seasonId");
  const plantId = c.req.query("plantId");
  const bedId = c.req.query("bedId");

  let rows = await db
    .select()
    .from(plantings)
    .where(and(eq(plantings.userId, userId), isNull(plantings.deletedAt)));

  if (seasonId) rows = rows.filter((r) => r.seasonId === seasonId);
  if (plantId) rows = rows.filter((r) => r.plantInstanceId === plantId);
  if (bedId) rows = rows.filter((r) => r.bedId === bedId);

  return c.json(rows);
});

/** GET /api/plantings/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(plantings)
    .where(and(eq(plantings.id, id), eq(plantings.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/plantings */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<PlantingBody>();
  const result = await db
    .insert(plantings)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/plantings/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<PlantingPatch>();
  const result = await db
    .update(plantings)
    .set({ ...body, version: sql`${plantings.version} + 1`, updatedAt: now() })
    .where(and(eq(plantings.id, id), eq(plantings.userId, userId), isNull(plantings.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/plantings/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(plantings)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${plantings.version} + 1` })
    .where(and(eq(plantings.id, id), eq(plantings.userId, userId), isNull(plantings.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
