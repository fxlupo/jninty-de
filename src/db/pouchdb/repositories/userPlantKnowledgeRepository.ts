/**
 * UserPlantKnowledge repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type UserPlantKnowledge } from "../../../validation/userPlantKnowledge.schema.ts";

const BASE = "/api/knowledge";

/**
 * Optional data keys that should be cleared when replaceAll is true.
 * The client pre-processes the changes object to strip these fields from
 * the existing record before merging, then sends the full replacement.
 */
const OPTIONAL_DATA_KEYS: readonly (keyof UserPlantKnowledge)[] = [
  "variety",
  "soilPreference",
  "growthRate",
  "spacingInches",
  "matureHeightInches",
  "matureSpreadInches",
  "indoorStartWeeksBeforeLastFrost",
  "transplantWeeksAfterLastFrost",
  "directSowWeeksBeforeLastFrost",
  "directSowWeeksAfterLastFrost",
  "daysToGermination",
  "daysToMaturity",
  "goodCompanions",
  "badCompanions",
  "commonPests",
  "commonDiseases",
];

type CreateInput = Omit<
  UserPlantKnowledge,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateInput = Partial<CreateInput>;

export async function create(input: CreateInput): Promise<UserPlantKnowledge> {
  return post<UserPlantKnowledge>(BASE, input);
}

export async function update(
  id: string,
  changes: UpdateInput,
  options?: { replaceAll?: boolean },
): Promise<UserPlantKnowledge> {
  if (options?.replaceAll) {
    // Fetch existing, strip optional fields, then merge with changes
    let existing: UserPlantKnowledge | undefined;
    try {
      existing = await get<UserPlantKnowledge>(`${BASE}/${id}`);
    } catch {
      // fall through — server will 404
    }
    if (existing) {
      const stripped = { ...existing } as Partial<UserPlantKnowledge>;
      for (const key of OPTIONAL_DATA_KEYS) {
        delete stripped[key];
      }
      return patch<UserPlantKnowledge>(`${BASE}/${id}`, { ...stripped, ...changes });
    }
  }
  return patch<UserPlantKnowledge>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<UserPlantKnowledge | undefined> {
  try {
    return await get<UserPlantKnowledge>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAll(): Promise<UserPlantKnowledge[]> {
  return get<UserPlantKnowledge[]>(BASE);
}
