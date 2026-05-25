import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { calendarEvents } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

function now(): string {
  return new Date().toISOString();
}

type CalendarEvent = typeof calendarEvents.$inferSelect;

const RECURRENCE_INTERVALS: Record<string, number> = {
  yearly: 1,
  every_2y: 2,
  every_3y: 3,
  every_4y: 4,
};

function expandRecurrence(
  events: CalendarEvent[],
  from: string,
  to: string,
): Array<CalendarEvent> {
  const fromYear = parseInt(from.slice(0, 4), 10);
  const toYear = parseInt(to.slice(0, 4), 10);
  const result: Array<CalendarEvent> = [];

  for (const event of events) {
    if (event.recurrence === "once") {
      if (event.date >= from && event.date <= to) result.push(event);
      continue;
    }

    const interval = RECURRENCE_INTERVALS[event.recurrence];
    if (!interval) continue;

    const parts = event.date.split("-").map(Number);
    const baseYear = parts[0] ?? 0;
    const mm = parts[1] ?? 1;
    const dd = parts[2] ?? 1;

    for (let year = fromYear; year <= toYear; year++) {
      if (year < baseYear) continue;
      if ((year - baseYear) % interval !== 0) continue;
      const date = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      if (date >= from && date <= to) {
        result.push({ ...event, date });
      }
    }
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

type EventBody = {
  title: string;
  notes?: string | null;
  date: string;
  type?: string;
  recurrence?: string;
  relatedPlantId?: string | null;
  relatedBedId?: string | null;
};

/** GET /api/calendar-events?from=YYYY-MM-DD&to=YYYY-MM-DD */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";

  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, userId), isNull(calendarEvents.deletedAt)));

  if (!from || !to) return c.json(rows);
  return c.json(expandRecurrence(rows, from, to));
});

/** GET /api/calendar-events/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/calendar-events */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<EventBody>();
  const ts = now();
  const result = await db
    .insert(calendarEvents)
    .values({
      ...body,
      id: crypto.randomUUID(),
      userId,
      version: 1,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/calendar-events/:id */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<Partial<EventBody>>();
  const result = await db
    .update(calendarEvents)
    .set({ ...body, version: sql`${calendarEvents.version} + 1`, updatedAt: now() })
    .where(
      and(
        eq(calendarEvents.id, id),
        eq(calendarEvents.userId, userId),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/calendar-events/:id */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const ts = now();
  const result = await db
    .update(calendarEvents)
    .set({
      deletedAt: ts,
      updatedAt: ts,
      version: sql`${calendarEvents.version} + 1`,
    })
    .where(
      and(
        eq(calendarEvents.id, id),
        eq(calendarEvents.userId, userId),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
