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
