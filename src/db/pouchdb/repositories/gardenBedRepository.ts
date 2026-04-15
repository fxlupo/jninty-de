/**
 * GardenBed repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type GardenBed, type BedType } from "../../../validation/gardenBed.schema.ts";

const BASE = "/api/garden-beds";

type CreateGardenBedInput = Omit<
  GardenBed,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateGardenBedInput = Partial<CreateGardenBedInput>;

export async function create(input: CreateGardenBedInput): Promise<GardenBed> {
  return post<GardenBed>(BASE, input);
}

export async function update(id: string, changes: UpdateGardenBedInput): Promise<GardenBed> {
  return patch<GardenBed>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<GardenBed | undefined> {
  try {
    return await get<GardenBed>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAll(): Promise<GardenBed[]> {
  return get<GardenBed[]>(BASE);
}

export async function getByType(type: BedType): Promise<GardenBed[]> {
  return get<GardenBed[]>(`${BASE}?type=${encodeURIComponent(type)}`);
}
