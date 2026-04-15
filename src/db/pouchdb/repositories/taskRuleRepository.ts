/**
 * TaskRule repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, put, patch, del } from "../../api/client.ts";
import { type TaskRule } from "../../../validation/taskRule.schema.ts";

const BASE = "/api/task-rules";

type CreateTaskRuleInput = Omit<
  TaskRule,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateTaskRuleInput = Partial<CreateTaskRuleInput>;

type UpsertBuiltInInput = Omit<
  TaskRule,
  "version" | "createdAt" | "updatedAt" | "deletedAt"
> & { id: string };

export async function create(input: CreateTaskRuleInput): Promise<TaskRule> {
  return post<TaskRule>(BASE, input);
}

export async function update(id: string, changes: UpdateTaskRuleInput): Promise<TaskRule> {
  return patch<TaskRule>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<TaskRule | undefined> {
  try {
    return await get<TaskRule>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAll(): Promise<TaskRule[]> {
  return get<TaskRule[]>(BASE);
}

export async function getBuiltIn(): Promise<TaskRule[]> {
  return get<TaskRule[]>(`${BASE}?builtIn=1`);
}

export async function getUserCreated(): Promise<TaskRule[]> {
  return get<TaskRule[]>(`${BASE}?builtIn=0`);
}

export async function upsertBuiltIn(input: UpsertBuiltInInput): Promise<TaskRule> {
  return put<TaskRule>(`${BASE}/${input.id}`, input);
}
