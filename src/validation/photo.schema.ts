import { z } from "zod";
import { baseEntitySchema, isoTimestamp } from "./base.schema.ts";

export const photoSchema = baseEntitySchema
  .extend({
    thumbnailUrl: z.string().min(1),
    displayUrl: z.string().min(1).optional(),
    originalStored: z.boolean(),
    caption: z.string().min(1).optional(),
    takenAt: isoTimestamp.optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict();

export type Photo = z.infer<typeof photoSchema>;
