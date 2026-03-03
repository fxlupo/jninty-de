import { formatISO, startOfDay } from "date-fns";
import {
  getNotificationConfig,
  saveNotificationConfig,
} from "./notificationConfigStore.ts";
import { taskRepository } from "../db/index.ts";

const THROTTLE_MS = 4 * 60 * 60 * 1000; // 4 hours

function todayDate(): string {
  return formatISO(startOfDay(new Date()), { representation: "date" });
}

// ─── Capability checks ───

export function isNotificationSupported(): boolean {
  return typeof Notification !== "undefined";
}

export function hasNotificationPermission(): boolean {
  return isNotificationSupported() && Notification.permission === "granted";
}

export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isNotificationSupported()) return null;
  return Notification.requestPermission();
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// ─── Show notification ───

export function showNotification(
  title: string,
  options?: NotificationOptions,
): Notification | null {
  const config = getNotificationConfig();
  if (!config.enabled || !hasNotificationPermission()) return null;
  return new Notification(title, {
    icon: "/icons/icon-192x192.png",
    ...options,
  });
}

// ─── Task notifications ───

export async function checkAndNotifyTasks(): Promise<number> {
  const config = getNotificationConfig();
  if (!config.enabled || !hasNotificationPermission()) return 0;

  // Throttle: skip if checked within the last 4 hours
  if (config.lastCheckTimestamp) {
    const lastCheck = new Date(config.lastCheckTimestamp).getTime();
    if (Date.now() - lastCheck < THROTTLE_MS) return 0;
  }

  saveNotificationConfig({ lastCheckTimestamp: new Date().toISOString() });

  let notificationCount = 0;

  // Tasks due today
  const todayTasks = await taskRepository.getUpcoming(0);
  if (todayTasks.length > 0) {
    if (todayTasks.length === 1 && todayTasks[0]) {
      showNotification("Garden Reminder", {
        body: `${todayTasks[0].title} is due today`,
        tag: "tasks-today",
      });
    } else {
      showNotification("Garden Reminder", {
        body: `You have ${String(todayTasks.length)} tasks due today`,
        tag: "tasks-today",
      });
    }
    notificationCount++;
  }

  // Overdue tasks
  const overdueTasks = await taskRepository.getOverdue();
  if (overdueTasks.length > 0) {
    showNotification("Overdue Tasks", {
      body: `You have ${String(overdueTasks.length)} overdue garden ${overdueTasks.length === 1 ? "task" : "tasks"}`,
      tag: "tasks-overdue",
    });
    notificationCount++;
  }

  return notificationCount;
}

export function notifyTaskDueToday(title: string): Notification | null {
  return showNotification("Garden Reminder", {
    body: `${title} is due today`,
    tag: `task-today-${title}`,
  });
}

// ─── Frost notifications ───

export function checkAndNotifyFrost(frostWarning: boolean): Notification | null {
  if (!frostWarning) return null;

  const config = getNotificationConfig();
  if (!config.enabled || !hasNotificationPermission()) return null;

  const today = todayDate();
  if (config.lastFrostAlertDate === today) return null;

  saveNotificationConfig({ lastFrostAlertDate: today });

  return showNotification("Frost Warning", {
    body: "Frost expected tonight! Protect sensitive plants.",
    tag: "frost-warning",
  });
}
