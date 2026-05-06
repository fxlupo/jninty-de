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
  id?: string;
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
  durationSec?: number | null;
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

interface IrrigationSchedule {
  id: string;
  zoneId: string;
  program: string;
  active: boolean;
  weekdays: number;
  startTime: string;
  durationMin: number;
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
  schedules: IrrigationSchedule[];
  sensors: IrrigationSensor[];
  events: IrrigationEvent[];
  commands: IrrigationCommand[];
  status: IrrigationStatus | null;
}

interface IrrigationHistory {
  days: number;
  sensors: IrrigationSensor[];
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

interface ScheduleDraft {
  zoneId: string;
  program: string;
  active: boolean;
  weekdays: number;
  startTime: string;
  durationMin: number;
}

type IrrigationTab = "dashboard" | "programs" | "manual" | "events" | "history";
type SensorField = "soilMoisture" | "soilTemp";
type EventFilter = "all" | "open" | "close" | "skip" | "manual" | "scheduler" | "zone";

const AUTO_REFRESH_MS = 10000;
const ONLINE_WINDOW_MS = 120000;
const FRESH_COMMAND_MS = 120000;
const LOCAL_COMMAND_GRACE_MS = 15000;
const API_BASE = apiUrl ?? "/api";
const INPUT_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25";
const WEEKDAYS = [
  { bit: 0, label: "Mo" },
  { bit: 1, label: "Di" },
  { bit: 2, label: "Mi" },
  { bit: 3, label: "Do" },
  { bit: 4, label: "Fr" },
  { bit: 5, label: "Sa" },
  { bit: 6, label: "So" },
];
const TABS: Array<{ id: IrrigationTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "programs", label: "Programme" },
  { id: "manual", label: "Manuell" },
  { id: "events", label: "Eventlog" },
  { id: "history", label: "History" },
];
const EVENT_FILTERS: Array<{ id: EventFilter; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "open", label: "Öffnen" },
  { id: "close", label: "Schließen" },
  { id: "skip", label: "Skip" },
  { id: "manual", label: "Manuell" },
  { id: "scheduler", label: "Scheduler" },
  { id: "zone", label: "Zone" },
];

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

