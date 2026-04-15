import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { seeds } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type SeedBody = Omit<
  typeof seeds.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type SeedPatch = Partial<SeedBody>;

/** GET /api/seeds?species= */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const species = c.req.query("species");
  let rows = await db
    .select()
    .from(seeds)
    .where(and(eq(seeds.userId, userId), isNull(seeds.deletedAt)));
  if (species) rows = rows.filter((r) => r.species === species);
  return c.json(rows);
});

/** GET /api/seeds/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(seeds)
    .where(and(eq(seeds.id, id), eq(seeds.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/seeds */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<SeedBody>();
  const result = await db
    .insert(seeds)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/seeds/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<SeedPatch>();
  const result = await db
    .update(seeds)
    .set({ ...body, version: sql`${seeds.version} + 1`, updatedAt: now() })
    .where(and(eq(seeds.id, id), eq(seeds.userId, userId), isNull(seeds.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/seeds/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(seeds)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${seeds.version} + 1` })
    .where(and(eq(seeds.id, id), eq(seeds.userId, userId), isNull(seeds.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
