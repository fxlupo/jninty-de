import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { taskRules } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type TaskRuleBody = Omit<
  typeof taskRules.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type TaskRulePatch = Partial<TaskRuleBody>;

/** GET /api/task-rules?builtIn=1 */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const builtIn = c.req.query("builtIn");
  let rows = await db
    .select()
    .from(taskRules)
    .where(and(eq(taskRules.userId, userId), isNull(taskRules.deletedAt)));
  if (builtIn === "1") rows = rows.filter((r) => r.isBuiltIn);
  else if (builtIn === "0") rows = rows.filter((r) => !r.isBuiltIn);
  return c.json(rows);
});

/** GET /api/task-rules/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(taskRules)
    .where(and(eq(taskRules.id, id), eq(taskRules.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/task-rules */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<TaskRuleBody>();
  const result = await db
    .insert(taskRules)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PUT /api/task-rules/:id — upsert built-in rule */
router.put("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<TaskRuleBody>();
  const timestamp = now();

  const existing = await db
    .select()
    .from(taskRules)
    .where(and(eq(taskRules.id, id), eq(taskRules.userId, userId)));

  if (existing[0]) {
    const result = await db
      .update(taskRules)
      .set({ ...body, version: sql`${taskRules.version} + 1`, updatedAt: timestamp })
      .where(eq(taskRules.id, id))
      .returning();
    return c.json(result[0] ?? existing[0]);
  }

  const result = await db
    .insert(taskRules)
    .values({ ...body, id, userId, version: 1, createdAt: timestamp, updatedAt: timestamp })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Upsert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/task-rules/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<TaskRulePatch>();
  const result = await db
    .update(taskRules)
    .set({ ...body, version: sql`${taskRules.version} + 1`, updatedAt: now() })
    .where(and(eq(taskRules.id, id), eq(taskRules.userId, userId), isNull(taskRules.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/task-rules/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(taskRules)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${taskRules.version} + 1` })
    .where(and(eq(taskRules.id, id), eq(taskRules.userId, userId), isNull(taskRules.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
