import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { apiUrl } from "../config/cloud";
import ConfirmModal from "../components/ui/ConfirmModal";

// M5: Zod schemas validate user input before it reaches the API
const ZoneDraftSchema = z.object({
  name:               z.string().min(1, "Name darf nicht leer sein"),
  wh52Channel:        z.number().int().min(1).max(8),
  active:             z.boolean(),
  moistureThreshold:  z.number().int().min(0).max(100),
  tempMinimum:        z.number().min(-20).max(40),
  rainThreshold6h:    z.number().min(0).max(100),
  maxDurationMin:     z.number().int().min(1).max(480),
});

const ScheduleDraftSchema = z.object({
  zoneId:     z.string().uuid(),
  program:    z.string().min(1, "Programm darf nicht leer sein"),
  active:     z.boolean(),
  weekdays:   z.number().int().min(0).max(127),
  startTime:  z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Ungültige Uhrzeit"),
  durationMin: z.number().int().min(1).max(480),
});

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
  raw?: Record<string, unknown> | null;
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

type RuntimeZoneState = "idle" | "running" | "queued";

interface IrrigationRuntimeZone {
  zone: number;
  state: RuntimeZoneState;
  remainingSec: number;
}

interface IrrigationRuntime {
  queueLength: number;
  zones: IrrigationRuntimeZone[];
}

interface IrrigationControl {
  controllerEnabled: boolean;
  rainDelayUntil: string | null;
  rainDelayUntilEpoch: number;
}

interface IrrigationStatus {
  espOnline: boolean | null;
  wifiRssi: number | null;
  ecowittOk: boolean | null;
  valveStates: string | null;
  lastSeen: string | null;
  raw?: {
    runtime?: IrrigationRuntime;
    control?: IrrigationControl;
  } | null;
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

interface IrrigationPreviewItem {
  id: string;
  startsAt: string;
  valveNumber: number;
  zoneName: string;
  program: string;
  scheduledDurationMin: number;
  durationMin: number;
  action: "run" | "skip";
  detail: string;
}

interface IrrigationPreview {
  days: number;
  control: IrrigationControl;
  items: IrrigationPreviewItem[];
}

type CommandPayload =
  | { command: "open"; zoneId: string; zoneNumber: number; durationMin: number }
  | { command: "close"; zoneId: string; zoneNumber: number }
  | { command: "close_all"; zoneNumber: 0 }
  | { command: "run_once"; zoneNumber: 0; durationMin: number };

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

interface SensorChannelDescriptor {
  channel: number;
  label: string;
  shared: boolean;
}

interface NextScheduleRun {
  label: string;
  time: string;
  durationMin: number;
  startsAtMs: number;
}

const AUTO_REFRESH_MS = 10000;
const ONLINE_WINDOW_MS = 120000;
const FRESH_COMMAND_MS = 120000;
const LOCAL_COMMAND_GRACE_MS = 15000;
const IRRIGATION_ZONE_COUNT = 6;
const IRRIGATION_ZONE_NUMBERS = Array.from({ length: IRRIGATION_ZONE_COUNT }, (_, index) => index + 1);
const QUICK_TEST_SECONDS = [10, 20, 30];
const API_BASE = apiUrl ?? "/api";
const INPUT_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25";
const OPEN_ZONE_CARD_CLASS =
  "border-green-300 bg-surface-nav text-text-on-primary shadow-lg shadow-green-900/20 ring-2 ring-green-300";
const OPEN_ZONE_HEADING_CLASS = "text-text-on-primary";
const OPEN_ZONE_MUTED_CLASS = "text-green-100";
const OPEN_ZONE_PANEL_CLASS = "bg-primary-active/70 text-text-on-primary";
const OPEN_ZONE_BADGE_CLASS =
  "animate-pulse bg-green-300 text-green-950 ring-2 ring-green-100";
const WEEKDAYS = [
  { bit: 0, label: "Mo" },
  { bit: 1, label: "Di" },
  { bit: 2, label: "Mi" },
  { bit: 3, label: "Do" },
  { bit: 4, label: "Fr" },
  { bit: 5, label: "Sa" },
  { bit: 6, label: "So" },
];
const JS_WEEKDAY_LABELS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
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

function formatCompactValue(value: number | null | undefined, unit: string, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value.toFixed(digits)}${unit}`;
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
  if (command.command === "run_once") return `${prefix}: Testlauf ${command.durationMin ?? "?"} s`;
  return prefix;
}

// #5: compile once at module load instead of creating new RegExp objects on every call
const VALVE_PATTERNS = IRRIGATION_ZONE_NUMBERS.map((v) => new RegExp(`V${v}\\s+(On|Off)`, "i"));

function parseValveStates(value: string | null | undefined): boolean[] {
  if (!value) return IRRIGATION_ZONE_NUMBERS.map(() => false);
  const compact = value.trim();
  if (new RegExp(`^[01]{1,${IRRIGATION_ZONE_COUNT}}$`).test(compact)) {
    return IRRIGATION_ZONE_NUMBERS.map((_, index) => compact[index] === "1");
  }
  return VALVE_PATTERNS.map((pattern) => {
    const match = compact.match(pattern);
    return match?.[1]?.toLowerCase() === "on";
  });
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    open: "Öffnen",
    close: "Schließen",
    close_all: "Alle Stop",
    run_once: "Testlauf",
    skip: "Skip",
    manual: "Manuell",
    scheduler: "Scheduler",
    sensor: "Sensor",
    system: "System",
  };
  return labels[type] ?? type;
}

function eventTriggerText(reason: string | null): string {
  const normalized = reason?.toLowerCase() ?? null;
  if (normalized === "manual") return "Manuell";
  if (normalized === "scheduler" || normalized === "schedule") return "Scheduler";
  if (normalized === "sensor") return "Sensor";
  if (normalized === "system") return "System";
  return reason ?? "-";
}

function eventDurationText(event: IrrigationEvent): string {
  if (event.durationSec != null && event.durationSec > 0) {
    const min = Math.round(event.durationSec / 60);
    return min >= 1 ? `${min} min` : `${event.durationSec} s`;
  }
  const match = event.detail?.match(/(\d+)\s*min/i);
  return match?.[1] ? `${match[1]} min` : "-";
}

function eventZoneNumber(event: IrrigationEvent): number {
  if (typeof event.zoneNumber === "number") return event.zoneNumber;
  const rawZoneNumber = event.raw?.["zoneNumber"] ?? event.raw?.["zone_number"] ?? event.raw?.["zone_id"];
  if (typeof rawZoneNumber === "number") return rawZoneNumber;
  if (typeof rawZoneNumber === "string") {
    const parsed = Number(rawZoneNumber);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function eventZoneText(event: IrrigationEvent, zones: IrrigationZone[]): string {
  const zoneNumber = eventZoneNumber(event);
  if (zoneNumber <= 0) return "Alle";
  const zone = zones.find((item) => item.valveNumber === zoneNumber);
  return `V${zoneNumber} ${zone?.name ?? "Zone"}`;
}

function matchesEventFilter(event: IrrigationEvent, filter: EventFilter): boolean {
  const reason = event.reason?.toLowerCase() ?? "";
  if (filter === "all") return true;
  if (filter === "open") return event.action === "open";
  if (filter === "close") return event.action === "close" || event.action === "close_all";
  if (filter === "skip") return event.action === "skip" || reason === "skip";
  if (filter === "manual") return reason === "manual";
  if (filter === "scheduler") return reason === "scheduler" || reason === "schedule";
  return eventZoneNumber(event) > 0;
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // #7: append to DOM so Firefox triggers the download, then remove immediately
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function eventDurationMs(event: IrrigationEvent): number {
  if (event.durationSec != null && event.durationSec > 0) return event.durationSec * 1000;
  const match = event.detail?.match(/(\d+)\s*min/i);
  return match?.[1] ? Number(match[1]) * 60 * 1000 : 0;
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min)}:${String(sec).padStart(2, "0")} min`;
}

