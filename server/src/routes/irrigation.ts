import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { and, desc, eq, getTableColumns, gte, inArray, isNull, max, sql } from "drizzle-orm";
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

// K1: known command strings the frontend may send and the ESP understands
const VALID_COMMANDS = ["open", "close", "close_all"] as const;
type IrrigationCommand = (typeof VALID_COMMANDS)[number];

// K1: known event actions the ESP firmware may report
const VALID_ACTIONS = ["open", "close", "close_all", "skip", "system", "error"] as const;

// Query limits — named so magic numbers don't spread through the codebase
const LIMIT_DASHBOARD_EVENTS  = 40;   // recent events shown on the dashboard
const LIMIT_DEVICE_EVENTS      = 12;   // events returned to the ESP per poll
const LIMIT_HISTORY_SENSORS    = 800;  // sensor rows for history graphs (≈ 1 per 10 min over 90 days)
const COMMAND_FRESH_WINDOW_MS  = 2 * 60 * 1000; // commands older than 2 min are considered stale

function now(): string {
  return new Date().toISOString();
}

function intParam(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// #3: validate format with regex instead of relying on string length
function normalizeDeviceStartTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value))    return `${value}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value;
  return "00:00:00"; // fallback for unexpected formats
}

// #6: use ISO-8601 consistently — was using SQLite space-separator format which
// sorts differently from the ISO strings stored by now() (space < T in ASCII)
function cutoffDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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

  await db
    .insert(irrigationZones)
    .values(defaults)
    .onConflictDoNothing({
      target: [irrigationZones.userId, irrigationZones.valveNumber],
    });

  return db
    .select()
    .from(irrigationZones)
    .where(and(eq(irrigationZones.userId, userId), isNull(irrigationZones.deletedAt)));
}

async function latestSensors(userId: string) {
  // M3: resolve the latest reading per channel in the DB via a GROUP BY subquery
  // instead of fetching 80 rows and deduplicating in application code.
  const subq = db
    .select({
      channel: irrigationSensorReadings.channel,
      maxCreatedAt: max(irrigationSensorReadings.createdAt).as("max_created_at"),
    })
    .from(irrigationSensorReadings)
    .where(eq(irrigationSensorReadings.userId, userId))
    .groupBy(irrigationSensorReadings.channel)
    .as("latest_per_channel");

  return db
    .select(getTableColumns(irrigationSensorReadings))
    .from(irrigationSensorReadings)
    .innerJoin(
      subq,
      and(
        eq(irrigationSensorReadings.channel, subq.channel),
        eq(irrigationSensorReadings.createdAt, subq.maxCreatedAt),
      ),
    )
    .where(eq(irrigationSensorReadings.userId, userId));
}

async function irrigationDashboard(userId: string) {
  // M4: all five queries are independent — run them in parallel
  const [zones, schedules, sensors, events, commands, statusRows] = await Promise.all([
    ensureDefaultZones(userId),
    db
      .select()
      .from(irrigationSchedules)
      .where(and(eq(irrigationSchedules.userId, userId), isNull(irrigationSchedules.deletedAt))),
    latestSensors(userId),
    db
      .select()
      .from(irrigationEvents)
      .where(eq(irrigationEvents.userId, userId))
      .orderBy(desc(irrigationEvents.createdAt))
      .limit(LIMIT_DASHBOARD_EVENTS),
    db
      .select()
      .from(irrigationCommands)
      .where(and(
        eq(irrigationCommands.userId, userId),
        inArray(irrigationCommands.status, ["pending", "acked"]),
      ))
      .orderBy(desc(irrigationCommands.createdAt)),
    db
      .select()
      .from(irrigationStatus)
      .where(eq(irrigationStatus.userId, userId)),
  ]);

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
    // K4: timing-safe comparison prevents token length/content leaks via timing side-channel
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);
    const tokenValid =
      tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf);
    if (!tokenValid) {
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
  const body = await c.req.json<Record<string, unknown>>();

  // Explicitly whitelist the fields the UI is allowed to change.
  // This prevents a client from overwriting id, userId, valveNumber (hardware-
  // bound), createdAt, deletedAt, or version through a crafted request body.
  const patch: {
    name?: string;
    wh52Channel?: number;
    active?: boolean;
    moistureThreshold?: number;
    tempMinimum?: number;
    rainThreshold6h?: number;
    maxDurationMin?: number;
    sortOrder?: number;
  } = {};
  if (typeof body["name"] === "string")              patch.name              = body["name"];
  if (typeof body["wh52Channel"] === "number")       patch.wh52Channel       = body["wh52Channel"];
  if (typeof body["active"] === "boolean")           patch.active            = body["active"];
  if (typeof body["moistureThreshold"] === "number") patch.moistureThreshold = body["moistureThreshold"];
  if (typeof body["tempMinimum"] === "number")       patch.tempMinimum       = body["tempMinimum"];
  if (typeof body["rainThreshold6h"] === "number")   patch.rainThreshold6h   = body["rainThreshold6h"];
  if (typeof body["maxDurationMin"] === "number")    patch.maxDurationMin    = body["maxDurationMin"];
  if (typeof body["sortOrder"] === "number")         patch.sortOrder         = body["sortOrder"];

  const result = await db
    .update(irrigationZones)
    .set({ ...patch, version: sql`${irrigationZones.version} + 1`, updatedAt: now() })
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
  // K3: verify the target zone belongs to the requesting user before inserting
  const zone = await db
    .select({ id: irrigationZones.id })
    .from(irrigationZones)
    .where(and(eq(irrigationZones.id, body.zoneId), eq(irrigationZones.userId, userId), isNull(irrigationZones.deletedAt)))
    .limit(1);
  if (!zone[0]) return c.json({ error: "Zone not found" }, 404);

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
  // K2: only accept mutable schedule fields — never zoneId, userId, or timestamps
  const body = await c.req.json<Record<string, unknown>>();
  const patch: {
    program?: string;
    active?: boolean;
    weekdays?: number;
    startTime?: string;
    durationMin?: number;
  } = {};
  if (typeof body["program"]     === "string")  patch.program     = body["program"];
  if (typeof body["active"]      === "boolean") patch.active      = body["active"];
  if (typeof body["weekdays"]    === "number")  patch.weekdays    = body["weekdays"];
  if (typeof body["startTime"]   === "string")  patch.startTime   = body["startTime"];
  if (typeof body["durationMin"] === "number")  patch.durationMin = body["durationMin"];

  const result = await db
    .update(irrigationSchedules)
    .set({ ...patch, version: sql`${irrigationSchedules.version} + 1`, updatedAt: now() })
    .where(and(eq(irrigationSchedules.id, id), eq(irrigationSchedules.userId, userId), isNull(irrigationSchedules.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

router.delete("/schedules/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  // #1: single now() call so deletedAt and updatedAt share the same timestamp
  const ts = now();
  const result = await db
    .update(irrigationSchedules)
    .set({ deletedAt: ts, updatedAt: ts, version: sql`${irrigationSchedules.version} + 1` })
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
  const since = cutoffDate(days);

  const sensors = await db
    .select()
    .from(irrigationSensorReadings)
    .where(and(eq(irrigationSensorReadings.userId, userId), gte(irrigationSensorReadings.createdAt, since)))
    .orderBy(desc(irrigationSensorReadings.createdAt))
    .limit(LIMIT_HISTORY_SENSORS);

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

  // K1: reject unknown command strings before they reach the database
  if (!(VALID_COMMANDS as readonly string[]).includes(body.command)) {
    return c.json({ error: `Unknown command. Valid: ${VALID_COMMANDS.join(", ")}` }, 400);
  }
  const command = body.command as IrrigationCommand;

  // K3: if a zoneId is supplied, verify it belongs to the requesting user
  if (body.zoneId) {
    const zone = await db
      .select({ id: irrigationZones.id })
      .from(irrigationZones)
      .where(and(eq(irrigationZones.id, body.zoneId), eq(irrigationZones.userId, userId), isNull(irrigationZones.deletedAt)))
      .limit(1);
    if (!zone[0]) return c.json({ error: "Zone not found" }, 404);
  }

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
      command,
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
  // M2: freshAfter filter belongs in the DB query, not in app code.
  // Fetch at most 1 pending command that was created within the last 2 minutes
  // so stale commands (e.g. from a previous ESP downtime) are never delivered.
  const freshAfter = new Date(Date.now() - COMMAND_FRESH_WINDOW_MS).toISOString();
  const rows = await db
    .select()
    .from(irrigationCommands)
    .where(and(
      eq(irrigationCommands.userId, userId),
      eq(irrigationCommands.status, "pending"),
      gte(irrigationCommands.createdAt, freshAfter),
    ))
    .orderBy(desc(irrigationCommands.createdAt))
    .limit(1);
  return c.json(rows);
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
    // K5: always use the server's receive time — the ESP RTC has no NTP sync and
    //     can drift significantly; the ESP timestamp is preserved in raw.
    createdAt: now(),
    zoneId: typeof event["zoneId"] === "string" ? event["zoneId"] : null,
    zoneNumber: typeof event["zoneNumber"] === "number" ? event["zoneNumber"] : null,
    // K1: only store known action strings; unknown values fall back to "system"
    action:
      typeof event["action"] === "string" && (VALID_ACTIONS as readonly string[]).includes(event["action"])
        ? event["action"]
        : "system",
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
  const limit = Math.min(200, Math.max(1, intParam(c.req.query("limit"), LIMIT_DEVICE_EVENTS)));
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
    // K5: always use the server's receive time (ESP RTC has no NTP sync)
    createdAt: now(),
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
