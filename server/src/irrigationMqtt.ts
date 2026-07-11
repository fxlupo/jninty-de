import mqtt from "mqtt";
import {
  ingestIrrigationEvents,
  ingestIrrigationSensors,
  ingestIrrigationStatus,
} from "./routes/irrigation.ts";

type JsonObject = Record<string, unknown>;
type JsonPayload = JsonObject | JsonObject[];

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

  const baseTopic = `${prefix}/${deviceId}`;
  const client = mqtt.connect(url, {
    username,
    password,
    clientId: `jninty-irrigation-${deviceId}`,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 10000,
  });

  client.on("connect", () => {
    client.subscribe([`${baseTopic}/status`, `${baseTopic}/events`, `${baseTopic}/sensors`], { qos: 0 }, (error) => {
      if (error) console.error("Fehler beim MQTT Subscribe für Bewässerung:", error);
      else console.log(`✓ Bewässerung MQTT verbunden: ${baseTopic}`);
    });
  });

  client.on("message", (topic, payload) => {
    const parsed = parseJsonPayload(payload);
    if (!parsed) return;

    void (async () => {
      if (topic === `${baseTopic}/status` && !Array.isArray(parsed)) {
        await ingestIrrigationStatus(userId, parsed);
      } else if (topic === `${baseTopic}/events`) {
        await ingestIrrigationEvents(userId, parsed);
      } else if (topic === `${baseTopic}/sensors`) {
        await ingestIrrigationSensors(userId, parsed);
      }
    })().catch((error) => {
      console.error("Fehler beim Verarbeiten einer Bewässerung-MQTT-Nachricht:", error);
    });
  });

  client.on("error", (error) => {
    console.error("Bewässerung MQTT Fehler:", error.message);
  });
}
