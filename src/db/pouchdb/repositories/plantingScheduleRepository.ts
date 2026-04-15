/**
 * PlantingSchedule repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type PlantingSchedule } from "../../../validation/plantingSchedule.schema.ts";

const BASE = "/api/planting-schedules";

type CreateInput = Omit<
  PlantingSchedule,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateInput = Partial<CreateInput>;

export async function create(input: CreateInput): Promise<PlantingSchedule> {
  return post<PlantingSchedule>(BASE, input);
}

export async function update(id: string, changes: UpdateInput): Promise<PlantingSchedule> {
  return patch<PlantingSchedule>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<PlantingSchedule | undefined> {
  try {
    return await get<PlantingSchedule>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAll(): Promise<PlantingSchedule[]> {
  return get<PlantingSchedule[]>(BASE);
}

export async function getBySeasonId(seasonId: string): Promise<PlantingSchedule[]> {
  return get<PlantingSchedule[]>(`${BASE}?seasonId=${seasonId}`);
}

export async function getByBedId(bedId: string): Promise<PlantingSchedule[]> {
  return get<PlantingSchedule[]>(`${BASE}?bedId=${bedId}`);
}

export async function getByDateRange(start: string, end: string): Promise<PlantingSchedule[]> {
  return get<PlantingSchedule[]>(`${BASE}?start=${start}&end=${end}`);
}
