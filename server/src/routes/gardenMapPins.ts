import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { gardenMapPins } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type PinBody = Omit<
  typeof gardenMapPins.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type PinPatch = Partial<PinBody>;

/** GET /api/garden-map-pins */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(gardenMapPins)
    .where(and(eq(gardenMapPins.userId, userId), isNull(gardenMapPins.deletedAt)));
  return c.json(rows);
});

/** GET /api/garden-map-pins/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(gardenMapPins)
    .where(and(eq(gardenMapPins.id, id), eq(gardenMapPins.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/garden-map-pins */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<PinBody>();
  const result = await db
    .insert(gardenMapPins)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/garden-map-pins/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<PinPatch>();
  const result = await db
    .update(gardenMapPins)
    .set({ ...body, version: sql`${gardenMapPins.version} + 1`, updatedAt: now() })
    .where(and(eq(gardenMapPins.id, id), eq(gardenMapPins.userId, userId), isNull(gardenMapPins.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/garden-map-pins/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(gardenMapPins)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${gardenMapPins.version} + 1` })
    .where(and(eq(gardenMapPins.id, id), eq(gardenMapPins.userId, userId), isNull(gardenMapPins.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
