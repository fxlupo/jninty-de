/**
 * POST /api/reset — hard-delete all user data across all entity tables.
 * Used by the "Replace" import mode and the demo data cleaner.
 * Photos on disk are NOT removed (they would be orphaned but that's acceptable).
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  plants,
  photos,
  journalEntries,
  tasks,
  expenses,
  seeds,
  seasons,
  gardenBeds,
  taskRules,
  plantings,
  plantingSchedules,
  scheduleTasks,
  userPlantKnowledge,
  settings,
} from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  // Delete in dependency order (children before parents)
  await db.delete(scheduleTasks).where(eq(scheduleTasks.userId, userId));
  await db.delete(plantingSchedules).where(eq(plantingSchedules.userId, userId));
  await db.delete(plantings).where(eq(plantings.userId, userId));
  await db.delete(journalEntries).where(eq(journalEntries.userId, userId));
  await db.delete(taskRules).where(eq(taskRules.userId, userId));
  await db.delete(tasks).where(eq(tasks.userId, userId));
  await db.delete(expenses).where(eq(expenses.userId, userId));
  await db.delete(seeds).where(eq(seeds.userId, userId));
  await db.delete(userPlantKnowledge).where(eq(userPlantKnowledge.userId, userId));
  await db.delete(photos).where(eq(photos.userId, userId));
  await db.delete(gardenBeds).where(eq(gardenBeds.userId, userId));
  await db.delete(plants).where(eq(plants.userId, userId));
  await db.delete(seasons).where(eq(seasons.userId, userId));
  await db.delete(settings).where(eq(settings.userId, userId));

  return c.json({ ok: true });
});

export default router;
