import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { formatISO, addDays, startOfDay } from "date-fns";
import { db } from "../db/schema.ts";
import * as taskEngine from "./taskEngine.ts";
import type { TaskSuggestion } from "./taskEngine.ts";
import type { TaskRule } from "../validation/taskRule.schema.ts";
import type { PlantInstance } from "../validation/plantInstance.schema.ts";
import type { Settings } from "../validation/settings.schema.ts";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  vi.useRealTimers();
});

function dateStr(date: Date): string {
  return formatISO(startOfDay(date), { representation: "date" });
}

const timestamp = new Date().toISOString();

// Deterministic UUIDs for tests
const RULE_1 = "00000000-0000-0000-0000-000000000101";
const RULE_2 = "00000000-0000-0000-0000-000000000102";
const RULE_3 = "00000000-0000-0000-0000-000000000103";
const RULE_4 = "00000000-0000-0000-0000-000000000104";
const RULE_5 = "00000000-0000-0000-0000-000000000105";
const RULE_6 = "00000000-0000-0000-0000-000000000106";
const RULE_FUTURE = "00000000-0000-0000-0000-000000000110";
const RULE_PAST = "00000000-0000-0000-0000-000000000111";
const RULE_ACCEPTED = "00000000-0000-0000-0000-000000000112";
const RULE_DISMISSED = "00000000-0000-0000-0000-000000000113";
const RULE_ANY = "00000000-0000-0000-0000-000000000114";
const PLANT_1 = "00000000-0000-0000-0000-000000000001";
const PLANT_99 = "00000000-0000-0000-0000-000000000099";

function makeRule(overrides: Partial<TaskRule> & { id: string }): TaskRule {
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    isBuiltIn: true,
    appliesTo: {},
    trigger: { type: "relative_to_last_frost", offsetDays: 14 },
    task: { title: "Test task", defaultPriority: "normal" },
    ...overrides,
  };
}

function makePlant(
  overrides: Partial<PlantInstance> & { id: string },
): PlantInstance {
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    species: "Solanum lycopersicum",
    type: "vegetable",
    isPerennial: false,
    source: "seed",
    status: "active",
    tags: [],
    ...overrides,
  };
}

// Settings with frost dates in the future relative to "today"
const settings: Pick<Settings, "lastFrostDate" | "firstFrostDate"> = {
  lastFrostDate: dateStr(addDays(new Date(), -14)), // 2 weeks ago
  firstFrostDate: dateStr(addDays(new Date(), 180)), // ~6 months from now
};

// ─── computeDueDate ───

describe("computeDueDate", () => {
  const frostSettings = {
    lastFrostDate: "2026-04-15",
    firstFrostDate: "2026-10-15",
  };

  it("computes relative_to_last_frost date", () => {
    const rule = makeRule({
      id: RULE_1,
      trigger: { type: "relative_to_last_frost", offsetDays: -42 },
    });
    const result = taskEngine.computeDueDate(rule, frostSettings);
    expect(result).toBe("2026-03-04"); // April 15 - 42 days = March 4
  });

  it("computes relative_to_first_frost date", () => {
    const rule = makeRule({
      id: RULE_2,
      trigger: { type: "relative_to_first_frost", offsetDays: -14 },
    });
    const result = taskEngine.computeDueDate(rule, frostSettings);
    expect(result).toBe("2026-10-01"); // Oct 15 - 14 days = Oct 1
  });

  it("computes seasonal date (nearest future 15th of the month)", () => {
    const rule = makeRule({
      id: RULE_3,
      trigger: { type: "seasonal", month: 3 },
    });
    const result = taskEngine.computeDueDate(rule, frostSettings);
    const now = new Date();
    const thisYearDate = new Date(now.getFullYear(), 2, 15); // March 15
    const expectedYear =
      thisYearDate >= startOfDay(now)
        ? now.getFullYear()
        : now.getFullYear() + 1;
    expect(result).toBe(`${expectedYear}-03-15`);
  });

  it("computes fixed_date (nearest future occurrence)", () => {
    const rule = makeRule({
      id: RULE_4,
      trigger: { type: "fixed_date", month: 6, day: 21 },
    });
    const result = taskEngine.computeDueDate(rule, frostSettings);
    const now = new Date();
    const thisYearDate = new Date(now.getFullYear(), 5, 21); // June 21
    const expectedYear =
      thisYearDate >= startOfDay(now)
        ? now.getFullYear()
        : now.getFullYear() + 1;
    expect(result).toBe(`${expectedYear}-06-21`);
  });

  it("returns null when offsetDays is missing for frost-relative trigger", () => {
    const rule = makeRule({
      id: RULE_5,
      trigger: { type: "relative_to_last_frost" },
    });
    expect(taskEngine.computeDueDate(rule, frostSettings)).toBeNull();
  });

  it("returns null when month is missing for seasonal trigger", () => {
    const rule = makeRule({
      id: RULE_6,
      trigger: { type: "seasonal" },
    });
    expect(taskEngine.computeDueDate(rule, frostSettings)).toBeNull();
  });
});

