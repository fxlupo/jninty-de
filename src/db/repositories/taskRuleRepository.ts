import { db } from "../schema.ts";
import {
  taskRuleSchema,
  type TaskRule,
} from "../../validation/taskRule.schema.ts";
import builtInRulesJson from "../../../data/taskRules.json";

function now(): string {
  return new Date().toISOString();
}

/**
 * Loads bundled rules from the JSON file, normalising them into full
 * TaskRule entities. These are NOT stored in IndexedDB — they're
 * always derived from the shipped JSON at runtime.
 */
export function getBuiltInRules(): TaskRule[] {
  const timestamp = now();
  return (builtInRulesJson as Record<string, unknown>[]).map((raw) => {
    const full = {
      ...raw,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      isBuiltIn: true,
    };
    return taskRuleSchema.parse(full);
  });
}

/** Returns user-created rules stored in IndexedDB. */
export async function getUserRules(): Promise<TaskRule[]> {
  const records = await db.taskRules.toArray();
  return records.filter((r) => r.deletedAt == null);
}

/** Returns all rules: built-in + user-created. */
export async function getAll(): Promise<TaskRule[]> {
  const builtIn = getBuiltInRules();
  const userRules = await getUserRules();
  return [...builtIn, ...userRules];
}

type CreateTaskRuleInput = Omit<
  TaskRule,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt" | "isBuiltIn"
>;

export async function create(input: CreateTaskRuleInput): Promise<TaskRule> {
  const timestamp = now();
  const record: TaskRule = {
    ...input,
    id: crypto.randomUUID(),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    isBuiltIn: false,
  };
  const parsed = taskRuleSchema.parse(record);
  await db.taskRules.add(parsed);
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
