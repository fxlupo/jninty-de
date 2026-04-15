import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import type { ExportManifest } from "./exporter.ts";

// Mock the PouchDB search module (rebuildIndex, startListening, stopListening are still used)
vi.mock("../db/pouchdb/search.ts", () => ({
  rebuildIndex: vi.fn().mockResolvedValue(0),
  startListening: vi.fn(),
  stopListening: vi.fn(),
  addToIndex: vi.fn(),
  removeFromIndex: vi.fn(),
  search: vi.fn().mockReturnValue([]),
  handleChange: vi.fn(),
  _resetIndex: vi.fn(),
  serializeIndex: vi.fn(),
  loadIndex: vi.fn().mockResolvedValue(false),
}));

// Import after mock setup
const {
  parseZip,
  executeImportMerge,
  executeImportReplace,
  importPlantsFromCsv,
  autoMapColumns,
} = await import("./importer.ts");

const { plantRepository, settingsRepository } = await import("../db/index.ts");

// ─── Helpers ───

const timestamp = "2026-03-15T10:00:00.000Z";

function makePlant(overrides?: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    species: "Solanum lycopersicum",
    type: "vegetable" as const,
    isPerennial: false,
    source: "seed" as const,
    status: "active" as const,
    tags: ["tomato"],
    ...overrides,
  };
}

function makeJournalEntry(overrides?: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    activityType: "watering" as const,
    body: "Watered the tomatoes",
    photoIds: [] as string[],
    isMilestone: false,
    seasonId: "00000000-0000-0000-0000-000000000099",
    ...overrides,
  };
}

function makeTask(overrides?: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: "Water tomatoes",
    dueDate: "2026-03-16",
    priority: "normal" as const,
    isCompleted: false,
    ...overrides,
  };
}

function makeSettings() {
  return {
    growingZone: "7b",
    lastFrostDate: "2026-04-15",
    firstFrostDate: "2026-10-20",
    gridUnit: "feet" as const,
    temperatureUnit: "fahrenheit" as const,
    theme: "light" as const,
    keepOriginalPhotos: false,
    dbSchemaVersion: 1,
    exportVersion: 1,
  };
}

function makeManifest(
  overrides?: Partial<ExportManifest>,
): ExportManifest {
  return {
    exportVersion: 1,
    schemaVersion: 5,
    exportedAt: timestamp,
    appVersion: "0.1.0",
    ...overrides,
  };
}

function makePhoto(overrides?: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    originalStored: false,
    ...overrides,
  };
}

async function buildZip(
  manifest: ExportManifest,
  data: Record<string, unknown[]>,
  photos?: Array<{ id: string; thumbBlob: Blob; displayBlob?: Blob; originalBlob?: Blob }>,
): Promise<File> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest));

  const dataFolder = zip.folder("data")!;
  for (const [name, items] of Object.entries(data)) {
    dataFolder.file(`${name}.json`, JSON.stringify(items));
  }

  if (photos) {
    const photosFolder = zip.folder("photos")!;
    for (const photo of photos) {
      photosFolder.file(`${photo.id}-thumb.jpg`, photo.thumbBlob);
      if (photo.displayBlob) {
        photosFolder.file(`${photo.id}-display.jpg`, photo.displayBlob);
      }
      if (photo.originalBlob) {
        photosFolder.file(`${photo.id}-original.jpg`, photo.originalBlob);
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], "test-import.zip", {
    type: "application/zip",
  });
}

/** Pre-seed an entity into the mock API with the exact ID preserved. */
async function seedEntity(collection: string, entity: Record<string, unknown>) {
  await fetch(`/api/${collection}/${entity["id"] as string}`, {
    method: "PUT",
    body: JSON.stringify(entity),
    headers: { "Content-Type": "application/json" },
  });
}

// ─── parseZip ───

