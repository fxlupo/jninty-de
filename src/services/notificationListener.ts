import { formatISO, startOfDay } from "date-fns";
import { taskRepository } from "../db/index.ts";
import { notifyTaskDueToday } from "./notifications.ts";

let pollingInterval: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 60_000; // check every minute

function todayDate(): string {
  return formatISO(startOfDay(new Date()), { representation: "date" });
}

async function checkTasksDueToday(): Promise<void> {
  try {
    const today = todayDate();
    const tasks = await taskRepository.getByDateRange(today, today);
    for (const task of tasks) {
      notifyTaskDueToday(task.title);
    }
  } catch {
    // Polling failure is non-critical
  }
}

export function startNotificationListening(): void {
  stopNotificationListening();
  void checkTasksDueToday();
  pollingInterval = setInterval(() => void checkTasksDueToday(), POLL_INTERVAL_MS);
}

export function stopNotificationListening(): void {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
