/**
 * Season repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type Season } from "../../../validation/season.schema.ts";

const BASE = "/api/seasons";

type CreateSeasonInput = Omit<
  Season,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateSeasonInput = Partial<CreateSeasonInput>;

export async function create(input: CreateSeasonInput): Promise<Season> {
  return post<Season>(BASE, input);
}

export async function update(id: string, changes: UpdateSeasonInput): Promise<Season> {
  return patch<Season>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<Season | undefined> {
  try {
    return await get<Season>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getActive(): Promise<Season | undefined> {
  const all = await getAll();
  return all.find((s) => s.isActive);
}

export async function getAll(): Promise<Season[]> {
  return get<Season[]>(BASE);
}

export async function setActive(id: string): Promise<Season> {
  return post<Season>(`${BASE}/${id}/activate`, {});
}
