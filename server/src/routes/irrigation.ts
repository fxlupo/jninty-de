import { Hono } from "hono";
import type { Context, Next } from "hono";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  irrigationCommands,
  irrigationEvents,
  irrigationSchedules,
  irrigationSensorReadings,
  irrigationStatus,
  irrigationZones,
} from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

type DeviceVariables = AppVariables & { irrigationUserId: string };
const deviceRouter = new Hono<{ Variables: DeviceVariables }>();

function now(): string {
  return new Date().toISOString();
}

function intParam(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDeviceStartTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function cutoffDateSql(days: number): string {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 19).replace("T", " ");
}

async function ensureDefaultZones(userId: string) {
  const rows = await db
    .select()
    .from(irrigationZones)
    .where(and(eq(irrigationZones.userId, userId), isNull(irrigationZones.deletedAt)));

  if (rows.length > 0) return rows;

  const ts = now();
  const defaults = [1, 2, 3, 4].map((valveNumber) => ({
    id: crypto.randomUUID(),
    userId,
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    valveNumber,
    name: `Zone ${valveNumber}`,
    wh52Channel: valveNumber,
    sortOrder: valveNumber,
  }));

  return db.insert(irrigationZones).values(defaults).returning();
}

async function latestSensors(userId: string) {
  const rows = await db
    .select()
    .from(irrigationSensorReadings)
    .where(eq(irrigationSensorReadings.userId, userId))
    .orderBy(desc(irrigationSensorReadings.createdAt))
    .limit(80);

  const seen = new Set<number>();
  const latest = [];
  for (const row of rows) {
    if (seen.has(row.channel)) continue;
    seen.add(row.channel);
    latest.push(row);
  }
  return latest;
}

async function irrigationDashboard(userId: string) {
  const zones = await ensureDefaultZones(userId);
  const schedules = await db
    .select()
    .from(irrigationSchedules)
    .where(and(eq(irrigationSchedules.userId, userId), isNull(irrigationSchedules.deletedAt)));
  const sensors = await latestSensors(userId);
  const events = await db
    .select()
    .from(irrigationEvents)
    .where(eq(irrigationEvents.userId, userId))
    .orderBy(desc(irrigationEvents.createdAt))
    .limit(40);
  const commands = await db
    .select()
    .from(irrigationCommands)
    .where(
      and(
        eq(irrigationCommands.userId, userId),
        inArray(irrigationCommands.status, ["pending", "acked"]),
      ),
    )
    .orderBy(desc(irrigationCommands.createdAt));
  const statusRows = await db
    .select()
    .from(irrigationStatus)
    .where(eq(irrigationStatus.userId, userId));

  return {
    zones,
    schedules,
    sensors,
    events,
    commands,
    status: statusRows[0] ?? null,
  };
}

