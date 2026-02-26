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
  // Full table scan + filter — the isBuiltIn index on booleans is unreliable
  // across IndexedDB implementations. Dataset size is small (< 100 rules).
  const records = await db.taskRules.toArray();
  return records.filter((r) => r.deletedAt == null && r.isBuiltIn);
}

export async function getUserCreated(): Promise<TaskRule[]> {
  const records = await db.taskRules.toArray();
  return records.filter((r) => r.deletedAt == null && !r.isBuiltIn);
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
