/**
 * Plant repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import type {
  PlantInstance,
  PlantStatus,
  PlantType,
} from "../../../validation/plantInstance.schema.ts";

const BASE = "/api/plants";

type CreatePlantInput = Omit<
  PlantInstance,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdatePlantInput = Partial<CreatePlantInput>;

export async function create(input: CreatePlantInput): Promise<PlantInstance> {
  return post<PlantInstance>(BASE, input);
}

export async function update(
  id: string,
  changes: UpdatePlantInput,
): Promise<PlantInstance> {
  return patch<PlantInstance>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<PlantInstance | undefined> {
  try {
    return await get<PlantInstance>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAll(): Promise<PlantInstance[]> {
  return get<PlantInstance[]>(BASE);
}

export async function getByStatus(status: PlantStatus): Promise<PlantInstance[]> {
  const all = await getAll();
  return all.filter((p) => p.status === status);
}

export async function getByType(type: PlantType): Promise<PlantInstance[]> {
  const all = await getAll();
  return all.filter((p) => p.type === type);
}
