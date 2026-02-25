import { plantKnowledgeSchema } from "../validation/plantKnowledge.schema.ts";
import type { PlantKnowledge } from "../validation/plantKnowledge.schema.ts";
import { z } from "zod";

import vegetablesData from "../../data/plants/vegetables.json";
import herbsData from "../../data/plants/herbs.json";
import fruitsData from "../../data/plants/fruits.json";
import flowersData from "../../data/plants/flowers.json";

// ─── Schema for the full JSON array ───

const plantKnowledgeArraySchema = z.array(plantKnowledgeSchema);

// ─── Module-level cache ───

let cache: PlantKnowledge[] | null = null;

// ─── Public API ───

/**
 * Loads and validates all plant knowledge JSON files.
 * Results are cached after the first call.
 * Throws if any entry fails Zod validation.
 */
export function loadKnowledgeBase(): PlantKnowledge[] {
  if (cache) return cache;

  const vegetables = plantKnowledgeArraySchema.parse(vegetablesData);
  const herbs = plantKnowledgeArraySchema.parse(herbsData);
  const fruits = plantKnowledgeArraySchema.parse(fruitsData);
  const flowers = plantKnowledgeArraySchema.parse(flowersData);

  cache = [...vegetables, ...herbs, ...fruits, ...flowers];
  return cache;
}

/**
 * Searches the knowledge base by species, variety, or common name.
 * Case-insensitive substring match.
 */
export function searchKnowledge(query: string): PlantKnowledge[] {
  const plants = loadKnowledgeBase();
  const q = query.toLowerCase();

  return plants.filter(
    (p) =>
      p.species.toLowerCase().includes(q) ||
      p.commonName.toLowerCase().includes(q) ||
      (p.variety && p.variety.toLowerCase().includes(q)),
  );
}

/**
 * Returns the first plant matching the given species exactly (case-insensitive).
 */
export function getBySpecies(species: string): PlantKnowledge | undefined {
  const plants = loadKnowledgeBase();
  const s = species.toLowerCase();
  return plants.find((p) => p.species.toLowerCase() === s);
}

/**
 * Returns companion planting data for a given species.
 */
export function getCompanions(species: string): {
  good: string[];
  bad: string[];
} {
  const plant = getBySpecies(species);
  if (!plant) return { good: [], bad: [] };
  return {
    good: plant.goodCompanions ?? [],
    bad: plant.badCompanions ?? [],
  };
}

/**
 * Clears the cached knowledge base (useful for testing).
 */
export function clearKnowledgeBaseCache(): void {
  cache = null;
}
