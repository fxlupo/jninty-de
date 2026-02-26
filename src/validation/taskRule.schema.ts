import { z } from "zod";
import { baseEntitySchema } from "./base.schema.ts";
import { plantTypeSchema } from "./plantInstance.schema.ts";
import { activityTypeSchema } from "./journalEntry.schema.ts";
import { taskPrioritySchema } from "./task.schema.ts";

export const taskTriggerTypeSchema = z.enum([
  "relative_to_last_frost",
  "relative_to_first_frost",
  "seasonal",
  "fixed_date",
]);

const appliesToSchema = z
  .object({
    plantType: plantTypeSchema.optional(),
    species: z.string().min(1).optional(),
    tagsAny: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
  .refine(
    (val) =>
      val.plantType != null || val.species != null || val.tagsAny != null,
    { message: "At least one criterion required in appliesTo" },
  );

const triggerSchema = z
  .object({
    type: taskTriggerTypeSchema,
    offsetDays: z.number().int().optional(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
  })
  .strict();

const ruleTaskSchema = z
  .object({
    title: z.string().min(1),
    activityType: activityTypeSchema.optional(),
    defaultPriority: taskPrioritySchema.optional(),
  })
  .strict();

export const taskRuleSchema = baseEntitySchema
  .extend({
    appliesTo: appliesToSchema,
    trigger: triggerSchema,
    task: ruleTaskSchema,
    isBuiltIn: z.boolean(),
  })
  .strict();

export type TaskTriggerType = z.infer<typeof taskTriggerTypeSchema>;
export type TaskRule = z.infer<typeof taskRuleSchema>;
