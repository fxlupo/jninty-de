# TaskRules Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated task suggestion system where rules match plants by type/species/tags and fire on frost-date, seasonal, or fixed-date triggers to suggest tasks the user can accept or dismiss.

**Architecture:** TaskRules are stored as a new Dexie table (schema v6). A pure `taskEngine` service evaluates rules against plants+settings and returns task suggestions. Built-in rules ship as JSON in `data/taskRules/`. The Dashboard and Tasks page show suggestions the user can accept (creates a real Task) or dismiss. No network calls, all local.

**Tech Stack:** Zod (schema), Dexie.js (persistence), date-fns (date math), React (UI), Vitest (tests)

---

### Task 1: TaskRule Zod Schema

**Files:**
- Create: `src/validation/taskRule.schema.ts`
- Test: `src/validation/taskRule.schema.test.ts`

**Step 1: Write the failing test**

```typescript
// src/validation/taskRule.schema.test.ts
import { describe, it, expect } from "vitest";
import { taskRuleSchema } from "./taskRule.schema.ts";
import { validateEntity } from "./helpers.ts";

const validRule = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  appliesTo: {
    plantType: "vegetable",
  },
  trigger: {
    type: "relative_to_last_frost",
    offsetDays: -42,
  },
  task: {
    title: "Start seeds indoors",
    activityType: "general",
    defaultPriority: "normal",
  },
  isBuiltIn: true,
};

describe("taskRuleSchema", () => {
  it("accepts valid rule with plantType + frost trigger", () => {
    const result = validateEntity(taskRuleSchema, validRule);
    expect(result.success).toBe(true);
  });

  it("accepts rule with species match", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      appliesTo: { species: "Solanum lycopersicum" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts rule with tagsAny match", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      appliesTo: { tagsAny: ["container", "indoor"] },
    });
    expect(result.success).toBe(true);
  });

  it("accepts rule with multiple appliesTo criteria", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      appliesTo: {
        plantType: "herb",
        species: "Ocimum basilicum",
        tagsAny: ["annual"],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts seasonal trigger with month", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      trigger: { type: "seasonal", month: 3 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts fixed_date trigger with month and day", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      trigger: { type: "fixed_date", month: 3, day: 15 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts relative_to_first_frost trigger", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      trigger: { type: "relative_to_first_frost", offsetDays: -14 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts task with optional activityType omitted", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      task: { title: "Do something", defaultPriority: "low" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts task with optional defaultPriority omitted", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      task: { title: "Do something" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty appliesTo object", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      appliesTo: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty task title", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      task: { ...validRule.task, title: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid trigger type", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      trigger: { type: "moon_phase", offsetDays: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid plantType", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      appliesTo: { plantType: "cactus" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid activityType", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      task: { ...validRule.task, activityType: "plowing" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid priority", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      task: { ...validRule.task, defaultPriority: "critical" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects month out of range", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      trigger: { type: "seasonal", month: 13 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects day out of range", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      trigger: { type: "fixed_date", month: 3, day: 32 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown properties (strict mode)", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      unknownField: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts user-created rule (isBuiltIn false)", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      isBuiltIn: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty tagsAny array", () => {
    const result = validateEntity(taskRuleSchema, {
      ...validRule,
      appliesTo: { tagsAny: [] },
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/validation/taskRule.schema.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/validation/taskRule.schema.ts
import { z } from "zod";
import { baseEntitySchema } from "./base.schema.ts";
import { plantTypeSchema } from "./plantInstance.schema.ts";
import { activityTypeSchema } from "./journalEntry.schema.ts";
import { taskPrioritySchema } from "./task.schema.ts";

export const taskTriggerTypeSchema = z.enum([
  "relative_to_last_frost",
  "relative_to_first_frost",
  "seasonal",
  "fixed_date",
]);

const appliesToSchema = z
  .object({
    plantType: plantTypeSchema.optional(),
    species: z.string().min(1).optional(),
    tagsAny: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
  .refine(
    (val) =>
      val.plantType != null || val.species != null || val.tagsAny != null,
    { message: "At least one criterion required in appliesTo" },
  );

const triggerSchema = z
  .object({
    type: taskTriggerTypeSchema,
    offsetDays: z.number().int().optional(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
  })
  .strict();

const ruleTaskSchema = z
  .object({
    title: z.string().min(1),
    activityType: activityTypeSchema.optional(),
    defaultPriority: taskPrioritySchema.optional(),
  })
  .strict();

export const taskRuleSchema = baseEntitySchema
  .extend({
    appliesTo: appliesToSchema,
    trigger: triggerSchema,
    task: ruleTaskSchema,
    isBuiltIn: z.boolean(),
  })
  .strict();

export type TaskTriggerType = z.infer<typeof taskTriggerTypeSchema>;
export type TaskRule = z.infer<typeof taskRuleSchema>;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/validation/taskRule.schema.test.ts`
Expected: PASS (all tests green)

**Step 5: Export types**

Add to `src/types/index.ts`:

```typescript
export type {
  TaskTriggerType,
  TaskRule,
} from "../validation/taskRule.schema.ts";
```

**Step 6: Commit**

```bash
git add src/validation/taskRule.schema.ts src/validation/taskRule.schema.test.ts src/types/index.ts
git commit -m "feat: add TaskRule Zod schema with validation"
```

---

