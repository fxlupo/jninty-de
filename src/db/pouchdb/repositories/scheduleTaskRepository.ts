/**
 * ScheduleTask repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type ScheduleTask } from "../../../validation/scheduleTask.schema.ts";

const BASE = "/api/schedule-tasks";

type CreateInput = Omit<
  ScheduleTask,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateInput = Partial<CreateInput>;

export async function create(input: CreateInput): Promise<ScheduleTask> {
  return post<ScheduleTask>(BASE, input);
}

export async function createBatch(inputs: CreateInput[]): Promise<ScheduleTask[]> {
  return post<ScheduleTask[]>(`${BASE}/batch`, inputs);
}

export async function update(id: string, changes: UpdateInput): Promise<ScheduleTask> {
  return patch<ScheduleTask>(`${BASE}/${id}`, changes);
}

export async function complete(id: string, completedDate?: string): Promise<ScheduleTask> {
  return patch<ScheduleTask>(`${BASE}/${id}/complete`, completedDate ? { completedDate } : {});
}

export async function uncomplete(id: string): Promise<ScheduleTask> {
  return patch<ScheduleTask>(`${BASE}/${id}/uncomplete`, {});
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function softDeleteByScheduleId(plantingScheduleId: string): Promise<void> {
  await del(`${BASE}/bulk?scheduleId=${plantingScheduleId}`);
}

export async function getById(id: string): Promise<ScheduleTask | undefined> {
  try {
    return await get<ScheduleTask>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAll(): Promise<ScheduleTask[]> {
  return get<ScheduleTask[]>(BASE);
}

export async function getByScheduleId(plantingScheduleId: string): Promise<ScheduleTask[]> {
  return get<ScheduleTask[]>(`${BASE}?scheduleId=${plantingScheduleId}`);
}

export async function getByDateRange(start: string, end: string): Promise<ScheduleTask[]> {
  return get<ScheduleTask[]>(`${BASE}?start=${start}&end=${end}`);
}

export async function getIncompleteDownstream(
  plantingScheduleId: string,
  sequenceOrder: number,
): Promise<ScheduleTask[]> {
  const tasks = await getByScheduleId(plantingScheduleId);
  return tasks.filter((t) => t.sequenceOrder > sequenceOrder && !t.isCompleted);
}

export async function updateBatch(
  updates: Array<{ id: string; changes: UpdateInput }>,
): Promise<ScheduleTask[]> {
  return Promise.all(updates.map(({ id, changes }) => update(id, changes)));
}
