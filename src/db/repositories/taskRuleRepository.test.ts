import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../schema.ts";
import * as taskRuleRepo from "./taskRuleRepository.ts";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("taskRuleRepository", () => {
  describe("getBuiltInRules", () => {
    it("returns at least 20 built-in rules", () => {
      const rules = taskRuleRepo.getBuiltInRules();
      expect(rules.length).toBeGreaterThanOrEqual(20);
    });

    it("all built-in rules have isBuiltIn = true", () => {
      const rules = taskRuleRepo.getBuiltInRules();
      for (const rule of rules) {
        expect(rule.isBuiltIn).toBe(true);
      }
    });

    it("all built-in rules have valid trigger types", () => {
      const validTypes = [
        "relative_to_last_frost",
        "relative_to_first_frost",
        "seasonal",
        "fixed_date",
      ];
      const rules = taskRuleRepo.getBuiltInRules();
      for (const rule of rules) {
        expect(validTypes).toContain(rule.trigger.type);
      }
    });

    it("all built-in rules have non-empty titles", () => {
      const rules = taskRuleRepo.getBuiltInRules();
      for (const rule of rules) {
        expect(rule.task.title.length).toBeGreaterThan(0);
      }
    });
  });

  describe("create (user rules)", () => {
    it("creates a user rule in IndexedDB", async () => {
      const rule = await taskRuleRepo.create({
        appliesTo: { species: "Rosa" },
        trigger: { type: "seasonal", month: 11 },
        task: { title: "Winterize roses" },
        isBuiltIn: false,
      });

      expect(rule.id).toBeDefined();
      expect(rule.isBuiltIn).toBe(false);
      expect(rule.task.title).toBe("Winterize roses");
    });
  });

  describe("getUserRules", () => {
    it("returns only user-created rules", async () => {
      await taskRuleRepo.create({
        appliesTo: { species: "Rosa" },
        trigger: { type: "seasonal", month: 11 },
        task: { title: "Winterize roses" },
        isBuiltIn: false,
      });

      const userRules = await taskRuleRepo.getUserRules();
      expect(userRules).toHaveLength(1);
      expect(userRules[0]?.task.title).toBe("Winterize roses");
    });

    it("excludes soft-deleted rules", async () => {
      const rule = await taskRuleRepo.create({
        appliesTo: { species: "Rosa" },
        trigger: { type: "seasonal", month: 11 },
        task: { title: "Winterize roses" },
        isBuiltIn: false,
      });
      await taskRuleRepo.softDelete(rule.id);

      const userRules = await taskRuleRepo.getUserRules();
      expect(userRules).toHaveLength(0);
    });
  });

  describe("getAll", () => {
    it("returns built-in + user rules", async () => {
      await taskRuleRepo.create({
        appliesTo: { species: "Rosa" },
        trigger: { type: "seasonal", month: 11 },
        task: { title: "Winterize roses" },
        isBuiltIn: false,
      });

      const allRules = await taskRuleRepo.getAll();
      const builtInCount = taskRuleRepo.getBuiltInRules().length;
      expect(allRules.length).toBe(builtInCount + 1);
    });
  });

  describe("softDelete", () => {
    it("soft-deletes a user rule", async () => {
      const rule = await taskRuleRepo.create({
        appliesTo: { species: "Rosa" },
        trigger: { type: "seasonal", month: 11 },
        task: { title: "Winterize roses" },
        isBuiltIn: false,
      });

      await taskRuleRepo.softDelete(rule.id);

      const raw = await db.taskRules.get(rule.id);
      expect(raw?.deletedAt).toBeDefined();
    });

    it("throws for non-existent rule", async () => {
      await expect(
        taskRuleRepo.softDelete("non-existent-id"),
      ).rejects.toThrow("TaskRule not found");
    });
  });
});
