import { z } from "zod";

export const isoTimestamp = z.string().datetime();

export const baseEntitySchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.optional(),
});