### Task 2: DB Schema Migration (v6) + TaskRule Repository

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/repositories/taskRuleRepository.ts`
- Create: `src/db/repositories/taskRuleRepository.test.ts`
- Modify: `src/db/repositories/index.ts`

**Step 1: Add taskRules table to schema.ts**

In `src/db/schema.ts`:

1. Add import: `import type { TaskRule } from "../validation/taskRule.schema.ts";`
2. Add table declaration: `taskRules!: Table<TaskRule, string>;`
3. Add version 6:

```typescript
// ─── Version 6: Phase 2 — Task Rules ───
// Adds taskRules store for automated task suggestion engine.
this.version(6).stores({
  taskRules: "id, isBuiltIn",
});
```

**Step 2: Write the failing repository test**

```typescript
// src/db/repositories/taskRuleRepository.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Dexie from "dexie";
import "fake-indexeddb/auto";
import * as taskRuleRepository from "./taskRuleRepository.ts";

beforeEach(async () => {
  const { db } = await import("../schema.ts");
  await db.delete();
  await db.open();
});

const ruleInput = {
  appliesTo: { plantType: "vegetable" as const },
  trigger: {
    type: "relative_to_last_frost" as const,
    offsetDays: -42,
  },
  task: {
    title: "Start seeds indoors",
    activityType: "general" as const,
    defaultPriority: "normal" as const,
  },
  isBuiltIn: false,
};

