import type { SunExposure, WaterNeeds, GrowthRate } from "../validation/plantKnowledge.schema.ts";
import type { KnowledgeSource } from "../services/knowledgeBaseTypes.ts";

// ─── Human-readable label maps ───

export const SUN_LABELS: Record<SunExposure, string> = {
  full_sun: "Volle Sonne",
  partial_shade: "Halbschatten",
  full_shade: "Voller Schatten",
};

export const WATER_LABELS: Record<WaterNeeds, string> = {
  low: "Wenig",
  moderate: "Mittel",
  high: "Hoch",
};

export const GROWTH_RATE_LABELS: Record<GrowthRate, string> = {
  slow: "Langsam",
  moderate: "Mittel",
  fast: "Schnell",
};

export const SOURCE_LABELS: Record<KnowledgeSource, string> = {
  builtin: "Integriert",
  custom: "Benutzerdefiniert",
};

// ─── Option arrays for form selects ───

export const SUN_OPTIONS: { value: SunExposure; label: string }[] = [
  { value: "full_sun", label: "Volle Sonne" },
  { value: "partial_shade", label: "Halbschatten" },
  { value: "full_shade", label: "Voller Schatten" },
];

export const WATER_OPTIONS: { value: WaterNeeds; label: string }[] = [
  { value: "low", label: "Wenig" },
  { value: "moderate", label: "Mittel" },
  { value: "high", label: "Hoch" },
];

export const GROWTH_RATE_OPTIONS: { value: GrowthRate; label: string }[] = [
  { value: "slow", label: "Langsam" },
  { value: "moderate", label: "Mittel" },
  { value: "fast", label: "Schnell" },
];
