/**
 * Journal repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import {
  type JournalEntry,
  type ActivityType,
} from "../../../validation/journalEntry.schema.ts";

const BASE = "/api/journal";

type CreateJournalInput = Omit<
  JournalEntry,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateJournalInput = Partial<CreateJournalInput>;

export async function create(input: CreateJournalInput): Promise<JournalEntry> {
  return post<JournalEntry>(BASE, input);
}

export async function update(id: string, changes: UpdateJournalInput): Promise<JournalEntry> {
  return patch<JournalEntry>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<JournalEntry | undefined> {
  try {
    return await get<JournalEntry>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getByPlantId(plantInstanceId: string): Promise<JournalEntry[]> {
  return get<JournalEntry[]>(`${BASE}?plantId=${plantInstanceId}`);
}

export async function getRecent(limit: number): Promise<JournalEntry[]> {
  return get<JournalEntry[]>(`${BASE}?limit=${limit}`);
}

export async function getByActivityType(activityType: ActivityType): Promise<JournalEntry[]> {
  return get<JournalEntry[]>(`${BASE}?activityType=${activityType}`);
}

export async function getAll(): Promise<JournalEntry[]> {
  return get<JournalEntry[]>(BASE);
}

export async function getByDateRange(start: string, end: string): Promise<JournalEntry[]> {
  return get<JournalEntry[]>(`${BASE}?start=${start}&end=${end}`);
}

export async function getBySeasonId(seasonId: string): Promise<JournalEntry[]> {
  return get<JournalEntry[]>(`${BASE}?seasonId=${seasonId}`);
}
