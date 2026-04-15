/**
 * Seed repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type Seed } from "../../../validation/seed.schema.ts";

const BASE = "/api/seeds";

type CreateSeedInput = Omit<
  Seed,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateSeedInput = Partial<CreateSeedInput>;

export async function create(input: CreateSeedInput): Promise<Seed> {
  return post<Seed>(BASE, input);
}

export async function update(id: string, changes: UpdateSeedInput): Promise<Seed> {
  return patch<Seed>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<Seed | undefined> {
  try {
    return await get<Seed>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAll(): Promise<Seed[]> {
  return get<Seed[]>(BASE);
}

export async function getBySpecies(species: string): Promise<Seed[]> {
  return get<Seed[]>(`${BASE}?species=${encodeURIComponent(species)}`);
}

export async function getExpiringSoon(days: number): Promise<Seed[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const all = await getAll();
  const today = new Date().toISOString().slice(0, 10);
  return all.filter((s) => s.expiryDate != null && s.expiryDate >= today && s.expiryDate <= cutoffDate);
}

export async function deductQuantity(id: string, amount: number): Promise<Seed> {
  if (amount <= 0) throw new Error("Deduction amount must be positive");
  const seed = await get<Seed>(`${BASE}/${id}`);
  if (seed.quantityRemaining < amount) throw new Error("Insufficient quantity");
  return patch<Seed>(`${BASE}/${id}`, { quantityRemaining: seed.quantityRemaining - amount });
}
