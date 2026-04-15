import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { settings } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type SettingsPatch = Partial<
  Omit<typeof settings.$inferInsert, "userId" | "updatedAt">
>;

/** GET /api/settings — returns current user's settings, creating defaults if absent */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db.select().from(settings).where(eq(settings.userId, userId));
  if (rows[0]) return c.json(rows[0]);

  // Create default settings for new user
  const result = await db
    .insert(settings)
    .values({ userId, updatedAt: now() })
    .returning();
  return c.json(result[0] ?? { userId, updatedAt: now() });
});

/** PUT /api/settings — upsert settings */
router.put("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<SettingsPatch>();

  const existing = await db.select().from(settings).where(eq(settings.userId, userId));
  if (existing[0]) {
    const result = await db
      .update(settings)
      .set({ ...body, updatedAt: now() })
      .where(eq(settings.userId, userId))
      .returning();
    return c.json(result[0] ?? existing[0]);
  }

  const result = await db
    .insert(settings)
    .values({ ...body, userId, updatedAt: now() })
    .returning();
  return c.json(result[0] ?? { userId, updatedAt: now() });
});

export default router;
