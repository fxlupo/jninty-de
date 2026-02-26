import { addDays, parseISO, formatISO, startOfDay } from "date-fns";
import type { TaskRule } from "../validation/taskRule.schema.ts";
import type { PlantInstance } from "../validation/plantInstance.schema.ts";
import type { Settings } from "../validation/settings.schema.ts";
import type { Task } from "../validation/task.schema.ts";
import { db } from "../db/schema.ts";
import type { DismissedSuggestion } from "../db/schema.ts";
import * as taskRepository from "../db/repositories/taskRepository.ts";

// ─── Types ───

export interface TaskSuggestion {
  /** Deterministic id: ruleId::plantInstanceId */
  suggestionId: string;
  ruleId: string;
  plantInstanceId: string;
  plantName: string;
  title: string;
  dueDate: string; // ISO date
  priority: "urgent" | "normal" | "low";
  activityType?: string;
}

type FrostSettings = Pick<Settings, "lastFrostDate" | "firstFrostDate">;

// ─── Date computation ───

/**
 * Computes the due date for a task rule given frost-date settings.
 * Returns an ISO date string (YYYY-MM-DD) or null if the rule
 * trigger type cannot be resolved.
 */
export function computeDueDate(
  rule: TaskRule,
  settings: FrostSettings,
): string | null {
  const { trigger } = rule;

  switch (trigger.type) {
    case "relative_to_last_frost": {
      if (trigger.offsetDays == null) return null;
      const lastFrost = parseISO(settings.lastFrostDate);
      const date = addDays(lastFrost, trigger.offsetDays);
      return formatISO(startOfDay(date), { representation: "date" });
    }

    case "relative_to_first_frost": {
      if (trigger.offsetDays == null) return null;
      const firstFrost = parseISO(settings.firstFrostDate);
      const date = addDays(firstFrost, trigger.offsetDays);
      return formatISO(startOfDay(date), { representation: "date" });
    }

    case "seasonal": {
      if (trigger.month == null) return null;
      // Use the 15th of the specified month in the current year
      const year = new Date().getFullYear();
      const date = new Date(year, trigger.month - 1, 15);
      return formatISO(startOfDay(date), { representation: "date" });
    }

    case "fixed_date": {
      if (trigger.month == null || trigger.day == null) return null;
      const year = new Date().getFullYear();
      const date = new Date(year, trigger.month - 1, trigger.day);
      return formatISO(startOfDay(date), { representation: "date" });
    }

    default:
      return null;
  }
}

// ─── Rule matching ───

/**
 * Checks whether a rule applies to a given plant instance.
 * A rule matches if ALL specified criteria in appliesTo match.
 * An empty appliesTo matches no plants (requires at least one criterion).
 */
export function ruleMatchesPlant(
  rule: TaskRule,
  plant: PlantInstance,
): boolean {
  const { appliesTo } = rule;

  const hasAnyCriteria =
    appliesTo.plantType != null ||
    appliesTo.species != null ||
    (appliesTo.tagsAny != null && appliesTo.tagsAny.length > 0);

  if (!hasAnyCriteria) return false;

  // All specified criteria must match
  if (appliesTo.plantType != null && plant.type !== appliesTo.plantType) {
    return false;
  }

  if (appliesTo.species != null) {
    // Case-insensitive partial match on species (e.g. "Solanum lycopersicum"
    // matches a plant with species "Solanum lycopersicum var. cerasiforme")
    const ruleSpecies = appliesTo.species.toLowerCase();
    const plantSpecies = plant.species.toLowerCase();
    if (!plantSpecies.startsWith(ruleSpecies)) {
      return false;
    }
  }

  if (appliesTo.tagsAny != null && appliesTo.tagsAny.length > 0) {
    const hasMatch = appliesTo.tagsAny.some((tag) =>
      plant.tags.includes(tag),
    );
    if (!hasMatch) return false;
  }

  return true;
}

// ─── Suggestion generation ───

/**
 * Generates task suggestions by matching rules against the user's plants.
 * Filters out:
 * - suggestions with past due dates
 * - suggestions already accepted (task with same ruleId + plantInstanceId exists)
 * - suggestions already dismissed
 */