function runtimeLabel(state: RuntimeZoneState | undefined): string {
  if (state === "running") return "offen";
  if (state === "queued") return "wartet";
  return "zu";
}

function runtimeBadgeVariant(
  runtime: IrrigationRuntimeZone | undefined,
  command: IrrigationCommand | undefined,
  isOpen: boolean,
): "success" | "warning" | "default" {
  if (command || runtime?.state === "queued") return "warning";
  if (runtime?.state === "running" || isOpen) return "success";
  return "default";
}

function runtimeRemainingMs(runtime: IrrigationRuntimeZone | undefined): number | null {
  if (!runtime || runtime.remainingSec <= 0) return null;
  return runtime.remainingSec * 1000;
}

function remainingRunMs(
  zoneNumber: number,
  events: IrrigationEvent[],
  command: IrrigationCommand | undefined,
  nowMs: number,
): number | null {
  if (command?.command === "open" && command.durationMin != null) {
    const startMs = parseDateMs(command.requestedAt);
    if (!Number.isNaN(startMs)) {
      return Math.max(0, startMs + command.durationMin * 60 * 1000 - nowMs);
    }
  }
  const latestOpen = events
    .filter((event) => event.zoneNumber === zoneNumber && event.action === "open")
    .sort((a, b) => parseDateMs(b.createdAt) - parseDateMs(a.createdAt))[0];
  if (!latestOpen) return null;
  const startMs = parseDateMs(latestOpen.createdAt);
  const durationMs = eventDurationMs(latestOpen);
  if (Number.isNaN(startMs) || durationMs <= 0) return null;
  return Math.max(0, startMs + durationMs - nowMs);
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

function weekdayBitForDate(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function dateWithScheduleTime(baseDate: Date, startTime: string): Date | null {
  const [hourText, minuteText] = normalizeStartTime(startTime).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const date = new Date(baseDate);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function nextRunLabel(date: Date, dayOffset: number): string {
  if (dayOffset === 0) return "Heute";
  if (dayOffset === 1) return "Morgen";
  return JS_WEEKDAY_LABELS[date.getDay()] ?? "";
}

function nextScheduleRunForZone(
  schedules: IrrigationSchedule[],
  zoneId: string,
  now = new Date(),
): NextScheduleRun | null {
  let nextRun: NextScheduleRun | null = null;
  const candidates = schedules.filter((schedule) => schedule.zoneId === zoneId && schedule.active);

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);
    const bit = weekdayBitForDate(date);

    for (const schedule of candidates) {
      if ((schedule.weekdays & (1 << bit)) === 0) continue;

      const startsAt = dateWithScheduleTime(date, schedule.startTime);
      if (!startsAt || startsAt.getTime() <= now.getTime()) continue;

      const run: NextScheduleRun = {
        label: nextRunLabel(startsAt, dayOffset),
        time: normalizeStartTime(schedule.startTime),
        durationMin: schedule.durationMin,
        startsAtMs: startsAt.getTime(),
      };

      if (!nextRun || run.startsAtMs < nextRun.startsAtMs) {
        nextRun = run;
      }
    }
  }

  return nextRun;
}

function compareSchedules(a: IrrigationSchedule, b: IrrigationSchedule): number {
  const byProgram = a.program.localeCompare(b.program, "de", { sensitivity: "base" });
  if (byProgram !== 0) return byProgram;
  return normalizeStartTime(a.startTime).localeCompare(normalizeStartTime(b.startTime));
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
  const colors = ["#16a34a", "#7c3aed", "#d97706", "#db2777", "#0284c7", "#e11d48"];
  return colors[(channel - 1) % colors.length] ?? "#60a5fa";
}

function sensorChannelDescriptors(sensors: IrrigationSensor[], zones: IrrigationZone[]): SensorChannelDescriptor[] {
  const channels = new Set<number>();
  for (const sensor of sensors) {
    if (Number.isFinite(sensor.channel) && sensor.channel > 0) {
      channels.add(sensor.channel);
    }
  }
  for (const zone of zones) {
    if (zone.wh52Channel != null && zone.wh52Channel > 0) {
      channels.add(zone.wh52Channel);
    }
  }

  return [...channels].sort((a, b) => a - b).map((channel) => {
    const assignedZones = zones
      .filter((zone) => zone.wh52Channel === channel)
      .sort((a, b) => a.valveNumber - b.valveNumber);

    if (assignedZones.length === 0) {
      return { channel, label: `Kanal ${channel}`, shared: false };
    }

    if (assignedZones.length === 1) {
      const zone = assignedZones[0]!;
      return { channel, label: `V${zone.valveNumber} ${zone.name}`, shared: false };
    }

    const zoneNumbers = assignedZones.map((zone) => `V${zone.valveNumber}`).join("+");
    return { channel, label: `Ch ${channel}: Freifläche / ${zoneNumbers}`, shared: true };
  });
}

function chartTimeLabel(ms: number, days: number): string {
  const date = new Date(ms);
  if (days <= 1) {
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
}

type SensorChartRow = {
  ts: number;
  [key: string]: number | null;
};

function sensorSeriesKey(channel: number): string {
  return `ch${String(channel)}`;
}

function formatChartTooltipLabel(value: number | string): string {
  const ms = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function SensorTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; name?: string; value?: number | null }>;
  label?: number | string;
  unit: string;
}) {
  if (!active || !payload?.length || label == null) return null;
  const values = payload.filter((item) => typeof item.value === "number");
  if (values.length === 0) return null;

  return (
    <div className="rounded-lg border border-border-default bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-text-heading">{formatChartTooltipLabel(label)}</div>
      <div className="space-y-1">
        {values.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2 text-text-secondary">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color ?? "#64748b" }} />
              <span className="max-w-44 truncate">{item.name}</span>
            </span>
            <span className="font-semibold text-text-heading">
              {item.value?.toFixed(unit === "°C" ? 1 : 0)} {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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
  const xMin = Date.now() - days * 24 * 60 * 60 * 1000;
  const xMax = Date.now();

  const rowsByTs = new Map<number, SensorChartRow>();
  for (const sensor of sensors) {
    const value = sensor[field];
    const ms = parseDateMs(sensor.createdAt);
    if (value == null || Number.isNaN(value) || Number.isNaN(ms)) continue;
    if (ms < xMin || ms > xMax) continue;
    const row = rowsByTs.get(ms) ?? { ts: ms };
    row[sensorSeriesKey(sensor.channel)] = value;
    rowsByTs.set(ms, row);
  }
  const rows = [...rowsByTs.values()].sort((a, b) => a.ts - b.ts);
  const channelDescriptors = sensorChannelDescriptors(sensors, zones).filter(
    (descriptor) => rows.some((row) => typeof row[sensorSeriesKey(descriptor.channel)] === "number"),
  );

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-text-heading">{title}</h3>
        <span className="text-sm text-text-secondary">{unit}</span>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 113, 108, 0.22)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={[xMin, xMax]}
              tickFormatter={(value: number) => chartTimeLabel(value, days)}
              tick={{ fill: "#766957", fontSize: 11 }}
              axisLine={{ stroke: "rgba(120, 113, 108, 0.35)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={[min, max]}
              tickFormatter={(value: number) => `${String(Math.round(value))}${unit === "%" ? "%" : ""}`}
              tick={{ fill: "#766957", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip content={<SensorTooltip unit={unit} />} />
            <Legend
              verticalAlign="top"
              align="left"
              height={34}
              iconType="plainline"
              wrapperStyle={{ fontSize: 12, color: "#4b3828" }}
            />
            {channelDescriptors.map(({ channel, label }) => (
              <Line
                key={channel}
                type="monotone"
                dataKey={sensorSeriesKey(channel)}
                name={label}
                stroke={sensorColor(channel)}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
        {channelDescriptors.map(({ channel, label, shared }) => (
          <div key={channel} className="flex items-center gap-2 text-text-secondary">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: sensorColor(channel) }} />
            <span className="truncate">{label}</span>
            {shared && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">geteilt</span>}
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
  const [pendingDeleteSchedule, setPendingDeleteSchedule] = useState<IrrigationSchedule | null>(null);
  const [historyDays, setHistoryDays] = useState(1);
  const [history, setHistory] = useState<IrrigationHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [eventLog, setEventLog] = useState<IrrigationEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [preview, setPreview] = useState<IrrigationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [savingControl, setSavingControl] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

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

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const data = await irrigationRequest<IrrigationEvent[]>("/irrigation/events?limit=200");
      setEventLog(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eventlog konnte nicht geladen werden.");
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "events") {
      void loadEvents();
    }
  }, [activeTab, loadEvents]);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const data = await irrigationRequest<IrrigationPreview>("/irrigation/preview");
      setPreview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Programmvorschau konnte nicht geladen werden.");
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "programs") {
      void loadPreview();
    }
  }, [activeTab, loadPreview]);

  const sensorsByChannel = useMemo(() => {
    const map = new Map<number, IrrigationSensor>();
    for (const sensor of dashboard?.sensors ?? []) {
      map.set(sensor.channel, sensor);
    }
    return map;
  }, [dashboard?.sensors]);
  const sharedSensorChannels = useMemo(() => {
    const counts = new Map<number, number>();
    for (const zone of dashboard?.zones ?? []) {
      if (zone.wh52Channel == null) continue;
      counts.set(zone.wh52Channel, (counts.get(zone.wh52Channel) ?? 0) + 1);
    }
    return counts;
  }, [dashboard?.zones]);

  const valveStates = useMemo(
    () => parseValveStates(dashboard?.status?.valveStates),
    [dashboard?.status?.valveStates],
  );
  const runtime = dashboard?.status?.raw?.runtime;
  const control = preview?.control ?? dashboard?.status?.raw?.control ?? {
    controllerEnabled: true,
    rainDelayUntil: null,
    rainDelayUntilEpoch: 0,
  };
  const runtimeByZone = useMemo(() => {
    const map = new Map<number, IrrigationRuntimeZone>();
    for (const zone of runtime?.zones ?? []) {
      if (zone.zone > 0) map.set(zone.zone, zone);
    }
    return map;
  }, [runtime?.zones]);
  const runtimeQueueLength = runtime?.queueLength ?? 0;
  const runtimeBusy = (runtime?.zones ?? []).some((zone) => zone.state === "running" || zone.state === "queued");
  const online = isStatusOnline(dashboard?.status ?? null);
  const activeCommands = useMemo(() => {
    const byId = new Map<string, IrrigationCommand>();
    for (const command of [...(dashboard?.commands ?? []), ...localCommands]) {
      if (isActiveCommand(command)) byId.set(command.id, command);
    }
    return [...byId.values()].sort((a, b) => commandTime(b) - commandTime(a));
  }, [dashboard?.commands, localCommands]);
  const pendingCount = activeCommands.length;
  const runOnceCommand = activeCommands.find((command) => command.command === "run_once");
  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loadDashboard, pendingCount]);

  const commandByZone = useMemo(() => {
    const map = new Map<number, IrrigationCommand>();
    for (const command of activeCommands) {
      if (command.zoneNumber > 0 && !map.has(command.zoneNumber)) {
        map.set(command.zoneNumber, command);
      }
    }
    return map;
  }, [activeCommands]);
  const schedulesByZone = useMemo(() => {
    const grouped = new Map<string, IrrigationSchedule[]>();
    for (const schedule of dashboard?.schedules ?? []) {
      const list = grouped.get(schedule.zoneId) ?? [];
      list.push(schedule);
      grouped.set(schedule.zoneId, list);
    }
    for (const list of grouped.values()) {
      list.sort(compareSchedules);
    }
    return grouped;
  }, [dashboard?.schedules]);
  const filteredEvents = useMemo(
    () => (eventLog.length > 0 ? eventLog : (dashboard?.events ?? [])).filter((event) => matchesEventFilter(event, eventFilter)),
    [dashboard?.events, eventFilter, eventLog],
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

  const saveControl = async (patch: Partial<IrrigationControl>) => {
    setSavingControl(true);
    try {
      await irrigationRequest<IrrigationControl>("/irrigation/control", {
        method: "PATCH",
        body: JSON.stringify({ ...control, ...patch }),
      });
      await Promise.all([loadDashboard(), loadPreview()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Betriebszustand konnte nicht gespeichert werden.");
    } finally {
      setSavingControl(false);
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
    // M5: validate before sending to the API
    const parsed = ZoneDraftSchema.safeParse(zoneDraft);
    if (!parsed.success) {
      setError(parsed.error.errors.map((e) => e.message).join(", "));
      return;
    }
    setSavingZone(true);
    try {
      await irrigationRequest<IrrigationZone>(`/irrigation/zones/${zone.id}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
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
    // M5: validate before sending to the API
    const parsed = ScheduleDraftSchema.safeParse(scheduleDraft);
    if (!parsed.success) {
      setError(parsed.error.errors.map((e) => e.message).join(", "));
      return;
    }
    setSavingSchedule(true);
    try {
      const path = editingScheduleId === "new" ? "/irrigation/schedules" : `/irrigation/schedules/${editingScheduleId}`;
      const method = editingScheduleId === "new" ? "POST" : "PATCH";
      await irrigationRequest<IrrigationSchedule>(path, {
        method,
        body: JSON.stringify(parsed.data),
      });
      await loadDashboard();
      cancelEditSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zeitplan konnte nicht gespeichert werden.");
    } finally {
      setSavingSchedule(false);
    }
  };

  const deleteSchedule = (schedule: IrrigationSchedule) => {
    setPendingDeleteSchedule(schedule);
  };

  const confirmDeleteSchedule = async () => {
    if (!pendingDeleteSchedule) return;
    const schedule = pendingDeleteSchedule;
    setPendingDeleteSchedule(null);
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 md:gap-4 md:px-6 md:py-6">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border-default bg-surface-elevated p-1 sm:gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:py-2 sm:text-sm ${
              activeTab === tab.id
                ? "bg-primary text-text-on-primary"
                : "text-text-secondary hover:bg-surface-muted hover:text-text-heading"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <Card className="border-status-danger-text bg-status-danger-bg text-status-danger-text">
          {error}
        </Card>
      )}

      {activeTab === "dashboard" && (
        <>
          <section className="grid gap-2 lg:grid-cols-2">
            {(dashboard?.zones ?? []).map((zone) => {
              const sensor = zone.wh52Channel ? sensorsByChannel.get(zone.wh52Channel) : undefined;
              const runtimeZone = runtimeByZone.get(zone.valveNumber);
              const isOpen = runtimeZone?.state === "running" || (valveStates[zone.valveNumber - 1] ?? false);
              const zoneCommand = commandByZone.get(zone.valveNumber);
              const isEditing = editingZoneId === zone.id;
              const draft = isEditing ? zoneDraft : null;
              const nextRun = nextScheduleRunForZone(dashboard?.schedules ?? [], zone.id, new Date(nowMs));
              const nextRunMobileText = nextRun
                ? `${nextRun.label} ${nextRun.time} · ${nextRun.durationMin}m`
                : "kein Programm";
              const nextRunText = nextRun
                ? `${nextRun.label} ${nextRun.time} · ${nextRun.durationMin} min`
                : "kein Programm";
              const hint = planHint(zone, sensor);
              const sharedSensor = zone.wh52Channel != null && (sharedSensorChannels.get(zone.wh52Channel) ?? 0) > 1;
              return (
                <Card
                  key={zone.id}
                  className={`space-y-1.5 p-2 md:space-y-3 md:p-4 ${
                    isOpen ? OPEN_ZONE_CARD_CLASS : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 md:gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className={`truncate font-display text-base font-semibold md:text-lg ${isOpen ? OPEN_ZONE_HEADING_CLASS : "text-text-heading"}`}>{zone.name}</h2>
                        <Badge variant={zone.active ? "success" : "default"}>V{zone.valveNumber}</Badge>
                      </div>
                      <div className={`hidden text-xs sm:mt-0.5 sm:block md:mt-1 ${isOpen ? OPEN_ZONE_MUTED_CLASS : "text-text-secondary"}`}>
                        WH52 Ch {zone.wh52Channel ?? "-"}{sharedSensor ? " geteilt" : ""} · Limit {zone.maxDurationMin} min
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 md:gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="hidden md:inline-flex"
                        onClick={() => startEditZone(zone)}
                        disabled={editingZoneId != null && editingZoneId !== zone.id}
                      >
                        Bearbeiten
                      </Button>
                      <Badge
                        variant={runtimeBadgeVariant(runtimeZone, zoneCommand, isOpen)}
                        className={isOpen ? OPEN_ZONE_BADGE_CLASS : ""}
                      >
                        {zoneCommand ? (zoneCommand.status === "acked" ? "übernommen" : "wartet") : runtimeLabel(runtimeZone?.state)}
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

                  <div className={`grid grid-cols-3 gap-1 rounded-lg px-2 py-1.5 text-xs md:gap-2 md:p-3 md:text-sm ${isOpen ? OPEN_ZONE_PANEL_CLASS : "bg-surface-muted"}`}>
                    <div>
                      <div className={`text-xs ${isOpen ? OPEN_ZONE_MUTED_CLASS : "text-text-secondary"}`}>Feuchte</div>
                      <div className={`font-semibold ${isOpen ? OPEN_ZONE_HEADING_CLASS : "text-text-heading"}`}>
                        <span className="md:hidden">{formatCompactValue(sensor?.soilMoisture, "%", 1)}</span>
                        <span className="hidden md:inline">{formatValue(sensor?.soilMoisture, "%", 1)}</span>
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs ${isOpen ? OPEN_ZONE_MUTED_CLASS : "text-text-secondary"}`}>Temp</div>
                      <div className={`font-semibold ${isOpen ? OPEN_ZONE_HEADING_CLASS : "text-text-heading"}`}>
                        <span className="md:hidden">{formatCompactValue(sensor?.soilTemp, "°C", 1)}</span>
                        <span className="hidden md:inline">{formatValue(sensor?.soilTemp, "°C", 1)}</span>
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs ${isOpen ? OPEN_ZONE_MUTED_CLASS : "text-text-secondary"}`}>EC</div>
                      <div className={`font-semibold ${isOpen ? OPEN_ZONE_HEADING_CLASS : "text-text-heading"}`}>
                        <span className="md:hidden">{formatCompactValue(sensor?.soilEc, "uS")}</span>
                        <span className="hidden md:inline">{formatValue(sensor?.soilEc, "uS")}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs leading-tight md:gap-2 md:text-sm">
                    <span className={isOpen ? OPEN_ZONE_MUTED_CLASS : "text-text-secondary"}>
                      <span className="md:hidden">{nextRunMobileText}</span>
                      <span className="hidden md:inline">Nächster Lauf: {nextRunText}</span>
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
                <Badge variant={pendingCount > 0 || runtimeQueueLength > 0 ? "warning" : "default"}>
                  {runtimeQueueLength > 0 ? `${runtimeQueueLength} Queue` : pendingCount > 0 ? `${pendingCount} wartet` : "keine Befehle"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {IRRIGATION_ZONE_NUMBERS.map((valve) => {
                  const runtimeZone = runtimeByZone.get(valve);
                  const isOpen = runtimeZone?.state === "running" || (valveStates[valve - 1] ?? false);
                  const isQueued = runtimeZone?.state === "queued";
                  const valveCommand = commandByZone.get(valve);
                  return (
                    <span
                      key={valve}
                      className={valveCommand || isQueued ? "font-semibold text-status-warning-text" : isOpen ? "font-semibold text-status-success-text" : "text-text-secondary"}
                    >
                      V{valve} {valveCommand ? "wartet" : runtimeZone?.state === "queued" ? "Queued" : isOpen ? "On" : "Off"}
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
            <h2 className="font-display text-lg font-semibold text-text-heading">Programme</h2>
            <Button size="sm" onClick={startNewSchedule} disabled={!dashboard?.zones.length || editingScheduleId != null}>
              Zeitplan hinzufügen
            </Button>
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <section className="rounded-lg border border-border-default bg-surface-elevated p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-text-heading">Betrieb</h3>
                  <div className="text-xs text-text-secondary">Scheduler und Rain Delay</div>
                </div>
                <Badge variant={control.controllerEnabled && !control.rainDelayUntil ? "success" : "warning"}>
                  {control.controllerEnabled ? (control.rainDelayUntil ? "Rain Delay" : "aktiv") : "gesperrt"}
                </Badge>
              </div>
              {control.rainDelayUntil && (
                <div className="mb-3 rounded-lg bg-status-warning-bg px-3 py-2 text-sm font-medium text-status-warning-text">
                  pausiert bis {formatDateTime(control.rainDelayUntil)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={control.controllerEnabled ? "secondary" : "primary"}
                  disabled={savingControl}
                  onClick={() => void saveControl({ controllerEnabled: !control.controllerEnabled })}
                >
                  {control.controllerEnabled ? "Scheduler sperren" : "Scheduler aktivieren"}
                </Button>
                {[6, 24].map((hours) => (
                  <Button
                    key={hours}
                    size="sm"
                    variant="secondary"
                    disabled={savingControl}
                    onClick={() => {
                      const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
                      void saveControl({ rainDelayUntil: until });
                    }}
                  >
                    Rain {hours}h
                  </Button>
                ))}
                <Button size="sm" variant="secondary" disabled={savingControl || !control.rainDelayUntil} onClick={() => void saveControl({ rainDelayUntil: null })}>
                  Rain aus
                </Button>
              </div>
            </section>

            <section className="rounded-lg border border-border-default bg-surface-elevated p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-text-heading">Vorschau</h3>
                  <div className="text-xs text-text-secondary">Nächste {preview?.days ?? 7} Tage</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void loadPreview()} disabled={loadingPreview}>
                  {loadingPreview ? "Lädt..." : "Aktualisieren"}
                </Button>
              </div>
              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {(preview?.items ?? []).slice(0, 12).map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-lg border border-border-default bg-surface-muted p-2 text-sm md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                    <Badge variant={item.action === "run" ? "success" : "warning"} className="w-fit">
                      {item.action === "run" ? "läuft" : "skip"}
                    </Badge>
                    <div className="min-w-0">
                      <div className="font-semibold text-text-heading">
                        {formatDateTime(item.startsAt)} · V{item.valveNumber} {item.zoneName}
                      </div>
                      <div className="text-xs text-text-secondary">Prog {item.program} · {item.detail}</div>
                    </div>
                    <div className="text-xs font-semibold text-text-secondary md:text-right">
                      {item.action === "run" ? `${item.durationMin} min` : "-"}
                    </div>
                  </div>
                ))}
                {!loadingPreview && (preview?.items.length ?? 0) === 0 && (
                  <div className="rounded-lg border border-dashed border-border-default bg-surface-muted p-3 text-sm text-text-secondary">
                    Keine geplanten Läufe in der Vorschau.
                  </div>
                )}
              </div>
            </section>
          </div>

          {scheduleDraft && (
            <div className="mb-4 rounded-lg border border-border-default bg-surface-muted p-3">
              <div className="grid gap-3 md:grid-cols-6">
                <label className="md:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-text-secondary">Zone</span>
                  {editingScheduleId === "new" ? (
                    <select className={INPUT_CLASS} value={scheduleDraft.zoneId} onChange={(event) => updateScheduleDraft("zoneId", event.target.value)}>
                      {(dashboard?.zones ?? []).map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          V{zone.valveNumber} {zone.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-lg border border-border-strong bg-surface-muted px-3 py-2 text-sm text-text-secondary">
                      {zoneNameById(dashboard?.zones ?? [], scheduleDraft.zoneId)}
                    </div>
                  )}
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

          <div className="grid gap-3 lg:grid-cols-2">
            {(dashboard?.zones ?? []).map((zone) => {
              const schedules = schedulesByZone.get(zone.id) ?? [];
              const sharedSensor = zone.wh52Channel != null && (sharedSensorChannels.get(zone.wh52Channel) ?? 0) > 1;
              return (
                <section key={zone.id} className="rounded-lg border border-border-default bg-surface-elevated p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-border-default pb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-display text-base font-semibold text-text-heading">{zone.name}</h3>
                        <Badge variant={zone.active ? "success" : "default"}>V{zone.valveNumber}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-text-secondary">
                        WH52 Ch {zone.wh52Channel ?? "-"}{sharedSensor ? " geteilt" : ""} · Limit {zone.maxDurationMin} min
                      </div>
                    </div>
                    <Badge variant={schedules.length > 0 ? "success" : "default"}>
                      {schedules.length > 0 ? `${schedules.length} ${schedules.length === 1 ? "Plan" : "Pläne"}` : "kein Plan"}
                    </Badge>
                  </div>

                  {schedules.length > 0 ? (
                    <div className="space-y-2">
                      {schedules.map((schedule) => (
                        <div key={schedule.id} className="rounded-lg border border-border-default bg-surface-muted p-2 md:p-3">
                          <div className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-3">
                            <Badge variant={schedule.active ? "success" : "default"} className="w-fit">{schedule.active ? "aktiv" : "inaktiv"}</Badge>
                            <div className="min-w-0">
                              <div className="font-semibold text-text-heading">Programm {schedule.program}</div>
                              <div className="text-sm text-text-secondary">
                                Start {normalizeStartTime(schedule.startTime)} · Dauer {schedule.durationMin} min
                              </div>
                              <div className="text-sm text-text-secondary">Wochentage: {weekdayText(schedule.weekdays)}</div>
                            </div>
                            <div className="flex flex-wrap gap-2 md:justify-end">
                              <Button size="sm" variant="secondary" onClick={() => startEditSchedule(schedule)} disabled={editingScheduleId != null}>
                                Bearbeiten
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => void deleteSchedule(schedule)} disabled={savingSchedule}>
                                Löschen
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border-default bg-surface-muted p-3 text-sm text-text-secondary">
                      Für diese Zone ist noch kein Zeitplan angelegt.
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end border-t border-border-default pt-4">
            <Button size="sm" variant="secondary" onClick={exportConfig} disabled={!dashboard}>
              Konfiguration exportieren
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "manual" && (
        <div className="space-y-2 md:space-y-3">
          <section className="grid gap-1.5 lg:grid-cols-2">
            {(dashboard?.zones ?? []).map((zone) => {
              const runtimeZone = runtimeByZone.get(zone.valveNumber);
              const isOpen = runtimeZone?.state === "running" || (valveStates[zone.valveNumber - 1] ?? false);
              const zoneCommand = commandByZone.get(zone.valveNumber);
              const commandKey = `open-${String(zone.valveNumber)}`;
              const closeKey = `close-${String(zone.valveNumber)}`;
              const remainingMs = runtimeRemainingMs(runtimeZone) ?? remainingRunMs(
                  zone.valveNumber,
                  [...(dashboard?.events ?? []), ...eventLog],
                  zoneCommand,
                  nowMs,
                );
              return (
                <Card
                  key={zone.id}
                  className={`space-y-1.5 p-2 md:space-y-2 md:p-3 ${
                    isOpen ? OPEN_ZONE_CARD_CLASS : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 md:gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className={`truncate font-display text-sm font-semibold sm:text-lg ${isOpen ? OPEN_ZONE_HEADING_CLASS : "text-text-heading"}`}>{zone.name}</h2>
                        <Badge variant={zone.active ? "success" : "default"}>V{zone.valveNumber}</Badge>
                      </div>
                      <div className={`hidden text-xs sm:mt-1 sm:block ${isOpen ? OPEN_ZONE_MUTED_CLASS : "text-text-secondary"}`}>Max {zone.maxDurationMin} min</div>
                    </div>
                    <Badge
                      variant={runtimeBadgeVariant(runtimeZone, zoneCommand, isOpen)}
                      className={isOpen ? OPEN_ZONE_BADGE_CLASS : ""}
                    >
                      {zoneCommand ? (zoneCommand.status === "acked" ? "übernommen" : "wartet") : runtimeLabel(runtimeZone?.state)}
                    </Badge>
                  </div>
                  {zoneCommand && (
                    <div className="rounded-lg bg-status-warning-bg px-2 py-1 text-xs font-medium text-status-warning-text md:px-3 md:py-2 md:text-sm">
                      {commandLabel(zoneCommand)}
                    </div>
                  )}
                  {isOpen && remainingMs != null && (
                    <div className="rounded-lg bg-status-success-bg px-2 py-1 text-xs font-semibold text-status-success-text md:px-3 md:py-2 md:text-sm">
                      Restlaufzeit {formatRemaining(remainingMs)}
                    </div>
                  )}
                  {runtimeZone?.state === "queued" && remainingMs != null && (
                    <div className="rounded-lg bg-status-warning-bg px-2 py-1 text-xs font-semibold text-status-warning-text md:px-3 md:py-2 md:text-sm">
                      Wartet in Queue · Dauer {formatRemaining(remainingMs)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 md:gap-2">
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
          <Card className="space-y-2 p-2 md:p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-text-heading sm:text-lg">Testlauf</h2>
                <div className="text-xs text-text-secondary">Alle aktiven Zonen nacheinander</div>
              </div>
              <Badge variant={runtimeQueueLength > 0 || runOnceCommand ? "warning" : "default"}>
                {runtimeQueueLength > 0 ? `${runtimeQueueLength} Queue` : runOnceCommand ? "wartet" : "bereit"}
              </Badge>
            </div>
            {runOnceCommand && (
              <div className="rounded-lg bg-status-warning-bg px-2 py-1 text-xs font-medium text-status-warning-text md:px-3 md:py-2 md:text-sm">
                {commandLabel(runOnceCommand)}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              {QUICK_TEST_SECONDS.map((durationSec) => (
                <Button
                  key={durationSec}
                  size="sm"
                  variant="secondary"
                  disabled={pendingCommand != null || runOnceCommand != null || runtimeBusy}
                  onClick={() =>
                    void sendCommand({
                      command: "run_once",
                      zoneNumber: 0,
                      durationMin: durationSec,
                    })
                  }
                >
                  {pendingCommand === "run_once-0" ? "Sendet..." : `${durationSec} s`}
                </Button>
              ))}
            </div>
          </Card>
          <div className="flex justify-end pt-1">
            <Button
              variant="danger"
              onClick={() => void sendCommand({ command: "close_all", zoneNumber: 0 })}
              disabled={pendingCommand != null}
            >
              Alle stoppen
            </Button>
          </div>
        </div>
      )}

      {activeTab === "events" && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-text-heading">Eventlog</h2>
              <p className="text-sm text-text-secondary">Gefilterte Ereignisse vom ESP und Scheduler.</p>
            </div>
            <div className="flex items-center gap-2">
              {loadingEvents && <span className="text-xs text-text-secondary">lädt...</span>}
              <Button size="sm" variant="secondary" onClick={() => void loadEvents()} disabled={loadingEvents}>
                Aktualisieren
              </Button>
            </div>
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
          <div className="hidden grid-cols-[110px_90px_minmax(150px,1fr)_100px_80px] gap-3 border-b border-border-default pb-2 text-xs font-semibold text-text-secondary md:grid">
            <span>Datum Uhrzeit</span>
            <span>Aktion</span>
            <span>Zone</span>
            <span>Trigger</span>
            <span>Dauer</span>
          </div>
          <div className="divide-y divide-dashed divide-border-default">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className="py-2 text-sm md:grid md:grid-cols-[110px_90px_minmax(150px,1fr)_100px_80px] md:gap-3"
              >
                <div className="flex min-w-0 items-center gap-2 md:contents">
                  <span className="shrink-0 text-xs text-text-secondary md:text-sm">{formatDateTime(event.createdAt)}</span>
                  <span className="shrink-0 font-semibold text-text-heading">{eventLabel(event.action)}</span>
                  <span className="min-w-0 truncate text-text-primary">{eventZoneText(event, dashboard?.zones ?? [])}</span>
                  <span className="hidden text-text-secondary md:inline">{eventTriggerText(event.reason)}</span>
                  <span className="hidden text-text-secondary md:inline">{eventDurationText(event)}</span>
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-text-secondary md:hidden">
                  <span>{eventTriggerText(event.reason)}</span>
                  <span>{eventDurationText(event)}</span>
                  {event.detail && <span className="min-w-0 truncate text-text-muted">{event.detail}</span>}
                </div>
                {event.detail && (
                  <span className="hidden text-xs text-text-muted md:col-start-3 md:col-span-3 md:block">{event.detail}</span>
                )}
              </div>
            ))}
            {dashboard && filteredEvents.length === 0 && (
              <div className="py-4 text-sm text-text-secondary">
                {(eventLog.length > 0 ? eventLog : dashboard.events).length === 0 ? "Noch keine Events vorhanden." : "Keine Events passen zum Filter."}
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

      <ConfirmModal
        isOpen={pendingDeleteSchedule !== null}
        title="Zeitplan löschen"
        message={`Zeitplan "${pendingDeleteSchedule?.program ?? ""} – ${pendingDeleteSchedule?.startTime ?? ""}" wirklich löschen?`}
        confirmLabel="Löschen"
        variant="danger"
        isLoading={savingSchedule}
        onConfirm={() => { void confirmDeleteSchedule(); }}
        onCancel={() => setPendingDeleteSchedule(null)}
      />
    </div>
  );
}