// ─── ruleMatchesPlant ───

describe("ruleMatchesPlant", () => {
  const tomato = makePlant({
    id: PLANT_1,
    species: "Solanum lycopersicum",
    type: "vegetable",
    tags: ["nightshade", "indoor-start"],
  });

  it("matches by plantType", () => {
    const rule = makeRule({
      id: RULE_1,
      appliesTo: { plantType: "vegetable" },
    });
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(true);
  });

  it("does not match wrong plantType", () => {
    const rule = makeRule({
      id: RULE_1,
      appliesTo: { plantType: "herb" },
    });
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(false);
  });

  it("matches by species (case-insensitive prefix)", () => {
    const rule = makeRule({
      id: RULE_1,
      appliesTo: { species: "Solanum lycopersicum" },
    });
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(true);
  });

  it("matches species prefix", () => {
    const rule = makeRule({
      id: RULE_1,
      appliesTo: { species: "Solanum" },
    });
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(true);
  });

  it("does not match unrelated species", () => {
    const rule = makeRule({
      id: RULE_1,
      appliesTo: { species: "Capsicum" },
    });
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(false);
  });

  it("matches by tagsAny", () => {
    const rule = makeRule({
      id: RULE_1,
      appliesTo: { tagsAny: ["nightshade", "tropical"] },
    });
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(true);
  });

  it("does not match when no tags overlap", () => {
    const rule = makeRule({
      id: RULE_1,
      appliesTo: { tagsAny: ["tropical"] },
    });
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(false);
  });

  it("does not match empty appliesTo (no criteria)", () => {
    const rule = makeRule({ id: RULE_1, appliesTo: {} });
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(false);
  });

  it("requires ALL specified criteria to match", () => {
    const rule = makeRule({
      id: RULE_1,
      appliesTo: { plantType: "vegetable", species: "Capsicum" },
    });
    // plantType matches but species doesn't
    expect(taskEngine.ruleMatchesPlant(rule, tomato)).toBe(false);
  });
});

// ─── generateTaskSuggestions ───

