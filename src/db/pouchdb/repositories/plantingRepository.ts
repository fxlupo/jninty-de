/**
 * Planting repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type Planting } from "../../../validation/planting.schema.ts";

const BASE = "/api/plantings";

type CreatePlantingInput = Omit<
  Planting,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdatePlantingInput = Partial<CreatePlantingInput>;

export async function create(input: CreatePlantingInput): Promise<Planting> {
  return post<Planting>(BASE, input);
}

export async function update(id: string, changes: UpdatePlantingInput): Promise<Planting> {
  return patch<Planting>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<Planting | undefined> {
  try {
    return await get<Planting>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getBySeason(seasonId: string): Promise<Planting[]> {
  return get<Planting[]>(`${BASE}?seasonId=${seasonId}`);
}

export async function getByPlant(plantInstanceId: string): Promise<Planting[]> {
  return get<Planting[]>(`${BASE}?plantId=${plantInstanceId}`);
}

export async function getByBed(bedId: string): Promise<Planting[]> {
  return get<Planting[]>(`${BASE}?bedId=${bedId}`);
}

export async function getAll(): Promise<Planting[]> {
  return get<Planting[]>(BASE);
}
