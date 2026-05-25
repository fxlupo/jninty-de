import { get, post, patch, del } from "../../api/client.ts";

const BASE = "/api/plant-reminders";

export type ReminderCategory = "pruning" | "fertilizing" | "other";
export type ReminderRecurrence = "once" | "biannual" | "yearly" | "every_2y" | "every_3y" | "every_4y";
export type ReminderStatus = "active" | "expired";

export interface PlantReminder {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  userId: string;
  plantId: string;
  category: ReminderCategory;
  title: string;
  notes: string | null;
  startDate: string;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  lastRunAt: string | null;
}

export type ReminderInput = {
  plantId: string;
  category: ReminderCategory;
  title: string;
  notes?: string | null;
  startDate: string;
  recurrence: ReminderRecurrence;
};

export async function getByPlantId(plantId: string): Promise<PlantReminder[]> {
  return get<PlantReminder[]>(`${BASE}?plantId=${plantId}`);
}

export async function upsert(input: ReminderInput): Promise<PlantReminder> {
  return post<PlantReminder>(BASE, input);
}

export async function update(id: string, changes: Partial<ReminderInput>): Promise<PlantReminder> {
  return patch<PlantReminder>(`${BASE}/${id}`, changes);
}

export async function remove(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}
