import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { gardenBeds } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type GardenBedBody = Omit<
  typeof gardenBeds.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type GardenBedPatch = Partial<GardenBedBody>;

/** GET /api/garden-beds?type= */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type");
  let rows = await db
    .select()
    .from(gardenBeds)
    .where(and(eq(gardenBeds.userId, userId), isNull(gardenBeds.deletedAt)));
  if (type) rows = rows.filter((r) => r.type === type);
  return c.json(rows);
});

/** GET /api/garden-beds/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(gardenBeds)
    .where(and(eq(gardenBeds.id, id), eq(gardenBeds.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/garden-beds */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<GardenBedBody>();
  const result = await db
    .insert(gardenBeds)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/garden-beds/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<GardenBedPatch>();
  const result = await db
    .update(gardenBeds)
    .set({ ...body, version: sql`${gardenBeds.version} + 1`, updatedAt: now() })
    .where(and(eq(gardenBeds.id, id), eq(gardenBeds.userId, userId), isNull(gardenBeds.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/garden-beds/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(gardenBeds)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${gardenBeds.version} + 1` })
    .where(and(eq(gardenBeds.id, id), eq(gardenBeds.userId, userId), isNull(gardenBeds.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
