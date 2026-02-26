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

export const taskRuleAppliesToSchema = z
  .object({
    plantType: plantTypeSchema.optional(),
    species: z.string().min(1).optional(),
    tagsAny: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const taskRuleTriggerSchema = z
  .object({
    type: taskTriggerTypeSchema,
    offsetDays: z.number().int().optional(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
  })
  .strict();

export const taskRuleTaskSchema = z
  .object({
    title: z.string().min(1),
    activityType: activityTypeSchema.optional(),
    defaultPriority: taskPrioritySchema.optional(),
  })
  .strict();

export const taskRuleSchema = baseEntitySchema
  .extend({
    appliesTo: taskRuleAppliesToSchema,
    trigger: taskRuleTriggerSchema,
    task: taskRuleTaskSchema,
    isBuiltIn: z.boolean(),
  })
  .strict();

export type TaskTriggerType = z.infer<typeof taskTriggerTypeSchema>;
export type TaskRuleAppliesTo = z.infer<typeof taskRuleAppliesToSchema>;
export type TaskRuleTrigger = z.infer<typeof taskRuleTriggerSchema>;
export type TaskRuleTask = z.infer<typeof taskRuleTaskSchema>;
export type TaskRule = z.infer<typeof taskRuleSchema>;
