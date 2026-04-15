import type {
  PlantType,
  PlantSource,
  PlantStatus,
} from "../types/index.ts";
import type {
  ActivityType,
  MilestoneType,
} from "../validation/journalEntry.schema.ts";

// ─── Badge variant type (matches Badge component) ───

export type BadgeVariant = "default" | "success" | "warning" | "danger";

// ─── Label maps ───

export const TYPE_LABELS: Record<PlantType, string> = {
  vegetable: "Gemuese",
  herb: "Kraeuter",
  flower: "Blume",
  ornamental: "Zierpflanze",
  fruit_tree: "Obstbaum",
  berry: "Beere",
  other: "Sonstiges",
};

export const STATUS_LABELS: Record<PlantStatus, string> = {
  active: "Aktiv",
  dormant: "Ruhend",
  harvested: "Geerntet",
  removed: "Entfernt",
  dead: "Abgestorben",
};

export const SOURCE_LABELS: Record<PlantSource, string> = {
  seed: "Saatgut",
  nursery: "Gaertnerei",
  cutting: "Steckling",
  gift: "Geschenk",
  unknown: "Unbekannt",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  watering: "Giessen",
  fertilizing: "Duengen",
  pruning: "Rueckschnitt",
  pest: "Schaedlinge",
  disease: "Krankheit",
  harvest: "Ernte",
  transplant: "Umpflanzen",
  milestone: "Meilenstein",
  general: "Allgemein",
};

// ─── Badge variant maps ───

export const STATUS_VARIANT: Record<PlantStatus, BadgeVariant> = {
  active: "success",
  dormant: "warning",
  harvested: "default",
  removed: "danger",
  dead: "danger",
};

// ─── Option arrays for forms and filters ───

export const ALL_TYPES: PlantType[] = [
  "vegetable",
  "herb",
  "flower",
  "ornamental",
  "fruit_tree",
  "berry",
  "other",
];

export const ALL_STATUSES: PlantStatus[] = [
  "active",
  "dormant",
  "harvested",
  "removed",
  "dead",
];

export const TYPE_OPTIONS: { value: PlantType; label: string }[] =
  ALL_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }));

export const SOURCE_OPTIONS: { value: PlantSource; label: string }[] = [
  { value: "seed", label: "Saatgut" },
  { value: "nursery", label: "Gaertnerei" },
  { value: "cutting", label: "Steckling" },
  { value: "gift", label: "Geschenk" },
  { value: "unknown", label: "Unbekannt" },
];

export const STATUS_OPTIONS: { value: PlantStatus; label: string }[] =
  ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

// ─── Activity type arrays ───

export const ALL_ACTIVITY_TYPES: ActivityType[] = [
  "watering",
  "fertilizing",
  "pruning",
  "pest",
  "disease",
  "harvest",
  "transplant",
  "milestone",
  "general",
];

export const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] =
  ALL_ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_LABELS[t] }));

// ─── Milestone labels ───

export const MILESTONE_LABELS: Record<MilestoneType, string> = {
  first_sprout: "Erster Keimling",
  first_flower: "Erste Bluete",
  first_fruit: "Erste Frucht",
  peak_harvest: "Haupternte",
  other: "Sonstiges",
};

export const ALL_MILESTONE_TYPES: MilestoneType[] = [
  "first_sprout",
  "first_flower",
  "first_fruit",
  "peak_harvest",
  "other",
];

export const MILESTONE_OPTIONS: { value: MilestoneType; label: string }[] =
  ALL_MILESTONE_TYPES.map((m) => ({ value: m, label: MILESTONE_LABELS[m] }));
