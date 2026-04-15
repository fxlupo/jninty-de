import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { userPlantKnowledge } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type KnowledgeBody = Omit<
  typeof userPlantKnowledge.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type KnowledgePatch = Partial<KnowledgeBody>;

/** GET /api/knowledge */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(userPlantKnowledge)
    .where(and(eq(userPlantKnowledge.userId, userId), isNull(userPlantKnowledge.deletedAt)));
  return c.json(rows);
});

/** GET /api/knowledge/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(userPlantKnowledge)
    .where(and(eq(userPlantKnowledge.id, id), eq(userPlantKnowledge.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/knowledge */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<KnowledgeBody>();
  const result = await db
    .insert(userPlantKnowledge)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/knowledge/:id
 * Query param ?replaceAll=1 clears optional data fields before merging (handled client-side,
 * server just stores the supplied values).
 */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<KnowledgePatch>();
  const result = await db
    .update(userPlantKnowledge)
    .set({ ...body, version: sql`${userPlantKnowledge.version} + 1`, updatedAt: now() })
    .where(and(eq(userPlantKnowledge.id, id), eq(userPlantKnowledge.userId, userId), isNull(userPlantKnowledge.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/knowledge/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(userPlantKnowledge)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${userPlantKnowledge.version} + 1` })
    .where(and(eq(userPlantKnowledge.id, id), eq(userPlantKnowledge.userId, userId), isNull(userPlantKnowledge.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