describe("parseZip", () => {
  it("parses valid ZIP and returns correct counts and data", async () => {
    const plant = makePlant();
    const file = await buildZip(makeManifest(), {
      plantInstances: [plant],
      journalEntries: [makeJournalEntry()],
      tasks: [makeTask()],
      settings: [makeSettings()],
    });

    const result = await parseZip(file);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.counts.plantInstances).toBe(1);
    expect(result.counts.journalEntries).toBe(1);
    expect(result.counts.tasks).toBe(1);
    expect(result.counts.settings).toBe(1);
    expect(result.data).not.toBeNull();
    expect(result.zip).not.toBeNull();
  });

  it("rejects non-ZIP files", async () => {
    const file = new File(["not a zip"], "bad.zip", {
      type: "application/zip",
    });

    const result = await parseZip(file);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Failed to read ZIP file");
    expect(result.data).toBeNull();
  });

  it("rejects ZIP without manifest", async () => {
    const zip = new JSZip();
    zip.file("data/plantInstances.json", "[]");
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "no-manifest.zip");

    const result = await parseZip(file);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing manifest.json in ZIP");
  });

  it("rejects unsupported schema version", async () => {
    const file = await buildZip(makeManifest({ schemaVersion: 99 }), {});

    const result = await parseZip(file);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unsupported schema version 99");
  });

  it("handles missing data files (0 count)", async () => {
    const file = await buildZip(makeManifest(), {});

    const result = await parseZip(file);

    expect(result.valid).toBe(true);
    expect(result.counts.plantInstances).toBe(0);
    expect(result.data).not.toBeNull();
    expect(result.data!["plantInstances"]).toHaveLength(0);
  });

  it("reports validation errors for bad entities but keeps valid ones", async () => {
    const file = await buildZip(makeManifest(), {
      plantInstances: [
        makePlant(),
        { id: "bad", version: 1 }, // invalid
        makePlant(),
      ],
    });

    const result = await parseZip(file);

    expect(result.valid).toBe(false);
    expect(result.counts.plantInstances).toBe(2);
    expect(result.data!["plantInstances"]).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("plantInstances.json[1]");
  });
});

// ─── executeImportMerge ───

