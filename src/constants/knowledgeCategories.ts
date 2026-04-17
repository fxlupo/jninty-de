import type { PlantType } from "../types/index.ts";

export interface PlantCategory {
  slug: string;
  label: string;
  description: string;
  /** Which plantType values belong in this category */
  plantTypes: PlantType[];
}

/** Top-level knowledge sections (plants now, diseases/techniques later) */
export interface KnowledgeSection {
  slug: string;
  label: string;
  description: string;
  route: string;
}

export const PLANT_CATEGORIES: PlantCategory[] = [
  {
    slug: "blumen",
    label: "Blumen",
    description: "Einjährige und mehrjährige Blütenpflanzen",
    plantTypes: ["flower"],
  },
  {
    slug: "zierpflanzen",
    label: "Zierpflanzen",
    description: "Ornamentale Pflanzen und Ziergräser",
    plantTypes: ["ornamental"],
  },
  {
    slug: "straeucher",
    label: "Sträucher",
    description: "Sträucher, Hecken und Gehölze",
    plantTypes: ["shrub", "hedge"],
  },
  {
    slug: "obstbaum",
    label: "Obstbaum",
    description: "Obstbäume, Beerensträucher und Kletterfrüchte",
    plantTypes: ["fruit_tree", "berry"],
  },
  {
    slug: "gemuese-kraeuter",
    label: "Gemüse/Kräuter",
    description: "Gemüse, Salate, Kräuter und Heilpflanzen",
    plantTypes: ["vegetable", "herb"],
  },
  {
    slug: "sonstiges",
    label: "Sonstiges",
    description: "Alle übrigen Pflanzen",
    plantTypes: ["other"],
  },
];

/** All top-level knowledge sections. Add diseases, techniques, etc. here later. */
export const ALL_KNOWLEDGE_SECTIONS: KnowledgeSection[] = [
  {
    slug: "plants",
    label: "Pflanzen",
    description: "Pflanzenarten und Sorten durchsuchen",
    route: "/knowledge",
  },
];

export function getCategoryBySlug(slug: string): PlantCategory | undefined {
  return PLANT_CATEGORIES.find((c) => c.slug === slug);
}