describe("taskRuleRepository", () => {
  it("creates a rule with generated id and timestamps", async () => {
    const rule = await taskRuleRepository.create(ruleInput);
    expect(rule.id).toBeDefined();
    expect(rule.version).toBe(1);
    expect(rule.createdAt).toBeDefined();
    expect(rule.updatedAt).toBeDefined();
    expect(rule.task.title).toBe("Start seeds indoors");
  });

  it("retrieves a rule by id", async () => {
    const created = await taskRuleRepository.create(ruleInput);
    const fetched = await taskRuleRepository.getById(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
  });

  it("returns undefined for nonexistent id", async () => {
    const result = await taskRuleRepository.getById(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toBeUndefined();
  });

  it("returns all non-deleted rules", async () => {
    await taskRuleRepository.create(ruleInput);
    await taskRuleRepository.create({
      ...ruleInput,
      task: { ...ruleInput.task, title: "Prune" },
    });
    const all = await taskRuleRepository.getAll();
    expect(all).toHaveLength(2);
  });

  it("updates a rule", async () => {
    const created = await taskRuleRepository.create(ruleInput);
    const updated = await taskRuleRepository.update(created.id, {
      task: { ...ruleInput.task, title: "Updated title" },
    });
    expect(updated.task.title).toBe("Updated title");
    expect(updated.version).toBe(2);
  });

  it("soft-deletes a rule", async () => {
    const created = await taskRuleRepository.create(ruleInput);
    await taskRuleRepository.softDelete(created.id);
    const fetched = await taskRuleRepository.getById(created.id);
    expect(fetched).toBeUndefined();
  });

  it("getBuiltIn returns only built-in rules", async () => {
    await taskRuleRepository.create(ruleInput); // isBuiltIn: false
    await taskRuleRepository.create({ ...ruleInput, isBuiltIn: true });
    const builtIn = await taskRuleRepository.getBuiltIn();
    expect(builtIn).toHaveLength(1);
    expect(builtIn[0]!.isBuiltIn).toBe(true);
  });

  it("getUserCreated returns only user-created rules", async () => {
    await taskRuleRepository.create(ruleInput); // isBuiltIn: false
    await taskRuleRepository.create({ ...ruleInput, isBuiltIn: true });
    const userRules = await taskRuleRepository.getUserCreated();
    expect(userRules).toHaveLength(1);
    expect(userRules[0]!.isBuiltIn).toBe(false);
  });

  it("upsertBuiltIn inserts new built-in rule", async () => {
    const rule = await taskRuleRepository.upsertBuiltIn({
      ...ruleInput,
      id: "550e8400-e29b-41d4-a716-446655440000",
      isBuiltIn: true,
    });
    expect(rule.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    const all = await taskRuleRepository.getAll();
    expect(all).toHaveLength(1);
  });

  it("upsertBuiltIn updates existing built-in rule", async () => {
    await taskRuleRepository.upsertBuiltIn({
      ...ruleInput,
      id: "550e8400-e29b-41d4-a716-446655440000",
      isBuiltIn: true,
    });
    const updated = await taskRuleRepository.upsertBuiltIn({
      ...ruleInput,
      id: "550e8400-e29b-41d4-a716-446655440000",
      isBuiltIn: true,
      task: { ...ruleInput.task, title: "Updated" },
    });
    expect(updated.task.title).toBe("Updated");
    const all = await taskRuleRepository.getAll();
    expect(all).toHaveLength(1);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/db/repositories/taskRuleRepository.test.ts`
Expected: FAIL — module not found

**Step 4: Write minimal implementation**

```typescript
// src/db/repositories/taskRuleRepository.ts
import { db } from "../schema.ts";
import {
  taskRuleSchema,
  type TaskRule,
} from "../../validation/taskRule.schema.ts";

type CreateTaskRuleInput = Omit<
  TaskRule,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateTaskRuleInput = Partial<CreateTaskRuleInput>;

// Input for upsertBuiltIn — includes a known id
type UpsertBuiltInInput = Omit<
  TaskRule,
  "version" | "createdAt" | "updatedAt" | "deletedAt"
> & { id: string };

function now(): string {
  return new Date().toISOString();
}

export async function create(input: CreateTaskRuleInput): Promise<TaskRule> {
  const timestamp = now();
  const record: TaskRule = {
    ...input,
    id: crypto.randomUUID(),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const parsed = taskRuleSchema.parse(record);
  await db.taskRules.add(parsed);
  return parsed;
}

export async function update(
  id: string,
  changes: UpdateTaskRuleInput,
): Promise<TaskRule> {
  const existing = await db.taskRules.get(id);
  if (!existing || existing.deletedAt != null) {
    throw new Error(`TaskRule not found: ${id}`);
  }

  const updated: TaskRule = {
    ...existing,
    ...changes,
    id: existing.id,
    version: existing.version + 1,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };

  const parsed = taskRuleSchema.parse(updated);
  await db.taskRules.put(parsed);
  return parsed;
}

export async function softDelete(id: string): Promise<void> {
  const existing = await db.taskRules.get(id);
  if (!existing || existing.deletedAt != null) {
    throw new Error(`TaskRule not found: ${id}`);
  }

  const timestamp = now();
  const deleted = taskRuleSchema.parse({
    ...existing,
    deletedAt: timestamp,
    updatedAt: timestamp,
    version: existing.version + 1,
  });
  await db.taskRules.put(deleted);
}

export async function getById(id: string): Promise<TaskRule | undefined> {
  const record = await db.taskRules.get(id);
  if (!record || record.deletedAt != null) return undefined;
  return record;
}

export async function getAll(): Promise<TaskRule[]> {
  const records = await db.taskRules.toArray();
  return records.filter((r) => r.deletedAt == null);
}

export async function getBuiltIn(): Promise<TaskRule[]> {
  const records = await db.taskRules
    .where("isBuiltIn")
    .equals(1) // Dexie stores booleans as 0/1 in indexes
    .toArray();
  return records.filter((r) => r.deletedAt == null);
}

export async function getUserCreated(): Promise<TaskRule[]> {
  const records = await db.taskRules
    .where("isBuiltIn")
    .equals(0)
    .toArray();
  return records.filter((r) => r.deletedAt == null);
}

/**
 * Insert or update a built-in rule by its known id.
 * Used during app startup to seed/update bundled rules.
 */
export async function upsertBuiltIn(input: UpsertBuiltInInput): Promise<TaskRule> {
  const timestamp = now();
  const existing = await db.taskRules.get(input.id);

  const record: TaskRule = {
    ...input,
    version: existing ? existing.version + 1 : 1,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const parsed = taskRuleSchema.parse(record);
  await db.taskRules.put(parsed);
  return parsed;
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/db/repositories/taskRuleRepository.test.ts`
Expected: PASS

**Step 6: Export repository**

Add to `src/db/repositories/index.ts`:

```typescript
export * as taskRuleRepository from "./taskRuleRepository.ts";
```

**Step 7: Commit**

```bash
git add src/db/schema.ts src/db/repositories/taskRuleRepository.ts src/db/repositories/taskRuleRepository.test.ts src/db/repositories/index.ts
git commit -m "feat: add TaskRule DB table (v6) and repository with CRUD + upsert"
```

---

### Task 3: Task Engine — Pure Rule Evaluation Logic

**Files:**
- Create: `src/services/taskEngine.ts`
- Create: `src/services/taskEngine.test.ts`

This is the core business logic — pure functions, no DB access. The engine:
1. Matches rules against plants by type/species/tags
2. Evaluates trigger dates relative to frost dates or calendar
3. Generates task suggestions

**Step 1: Write the failing tests**

```typescript
// src/services/taskEngine.test.ts
import { describe, it, expect } from "vitest";
import {
  matchesPlant,
  computeTriggerDate,
  generateSuggestions,
} from "./taskEngine.ts";
import type { TaskRule } from "../validation/taskRule.schema.ts";
import type { PlantInstance } from "../validation/plantInstance.schema.ts";
import type { Settings } from "../validation/settings.schema.ts";

// ─── Fixtures ───

const baseRule: TaskRule = {
  id: "rule-1",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  appliesTo: { plantType: "vegetable" },
  trigger: { type: "relative_to_last_frost", offsetDays: -42 },
  task: {
    title: "Start seeds indoors",
    activityType: "general",
    defaultPriority: "normal",
  },
  isBuiltIn: true,
};

const tomato: PlantInstance = {
  id: "plant-1",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  species: "Solanum lycopersicum",
  type: "vegetable",
  isPerennial: false,
  source: "seed",
  status: "active",
  tags: ["container", "heirloom"],
};

const basil: PlantInstance = {
  id: "plant-2",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  species: "Ocimum basilicum",
  type: "herb",
  isPerennial: false,
  source: "seed",
  status: "active",
  tags: ["indoor"],
};

const settings: Settings = {
  growingZone: "7b",
  lastFrostDate: "2026-04-15",
  firstFrostDate: "2026-10-15",
  gridUnit: "feet",
  temperatureUnit: "fahrenheit",
  theme: "light",
  keepOriginalPhotos: false,
  dbSchemaVersion: 6,
  exportVersion: 1,
};

// ─── matchesPlant ───

describe("matchesPlant", () => {
  it("matches by plantType", () => {
    const rule = { ...baseRule, appliesTo: { plantType: "vegetable" as const } };
    expect(matchesPlant(rule, tomato)).toBe(true);
    expect(matchesPlant(rule, basil)).toBe(false);
  });

  it("matches by species", () => {
    const rule = { ...baseRule, appliesTo: { species: "Solanum lycopersicum" } };
    expect(matchesPlant(rule, tomato)).toBe(true);
    expect(matchesPlant(rule, basil)).toBe(false);
  });

  it("matches by tagsAny (any tag matches)", () => {
    const rule = { ...baseRule, appliesTo: { tagsAny: ["container", "raised-bed"] } };
    expect(matchesPlant(rule, tomato)).toBe(true); // has "container"
    expect(matchesPlant(rule, basil)).toBe(false); // has "indoor" only
  });

  it("requires ALL specified criteria to match", () => {
    const rule = {
      ...baseRule,
      appliesTo: {
        plantType: "vegetable" as const,
        species: "Capsicum annuum", // not tomato
      },
    };
    expect(matchesPlant(rule, tomato)).toBe(false);
  });

  it("matches when all criteria match", () => {
    const rule = {
      ...baseRule,
      appliesTo: {
        plantType: "vegetable" as const,
        species: "Solanum lycopersicum",
        tagsAny: ["heirloom"],
      },
    };
    expect(matchesPlant(rule, tomato)).toBe(true);
  });

  it("skips removed/dead plants", () => {
    const dead = { ...tomato, status: "dead" as const };
    expect(matchesPlant(baseRule, dead)).toBe(false);
  });
});

// ─── computeTriggerDate ───

describe("computeTriggerDate", () => {
  it("computes relative_to_last_frost with negative offset", () => {
    const rule = {
      ...baseRule,
      trigger: { type: "relative_to_last_frost" as const, offsetDays: -42 },
    };
    const date = computeTriggerDate(rule, settings);
    // April 15 - 42 days = March 4
    expect(date).toBe("2026-03-04");
  });

  it("computes relative_to_last_frost with positive offset", () => {
    const rule = {
      ...baseRule,
      trigger: { type: "relative_to_last_frost" as const, offsetDays: 14 },
    };
    const date = computeTriggerDate(rule, settings);
    // April 15 + 14 days = April 29
    expect(date).toBe("2026-04-29");
  });

  it("computes relative_to_first_frost", () => {
    const rule = {
      ...baseRule,
      trigger: { type: "relative_to_first_frost" as const, offsetDays: -14 },
    };
    const date = computeTriggerDate(rule, settings);
    // Oct 15 - 14 days = Oct 1
    expect(date).toBe("2026-10-01");
  });

  it("computes seasonal trigger (month only)", () => {
    const rule = {
      ...baseRule,
      trigger: { type: "seasonal" as const, month: 3 },
    };
    const date = computeTriggerDate(rule, settings, 2026);
    // March 1 of current year
    expect(date).toBe("2026-03-01");
  });

  it("computes fixed_date trigger (month + day)", () => {
    const rule = {
      ...baseRule,
      trigger: { type: "fixed_date" as const, month: 7, day: 4 },
    };
    const date = computeTriggerDate(rule, settings, 2026);
    expect(date).toBe("2026-07-04");
  });

  it("returns undefined when offsetDays is missing for frost trigger", () => {
    const rule = {
      ...baseRule,
      trigger: { type: "relative_to_last_frost" as const },
    };
    const date = computeTriggerDate(rule, settings);
    expect(date).toBeUndefined();
  });

  it("returns undefined when month is missing for seasonal trigger", () => {
    const rule = {
      ...baseRule,
      trigger: { type: "seasonal" as const },
    };
    const date = computeTriggerDate(rule, settings);
    expect(date).toBeUndefined();
  });
});

// ─── generateSuggestions ───

describe("generateSuggestions", () => {
  it("generates a suggestion when rule matches and trigger date is today or past", () => {
    const suggestions = generateSuggestions(
      [baseRule],
      [tomato],
      settings,
      "2026-03-04", // exactly the trigger date
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.title).toBe("Start seeds indoors");
    expect(suggestions[0]!.plantInstanceId).toBe("plant-1");
    expect(suggestions[0]!.ruleId).toBe("rule-1");
    expect(suggestions[0]!.isAutoGenerated).toBe(true);
    expect(suggestions[0]!.dueDate).toBe("2026-03-04");
    expect(suggestions[0]!.priority).toBe("normal");
  });

  it("generates suggestion when trigger date is in the past", () => {
    const suggestions = generateSuggestions(
      [baseRule],
      [tomato],
      settings,
      "2026-03-10", // past trigger date
    );
    expect(suggestions).toHaveLength(1);
  });

  it("does NOT generate suggestion when trigger date is in the future", () => {
    const suggestions = generateSuggestions(
      [baseRule],
      [tomato],
      settings,
      "2026-02-01", // before trigger date
    );
    expect(suggestions).toHaveLength(0);
  });

  it("does NOT generate suggestion when plant does not match", () => {
    const suggestions = generateSuggestions(
      [baseRule], // matches vegetable only
      [basil], // herb
      settings,
      "2026-03-04",
    );
    expect(suggestions).toHaveLength(0);
  });

  it("generates suggestions for multiple plants matching same rule", () => {
    const pepper = { ...tomato, id: "plant-3", species: "Capsicum annuum" };
    const suggestions = generateSuggestions(
      [baseRule],
      [tomato, pepper],
      settings,
      "2026-03-04",
    );
    expect(suggestions).toHaveLength(2);
  });

  it("deduplicates by ruleId + plantInstanceId", () => {
    const existingTaskKeys = new Set(["rule-1::plant-1"]);
    const suggestions = generateSuggestions(
      [baseRule],
      [tomato],
      settings,
      "2026-03-04",
      existingTaskKeys,
    );
    expect(suggestions).toHaveLength(0);
  });

  it("uses activityType from rule when provided", () => {
    const rule = {
      ...baseRule,
      task: { ...baseRule.task, activityType: "pruning" as const },
    };
    const suggestions = generateSuggestions(
      [rule],
      [tomato],
      settings,
      "2026-03-04",
    );
    expect(suggestions[0]!.activityType).toBe("pruning");
  });

  it("defaults priority to normal when rule omits it", () => {
    const rule = {
      ...baseRule,
      task: { title: "Do thing" },
    };
    const suggestions = generateSuggestions(
      [rule],
      [tomato],
      settings,
      "2026-03-04",
    );
    expect(suggestions[0]!.priority).toBe("normal");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/taskEngine.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/services/taskEngine.ts
import { addDays, formatISO, parseISO } from "date-fns";
import type { TaskRule } from "../validation/taskRule.schema.ts";
import type { PlantInstance } from "../validation/plantInstance.schema.ts";
import type { Settings } from "../validation/settings.schema.ts";
import type { ActivityType } from "../validation/journalEntry.schema.ts";
import type { TaskPriority } from "../validation/task.schema.ts";

export interface TaskSuggestion {
  title: string;
  dueDate: string;
  priority: TaskPriority;
  activityType?: ActivityType;
  plantInstanceId: string;
  ruleId: string;
  isAutoGenerated: true;
}

/**
 * Check whether a rule's appliesTo criteria match a plant.
 * All specified criteria must match (AND logic).
 * tagsAny uses OR logic within the array.
 * Plants with status "removed" or "dead" are skipped.
 */
export function matchesPlant(rule: TaskRule, plant: PlantInstance): boolean {
  if (plant.status === "removed" || plant.status === "dead") return false;

  const { appliesTo } = rule;

  if (appliesTo.plantType != null && appliesTo.plantType !== plant.type) {
    return false;
  }

  if (appliesTo.species != null && appliesTo.species !== plant.species) {
    return false;
  }

  if (appliesTo.tagsAny != null) {
    const hasMatch = appliesTo.tagsAny.some((tag) => plant.tags.includes(tag));
    if (!hasMatch) return false;
  }

  return true;
}

/**
 * Compute the ISO date (YYYY-MM-DD) when a rule's trigger fires.
 * Returns undefined if required fields are missing.
 */
export function computeTriggerDate(
  rule: TaskRule,
  settings: Pick<Settings, "lastFrostDate" | "firstFrostDate">,
  year?: number,
): string | undefined {
  const { trigger } = rule;

  switch (trigger.type) {
    case "relative_to_last_frost": {
      if (trigger.offsetDays == null) return undefined;
      const base = parseISO(settings.lastFrostDate);
      return formatISO(addDays(base, trigger.offsetDays), {
        representation: "date",
      });
    }
    case "relative_to_first_frost": {
      if (trigger.offsetDays == null) return undefined;
      const base = parseISO(settings.firstFrostDate);
      return formatISO(addDays(base, trigger.offsetDays), {
        representation: "date",
      });
    }
    case "seasonal": {
      if (trigger.month == null) return undefined;
      const y = year ?? new Date().getFullYear();
      const m = String(trigger.month).padStart(2, "0");
      const d = trigger.day != null ? String(trigger.day).padStart(2, "0") : "01";
      return `${String(y)}-${m}-${d}`;
    }
    case "fixed_date": {
      if (trigger.month == null) return undefined;
      const y = year ?? new Date().getFullYear();
      const m = String(trigger.month).padStart(2, "0");
      const d = trigger.day != null ? String(trigger.day).padStart(2, "0") : "01";
      return `${String(y)}-${m}-${d}`;
    }
  }
}

/**
 * Generate task suggestions by evaluating all rules against all plants.
 * `existingKeys` is a Set of "ruleId::plantInstanceId" strings for deduplication.
 * `today` is an ISO date string (YYYY-MM-DD).
 */
export function generateSuggestions(
  rules: TaskRule[],
  plants: PlantInstance[],
  settings: Pick<Settings, "lastFrostDate" | "firstFrostDate">,
  today: string,
  existingKeys?: Set<string>,
): TaskSuggestion[] {
  const suggestions: TaskSuggestion[] = [];
  const year = parseInt(today.slice(0, 4), 10);

  for (const rule of rules) {
    const triggerDate = computeTriggerDate(rule, settings, year);
    if (triggerDate == null || triggerDate > today) continue;

    for (const plant of plants) {
      if (!matchesPlant(rule, plant)) continue;

      const key = `${rule.id}::${plant.id}`;
      if (existingKeys?.has(key)) continue;

      suggestions.push({
        title: rule.task.title,
        dueDate: triggerDate,
        priority: rule.task.defaultPriority ?? "normal",
        ...(rule.task.activityType != null
          ? { activityType: rule.task.activityType }
          : {}),
        plantInstanceId: plant.id,
        ruleId: rule.id,
        isAutoGenerated: true,
      });
    }
  }

  return suggestions;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/taskEngine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/taskEngine.ts src/services/taskEngine.test.ts
git commit -m "feat: add task engine with rule matching, trigger evaluation, suggestion generation"
```

---

### Task 4: Built-in Task Rules JSON

**Files:**
- Create: `data/taskRules/vegetables.json`
- Create: `data/taskRules/herbs.json`
- Create: `data/taskRules/general.json`

Ship a small set of useful built-in rules. These fire on frost dates and seasonal triggers for common gardening tasks. Each rule uses a deterministic UUID so `upsertBuiltIn` is idempotent.

**Step 1: Create `data/taskRules/vegetables.json`**

```json
[
  {
    "id": "a0000001-0000-4000-8000-000000000001",
    "appliesTo": { "plantType": "vegetable", "species": "Solanum lycopersicum" },
    "trigger": { "type": "relative_to_last_frost", "offsetDays": -42 },
    "task": {
      "title": "Start tomato seeds indoors",
      "activityType": "general",
      "defaultPriority": "normal"
    },
    "isBuiltIn": true
  },
  {
    "id": "a0000001-0000-4000-8000-000000000002",
    "appliesTo": { "plantType": "vegetable", "species": "Solanum lycopersicum" },
    "trigger": { "type": "relative_to_last_frost", "offsetDays": 14 },
    "task": {
      "title": "Transplant tomatoes outdoors",
      "activityType": "transplant",
      "defaultPriority": "normal"
    },
    "isBuiltIn": true
  },
  {
    "id": "a0000001-0000-4000-8000-000000000003",
    "appliesTo": { "plantType": "vegetable", "species": "Capsicum annuum" },
    "trigger": { "type": "relative_to_last_frost", "offsetDays": -56 },
    "task": {
      "title": "Start pepper seeds indoors",
      "activityType": "general",
      "defaultPriority": "normal"
    },
    "isBuiltIn": true
  },
  {
    "id": "a0000001-0000-4000-8000-000000000004",
    "appliesTo": { "plantType": "vegetable", "species": "Cucumis sativus" },
    "trigger": { "type": "relative_to_last_frost", "offsetDays": 14 },
    "task": {
      "title": "Direct sow cucumbers",
      "activityType": "general",
      "defaultPriority": "normal"
    },
    "isBuiltIn": true
  },
  {
    "id": "a0000001-0000-4000-8000-000000000005",
    "appliesTo": { "plantType": "vegetable" },
    "trigger": { "type": "relative_to_first_frost", "offsetDays": -14 },
    "task": {
      "title": "Prepare frost protection for vegetables",
      "activityType": "general",
      "defaultPriority": "urgent"
    },
    "isBuiltIn": true
  }
]
```

**Step 2: Create `data/taskRules/herbs.json`**

```json
[
  {
    "id": "a0000002-0000-4000-8000-000000000001",
    "appliesTo": { "plantType": "herb", "species": "Ocimum basilicum" },
    "trigger": { "type": "relative_to_last_frost", "offsetDays": -28 },
    "task": {
      "title": "Start basil seeds indoors",
      "activityType": "general",
      "defaultPriority": "normal"
    },
    "isBuiltIn": true
  },
  {
    "id": "a0000002-0000-4000-8000-000000000002",
    "appliesTo": { "plantType": "herb" },
    "trigger": { "type": "seasonal", "month": 6 },
    "task": {
      "title": "Harvest and dry herbs for preservation",
      "activityType": "harvest",
      "defaultPriority": "low"
    },
    "isBuiltIn": true
  }
]
```

**Step 3: Create `data/taskRules/general.json`**

```json
[
  {
    "id": "a0000003-0000-4000-8000-000000000001",
    "appliesTo": { "tagsAny": ["container"] },
    "trigger": { "type": "seasonal", "month": 4 },
    "task": {
      "title": "Refresh potting soil in containers",
      "activityType": "general",
      "defaultPriority": "low"
    },
    "isBuiltIn": true
  },
  {
    "id": "a0000003-0000-4000-8000-000000000003",
    "appliesTo": { "plantType": "fruit_tree" },
    "trigger": { "type": "seasonal", "month": 2 },
    "task": {
      "title": "Prune fruit trees while dormant",
      "activityType": "pruning",
      "defaultPriority": "normal"
    },
    "isBuiltIn": true
  }
]
```

**Step 4: Commit**

```bash
git add data/taskRules/
git commit -m "feat: add built-in task rules for vegetables, herbs, and general gardening"
```

---

### Task 5: Built-in Rules Loader Service

**Files:**
- Create: `src/services/taskRuleLoader.ts`
- Create: `src/services/taskRuleLoader.test.ts`

Loads JSON files from `data/taskRules/`, validates with Zod, and upserts into DB via the repository.

**Step 1: Write the failing test**

```typescript
// src/services/taskRuleLoader.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { loadBuiltInRules, parseRuleFile } from "./taskRuleLoader.ts";
import * as taskRuleRepository from "../db/repositories/taskRuleRepository.ts";

beforeEach(async () => {
  const { db } = await import("../db/schema.ts");
  await db.delete();
  await db.open();
});

describe("parseRuleFile", () => {
  it("parses valid rule JSON", () => {
    const json = [
      {
        id: "a0000001-0000-4000-8000-000000000001",
        appliesTo: { plantType: "vegetable" },
        trigger: { type: "relative_to_last_frost", offsetDays: -42 },
        task: { title: "Start seeds", defaultPriority: "normal" },
        isBuiltIn: true,
      },
    ];
    const rules = parseRuleFile(json);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe("a0000001-0000-4000-8000-000000000001");
  });

  it("skips invalid rules and logs warning", () => {
    const json = [
      {
        id: "a0000001-0000-4000-8000-000000000001",
        appliesTo: { plantType: "vegetable" },
        trigger: { type: "relative_to_last_frost", offsetDays: -42 },
        task: { title: "Valid rule", defaultPriority: "normal" },
        isBuiltIn: true,
      },
      {
        id: "bad",
        appliesTo: {},
        trigger: { type: "invalid" },
        task: { title: "" },
        isBuiltIn: true,
      },
    ];
    const rules = parseRuleFile(json);
    expect(rules).toHaveLength(1);
  });
});

describe("loadBuiltInRules", () => {
  it("loads and persists rules into DB", async () => {
    await loadBuiltInRules();
    const all = await taskRuleRepository.getAll();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => r.isBuiltIn)).toBe(true);
  });

  it("is idempotent (running twice does not duplicate)", async () => {
    await loadBuiltInRules();
    const first = await taskRuleRepository.getAll();
    await loadBuiltInRules();
    const second = await taskRuleRepository.getAll();
    expect(first.length).toBe(second.length);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/taskRuleLoader.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/services/taskRuleLoader.ts
import { taskRuleSchema, type TaskRule } from "../validation/taskRule.schema.ts";
import * as taskRuleRepository from "../db/repositories/taskRuleRepository.ts";

// Import JSON rule files directly — Vite resolves these at build time
import vegetableRules from "../../data/taskRules/vegetables.json";
import herbRules from "../../data/taskRules/herbs.json";
import generalRules from "../../data/taskRules/general.json";

type RuleInput = Omit<TaskRule, "version" | "createdAt" | "updatedAt" | "deletedAt">;

/**
 * Validate an array of raw rule objects against the TaskRule schema.
 * Invalid entries are skipped with a console warning.
 */
export function parseRuleFile(raw: unknown[]): RuleInput[] {
  const validRules: RuleInput[] = [];

  for (let i = 0; i < raw.length; i++) {
    // We validate only the fields we need for upsert (without base entity timestamps)
    const item = raw[i];
    if (typeof item !== "object" || item == null) {
      console.warn(`taskRuleLoader: skipping invalid entry at index ${String(i)}`);
      continue;
    }

    const withDefaults = {
      ...(item as Record<string, unknown>),
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    const result = taskRuleSchema.safeParse(withDefaults);
    if (result.success) {
      validRules.push({
        id: result.data.id,
        appliesTo: result.data.appliesTo,
        trigger: result.data.trigger,
        task: result.data.task,
        isBuiltIn: result.data.isBuiltIn,
      });
    } else {
      console.warn(
        `taskRuleLoader: skipping invalid rule at index ${String(i)}:`,
        result.error.issues,
      );
    }
  }

  return validRules;
}

/**
 * Load all built-in rule JSON files and upsert into DB.
 * Safe to call on every app startup — uses upsertBuiltIn for idempotency.
 */
export async function loadBuiltInRules(): Promise<void> {
  const allFiles = [
    vegetableRules as unknown[],
    herbRules as unknown[],
    generalRules as unknown[],
  ];

  for (const file of allFiles) {
    const rules = parseRuleFile(file);
    for (const rule of rules) {
      await taskRuleRepository.upsertBuiltIn(rule);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/taskRuleLoader.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/taskRuleLoader.ts src/services/taskRuleLoader.test.ts
git commit -m "feat: add built-in task rules loader with validation and idempotent upsert"
```

---

### Task 6: Integrate Rule Loader into App Startup

**Files:**
- Modify: `src/App.tsx` (or wherever the app initializes — check actual entry point)

**Step 1: Find the app entry point**

Read `src/App.tsx` or `src/main.tsx` to find where initialization happens (e.g., a `useEffect` on mount).

**Step 2: Call `loadBuiltInRules()` on startup**

Add to the app initialization (alongside existing startup code like knowledge base loading):

```typescript
import { loadBuiltInRules } from "./services/taskRuleLoader.ts";

// Inside the root component or an init effect:
useEffect(() => {
  loadBuiltInRules().catch(console.error);
}, []);
```

**Step 3: Verify dev server starts without errors**

Run: `npm run dev`
Open browser, check no console errors.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: load built-in task rules on app startup"
```

---

### Task 7: Hook — useTaskSuggestions

**Files:**
- Create: `src/hooks/useTaskSuggestions.ts`

This hook wires the pure `generateSuggestions` engine to live Dexie data, returning reactive suggestions.

**Step 1: Write the hook**

```typescript
// src/hooks/useTaskSuggestions.ts
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { formatISO, startOfDay } from "date-fns";
import * as taskRuleRepository from "../db/repositories/taskRuleRepository.ts";
import * as plantRepository from "../db/repositories/plantRepository.ts";
import * as taskRepository from "../db/repositories/taskRepository.ts";
import { useSettings } from "./useSettings.ts";
import { generateSuggestions, type TaskSuggestion } from "../services/taskEngine.ts";

function todayDate(): string {
  return formatISO(startOfDay(new Date()), { representation: "date" });
}

/**
 * Returns task suggestions from the rule engine, excluding
 * rules that already have a corresponding accepted or dismissed task.
 */
export function useTaskSuggestions(): {
  suggestions: TaskSuggestion[] | undefined;
  isLoading: boolean;
} {
  const { settings } = useSettings();
  const rules = useLiveQuery(() => taskRuleRepository.getAll());
  const plants = useLiveQuery(() => plantRepository.getAll());
  const tasks = useLiveQuery(() => taskRepository.getAll());

  const suggestions = useMemo(() => {
    if (!rules || !plants || !tasks || !settings) return undefined;

    // Build a set of "ruleId::plantInstanceId" for tasks already generated
    const existingKeys = new Set<string>();
    for (const task of tasks) {
      if (task.ruleId && task.plantInstanceId) {
        existingKeys.add(`${task.ruleId}::${task.plantInstanceId}`);
      }
    }

    return generateSuggestions(rules, plants, settings, todayDate(), existingKeys);
  }, [rules, plants, tasks, settings]);

  return {
    suggestions,
    isLoading: suggestions === undefined,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useTaskSuggestions.ts
git commit -m "feat: add useTaskSuggestions hook wiring engine to live Dexie data"
```

---

### Task 8: Task Suggestions UI on Dashboard

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

Add a "Suggested Tasks" section between the Weather widget and "This Week's Tasks" that shows rule-generated suggestions with Accept / Dismiss buttons.

**Step 1: Add the suggestions section**

Import the hook and the repository:

```typescript
import { useTaskSuggestions } from "../hooks/useTaskSuggestions.ts";
import * as taskRepository from "../db/repositories/taskRepository";
import type { TaskSuggestion } from "../services/taskEngine.ts";
```

Inside the component:

```typescript
const { suggestions } = useTaskSuggestions();
```

Add accept/dismiss handlers:

```typescript
async function handleAcceptSuggestion(suggestion: TaskSuggestion) {
  try {
    await taskRepository.create({
      title: suggestion.title,
      dueDate: suggestion.dueDate,
      priority: suggestion.priority,
      isCompleted: false,
      plantInstanceId: suggestion.plantInstanceId,
      ruleId: suggestion.ruleId,
      isAutoGenerated: true,
      generatedAt: new Date().toISOString(),
      ...(suggestion.activityType != null
        ? { description: `Activity: ${suggestion.activityType}` }
        : {}),
      ...(activeSeason?.id ? { seasonId: activeSeason.id } : {}),
    });
    toast("Task added", "success");
  } catch {
    toast("Failed to add task", "error");
  }
}

async function handleDismissSuggestion(suggestion: TaskSuggestion) {
  try {
    await taskRepository.create({
      title: suggestion.title,
      dueDate: suggestion.dueDate,
      priority: suggestion.priority,
      isCompleted: false,
      plantInstanceId: suggestion.plantInstanceId,
      ruleId: suggestion.ruleId,
      isAutoGenerated: true,
      generatedAt: new Date().toISOString(),
      dismissedAt: new Date().toISOString(),
    });
  } catch {
    toast("Failed to dismiss suggestion", "error");
  }
}
```

Add the JSX section (before "This Week's Tasks"):

```tsx
{/* Suggested Tasks */}
{suggestions && suggestions.length > 0 && (
  <section className="mt-6">
    <h2 className="font-display text-lg font-semibold text-green-800">
      Suggested Tasks
    </h2>
    <div className="mt-2 space-y-2">
      {suggestions.map((s) => (
        <Card key={`${s.ruleId}-${s.plantInstanceId}`} className="border-green-200 bg-green-50/30">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-soil-900">
                {s.title}
              </p>
              <p className="mt-0.5 text-xs text-soil-500">
                {plantNames.get(s.plantInstanceId) ?? "Unknown plant"}
                {" \u00b7 "}Due {format(parseISO(s.dueDate), "MMM d")}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="primary"
                onClick={() => void handleAcceptSuggestion(s)}
                className="px-2 py-1 text-xs"
              >
                Add
              </Button>
              <Button
                variant="ghost"
                onClick={() => void handleDismissSuggestion(s)}
                className="px-2 py-1 text-xs text-soil-500"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </section>
)}
```

**Step 2: Also need active season for linking — add query**

The Dashboard already has `useLiveQuery` calls. Add the active season if not already present:

```typescript
const activeSeason = useLiveQuery(() => seasonRepository.getActive());
```

(Check if it's already there from existing code — if so, skip.)

**Step 3: Verify in dev**

Run: `npm run dev`
Add a vegetable plant, ensure frost dates are set in settings. Suggestions should appear.

**Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: add task suggestions section to dashboard with accept/dismiss"
```

---

### Task 9: Task Suggestions UI on Tasks Page

**Files:**
- Modify: `src/pages/TasksPage.tsx`

Add a collapsible "Suggestions" section at the top of the Tasks page, above pending tasks.

**Step 1: Add suggestions section**

Import the hook:

```typescript
import { useTaskSuggestions } from "../hooks/useTaskSuggestions.ts";
import type { TaskSuggestion } from "../services/taskEngine.ts";
```

Use the hook:

```typescript
const { suggestions } = useTaskSuggestions();
```

Add the same accept/dismiss handlers as the dashboard (adapted for the Tasks page context — use `activeSeasonId` from the existing season query).

Add collapsible section JSX above pending tasks:

```tsx
{/* Suggested Tasks */}
{suggestions && suggestions.length > 0 && (
  <section className="mt-4">
    <h2 className="font-display text-base font-semibold text-green-700">
      Suggested ({suggestions.length})
    </h2>
    <div className="mt-2 space-y-2">
      {suggestions.map((s) => (
        <Card key={`${s.ruleId}-${s.plantInstanceId}`} className="border-green-200 bg-green-50/30">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-soil-900">
                  {s.title}
                </span>
                <Badge variant="default">Suggested</Badge>
              </div>
              <p className="mt-0.5 text-xs text-soil-500">
                {plantNames.get(s.plantInstanceId) ?? "Unknown plant"}
                {" \u00b7 "}Due {format(parseISO(s.dueDate), "MMM d")}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="primary"
                onClick={() => void handleAcceptSuggestion(s)}
                className="px-2 py-1 text-xs"
              >
                Add
              </Button>
              <Button
                variant="ghost"
                onClick={() => void handleDismissSuggestion(s)}
                className="px-2 py-1 text-xs text-soil-500"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </section>
)}
```

**Step 2: Commit**

```bash
git add src/pages/TasksPage.tsx
git commit -m "feat: add task suggestions section to tasks page"
```

---

### Task 10: Export/Import Support for TaskRules

**Files:**
- Modify: `src/services/exporter.ts`

**Step 1: Add taskRules to export**

Import the schema:

```typescript
import { taskRuleSchema } from "../validation/taskRule.schema.ts";
```

Add `taskRules` to the `ImportResult["counts"]` type.

In `exportAll()`:
- Query `db.taskRules` (user-created only, `isBuiltIn === false`)
- Add `dataFolder.file("taskRules.json", ...)`

In `importFromZip()`:
- Add `taskRules` to the `counts` object
- Add entry to `tableValidations` array

**Step 2: Update SCHEMA_VERSION**

```typescript
const SCHEMA_VERSION = 4; // bumped for taskRules
```

**Step 3: Run existing exporter tests**

Run: `npx vitest run src/services/exporter.test.ts`
Expected: PASS (or update test expectations for the new counts field)

**Step 4: Commit**

```bash
git add src/services/exporter.ts
git commit -m "feat: add taskRules to export/import pipeline"
```

---

### Task 11: Build Check + Type Check

**Step 1: Run type check**

Run: `npm run build`
Expected: PASS — no TypeScript errors

**Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass

**Step 3: Fix any issues found**

If there are type errors or test failures, fix them.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type/test issues from TaskRules integration"
```

---

## Summary

| Task | What it builds | Key files |
|------|---------------|-----------|
| 1 | Zod schema | `src/validation/taskRule.schema.ts` |
| 2 | DB table + repository | `src/db/schema.ts`, `src/db/repositories/taskRuleRepository.ts` |
| 3 | Task engine (pure logic) | `src/services/taskEngine.ts` |
| 4 | Built-in rules JSON | `data/taskRules/*.json` |
| 5 | Rules loader service | `src/services/taskRuleLoader.ts` |
| 6 | App startup integration | `src/App.tsx` |
| 7 | React hook | `src/hooks/useTaskSuggestions.ts` |
| 8 | Dashboard suggestions UI | `src/pages/DashboardPage.tsx` |
| 9 | Tasks page suggestions UI | `src/pages/TasksPage.tsx` |
| 10 | Export/import | `src/services/exporter.ts` |
| 11 | Build + type check | — |
