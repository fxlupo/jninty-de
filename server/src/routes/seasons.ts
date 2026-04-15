import { Hono } from "hono";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { seasons } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type SeasonBody = Omit<
  typeof seasons.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type SeasonPatch = Partial<SeasonBody>;

/** GET /api/seasons */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.userId, userId), isNull(seasons.deletedAt)));
  return c.json(rows);
});

/** GET /api/seasons/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.id, id), eq(seasons.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/seasons */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<SeasonBody>();
  // If creating as active, deactivate all others first
  if (body.isActive) {
    await db
      .update(seasons)
      .set({ isActive: false, updatedAt: now() })
      .where(and(eq(seasons.userId, userId), isNull(seasons.deletedAt)));
  }
  const result = await db
    .insert(seasons)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/seasons/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<SeasonPatch>();
  // If activating, deactivate all others first
  if (body.isActive === true) {
    await db
      .update(seasons)
      .set({ isActive: false, updatedAt: now() })
      .where(and(eq(seasons.userId, userId), ne(seasons.id, id), isNull(seasons.deletedAt)));
  }
  const result = await db
    .update(seasons)
    .set({ ...body, version: sql`${seasons.version} + 1`, updatedAt: now() })
    .where(and(eq(seasons.id, id), eq(seasons.userId, userId), isNull(seasons.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/seasons/:id/activate */
router.post("/:id/activate", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  // Deactivate all others
  await db
    .update(seasons)
    .set({ isActive: false, updatedAt: now() })
    .where(and(eq(seasons.userId, userId), ne(seasons.id, id), isNull(seasons.deletedAt)));
  // Activate this one
  const result = await db
    .update(seasons)
    .set({ isActive: true, version: sql`${seasons.version} + 1`, updatedAt: now() })
    .where(and(eq(seasons.id, id), eq(seasons.userId, userId), isNull(seasons.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/seasons/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(seasons)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${seasons.version} + 1` })
    .where(and(eq(seasons.id, id), eq(seasons.userId, userId), isNull(seasons.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
