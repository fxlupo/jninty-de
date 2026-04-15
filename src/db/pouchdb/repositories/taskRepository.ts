/**
 * Task repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type Task } from "../../../validation/task.schema.ts";

const BASE = "/api/tasks";

type CreateTaskInput = Omit<
  Task,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateTaskInput = Partial<CreateTaskInput>;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function create(input: CreateTaskInput): Promise<Task> {
  return post<Task>(BASE, input);
}

export async function update(id: string, changes: UpdateTaskInput): Promise<Task> {
  return patch<Task>(`${BASE}/${id}`, changes);
}

export async function complete(id: string): Promise<Task> {
  return post<Task>(`${BASE}/${id}/complete`, {});
}

export async function uncomplete(id: string): Promise<Task> {
  return post<Task>(`${BASE}/${id}/uncomplete`, {});
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<Task | undefined> {
  try {
    return await get<Task>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getUpcoming(days: number): Promise<Task[]> {
  const today = todayDate();
  const future = addDays(today, days);
  return get<Task[]>(`${BASE}?start=${today}&end=${future}`);
}

export async function getOverdue(): Promise<Task[]> {
  return get<Task[]>(`${BASE}?overdue=1`);
}

export async function getAll(): Promise<Task[]> {
  return get<Task[]>(BASE);
}

export async function getByDateRange(start: string, end: string): Promise<Task[]> {
  return get<Task[]>(`${BASE}?start=${start}&end=${end}`);
}

export async function getByPlantId(plantInstanceId: string): Promise<Task[]> {
  return get<Task[]>(`${BASE}?plantId=${plantInstanceId}`);
}

export async function getBySeasonId(seasonId: string): Promise<Task[]> {
  return get<Task[]>(`${BASE}?seasonId=${seasonId}`);
}
