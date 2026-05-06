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
  rainThreshold6h: number;
  maxDurationMin: number;
}

interface IrrigationSensor {
  channel: number;
  soilMoisture: number | null;
  soilTemp: number | null;
  soilEc: number | null;
  batteryOk: boolean | null;
  createdAt: string;
}

interface IrrigationEvent {
  id: string;
  action: string;
  reason: string | null;
  detail: string | null;
  zoneNumber: number | null;
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

interface ZoneDraft {
  name: string;
  wh52Channel: number;
  active: boolean;
  moistureThreshold: number;
  tempMinimum: number;
  rainThreshold6h: number;
  maxDurationMin: number;
}

const AUTO_REFRESH_MS = 10000;
const ONLINE_WINDOW_MS = 120000;
const FRESH_COMMAND_MS = 120000;
const API_BASE = apiUrl ?? "/api";
const INPUT_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25";

async function irrigationRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
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

  const res = await fetch(`${API_BASE}${path}`, {
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
  const date = new Date(value.includes(" ") ? value.replace(" ", "T") : value);
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

function isFreshPendingCommand(command: IrrigationCommand): boolean {
  if (command.status !== "pending") return false;
  const requestedAt = new Date(command.requestedAt).getTime();
  if (Number.isNaN(requestedAt)) return false;
  return Date.now() - requestedAt < FRESH_COMMAND_MS;
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

function eventText(event: IrrigationEvent): string {
  const zone = event.zoneNumber && event.zoneNumber > 0 ? `V${event.zoneNumber} ` : "";
  const reason = event.reason ? ` · ${event.reason}` : "";
  const detail = event.detail ? ` · ${event.detail}` : "";
  return `${zone}${eventLabel(event.action)}${reason}${detail}`;
}

export default function IrrigationPage() {
  const [dashboard, setDashboard] = useState<IrrigationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft | null>(null);
  const [savingZone, setSavingZone] = useState(false);

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
  const pendingCount = dashboard?.commands.filter(isFreshPendingCommand).length ?? 0;

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

  const startEditZone = (zone: IrrigationZone) => {
    setEditingZoneId(zone.id);
    setZoneDraft({
      name: zone.name,
      wh52Channel: zone.wh52Channel ?? zone.valveNumber,
      active: zone.active,
      moistureThreshold: zone.moistureThreshold,
      tempMinimum: zone.tempMinimum,
      rainThreshold6h: zone.rainThreshold6h,
      maxDurationMin: zone.maxDurationMin,
    });
  };

  const cancelEditZone = () => {
    setEditingZoneId(null);
    setZoneDraft(null);
  };

  const updateDraft = <K extends keyof ZoneDraft>(key: K, value: ZoneDraft[K]) => {
    setZoneDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveZone = async (zone: IrrigationZone) => {
    if (!zoneDraft) return;
    setSavingZone(true);
    try {
      await irrigationRequest<IrrigationZone>(`/irrigation/zones/${zone.id}`, {
        method: "PATCH",
        body: JSON.stringify(zoneDraft),
      });
      await loadDashboard();
      cancelEditZone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zone konnte nicht gespeichert werden.");
    } finally {
      setSavingZone(false);
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
          const isEditing = editingZoneId === zone.id;
          const draft = isEditing ? zoneDraft : null;
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
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEditZone(zone)}
                    disabled={editingZoneId != null && editingZoneId !== zone.id}
                  >
                    Bearbeiten
                  </Button>
                  <Badge variant={isOpen ? "success" : "default"}>{isOpen ? "offen" : "zu"}</Badge>
                </div>
              </div>

              {draft && (
                <div className="rounded-lg border border-border-default bg-surface-muted p-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Name</span>
                      <input
                        className={INPUT_CLASS}
                        value={draft.name}
                        onChange={(event) => updateDraft("name", event.target.value)}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-text-secondary">WH52 Ch</span>
                      <input
                        className={INPUT_CLASS}
                        type="number"
                        min={1}
                        max={8}
                        value={draft.wh52Channel}
                        onChange={(event) => updateDraft("wh52Channel", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Feuchte Limit</span>
                      <input
                        className={INPUT_CLASS}
                        type="number"
                        min={0}
                        max={100}
                        value={draft.moistureThreshold}
                        onChange={(event) => updateDraft("moistureThreshold", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Temp Minimum</span>
                      <input
                        className={INPUT_CLASS}
                        type="number"
                        step={0.5}
                        value={draft.tempMinimum}
                        onChange={(event) => updateDraft("tempMinimum", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Regen 6h Limit</span>
                      <input
                        className={INPUT_CLASS}
                        type="number"
                        step={0.5}
                        min={0}
                        value={draft.rainThreshold6h}
                        onChange={(event) => updateDraft("rainThreshold6h", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Max-Dauer</span>
                      <input
                        className={INPUT_CLASS}
                        type="number"
                        min={1}
                        max={180}
                        value={draft.maxDurationMin}
                        onChange={(event) => updateDraft("maxDurationMin", Number(event.target.value))}
                      />
                    </label>
                    <label className="flex items-center gap-2 pt-6 text-sm font-medium text-text-heading">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(event) => updateDraft("active", event.target.checked)}
                      />
                      Zone aktiv
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void saveZone(zone)} disabled={savingZone}>
                      {savingZone ? "Speichert..." : "Speichern"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={cancelEditZone} disabled={savingZone}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-muted p-3 text-sm">
                <div>
                  <div className="text-xs text-text-secondary">Feuchte</div>
                  <div className="font-semibold text-text-heading">{formatValue(sensor?.soilMoisture, "%", 1)}</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary">Temp</div>
                  <div className="font-semibold text-text-heading">{formatValue(sensor?.soilTemp, "°C", 1)}</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary">EC</div>
                  <div className="font-semibold text-text-heading">{formatValue(sensor?.soilEc, "uS")}</div>
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
                {eventLabel(event.action)}
              </Badge>
              <span className="min-w-0 text-text-primary">{eventText(event)}</span>
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