function requireDeviceToken() {
  return async (c: Context<{ Variables: DeviceVariables }>, next: Next) => {
    const expected = process.env["IRRIGATION_DEVICE_TOKEN"];
    const irrigationUserId = process.env["IRRIGATION_DEVICE_USER_ID"];
    if (!expected || !irrigationUserId) {
      return c.json({ error: "Irrigation device auth is not configured." }, 503);
    }

    const header = c.req.header("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
    if (token !== expected) {
      return c.json({ error: "Unauthorized." }, 401);
    }

    c.set("irrigationUserId", irrigationUserId);
    await next();
  };
}

// ─── Web routes, protected by better-auth ────────────────────────────────────

router.get("/dashboard", requireAuth, async (c) => {
  return c.json(await irrigationDashboard(c.get("userId")));
});

router.get("/zones", requireAuth, async (c) => {
  return c.json(await ensureDefaultZones(c.get("userId")));
});

router.patch("/zones/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<Partial<typeof irrigationZones.$inferInsert>>();
  const result = await db
    .update(irrigationZones)
    .set({ ...body, userId, version: sql`${irrigationZones.version} + 1`, updatedAt: now() })
    .where(and(eq(irrigationZones.id, id), eq(irrigationZones.userId, userId), isNull(irrigationZones.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

router.get("/schedules", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(irrigationSchedules)
    .where(and(eq(irrigationSchedules.userId, userId), isNull(irrigationSchedules.deletedAt)));
  return c.json(rows);
});

router.post("/schedules", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<
    Pick<typeof irrigationSchedules.$inferInsert, "zoneId" | "program" | "active" | "weekdays" | "startTime" | "durationMin">
  >();
  const ts = now();
  const result = await db
    .insert(irrigationSchedules)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: ts, updatedAt: ts })
    .returning();
  return c.json(result[0], 201);
});

router.patch("/schedules/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<Partial<typeof irrigationSchedules.$inferInsert>>();
  const result = await db
    .update(irrigationSchedules)
    .set({ ...body, userId, version: sql`${irrigationSchedules.version} + 1`, updatedAt: now() })
    .where(and(eq(irrigationSchedules.id, id), eq(irrigationSchedules.userId, userId), isNull(irrigationSchedules.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

router.delete("/schedules/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(irrigationSchedules)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${irrigationSchedules.version} + 1` })
    .where(and(eq(irrigationSchedules.id, id), eq(irrigationSchedules.userId, userId), isNull(irrigationSchedules.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

router.get("/events", requireAuth, async (c) => {
  const userId = c.get("userId");
  const limit = Math.min(200, Math.max(1, intParam(c.req.query("limit"), 50)));
  const rows = await db
    .select()
    .from(irrigationEvents)
    .where(eq(irrigationEvents.userId, userId))
    .orderBy(desc(irrigationEvents.createdAt))
    .limit(limit);
  return c.json(rows);
});

router.get("/history", requireAuth, async (c) => {
  const userId = c.get("userId");
  const days = Math.min(365, Math.max(1, intParam(c.req.query("days"), 30)));
  const since = cutoffDateSql(days);

  const sensors = await db
    .select()
    .from(irrigationSensorReadings)
    .where(and(eq(irrigationSensorReadings.userId, userId), gte(irrigationSensorReadings.createdAt, since)))
    .orderBy(desc(irrigationSensorReadings.createdAt))
    .limit(800);

  return c.json({ days, sensors });
});

router.post("/commands", requireAuth, async (c) => {
  const userId = c.get("userId");
  const session = c.get("session");
  const body = await c.req.json<{
    zoneId?: string | null;
    zoneNumber?: number | null;
    command: string;
    durationMin?: number | null;
  }>();
  const ts = now();
  const requestedBy = session?.user?.email ?? session?.user?.id ?? userId;
  const result = await db
    .insert(irrigationCommands)
    .values({
      id: crypto.randomUUID(),
      userId,
      createdAt: ts,
      updatedAt: ts,
      requestedAt: ts,
      requestedBy,
      status: "pending",
      zoneId: body.zoneId ?? null,
      zoneNumber: body.zoneNumber ?? null,
      command: body.command,
      durationMin: body.durationMin ?? null,
    })
    .returning();
  return c.json(result[0], 201);
});

// ─── ESP/device routes, protected by bearer token ────────────────────────────

deviceRouter.use("*", requireDeviceToken());

deviceRouter.get("/config", async (c) => {
  const userId = c.get("irrigationUserId");
  const zones = await ensureDefaultZones(userId);
  const schedules = await db
    .select()
    .from(irrigationSchedules)
    .where(and(eq(irrigationSchedules.userId, userId), isNull(irrigationSchedules.deletedAt)));
  const valveNumberByZoneId = new Map(zones.map((zone) => [zone.id, zone.valveNumber]));
  const deviceSchedules = schedules.map((schedule) => ({
    ...schedule,
    zoneNumber: valveNumberByZoneId.get(schedule.zoneId) ?? 0,
    startTime: normalizeDeviceStartTime(schedule.startTime),
  }));
  return c.json({ zones, schedules: deviceSchedules });
});

deviceRouter.get("/commands", async (c) => {
  const userId = c.get("irrigationUserId");
  const freshAfter = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const rows = await db
    .select()
    .from(irrigationCommands)
    .where(and(eq(irrigationCommands.userId, userId), eq(irrigationCommands.status, "pending")))
    .orderBy(desc(irrigationCommands.createdAt))
    .limit(10);
  return c.json(rows.filter((row) => row.createdAt >= freshAfter).slice(0, 1));
});

deviceRouter.post("/status", async (c) => {
  const userId = c.get("irrigationUserId");
  const body = await c.req.json<Record<string, unknown>>();
  const ts = now();
  const row = {
    userId,
    updatedAt: ts,
    lastSeen: ts,
    wifiRssi: typeof body["wifiRssi"] === "number" ? body["wifiRssi"] : null,
    ecowittOk: typeof body["ecowittOk"] === "boolean" ? body["ecowittOk"] : null,
    valveStates: typeof body["valveStates"] === "string" ? body["valveStates"] : "0000",
    firmwareVersion: typeof body["firmwareVersion"] === "string" ? body["firmwareVersion"] : null,
    ipAddress: typeof body["ipAddress"] === "string" ? body["ipAddress"] : null,
    uptimeSec: typeof body["uptimeSec"] === "number" ? body["uptimeSec"] : null,
    raw: body,
  };

  await db
    .insert(irrigationStatus)
    .values(row)
    .onConflictDoUpdate({ target: irrigationStatus.userId, set: row });
  return c.json({ ok: true });
});

deviceRouter.post("/events", async (c) => {
  const userId = c.get("irrigationUserId");
  const body = await c.req.json<Record<string, unknown> | Record<string, unknown>[]>();
  const events = Array.isArray(body) ? body : [body];
  const rows = events.map((event) => ({
    id: crypto.randomUUID(),
    userId,
    createdAt: typeof event["createdAt"] === "string" ? event["createdAt"] : now(),
    zoneId: typeof event["zoneId"] === "string" ? event["zoneId"] : null,
    zoneNumber: typeof event["zoneNumber"] === "number" ? event["zoneNumber"] : null,
    action: typeof event["action"] === "string" ? event["action"] : "system",
    reason: typeof event["reason"] === "string" ? event["reason"] : null,
    detail: typeof event["detail"] === "string" ? event["detail"] : null,
    durationSec: typeof event["durationSec"] === "number" ? event["durationSec"] : null,
    raw: event,
  }));
  const result = await db.insert(irrigationEvents).values(rows).returning();
  return c.json(result, 201);
});

deviceRouter.get("/events", async (c) => {
  const userId = c.get("irrigationUserId");
  const limit = Math.min(200, Math.max(1, intParam(c.req.query("limit"), 12)));
  const rows = await db
    .select()
    .from(irrigationEvents)
    .where(eq(irrigationEvents.userId, userId))
    .orderBy(desc(irrigationEvents.createdAt))
    .limit(limit);
  return c.json(rows);
});

deviceRouter.post("/sensors", async (c) => {
  const userId = c.get("irrigationUserId");
  const body = await c.req.json<Record<string, unknown> | Record<string, unknown>[]>();
  const readings = Array.isArray(body) ? body : [body];
  const rows = readings.map((reading) => ({
    id: crypto.randomUUID(),
    userId,
    createdAt: typeof reading["createdAt"] === "string" ? reading["createdAt"] : now(),
    channel: typeof reading["channel"] === "number" ? reading["channel"] : 0,
    soilMoisture: typeof reading["soilMoisture"] === "number" ? reading["soilMoisture"] : null,
    soilTemp: typeof reading["soilTemp"] === "number" ? reading["soilTemp"] : null,
    soilEc: typeof reading["soilEc"] === "number" ? reading["soilEc"] : null,
    batteryOk: typeof reading["batteryOk"] === "boolean" ? reading["batteryOk"] : null,
    raw: reading,
  }));
  const result = await db.insert(irrigationSensorReadings).values(rows).returning();
  return c.json(result, 201);
});

deviceRouter.post("/commands/:id/ack", async (c) => {
  const userId = c.get("irrigationUserId");
  const id = c.req.param("id") ?? "";
  const ts = now();
  const result = await db
    .update(irrigationCommands)
    .set({ status: "acked", ackedAt: ts, updatedAt: ts })
    .where(and(eq(irrigationCommands.id, id), eq(irrigationCommands.userId, userId)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json(result[0]);
});

deviceRouter.post("/commands/:id/done", async (c) => {
  const userId = c.get("irrigationUserId");
  const id = c.req.param("id") ?? "";
  const body: { ok?: boolean; result?: string } = await c.req
    .json<{ ok?: boolean; result?: string }>()
    .catch(() => ({}));
  const ts = now();
  const result = await db
    .update(irrigationCommands)
    .set({
      status: body.ok === false ? "failed" : "done",
      completedAt: ts,
      updatedAt: ts,
      result: body.result ?? null,
    })
    .where(and(eq(irrigationCommands.id, id), eq(irrigationCommands.userId, userId)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json(result[0]);
});

router.route("/device", deviceRouter);

export default router;
