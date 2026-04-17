import { z } from "zod";

export const gardenMapPinSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
  plantInstanceId: z.string().uuid(),
  gridX: z.number(),
  gridY: z.number(),
  sizeM: z.number().positive().default(0.5),
  label: z.string().optional().nullable(),
});

export type GardenMapPin = z.infer<typeof gardenMapPinSchema>;
