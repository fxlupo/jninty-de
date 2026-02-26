import { describe, it, expect } from "vitest";
import { taskRuleSchema } from "./taskRule.schema.ts";

const timestamp = "2026-01-01T00:00:00.000Z";

const validRule = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  appliesTo: { plantType: "vegetable" },
  trigger: { type: "relative_to_last_frost", offsetDays: -42 },
  task: { title: "Start seeds indoors", defaultPriority: "normal" },
  isBuiltIn: true,
};

describe("taskRuleSchema", () => {
  it("validates a complete rule", () => {
    const result = taskRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
  });

  it("validates all trigger types", () => {
    const types = [
      "relative_to_last_frost",
      "relative_to_first_frost",
      "seasonal",
      "fixed_date",
    ];
    for (const type of types) {
      const result = taskRuleSchema.safeParse({
        ...validRule,
        trigger: { type, month: 3, day: 15, offsetDays: 0 },
      });
      expect(result.success).toBe(true);
    }
  });

  it("validates all plant types in appliesTo", () => {
    const types = [
      "vegetable",
      "herb",
      "flower",
      "ornamental",
      "fruit_tree",
      "berry",
      "other",
    ];
    for (const plantType of types) {
      const result = taskRuleSchema.safeParse({
        ...validRule,
        appliesTo: { plantType },
      });
      expect(result.success).toBe(true);
    }
  });

  it("allows appliesTo with species only", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      appliesTo: { species: "Solanum lycopersicum" },
    });
    expect(result.success).toBe(true);
  });

  it("allows appliesTo with tagsAny only", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      appliesTo: { tagsAny: ["nightshade", "indoor-start"] },
    });
    expect(result.success).toBe(true);
  });

  it("allows empty appliesTo (matches no plants in engine)", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      appliesTo: {},
    });
    expect(result.success).toBe(true);
  });

  it("allows optional activityType in task", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      task: {
        title: "Prune",
        activityType: "pruning",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid trigger type", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      trigger: { type: "invalid_type", offsetDays: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects month out of range", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      trigger: { type: "seasonal", month: 13 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects month = 0", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      trigger: { type: "seasonal", month: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title in task", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      task: { title: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing isBuiltIn", () => {
    const { isBuiltIn: _, ...noBuiltIn } = validRule;
    void _;
    const result = taskRuleSchema.safeParse(noBuiltIn);
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict mode)", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      unknownField: "bad",
    });
    expect(result.success).toBe(false);
  });

  it("allows deletedAt", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      deletedAt: timestamp,
    });
    expect(result.success).toBe(true);
  });

  // Trigger refinement tests
  it("rejects frost-relative trigger without offsetDays", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      trigger: { type: "relative_to_last_frost" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects first-frost trigger without offsetDays", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      trigger: { type: "relative_to_first_frost" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects seasonal trigger without month", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      trigger: { type: "seasonal" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects fixed_date trigger without day", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      trigger: { type: "fixed_date", month: 6 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts fixed_date trigger with month and day", () => {
    const result = taskRuleSchema.safeParse({
      ...validRule,
      trigger: { type: "fixed_date", month: 6, day: 21 },
    });
    expect(result.success).toBe(true);
  });
});
