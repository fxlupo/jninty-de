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

/** Normalise legacy MM-DD frost dates that predate the YYYY-MM-DD requirement. */
function normalizeFrostDate(value: string, fallback: string): string {
  return /^\d{2}-\d{2}$/.test(value) ? `2026-${value}` : value || fallback;
}

/** GET /api/settings — returns current user's settings, creating defaults if absent */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db.select().from(settings).where(eq(settings.userId, userId));
  if (rows[0]) {
    const row = rows[0];
    const fixedLast = normalizeFrostDate(row.lastFrostDate, "2026-04-15");
    const fixedFirst = normalizeFrostDate(row.firstFrostDate, "2026-10-15");
    if (fixedLast !== row.lastFrostDate || fixedFirst !== row.firstFrostDate) {
      await db
        .update(settings)
        .set({ lastFrostDate: fixedLast, firstFrostDate: fixedFirst })
        .where(eq(settings.userId, userId));
      return c.json({ ...row, lastFrostDate: fixedLast, firstFrostDate: fixedFirst });
    }
    return c.json(row);
  }

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