function parseDateMs(value: string): number {
  const date = new Date(value.includes(" ") ? value.replace(" ", "T") : value);
  return date.getTime();
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

function commandTime(command: IrrigationCommand): number {
  const requestedAt = new Date(command.requestedAt).getTime();
  return Number.isNaN(requestedAt) ? 0 : requestedAt;
}

function isActiveCommand(command: IrrigationCommand): boolean {
  if (command.status !== "pending" && command.status !== "acked") return false;
  const requestedAt = commandTime(command);
  if (requestedAt === 0) return false;
  return Date.now() - requestedAt < FRESH_COMMAND_MS;
}

function commandLabel(command: IrrigationCommand): string {
  const prefix = command.status === "acked" ? "ESP übernimmt" : "Befehl wartet";
  if (command.command === "open") return `${prefix}: ${command.durationMin ?? "?"} min`;
  if (command.command === "close") return `${prefix}: schließen`;
  if (command.command === "close_all") return `${prefix}: alle stoppen`;
  return prefix;
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

function matchesEventFilter(event: IrrigationEvent, filter: EventFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return event.action === "open";
  if (filter === "close") return event.action === "close" || event.action === "close_all";
  if (filter === "skip") return event.action === "skip" || event.reason === "skip";
  if (filter === "manual") return event.reason === "manual";
  if (filter === "scheduler") return event.reason === "scheduler";
  return (event.zoneNumber ?? 0) > 0;
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeStartTime(value: string): string {
  return value.slice(0, 5);
}

function weekdayText(mask: number): string {
  if (mask === 127) return "täglich";
  if (mask === 31) return "werktags";
  if (mask === 96) return "Wochenende";
  const labels = WEEKDAYS.filter((day) => (mask & (1 << day.bit)) !== 0).map((day) => day.label);
  return labels.length > 0 ? labels.join(", ") : "keine Tage";
}

function zoneNameById(zones: IrrigationZone[], zoneId: string): string {
  return zones.find((zone) => zone.id === zoneId)?.name ?? "Zone";
}

function nextScheduleForZone(schedules: IrrigationSchedule[], zoneId: string): IrrigationSchedule | null {
  return schedules.find((schedule) => schedule.zoneId === zoneId && schedule.active) ?? null;
}

function planHint(zone: IrrigationZone, sensor: IrrigationSensor | undefined): { text: string; variant: "success" | "warning" | "default" } {
  if (!zone.active) return { text: "Skip: Zone inaktiv", variant: "warning" };
  if (!sensor) return { text: "Skip: keine Sensor Daten", variant: "warning" };
  if (sensor.soilTemp != null && sensor.soilTemp < zone.tempMinimum) {
    return { text: "Skip: Boden zu kalt", variant: "warning" };
  }
  if (sensor.soilMoisture != null && sensor.soilMoisture >= zone.moistureThreshold) {
    return { text: "Skip: Boden zu feucht", variant: "warning" };
  }
  return { text: "Plan: wird laufen", variant: "success" };
}

function sensorColor(channel: number): string {
  const colors = ["#4ade80", "#a78bfa", "#fbbf24", "#f472b6"];
  return colors[(channel - 1) % colors.length] ?? "#60a5fa";
}

function chartTimeLabel(ms: number, days: number): string {
  const date = new Date(ms);
  if (days <= 1) {
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
}

function SensorLineChart({
  title,
  sensors,
  zones,
  field,
  unit,
  min,
  max,
  days,
}: {
  title: string;
  sensors: IrrigationSensor[];
  zones: IrrigationZone[];
  field: SensorField;
  unit: string;
  min: number;
  max: number;
  days: number;
}) {
  const width = 720;
  const height = 260;
  const pad = { left: 42, right: 16, top: 18, bottom: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xMin = Date.now() - days * 24 * 60 * 60 * 1000;
  const xMax = Date.now();
  const yTicks = [min, (min + max) / 2, max];

  const byChannel = new Map<number, IrrigationSensor[]>();
  for (const sensor of sensors) {
    const value = sensor[field];
    const ms = parseDateMs(sensor.createdAt);
    if (value == null || Number.isNaN(value) || Number.isNaN(ms)) continue;
    if (ms < xMin || ms > xMax) continue;
    const list = byChannel.get(sensor.channel) ?? [];
    list.push(sensor);
    byChannel.set(sensor.channel, list);
  }

  const x = (ms: number) => pad.left + ((ms - xMin) / Math.max(1, xMax - xMin)) * innerW;
  const y = (value: number) => pad.top + (1 - (value - min) / (max - min)) * innerH;

  const channelLines = [1, 2, 3, 4].map((channel) => {
    const points = (byChannel.get(channel) ?? [])
      .slice()
      .sort((a, b) => parseDateMs(a.createdAt) - parseDateMs(b.createdAt))
      .map((sensor) => {
        const value = sensor[field];
        if (value == null) return "";
        return `${x(parseDateMs(sensor.createdAt)).toFixed(1)},${y(value).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");
    return { channel, points };
  });

  const zoneName = (channel: number) =>
    zones.find((zone) => zone.wh52Channel === channel)?.name ?? `Kanal ${channel}`;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-text-heading">{title}</h3>
        <span className="text-sm text-text-secondary">{unit}</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-64 min-w-[620px] w-full">
          <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill="transparent" />
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="currentColor" className="text-border-default" strokeDasharray="4 4" />
              <text x={8} y={y(tick) + 4} className="fill-text-secondary text-[11px]">
                {tick.toFixed(0)}
              </text>
            </g>
          ))}
          {[0, 0.5, 1].map((ratio) => {
            const ms = xMin + (xMax - xMin) * ratio;
            return (
              <text key={ratio} x={x(ms)} y={height - 8} textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"} className="fill-text-secondary text-[11px]">
                {chartTimeLabel(ms, days)}
              </text>
            );
          })}
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + innerH} stroke="currentColor" className="text-border-strong" />
          <line x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH} stroke="currentColor" className="text-border-strong" />
          {channelLines.map(({ channel, points }) =>
            points ? (
              <polyline
                key={channel}
                points={points}
                fill="none"
                stroke={sensorColor(channel)}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null,
          )}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
        {[1, 2, 3, 4].map((channel) => (
          <div key={channel} className="flex items-center gap-2 text-text-secondary">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: sensorColor(channel) }} />
            <span className="truncate">{zoneName(channel)}</span>
          </div>
        ))}
      </div>
      {sensors.length === 0 && (
        <div className="mt-3 text-sm text-text-secondary">Keine Sensorwerte im Zeitraum.</div>
      )}
    </Card>
  );
}

export default function IrrigationPage() {
  const [dashboard, setDashboard] = useState<IrrigationDashboard | null>(null);
  const [activeTab, setActiveTab] = useState<IrrigationTab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [localCommands, setLocalCommands] = useState<IrrigationCommand[]>([]);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft | null>(null);
  const [savingZone, setSavingZone] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [historyDays, setHistoryDays] = useState(1);
  const [history, setHistory] = useState<IrrigationHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");

  const loadDashboard = useCallback(async () => {
    try {
      const data = await irrigationRequest<IrrigationDashboard>("/irrigation/dashboard");
      const serverCommandIds = new Set(data.commands.map((command) => command.id));
      const now = Date.now();
      setDashboard(data);
      setLocalCommands((current) =>
        current.filter((command) => {
          if (serverCommandIds.has(command.id)) return false;
          const requestedAt = commandTime(command);
          return requestedAt > 0 && now - requestedAt < LOCAL_COMMAND_GRACE_MS;
        }),
      );
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

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await irrigationRequest<IrrigationHistory>(`/irrigation/history?days=${historyDays}`);
      setHistory(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "History konnte nicht geladen werden.");
    } finally {
      setLoadingHistory(false);
    }
  }, [historyDays]);

  useEffect(() => {
    if (activeTab === "history") {
      void loadHistory();
    }
  }, [activeTab, loadHistory]);

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
  const activeCommands = useMemo(() => {
    const byId = new Map<string, IrrigationCommand>();
    for (const command of [...(dashboard?.commands ?? []), ...localCommands]) {
      if (isActiveCommand(command)) byId.set(command.id, command);
    }
    return [...byId.values()].sort((a, b) => commandTime(b) - commandTime(a));
  }, [dashboard?.commands, localCommands]);
  const pendingCount = activeCommands.length;
  const commandByZone = useMemo(() => {
    const map = new Map<number, IrrigationCommand>();
    for (const command of activeCommands) {
      if (command.zoneNumber > 0 && !map.has(command.zoneNumber)) {
        map.set(command.zoneNumber, command);
      }
    }
    return map;
  }, [activeCommands]);
  const filteredEvents = useMemo(
    () => (dashboard?.events ?? []).filter((event) => matchesEventFilter(event, eventFilter)).slice(0, 40),
    [dashboard?.events, eventFilter],
  );

  const sendCommand = async (payload: CommandPayload) => {
    setPendingCommand(`${payload.command}-${String(payload.zoneNumber)}`);
    try {
      const command = await irrigationRequest<IrrigationCommand>("/irrigation/commands", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setLocalCommands((current) => [command, ...current.filter((item) => item.id !== command.id)]);
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

  const startNewSchedule = () => {
    const firstZone = dashboard?.zones[0];
    if (!firstZone) return;
    setEditingScheduleId("new");
    setScheduleDraft({
      zoneId: firstZone.id,
      program: "A",
      active: true,
      weekdays: 127,
      startTime: "06:00",
      durationMin: 30,
    });
  };

  const startEditSchedule = (schedule: IrrigationSchedule) => {
    setEditingScheduleId(schedule.id);
    setScheduleDraft({
      zoneId: schedule.zoneId,
      program: schedule.program,
      active: schedule.active,
      weekdays: schedule.weekdays,
      startTime: normalizeStartTime(schedule.startTime),
      durationMin: schedule.durationMin,
    });
  };

  const cancelEditSchedule = () => {
    setEditingScheduleId(null);
    setScheduleDraft(null);
  };

  const updateScheduleDraft = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => {
    setScheduleDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const toggleScheduleWeekday = (bit: number) => {
    setScheduleDraft((current) => {
      if (!current) return current;
      return { ...current, weekdays: current.weekdays ^ (1 << bit) };
    });
  };

  const saveSchedule = async () => {
    if (!scheduleDraft || !editingScheduleId) return;
    setSavingSchedule(true);
    try {
      const path = editingScheduleId === "new" ? "/irrigation/schedules" : `/irrigation/schedules/${editingScheduleId}`;
      const method = editingScheduleId === "new" ? "POST" : "PATCH";
      await irrigationRequest<IrrigationSchedule>(path, {
        method,
        body: JSON.stringify(scheduleDraft),
      });
      await loadDashboard();
      cancelEditSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zeitplan konnte nicht gespeichert werden.");
    } finally {
      setSavingSchedule(false);
    }
  };

  const deleteSchedule = async (schedule: IrrigationSchedule) => {
    if (!window.confirm("Zeitplan wirklich löschen?")) return;
    setSavingSchedule(true);
    try {
      await irrigationRequest<{ ok: boolean }>(`/irrigation/schedules/${schedule.id}`, {
        method: "DELETE",
      });
      await loadDashboard();
      if (editingScheduleId === schedule.id) cancelEditSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zeitplan konnte nicht gelöscht werden.");
    } finally {
      setSavingSchedule(false);
    }
  };

  const exportConfig = () => {
    downloadJson(`bewaesserung-config-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      source: "jninty-irrigation",
      zones: dashboard?.zones ?? [],
      schedules: dashboard?.schedules ?? [],
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-heading">Bewässerung</h1>
          <p className="text-sm text-text-secondary">ESP-Steuerung, Sensorwerte und Programme.</p>
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

      <div className="flex gap-2 overflow-x-auto rounded-xl border border-border-default bg-surface-elevated p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-text-on-primary"
                : "text-text-secondary hover:bg-surface-muted hover:text-text-heading"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <>
          <section className="grid gap-3 lg:grid-cols-2">
            {(dashboard?.zones ?? []).map((zone) => {
              const sensor = zone.wh52Channel ? sensorsByChannel.get(zone.wh52Channel) : undefined;
              const isOpen = valveStates[zone.valveNumber - 1] ?? false;
              const zoneCommand = commandByZone.get(zone.valveNumber);
              const isEditing = editingZoneId === zone.id;
              const draft = isEditing ? zoneDraft : null;
              const next = nextScheduleForZone(dashboard?.schedules ?? [], zone.id);
              const hint = planHint(zone, sensor);
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
                      <Badge variant={zoneCommand ? "warning" : isOpen ? "success" : "default"}>
                        {zoneCommand ? (zoneCommand.status === "acked" ? "übernommen" : "wartet") : isOpen ? "offen" : "zu"}
                      </Badge>
                    </div>
                  </div>

                  {draft && (
                    <div className="rounded-lg border border-border-default bg-surface-muted p-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="md:col-span-2">
                          <span className="mb-1 block text-xs font-medium text-text-secondary">Name</span>
                          <input className={INPUT_CLASS} value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium text-text-secondary">WH52 Ch</span>
                          <input className={INPUT_CLASS} type="number" min={1} max={8} value={draft.wh52Channel} onChange={(event) => updateDraft("wh52Channel", Number(event.target.value))} />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium text-text-secondary">Feuchte Limit</span>
                          <input className={INPUT_CLASS} type="number" min={0} max={100} value={draft.moistureThreshold} onChange={(event) => updateDraft("moistureThreshold", Number(event.target.value))} />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium text-text-secondary">Temp Minimum</span>
                          <input className={INPUT_CLASS} type="number" step={0.5} value={draft.tempMinimum} onChange={(event) => updateDraft("tempMinimum", Number(event.target.value))} />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium text-text-secondary">Regen 6h Limit</span>
                          <input className={INPUT_CLASS} type="number" step={0.5} min={0} value={draft.rainThreshold6h} onChange={(event) => updateDraft("rainThreshold6h", Number(event.target.value))} />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium text-text-secondary">Max-Dauer</span>
                          <input className={INPUT_CLASS} type="number" min={1} max={180} value={draft.maxDurationMin} onChange={(event) => updateDraft("maxDurationMin", Number(event.target.value))} />
                        </label>
                        <label className="flex items-center gap-2 pt-6 text-sm font-medium text-text-heading">
                          <input type="checkbox" checked={draft.active} onChange={(event) => updateDraft("active", event.target.checked)} />
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

                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-text-secondary">
                      Nächster Lauf: {next ? `${normalizeStartTime(next.startTime)} · ${next.durationMin} min` : "kein Programm"}
                    </span>
                    {zoneCommand ? (
                      <Badge variant="warning">{commandLabel(zoneCommand)}</Badge>
                    ) : (
                      <Badge variant={hint.variant}>{hint.text}</Badge>
                    )}
                  </div>
                </Card>
              );
            })}
          </section>

          <div className="grid gap-3 md:grid-cols-4">
            <Card className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-text-heading">Ventile</div>
                <Badge variant={pendingCount > 0 ? "warning" : "default"}>
                  {pendingCount > 0 ? `${pendingCount} wartet` : "keine Befehle"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {[1, 2, 3, 4].map((valve) => {
                  const isOpen = valveStates[valve - 1] ?? false;
                  const valveCommand = commandByZone.get(valve);
                  return (
                    <span
                      key={valve}
                      className={valveCommand ? "font-semibold text-status-warning-text" : isOpen ? "font-semibold text-status-success-text" : "text-text-secondary"}
                    >
                      V{valve} {valveCommand ? "wartet" : isOpen ? "On" : "Off"}
                    </span>
                  );
                })}
              </div>
            </Card>
            <Card className="space-y-2">
              <div className="text-sm font-semibold text-text-heading">ESP</div>
              <Badge variant={online ? "success" : "danger"}>{online ? "online" : "offline"}</Badge>
              <div className="text-xs text-text-secondary">zuletzt {formatDateTime(dashboard?.status?.lastSeen)}</div>
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
            <Card className="space-y-2">
              <div className="text-sm font-semibold text-text-heading">Sync</div>
              <Badge variant={pendingCount > 0 ? "warning" : "success"}>
                {pendingCount > 0 ? "wartet" : "aktuell"}
              </Badge>
              <div className="text-xs text-text-secondary">{loading ? "lädt..." : "Auto-Refresh 10s"}</div>
            </Card>
          </div>
        </>
      )}

      {activeTab === "programs" && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-text-heading">Programme</h2>
              <p className="text-sm text-text-secondary">Automatische Läufe werden vom ESP beim nächsten Config-Sync übernommen.</p>
            </div>
            <Button size="sm" onClick={startNewSchedule} disabled={!dashboard?.zones.length || editingScheduleId != null}>
              Zeitplan hinzufügen
            </Button>
          </div>

          {scheduleDraft && (
            <div className="mb-4 rounded-lg border border-border-default bg-surface-muted p-3">
              <div className="grid gap-3 md:grid-cols-6">
                <label className="md:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-text-secondary">Zone</span>
                  <select className={INPUT_CLASS} value={scheduleDraft.zoneId} onChange={(event) => updateScheduleDraft("zoneId", event.target.value)}>
                    {(dashboard?.zones ?? []).map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        V{zone.valveNumber} {zone.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-text-secondary">Programm</span>
                  <select className={INPUT_CLASS} value={scheduleDraft.program} onChange={(event) => updateScheduleDraft("program", event.target.value)}>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-text-secondary">Start</span>
                  <input className={INPUT_CLASS} type="time" value={scheduleDraft.startTime} onChange={(event) => updateScheduleDraft("startTime", event.target.value)} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-text-secondary">Dauer</span>
                  <input className={INPUT_CLASS} type="number" min={1} max={180} value={scheduleDraft.durationMin} onChange={(event) => updateScheduleDraft("durationMin", Number(event.target.value))} />
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm font-medium text-text-heading">
                  <input type="checkbox" checked={scheduleDraft.active} onChange={(event) => updateScheduleDraft("active", event.target.checked)} />
                  aktiv
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                  const active = (scheduleDraft.weekdays & (1 << day.bit)) !== 0;
                  return (
                    <button
                      key={day.bit}
                      type="button"
                      onClick={() => toggleScheduleWeekday(day.bit)}
                      className={`rounded-lg border px-3 py-1 text-sm font-semibold transition-colors ${
                        active ? "border-primary bg-primary text-text-on-primary" : "border-border-strong bg-surface text-text-secondary"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void saveSchedule()} disabled={savingSchedule || scheduleDraft.weekdays === 0}>
                  {savingSchedule ? "Speichert..." : "Speichern"}
                </Button>
                <Button size="sm" variant="secondary" onClick={cancelEditSchedule} disabled={savingSchedule}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}

          <div className="divide-y divide-border-default">
            {(dashboard?.schedules ?? []).map((schedule) => (
              <div key={schedule.id} className="flex flex-wrap items-center gap-3 py-3">
                <Badge variant={schedule.active ? "success" : "default"}>{schedule.active ? "aktiv" : "inaktiv"}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-text-heading">
                    {zoneNameById(dashboard?.zones ?? [], schedule.zoneId)} · {normalizeStartTime(schedule.startTime)} · {schedule.durationMin} min
                  </div>
                  <div className="text-sm text-text-secondary">Programm {schedule.program} · {weekdayText(schedule.weekdays)}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => startEditSchedule(schedule)} disabled={editingScheduleId != null}>
                  Bearbeiten
                </Button>
                <Button size="sm" variant="danger" onClick={() => void deleteSchedule(schedule)} disabled={savingSchedule}>
                  Löschen
                </Button>
              </div>
            ))}
            {dashboard && dashboard.schedules.length === 0 && (
              <div className="py-4 text-sm text-text-secondary">Noch keine Zeitpläne angelegt.</div>
            )}
          </div>

          <div className="mt-4 flex justify-end border-t border-border-default pt-4">
            <Button size="sm" variant="secondary" onClick={exportConfig} disabled={!dashboard}>
              Konfiguration exportieren
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "manual" && (
        <section className="grid gap-3 lg:grid-cols-2">
          {(dashboard?.zones ?? []).map((zone) => {
            const isOpen = valveStates[zone.valveNumber - 1] ?? false;
            const zoneCommand = commandByZone.get(zone.valveNumber);
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
                    <div className="mt-1 text-xs text-text-secondary">Max {zone.maxDurationMin} min</div>
                  </div>
                  <Badge variant={zoneCommand ? "warning" : isOpen ? "success" : "default"}>
                    {zoneCommand ? (zoneCommand.status === "acked" ? "übernommen" : "wartet") : isOpen ? "offen" : "zu"}
                  </Badge>
                </div>
                {zoneCommand && (
                  <div className="rounded-lg bg-status-warning-bg px-3 py-2 text-sm font-medium text-status-warning-text">
                    {commandLabel(zoneCommand)}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {[15, 30, 60, 90].map((duration) => (
                    <Button
                      key={duration}
                      size="sm"
                      variant="secondary"
                      disabled={pendingCommand != null || zoneCommand != null}
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
                    disabled={pendingCommand != null || zoneCommand != null}
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
      )}

      {activeTab === "events" && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-text-heading">Eventlog</h2>
              <p className="text-sm text-text-secondary">Gefilterte Ereignisse vom ESP und Scheduler.</p>
            </div>
            {loading && <span className="text-xs text-text-secondary">lädt...</span>}
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {EVENT_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setEventFilter(filter.id)}
                className={`rounded-lg border px-3 py-1 text-sm font-semibold transition-colors ${
                  eventFilter === filter.id
                    ? "border-primary bg-primary text-text-on-primary"
                    : "border-border-strong bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-heading"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="divide-y divide-dashed divide-border-default">
            {filteredEvents.map((event) => (
              <div key={event.id} className="flex gap-3 py-2 text-sm">
                <span className="w-24 shrink-0 text-text-secondary">{formatDateTime(event.createdAt)}</span>
                <Badge variant="default" className="shrink-0">
                  {eventLabel(event.action)}
                </Badge>
                <span className="min-w-0 text-text-primary">{eventText(event)}</span>
              </div>
            ))}
            {dashboard && filteredEvents.length === 0 && (
              <div className="py-4 text-sm text-text-secondary">
                {dashboard.events.length === 0 ? "Noch keine Events vorhanden." : "Keine Events passen zum Filter."}
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === "history" && (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-text-heading">History</h2>
                <p className="text-sm text-text-secondary">Sensorverlauf für Bodenfeuchte und Bodentemperatur.</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className={INPUT_CLASS}
                  value={historyDays}
                  onChange={(event) => setHistoryDays(Number(event.target.value))}
                >
                  <option value={1}>24 Stunden</option>
                  <option value={7}>7 Tage</option>
                  <option value={30}>30 Tage</option>
                  <option value={90}>90 Tage</option>
                  <option value={365}>365 Tage</option>
                </select>
                <Button size="sm" variant="secondary" onClick={() => void loadHistory()} disabled={loadingHistory}>
                  {loadingHistory ? "Lädt..." : "Aktualisieren"}
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <SensorLineChart
              title="Bodenfeuchte"
              sensors={history?.sensors ?? []}
              zones={dashboard?.zones ?? []}
              field="soilMoisture"
              unit="%"
              min={0}
              max={100}
              days={historyDays}
            />
            <SensorLineChart
              title="Bodentemperatur"
              sensors={history?.sensors ?? []}
              zones={dashboard?.zones ?? []}
              field="soilTemp"
              unit="°C"
              min={-10}
              max={40}
              days={historyDays}
            />
          </div>
        </div>
      )}
    </div>
  );
}
