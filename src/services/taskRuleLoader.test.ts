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