describe("generateTaskSuggestions", () => {
  const plant = makePlant({
    id: PLANT_1,
    species: "Solanum lycopersicum",
    type: "vegetable",
  });

  it("generates suggestions for matching rules with future due dates", async () => {
    const futureRule = makeRule({
      id: RULE_FUTURE,
      appliesTo: { plantType: "vegetable" },
      trigger: { type: "relative_to_first_frost", offsetDays: -14 },
      task: { title: "Mulch before frost" },
    });

    const futureSettings = {
      lastFrostDate: dateStr(addDays(new Date(), 60)),
      firstFrostDate: dateStr(addDays(new Date(), 180)),
    };

    const results = await taskEngine.generateTaskSuggestions(
      [plant],
      futureSettings,
      [futureRule],
    );

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.title).toBe("Mulch before frost");
    expect(results[0]?.plantInstanceId).toBe(plant.id);
  });

  it("filters out past-due suggestions", async () => {
    const pastRule = makeRule({
      id: RULE_PAST,
      appliesTo: { plantType: "vegetable" },
      trigger: { type: "relative_to_last_frost", offsetDays: -100 },
      task: { title: "Past task" },
    });

    const results = await taskEngine.generateTaskSuggestions(
      [plant],
      settings,
      [pastRule],
    );

    expect(results).toHaveLength(0);
  });

  it("filters out already-accepted suggestions", async () => {
    const futureSettings = {
      lastFrostDate: dateStr(addDays(new Date(), 60)),
      firstFrostDate: dateStr(addDays(new Date(), 180)),
    };

    const rule = makeRule({
      id: RULE_ACCEPTED,
      appliesTo: { plantType: "vegetable" },
      trigger: { type: "relative_to_last_frost", offsetDays: 14 },
      task: { title: "Already accepted" },
    });

    // Create a task with ruleId + plantInstanceId to simulate acceptance
    await db.tasks.add({
      id: crypto.randomUUID(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      title: "Already accepted",
      dueDate: dateStr(addDays(new Date(), 74)),
      priority: "normal",
      isCompleted: false,
      isAutoGenerated: true,
      ruleId: RULE_ACCEPTED,
      plantInstanceId: plant.id,
    });

    const results = await taskEngine.generateTaskSuggestions(
      [plant],
      futureSettings,
      [rule],
    );

    expect(results).toHaveLength(0);
  });

  it("filters out dismissed suggestions", async () => {
    const futureSettings = {
      lastFrostDate: dateStr(addDays(new Date(), 60)),
      firstFrostDate: dateStr(addDays(new Date(), 180)),
    };

    const rule = makeRule({
      id: RULE_DISMISSED,
      appliesTo: { plantType: "vegetable" },
      trigger: { type: "relative_to_last_frost", offsetDays: 14 },
      task: { title: "Dismissed" },
    });

    // Dismiss the suggestion
    await db.dismissedSuggestions.add({
      id: `${RULE_DISMISSED}::${plant.id}`,
      ruleId: RULE_DISMISSED,
      plantInstanceId: plant.id,
      dismissedAt: timestamp,
    });

    const results = await taskEngine.generateTaskSuggestions(
      [plant],
      futureSettings,
      [rule],
    );

    expect(results).toHaveLength(0);
  });

  it("skips inactive/deleted plants", async () => {
    const inactivePlant = makePlant({
      id: PLANT_99,
      species: "Solanum lycopersicum",
      type: "vegetable",
      status: "removed",
    });

    const rule = makeRule({
      id: RULE_ANY,
      appliesTo: { plantType: "vegetable" },
      trigger: { type: "relative_to_first_frost", offsetDays: -14 },
      task: { title: "Some task" },
    });

    const results = await taskEngine.generateTaskSuggestions(
      [inactivePlant],
      settings,
      [rule],
    );

    expect(results).toHaveLength(0);
  });
});

// ─── acceptSuggestion ───

describe("acceptSuggestion", () => {
  it("creates a task with auto-generation provenance", async () => {
    const suggestion: TaskSuggestion = {
      suggestionId: `${RULE_1}::${PLANT_1}`,
      ruleId: RULE_1,
      plantInstanceId: PLANT_1,
      plantName: "Tomato",
      title: "Start seeds indoors",
      dueDate: dateStr(addDays(new Date(), 30)),
      priority: "normal",
    };

    const task = await taskEngine.acceptSuggestion(suggestion, "00000000-0000-0000-0000-000000000200");

    expect(task.title).toBe("Start seeds indoors");
    expect(task.isAutoGenerated).toBe(true);
    expect(task.ruleId).toBe(RULE_1);
    expect(task.plantInstanceId).toBe(PLANT_1);
    expect(task.seasonId).toBe("00000000-0000-0000-0000-000000000200");
    expect(task.isCompleted).toBe(false);
  });
});

// ─── dismissSuggestion ───