export async function generateTaskSuggestions(
  plants: PlantInstance[],
  settings: FrostSettings,
  rules: TaskRule[],
): Promise<TaskSuggestion[]> {
  const today = formatISO(startOfDay(new Date()), { representation: "date" });

  // Load existing tasks to check for already-accepted suggestions
  const existingTasks = await db.tasks.toArray();
  const acceptedKeys = new Set(
    existingTasks
      .filter((t) => t.ruleId != null && t.plantInstanceId != null && t.deletedAt == null)
      .map((t) => `${t.ruleId}::${t.plantInstanceId}`),
  );

  // Load dismissed suggestions
  const dismissed = await db.dismissedSuggestions.toArray();
  const dismissedKeys = new Set(dismissed.map((d) => d.id));

  const suggestions: TaskSuggestion[] = [];
  const activePlants = plants.filter(
    (p) => p.status === "active" && p.deletedAt == null,
  );

  for (const rule of rules) {
    const dueDate = computeDueDate(rule, settings);
    if (dueDate == null) continue;

    // Only suggest future or today's tasks
    if (dueDate < today) continue;

    for (const plant of activePlants) {
      if (!ruleMatchesPlant(rule, plant)) continue;

      const suggestionId = `${rule.id}::${plant.id}`;

      // Skip if already accepted or dismissed
      if (acceptedKeys.has(suggestionId)) continue;
      if (dismissedKeys.has(suggestionId)) continue;

      suggestions.push({
        suggestionId,
        ruleId: rule.id,
        plantInstanceId: plant.id,
        plantName: plant.nickname ?? plant.species,
        title: rule.task.title,
        dueDate,
        priority: rule.task.defaultPriority ?? "normal",
        ...(rule.task.activityType
          ? { activityType: rule.task.activityType }
          : {}),
      });
    }
  }

  // Sort by due date ascending
  suggestions.sort((a, b) =>
    a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
  );

  return suggestions;
}

// ─── Accept / Dismiss ───

/**
 * Accepts a suggestion — creates a real Task with auto-generation provenance.
 */
export async function acceptSuggestion(
  suggestion: TaskSuggestion,
  seasonId?: string,
): Promise<Task> {
  const timestamp = new Date().toISOString();
  return taskRepository.create({
    title: suggestion.title,
    dueDate: suggestion.dueDate,
    priority: suggestion.priority,
    isCompleted: false,
    plantInstanceId: suggestion.plantInstanceId,
    isAutoGenerated: true,
    ruleId: suggestion.ruleId,
    generatedAt: timestamp,
    ...(seasonId ? { seasonId } : {}),
  });
}

/**
 * Dismisses a suggestion so it won't be re-suggested.
 */
export async function dismissSuggestion(
  suggestion: TaskSuggestion,
): Promise<void> {
  const record: DismissedSuggestion = {
    id: suggestion.suggestionId,
    ruleId: suggestion.ruleId,
    plantInstanceId: suggestion.plantInstanceId,
    dismissedAt: new Date().toISOString(),
  };
  await db.dismissedSuggestions.put(record);
}

// ─── Recurring tasks ───

/**
 * When a recurring task is completed, creates the next occurrence.
 * Returns the new task or null if the task has no recurrence.
 */
export async function createNextRecurrence(
  completedTask: Task,
  seasonId?: string,
): Promise<Task | null> {
  if (!completedTask.recurrence) return null;

  const { type, interval } = completedTask.recurrence;
  const baseDate = parseISO(completedTask.dueDate);
  let nextDate: Date;

  switch (type) {
    case "daily":
      nextDate = addDays(baseDate, interval);
      break;
    case "weekly":
      nextDate = addDays(baseDate, interval * 7);
      break;
    case "monthly": {
      nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;
    }
    case "custom":
      nextDate = addDays(baseDate, interval);
      break;
    default:
      return null;
  }

  const nextDueDate = formatISO(startOfDay(nextDate), {
    representation: "date",
  });

  return taskRepository.create({
    title: completedTask.title,
    description: completedTask.description,
    dueDate: nextDueDate,
    priority: completedTask.priority,
    isCompleted: false,
    plantInstanceId: completedTask.plantInstanceId,
    bedId: completedTask.bedId,
    recurrence: completedTask.recurrence,
    ...(seasonId ? { seasonId } : {}),
  });
}
