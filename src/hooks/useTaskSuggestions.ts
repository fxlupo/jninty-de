import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { formatISO, startOfDay } from "date-fns";
import * as taskRuleRepository from "../db/repositories/taskRuleRepository.ts";
import * as plantRepository from "../db/repositories/plantRepository.ts";
import * as taskRepository from "../db/repositories/taskRepository.ts";
import { useSettings } from "./useSettings.tsx";
import { generateSuggestions, type TaskSuggestion } from "../services/taskEngine.ts";

function todayDate(): string {
  return formatISO(startOfDay(new Date()), { representation: "date" });
}

/**
 * Returns task suggestions from the rule engine, excluding
 * rules that already have a corresponding accepted or dismissed task.
 */
export function useTaskSuggestions(): {
  suggestions: TaskSuggestion[] | undefined;
  isLoading: boolean;
} {
  const { settings } = useSettings();
  const rules = useLiveQuery(() => taskRuleRepository.getAll());
  const plants = useLiveQuery(() => plantRepository.getAll());
  const tasks = useLiveQuery(() => taskRepository.getAll());

  const suggestions = useMemo(() => {
    if (!rules || !plants || !tasks || !settings) return undefined;

    // Build a set of "ruleId::plantInstanceId" for tasks already generated
    const existingKeys = new Set<string>();
    for (const task of tasks) {
      if (task.ruleId && task.plantInstanceId) {
        existingKeys.add(`${task.ruleId}::${task.plantInstanceId}`);
      }
    }

    return generateSuggestions(rules, plants, settings, todayDate(), existingKeys);
  }, [rules, plants, tasks, settings]);

  return {
    suggestions,
    isLoading: suggestions === undefined,
  };
}
