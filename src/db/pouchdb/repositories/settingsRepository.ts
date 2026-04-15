/**
 * Settings repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get as apiGet, put } from "../../api/client.ts";
import { type Settings } from "../../../validation/settings.schema.ts";

const BASE = "/api/settings";

export async function get(): Promise<Settings | undefined> {
  try {
    return await apiGet<Settings>(BASE);
  } catch {
    return undefined;
  }
}

export async function update(changes: Partial<Settings>): Promise<Settings> {
  return put<Settings>(BASE, changes);
}

export async function clearLocation(): Promise<Settings> {
  return put<Settings>(BASE, { latitude: null, longitude: null });
}
