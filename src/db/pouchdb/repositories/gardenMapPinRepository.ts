import { get, post, patch, del } from "../../api/client.ts";
import type { GardenMapPin } from "../../../validation/gardenMapPin.schema.ts";

const BASE = "/api/garden-map-pins";

export async function create(input: {
  plantInstanceId: string;
  gridX: number;
  gridY: number;
  sizeM?: number;
  label?: string;
}): Promise<GardenMapPin> {
  return post<GardenMapPin>(BASE, input);
}

export async function update(id: string, changes: { sizeM?: number; gridX?: number; gridY?: number; label?: string }): Promise<GardenMapPin> {
  return patch<GardenMapPin>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getAll(): Promise<GardenMapPin[]> {
  return get<GardenMapPin[]>(BASE);
}
