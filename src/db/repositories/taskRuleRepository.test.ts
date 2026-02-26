import { describe, it, expect, beforeEach } from "vitest";
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
