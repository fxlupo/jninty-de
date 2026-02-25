import { z } from "zod";
import { baseEntitySchema, isoTimestamp } from "./base.schema.ts";

export const taskPrioritySchema = z.enum(["urgent", "normal", "low"]);

export const recurrenceTypeSchema = z.enum([
  "daily",
  "weekly",
  "monthly",
  "custom",
]);

export const recurrenceSchema = z.object({
  type: recurrenceTypeSchema,
  interval: z.number().int().positive(),
});

export const taskSchema = baseEntitySchema.extend({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  plantInstanceId: z.string().uuid().optional(),
  bedId: z.string().uuid().optional(),
  dueDate: isoTimestamp,
  priority: taskPrioritySchema,
  isCompleted: z.boolean(),
  completedAt: isoTimestamp.optional(),
  recurrence: recurrenceSchema.optional(),
});
