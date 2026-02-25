import { describe, it, expect, beforeEach } from "vitest";
import {
  loadKnowledgeBase,
  searchKnowledge,
  getBySpecies,
  getCompanions,
  clearKnowledgeBaseCache,
} from "./knowledgeBase.ts";

beforeEach(() => {
  clearKnowledgeBaseCache();
});

describe("loadKnowledgeBase", () => {
  it("loads and validates all plant data", () => {
    const plants = loadKnowledgeBase();
    expect(plants.length).toBeGreaterThanOrEqual(70);
  });

  it("returns cached data on second call", () => {
    const first = loadKnowledgeBase();
    const second = loadKnowledgeBase();
    expect(first).toBe(second); // same reference
  });

  it("includes plants from all categories", () => {
    const plants = loadKnowledgeBase();
    const types = new Set(plants.map((p) => p.plantType));
    expect(types).toContain("vegetable");
    expect(types).toContain("herb");
    expect(types).toContain("flower");
    expect(types).toContain("fruit_tree");
    expect(types).toContain("berry");
  });
});

describe("searchKnowledge", () => {
  it("finds plants by common name", () => {
    const results = searchKnowledge("tomato");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((p) => p.commonName.toLowerCase().includes("tomato")))
      .toBe(true);
  });

  it("finds plants by species", () => {
    const results = searchKnowledge("Solanum lycopersicum");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("finds plants by variety", () => {
    const results = searchKnowledge("Cherry");
    expect(results.some((p) => p.variety?.toLowerCase().includes("cherry")))
      .toBe(true);
  });

  it("is case-insensitive", () => {
    const lower = searchKnowledge("basil");
    const upper = searchKnowledge("BASIL");
    expect(lower.length).toBe(upper.length);
    expect(lower.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for no match", () => {
    const results = searchKnowledge("xyznonexistent");
    expect(results).toEqual([]);
  });
});

describe("getBySpecies", () => {
  it("returns a plant by exact species match", () => {
    const plant = getBySpecies("Ocimum basilicum");
    expect(plant).toBeDefined();
    expect(plant?.commonName).toBe("Basil");
  });

  it("is case-insensitive", () => {
    const plant = getBySpecies("ocimum basilicum");
    expect(plant).toBeDefined();
  });

  it("returns undefined for unknown species", () => {
    const plant = getBySpecies("Nonexistus plantus");
    expect(plant).toBeUndefined();
  });
});

describe("getCompanions", () => {
  it("returns good and bad companions", () => {
    const companions = getCompanions("Solanum lycopersicum");
    expect(companions.good.length).toBeGreaterThan(0);
    expect(companions.bad.length).toBeGreaterThan(0);
  });

  it("returns empty arrays for unknown species", () => {
    const companions = getCompanions("Nonexistus plantus");
    expect(companions).toEqual({ good: [], bad: [] });
  });

  it("returns empty bad array when plant has no bad companions", () => {
    // Spinach typically has no bad companions in our data
    const companions = getCompanions("Spinacia oleracea");
    expect(companions.good.length).toBeGreaterThan(0);
    expect(companions.bad).toEqual([]);
  });
});