describe("dismissSuggestion", () => {
  it("records a dismissal in the database", async () => {
    const suggestionId = `${RULE_1}::${PLANT_1}`;
    const suggestion: TaskSuggestion = {
      suggestionId,
      ruleId: RULE_1,
      plantInstanceId: PLANT_1,
      plantName: "Tomato",
      title: "Start seeds indoors",
      dueDate: dateStr(addDays(new Date(), 30)),
      priority: "normal",
    };

    await taskEngine.dismissSuggestion(suggestion);

    const record = await db.dismissedSuggestions.get(suggestionId);
    expect(record).toBeDefined();
    expect(record!.ruleId).toBe(RULE_1);
    expect(record!.plantInstanceId).toBe(PLANT_1);
    expect(record!.dismissedAt).toBeDefined();
  });
});

// ─── createNextRecurrence ───

describe("createNextRecurrence", () => {
  it("creates next daily occurrence", async () => {
    const today = dateStr(new Date());
    const task = await db.tasks.add({
      id: crypto.randomUUID(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      title: "Water plants",
      dueDate: today,
      priority: "normal",
      isCompleted: true,
      completedAt: timestamp,
      recurrence: { type: "daily", interval: 2 },
    });
    const existing = await db.tasks.get(task);

    const next = await taskEngine.createNextRecurrence(existing!);

    expect(next).not.toBeNull();
    expect(next!.title).toBe("Water plants");
    expect(next!.dueDate).toBe(dateStr(addDays(new Date(), 2)));
    expect(next!.isCompleted).toBe(false);
    expect(next!.recurrence).toEqual({ type: "daily", interval: 2 });
  });

  it("creates next weekly occurrence", async () => {
    const today = dateStr(new Date());
    const task = await db.tasks.add({
      id: crypto.randomUUID(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      title: "Fertilize",
      dueDate: today,
      priority: "normal",
      isCompleted: true,
      completedAt: timestamp,
      recurrence: { type: "weekly", interval: 1 },
    });
    const existing = await db.tasks.get(task);

    const next = await taskEngine.createNextRecurrence(existing!);

    expect(next).not.toBeNull();
    expect(next!.dueDate).toBe(dateStr(addDays(new Date(), 7)));
  });

  it("creates next monthly occurrence", async () => {
    const task = await db.tasks.add({
      id: crypto.randomUUID(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      title: "Deep water",
      dueDate: "2026-03-15",
      priority: "normal",
      isCompleted: true,
      completedAt: timestamp,
      recurrence: { type: "monthly", interval: 1 },
    });
    const existing = await db.tasks.get(task);

    const next = await taskEngine.createNextRecurrence(existing!);

    expect(next).not.toBeNull();
    expect(next!.dueDate).toBe("2026-04-15");
  });

  it("returns null for tasks without recurrence", async () => {
    const task = await db.tasks.add({
      id: crypto.randomUUID(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      title: "One-time task",
      dueDate: dateStr(new Date()),
      priority: "normal",
      isCompleted: true,
      completedAt: timestamp,
    });
    const existing = await db.tasks.get(task);

    const next = await taskEngine.createNextRecurrence(existing!);
    expect(next).toBeNull();
  });

  it("preserves plant and bed links", async () => {
    const today = dateStr(new Date());
    const task = await db.tasks.add({
      id: crypto.randomUUID(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      title: "Water bed",
      dueDate: today,
      priority: "urgent",
      isCompleted: true,
      completedAt: timestamp,
      plantInstanceId: PLANT_1,
      bedId: "00000000-0000-0000-0000-000000000002",
      recurrence: { type: "daily", interval: 1 },
    });
    const existing = await db.tasks.get(task);

    const next = await taskEngine.createNextRecurrence(existing!, "00000000-0000-0000-0000-000000000200");

    expect(next!.plantInstanceId).toBe(PLANT_1);
    expect(next!.bedId).toBe("00000000-0000-0000-0000-000000000002");
    expect(next!.priority).toBe("urgent");
    expect(next!.seasonId).toBe("00000000-0000-0000-0000-000000000200");
  });
});
