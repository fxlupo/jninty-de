import mqtt from "mqtt";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "./db/client.ts";
import { irrigationCommands } from "./db/schema.ts";
import {
  ingestIrrigationEvents,
  ingestIrrigationSensors,
  ingestIrrigationStatus,
  irrigationDeviceConfig,
} from "./routes/irrigation.ts";

type JsonObject = Record<string, unknown>;
type JsonPayload = JsonObject | JsonObject[];

const COMMAND_FRESH_WINDOW_MS = 2 * 60 * 1000;
const COMMAND_PUBLISH_INTERVAL_MS = 2000;
const COMMAND_REPUBLISH_MS = 10000;
const CONFIG_PUBLISH_INTERVAL_MS = 30000;

function envBool(name: string): boolean {
  return (process.env[name] ?? "").toLowerCase() === "true";
}

function parseJsonPayload(payload: Buffer): JsonPayload | null {
  try {
    const parsed: unknown = JSON.parse(payload.toString("utf-8"));
    if (Array.isArray(parsed) && parsed.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
      return parsed as JsonObject[];
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
  } catch (error) {
    console.warn("MQTT irrigation payload is not valid JSON:", error);
  }
  return null;
}

export function startIrrigationMqtt() {
  if (!envBool("IRRIGATION_MQTT_ENABLED")) {
    console.log("✓ Bewässerung MQTT deaktiviert");
    return;
  }

  const userId = process.env["IRRIGATION_DEVICE_USER_ID"];
  const url = process.env["IRRIGATION_MQTT_URL"];
  const username = process.env["IRRIGATION_MQTT_USERNAME"];
  const password = process.env["IRRIGATION_MQTT_PASSWORD"];
  const deviceId = process.env["IRRIGATION_MQTT_DEVICE_ID"] ?? "esp32-01";
  const prefix = process.env["IRRIGATION_MQTT_TOPIC_PREFIX"] ?? "irrigation";

  if (!userId || !url || !username || !password) {
    console.warn("⚠ Bewässerung MQTT aktiv, aber Environment ist unvollständig");
    return;
  }

  const irrigationUserId = userId;
  const baseTopic = `${prefix}/${deviceId}`;
  const lastPublishedCommands = new Map<string, number>();
  let lastConfigPayload = "";
  const client = mqtt.connect(url, {
    username,
    password,
    clientId: `jninty-irrigation-${deviceId}`,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 10000,
  });

  client.on("connect", () => {
    client.subscribe([
      `${baseTopic}/status`,
      `${baseTopic}/events`,
      `${baseTopic}/sensors`,
      `${baseTopic}/commands/+/result`,
    ], { qos: 0 }, (error) => {
      if (error) console.error("Fehler beim MQTT Subscribe für Bewässerung:", error);
      else {
        console.log(`✓ Bewässerung MQTT verbunden: ${baseTopic}`);
        void publishConfig().catch((configError) => {
          console.error("Fehler beim Publizieren der Bewässerung-MQTT-Config:", configError);
        });
      }
    });
  });

  async function publishConfig(force = false) {
    if (!client.connected) return;
    const payload = JSON.stringify(await irrigationDeviceConfig(irrigationUserId));
    if (!force && payload === lastConfigPayload) return;
    client.publish(`${baseTopic}/config`, payload, { qos: 0, retain: true });
    lastConfigPayload = payload;
  }

  async function publishPendingCommands() {
    if (!client.connected) return;
    const freshAfter = new Date(Date.now() - COMMAND_FRESH_WINDOW_MS).toISOString();
    const rows = await db
      .select()
      .from(irrigationCommands)
      .where(and(
        eq(irrigationCommands.userId, irrigationUserId),
        eq(irrigationCommands.status, "pending"),
        gte(irrigationCommands.createdAt, freshAfter),
      ))
      .orderBy(desc(irrigationCommands.createdAt))
      .limit(5);

    const nowMs = Date.now();
    for (const command of rows) {
      const lastPublishedAt = lastPublishedCommands.get(command.id) ?? 0;
      if (nowMs - lastPublishedAt < COMMAND_REPUBLISH_MS) continue;
      const topic = `${baseTopic}/commands/${command.id}`;
      const payload = JSON.stringify({
        id: command.id,
        zoneId: command.zoneId,
        zoneNumber: command.zoneNumber,
        command: command.command,
        durationMin: command.durationMin,
        requestedAt: command.requestedAt,
      });
      client.publish(topic, payload, { qos: 0, retain: false });
      lastPublishedCommands.set(command.id, nowMs);
    }
  }

  async function handleCommandResult(commandId: string, result: JsonObject) {
    const ts = new Date().toISOString();
    const status = typeof result["status"] === "string" ? result["status"] : "";
    const ok = result["ok"] !== false;
    const resultText = typeof result["result"] === "string" ? result["result"] : null;

    if (status === "acked") {
      await db
        .update(irrigationCommands)
        .set({ status: "acked", ackedAt: ts, updatedAt: ts, result: resultText })
        .where(and(eq(irrigationCommands.id, commandId), eq(irrigationCommands.userId, irrigationUserId)));
      lastPublishedCommands.delete(commandId);
      return;
    }

    await db
      .update(irrigationCommands)
      .set({
        status: ok ? "done" : "failed",
        completedAt: ts,
        updatedAt: ts,
        result: resultText,
      })
      .where(and(eq(irrigationCommands.id, commandId), eq(irrigationCommands.userId, irrigationUserId)));
    lastPublishedCommands.delete(commandId);
  }

  const commandResultRe = new RegExp(`^${baseTopic}/commands/([^/]+)/result$`);

  client.on("message", (topic, payload) => {
    const parsed = parseJsonPayload(payload);
    if (!parsed) return;

    void (async () => {
      const commandResultMatch = topic.match(commandResultRe);
      if (commandResultMatch?.[1] && !Array.isArray(parsed)) {
        await handleCommandResult(commandResultMatch[1], parsed);
        return;
      }

      if (topic === `${baseTopic}/status` && !Array.isArray(parsed)) {
        await ingestIrrigationStatus(irrigationUserId, parsed);
      } else if (topic === `${baseTopic}/events`) {
        await ingestIrrigationEvents(irrigationUserId, parsed);
      } else if (topic === `${baseTopic}/sensors`) {
        await ingestIrrigationSensors(irrigationUserId, parsed);
      }
    })().catch((error) => {
      console.error("Fehler beim Verarbeiten einer Bewässerung-MQTT-Nachricht:", error);
    });
  });

  client.on("error", (error) => {
    console.error("Bewässerung MQTT Fehler:", error.message);
  });

  setInterval(() => {
    void publishPendingCommands().catch((error) => {
      console.error("Fehler beim Publizieren von Bewässerung-MQTT-Commands:", error);
    });
  }, COMMAND_PUBLISH_INTERVAL_MS);

  setInterval(() => {
    void publishConfig().catch((error) => {
      console.error("Fehler beim Publizieren der Bewässerung-MQTT-Config:", error);
    });
  }, CONFIG_PUBLISH_INTERVAL_MS);
}