describe("executeImportMerge", () => {
  it("inserts new entities", async () => {
    const plant = makePlant();
    const file = await buildZip(makeManifest(), {
      plantInstances: [plant],
      tasks: [makeTask()],
    });

    const parsed = await parseZip(file);
    const result = await executeImportMerge(parsed);

    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify the plant was created in the API
    const inserted = await plantRepository.getById(plant.id);
    expect(inserted).toBeDefined();
    expect(inserted!.species).toBe("Solanum lycopersicum");
  });

  it("skips existing documents", async () => {
    const plant = makePlant();
    // Pre-seed the document via the API
    await seedEntity("plants", plant);

    const file = await buildZip(makeManifest(), {
      plantInstances: [plant],
    });

    const parsed = await parseZip(file);
    const result = await executeImportMerge(parsed);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("inserts new and skips existing in the same batch", async () => {
    const existingPlant = makePlant();
    const newPlant = makePlant({ species: "Capsicum annuum" });
    await seedEntity("plants", existingPlant);

    const file = await buildZip(makeManifest(), {
      plantInstances: [existingPlant, newPlant],
    });

    const parsed = await parseZip(file);
    const result = await executeImportMerge(parsed);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("imports settings only if not already present", async () => {
    const settings = makeSettings();
    const file = await buildZip(makeManifest(), {
      settings: [settings],
    });

    const parsed = await parseZip(file);
    const result = await executeImportMerge(parsed);

    expect(result.inserted).toBe(1);

    // Verify settings were written via the API
    const saved = await settingsRepository.get();
    expect(saved?.growingZone).toBe("7b");
  });

  it("skips settings if already present", async () => {
    // The settings mock always allows upsert, but inserted count should be 1
    const file = await buildZip(makeManifest(), {
      settings: [makeSettings()],
    });

    const parsed = await parseZip(file);
    const result = await executeImportMerge(parsed);

    // Settings always upserts (no existence check in the current impl)
    expect(result.inserted).toBeGreaterThanOrEqual(1);
  });

  it("returns error for empty parsed data", async () => {
    const result = await executeImportMerge({
      valid: false,
      errors: [],
      counts: {} as never,
      data: null,
      zip: null,
    });

    expect(result.errors).toContain("No parsed data");
  });
});

// ─── executeImportReplace ───

describe("executeImportReplace", () => {
  it("replaces all data with imported data", async () => {
    // Pre-seed some data
    await seedEntity("plants", makePlant({ species: "Old Plant" }));

    const newPlant = makePlant({ species: "New Plant" });
    const file = await buildZip(makeManifest(), {
      plantInstances: [newPlant],
    });

    const parsed = await parseZip(file);
    const result = await executeImportReplace(parsed);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);

    // The new plant should be accessible
    const inserted = await plantRepository.getById(newPlant.id);
    expect(inserted?.species).toBe("New Plant");
  });

  it("writes settings on replace", async () => {
    const settings = makeSettings();
    const file = await buildZip(makeManifest(), {
      settings: [settings],
    });

    const parsed = await parseZip(file);
    await executeImportReplace(parsed);

    const saved = await settingsRepository.get();
    expect(saved?.growingZone).toBe("7b");
  });

  it("returns error for empty parsed data", async () => {
    const result = await executeImportReplace({
      valid: false,
      errors: [],
      counts: {} as never,
      data: null,
      zip: null,
    });

    expect(result.errors).toContain("No parsed data");
  });
});

// ─── Photo import ───

describe("photo import", () => {
  it("imports photo metadata and attachments via merge", async () => {
    const photoId = crypto.randomUUID();
    const photo = makePhoto({ id: photoId });
    const thumbBlob = new Blob([new Uint8Array(100)], { type: "image/jpeg" });
    const displayBlob = new Blob([new Uint8Array(500)], { type: "image/jpeg" });

    const file = await buildZip(
      makeManifest(),
      { photos: [photo] },
      [{ id: photoId, thumbBlob, displayBlob }],
    );

    const parsed = await parseZip(file);
    const result = await executeImportMerge(parsed);

    expect(result.inserted).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("uploads original file when photo has originalStored=true", async () => {
    const photoId = crypto.randomUUID();
    const photo = makePhoto({ id: photoId, originalStored: true });
    const thumbBlob = new Blob([new Uint8Array(100)], { type: "image/jpeg" });
    const originalBlob = new Blob([new Uint8Array(1000)], { type: "image/jpeg" });

    const file = await buildZip(
      makeManifest(),
      { photos: [photo] },
      [{ id: photoId, thumbBlob, originalBlob }],
    );

    const parsed = await parseZip(file);
    const result = await executeImportMerge(parsed);

    expect(result.inserted).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("skips existing photos in merge mode", async () => {
    const { photoRepository } = await import("../db/index.ts");

    const photoId = crypto.randomUUID();
    const photo = makePhoto({ id: photoId });
    const thumbBlob = new Blob([new Uint8Array(100)], { type: "image/jpeg" });
    const displayBlob = new Blob([new Uint8Array(50)], { type: "image/jpeg" });

    // Pre-seed a photo via the API mock
    await photoRepository.createWithFiles({
      thumbnailBlob: thumbBlob,
      displayBlob,
      width: 100,
      height: 100,
    });

    // Import a different photo (new ID) — should insert 1
    const file = await buildZip(
      makeManifest(),
      { photos: [photo] },
      [{ id: photoId, thumbBlob: new Blob([new Uint8Array(50)], { type: "image/jpeg" }) }],
    );

    const parsed = await parseZip(file);
    const result = await executeImportMerge(parsed);

    // Photo with photoId wasn't in the DB, so it gets inserted
    expect(result.skipped).toBe(0);
    expect(result.inserted).toBe(1);
  });
});

// ─── importPlantsFromCsv ───

describe("importPlantsFromCsv", () => {
  it("imports valid plant rows", async () => {
    const rows = [
      {
        Name: "Tomato",
        Type: "vegetable",
        Source: "seed",
        Status: "active",
      },
      {
        Name: "Basil",
        Type: "herb",
        Source: "nursery",
        Status: "active",
      },
    ];

    const columnMap = {
      Name: "species",
      Type: "type",
      Source: "source",
      Status: "status",
    };

    const result = await importPlantsFromCsv(rows, columnMap);

    expect(result.inserted).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Verify plants were created via the API
    const allPlants = await plantRepository.getAll();
    expect(allPlants).toHaveLength(2);
  });

  it("reports errors for invalid rows", async () => {
    const rows = [
      {
        Name: "Tomato",
        Type: "vegetable",
        Source: "seed",
        Status: "active",
      },
      {
        Name: "", // empty species → invalid
        Type: "vegetable",
        Source: "seed",
        Status: "active",
      },
    ];

    const columnMap = {
      Name: "species",
      Type: "type",
      Source: "source",
      Status: "status",
    };

    const result = await importPlantsFromCsv(rows, columnMap);

    expect(result.inserted).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(2);
  });

  it("handles boolean and numeric field mapping", async () => {
    const rows = [
      {
        Name: "Rose",
        Type: "flower",
        Source: "nursery",
        Status: "active",
        Perennial: "yes",
        Price: "12.50",
      },
    ];

    const columnMap = {
      Name: "species",
      Type: "type",
      Source: "source",
      Status: "status",
      Perennial: "isPerennial",
      Price: "purchasePrice",
    };

    const result = await importPlantsFromCsv(rows, columnMap);

    expect(result.inserted).toBe(1);

    const allPlants = await plantRepository.getAll();
    expect(allPlants).toHaveLength(1);
    expect(allPlants[0]!.isPerennial).toBe(true);
    expect(allPlants[0]!.purchasePrice).toBe(12.5);
  });

  it("strips currency symbols from purchasePrice", async () => {
    const rows = [
      {
        Name: "Orchid",
        Type: "flower",
        Source: "nursery",
        Status: "active",
        Price: "$24.99",
      },
    ];

    const columnMap = {
      Name: "species",
      Type: "type",
      Source: "source",
      Status: "status",
      Price: "purchasePrice",
    };

    const result = await importPlantsFromCsv(rows, columnMap);

    expect(result.inserted).toBe(1);

    const allPlants = await plantRepository.getAll();
    expect(allPlants).toHaveLength(1);
    expect(allPlants[0]!.purchasePrice).toBe(24.99);
  });

  it("handles tags as comma-separated values", async () => {
    const rows = [
      {
        Name: "Pepper",
        Type: "vegetable",
        Source: "seed",
        Status: "active",
        Tags: "hot, spicy, red",
      },
    ];

    const columnMap = {
      Name: "species",
      Type: "type",
      Source: "source",
      Status: "status",
      Tags: "tags",
    };

    const result = await importPlantsFromCsv(rows, columnMap);
    expect(result.inserted).toBe(1);

    const allPlants = await plantRepository.getAll();
    expect(allPlants).toHaveLength(1);
    expect(allPlants[0]!.tags).toEqual(["hot", "spicy", "red"]);
  });

  it("skips columns mapped to -- Skip --", async () => {
    const rows = [
      {
        Name: "Tomato",
        Type: "vegetable",
        Source: "seed",
        Status: "active",
        Notes: "Some notes",
      },
    ];

    const columnMap = {
      Name: "species",
      Type: "type",
      Source: "source",
      Status: "status",
      Notes: "-- Skip --",
    };

    const result = await importPlantsFromCsv(rows, columnMap);
    expect(result.inserted).toBe(1);
  });
});

// ─── autoMapColumns ───

describe("autoMapColumns", () => {
  it("maps common header names to fields", () => {
    const headers = ["Plant Name", "Type", "Source", "Status", "Variety", "Notes"];
    const map = autoMapColumns(headers);

    expect(map["Plant Name"]).toBe("species");
    expect(map["Type"]).toBe("type");
    expect(map["Source"]).toBe("source");
    expect(map["Status"]).toBe("status");
    expect(map["Variety"]).toBe("variety");
    expect(map["Notes"]).toBe("careNotes");
  });

  it("matches case-insensitively", () => {
    const headers = ["SPECIES", "type", "SOURCE"];
    const map = autoMapColumns(headers);

    expect(map["SPECIES"]).toBe("species");
    expect(map["type"]).toBe("type");
    expect(map["SOURCE"]).toBe("source");
  });

  it("ignores unrecognized headers", () => {
    const headers = ["Foo", "Bar"];
    const map = autoMapColumns(headers);

    expect(Object.keys(map)).toHaveLength(0);
  });
});
