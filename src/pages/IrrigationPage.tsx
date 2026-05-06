import { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { apiUrl } from "../config/cloud";
import { getLegacyToken, hasLoggedInCookie } from "../lib/apiClient";

interface IrrigationZone {
  id: string;
  valveNumber: number;
  name: string;
  wh52Channel: number | null;
  active: boolean;
  moistureThreshold: number;
  tempMinimum: number;
  maxDurationMin: number;
}

interface IrrigationSensor {
  channel: number;
  moisture: number | null;
  temperature: number | null;
  batteryMv: number | null;
  receivedAt: string;
}

interface IrrigationEvent {
  id: string;
  eventType: string;
  message: string;
  createdAt: string;
}

interface IrrigationCommand {
  id: string;
  zoneNumber: number;
  command: string;
  durationMin: number | null;
  status: string;
  requestedAt: string;
}

interface IrrigationStatus {
  espOnline: boolean | null;
  wifiRssi: number | null;
  ecowittOk: boolean | null;
  valveStates: string | null;
  lastSeen: string | null;
}

interface IrrigationDashboard {
  zones: IrrigationZone[];
  sensors: IrrigationSensor[];
  events: IrrigationEvent[];
  commands: IrrigationCommand[];
  status: IrrigationStatus | null;
}

type CommandPayload =
  | { command: "open"; zoneId: string; zoneNumber: number; durationMin: number }
  | { command: "close"; zoneId: string; zoneNumber: number }
  | { command: "close_all"; zoneNumber: 0 };

const AUTO_REFRESH_MS = 10000;
const ONLINE_WINDOW_MS = 120000;

async function irrigationRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiUrl) {
    throw new Error("API URL ist nicht konfiguriert.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!hasLoggedInCookie()) {
    const legacyToken = getLegacyToken();
    if (legacyToken) {
      headers["Authorization"] = `Bearer ${legacyToken}`;
    }
  }

  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`API Fehler ${String(res.status)}`);
  }

  return res.json() as Promise<T>;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "offen";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "offen";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatValue(value: number | null | undefined, unit: string, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value.toFixed(digits)} ${unit}`;
}

function isStatusOnline(status: IrrigationStatus | null): boolean {
  if (!status?.lastSeen) return false;
  const lastSeen = new Date(status.lastSeen).getTime();
  if (Number.isNaN(lastSeen)) return false;
  return Date.now() - lastSeen < ONLINE_WINDOW_MS;
}

function parseValveStates(value: string | null | undefined): boolean[] {
  if (!value) return [false, false, false, false];
  const compact = value.trim();
  if (/^[01]{4}$/.test(compact)) {
    return compact.split("").map((state) => state === "1");
  }
  return [1, 2, 3, 4].map((valve) => {
    const match = compact.match(new RegExp(`V${String(valve)}\\s+(On|Off)`, "i"));
    return match?.[1]?.toLowerCase() === "on";
  });
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    open: "Öffnen",
    close: "Schließen",
    close_all: "Alle Stop",
    skip: "Skip",
    manual: "Manuell",
    scheduler: "Scheduler",
    sensor: "Sensor",
    system: "System",
  };
  return labels[type] ?? type;
}

export default function IrrigationPage() {
  const [dashboard, setDashboard] = useState<IrrigationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await irrigationRequest<IrrigationDashboard>("/irrigation/dashboard");
      setDashboard(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bewässerung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(() => {
      void loadDashboard();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const sensorsByChannel = useMemo(() => {
    const map = new Map<number, IrrigationSensor>();
    for (const sensor of dashboard?.sensors ?? []) {
      map.set(sensor.channel, sensor);
    }
    return map;
  }, [dashboard?.sensors]);

  const valveStates = useMemo(
    () => parseValveStates(dashboard?.status?.valveStates),
    [dashboard?.status?.valveStates],
  );
  const online = isStatusOnline(dashboard?.status ?? null);
  const pendingCount = dashboard?.commands.filter((command) => command.status === "pending").length ?? 0;

  const sendCommand = async (payload: CommandPayload) => {
    setPendingCommand(`${payload.command}-${String(payload.zoneNumber)}`);
    try {
      await irrigationRequest<IrrigationCommand>("/irrigation/commands", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Befehl konnte nicht gesendet werden.");
    } finally {
      setPendingCommand(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-heading">Bewässerung</h1>
          <p className="text-sm text-text-secondary">
            ESP-Steuerung, Sensorwerte und manuelle Ventilbefehle.
          </p>
        </div>
        <Button
          variant="danger"
          onClick={() => void sendCommand({ command: "close_all", zoneNumber: 0 })}
          disabled={pendingCommand != null}
        >
          Alle stoppen
        </Button>
      </div>

      {error && (
        <Card className="border-status-danger-text bg-status-danger-bg text-status-danger-text">
          {error}
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="space-y-2">
          <div className="text-sm font-semibold text-text-heading">ESP</div>
          <Badge variant={online ? "success" : "danger"}>{online ? "online" : "offline"}</Badge>
          <div className="text-xs text-text-secondary">
            zuletzt {formatDateTime(dashboard?.status?.lastSeen)}
          </div>
          {dashboard?.status?.wifiRssi != null && (
            <div className="text-xs text-text-secondary">RSSI {dashboard.status.wifiRssi} dBm</div>
          )}
        </Card>
        <Card className="space-y-2">
          <div className="text-sm font-semibold text-text-heading">GW1200</div>
          <Badge variant={dashboard?.status?.ecowittOk ? "success" : "warning"}>
            {dashboard?.status?.ecowittOk ? "erreichbar" : "offen"}
          </Badge>
        </Card>
        <Card className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-text-heading">Ventile</div>
            <Badge variant={pendingCount > 0 ? "warning" : "default"}>
              {pendingCount > 0 ? `${pendingCount} wartet` : "keine Befehle"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {[1, 2, 3, 4].map((valve) => {
              const isOpen = valveStates[valve - 1] ?? false;
              return (
                <span key={valve} className={isOpen ? "font-semibold text-status-success-text" : "text-text-secondary"}>
                  V{valve} {isOpen ? "On" : "Off"}
                </span>
              );
            })}
          </div>
        </Card>
      </div>

      <section className="grid gap-3 lg:grid-cols-2">
        {(dashboard?.zones ?? []).map((zone) => {
          const sensor = zone.wh52Channel ? sensorsByChannel.get(zone.wh52Channel) : undefined;
          const isOpen = valveStates[zone.valveNumber - 1] ?? false;
          const commandKey = `open-${String(zone.valveNumber)}`;
          const closeKey = `close-${String(zone.valveNumber)}`;
          return (
            <Card key={zone.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-semibold text-text-heading">{zone.name}</h2>
                    <Badge variant={zone.active ? "success" : "default"}>V{zone.valveNumber}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    WH52 Ch {zone.wh52Channel ?? "-"} · Limit {zone.maxDurationMin} min
                  </div>
                </div>
                <Badge variant={isOpen ? "success" : "default"}>{isOpen ? "offen" : "zu"}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-muted p-3 text-sm">
                <div>
                  <div className="text-xs text-text-secondary">Feuchte</div>
                  <div className="font-semibold text-text-heading">{formatValue(sensor?.moisture, "%")}</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary">Temp</div>
                  <div className="font-semibold text-text-heading">{formatValue(sensor?.temperature, "°C", 1)}</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary">Akku</div>
                  <div className="font-semibold text-text-heading">{formatValue(sensor?.batteryMv, "mV")}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[15, 30, 60, 90].map((duration) => (
                  <Button
                    key={duration}
                    size="sm"
                    variant="secondary"
                    disabled={pendingCommand != null}
                    onClick={() =>
                      void sendCommand({
                        command: "open",
                        zoneId: zone.id,
                        zoneNumber: zone.valveNumber,
                        durationMin: duration,
                      })
                    }
                  >
                    {pendingCommand === commandKey ? "Sendet..." : `${duration} min`}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pendingCommand != null}
                  onClick={() =>
                    void sendCommand({
                      command: "close",
                      zoneId: zone.id,
                      zoneNumber: zone.valveNumber,
                    })
                  }
                >
                  {pendingCommand === closeKey ? "Sendet..." : "Schließen"}
                </Button>
              </div>
            </Card>
          );
        })}
      </section>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-text-heading">Eventlog</h2>
          {loading && <span className="text-xs text-text-secondary">lädt...</span>}
        </div>
        <div className="divide-y divide-dashed divide-border-default">
          {(dashboard?.events ?? []).slice(0, 10).map((event) => (
            <div key={event.id} className="flex gap-3 py-2 text-sm">
              <span className="w-24 shrink-0 text-text-secondary">{formatDateTime(event.createdAt)}</span>
              <Badge variant="default" className="shrink-0">
                {eventLabel(event.eventType)}
              </Badge>
              <span className="min-w-0 text-text-primary">{event.message}</span>
            </div>
          ))}
          {dashboard && dashboard.events.length === 0 && (
            <div className="py-4 text-sm text-text-secondary">Noch keine Events vorhanden.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
