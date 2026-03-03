import { z } from "zod";

const STORAGE_KEY = "jninty:notificationConfig";

const NotificationConfigSchema = z.object({
  enabled: z.boolean(),
  dismissed: z.boolean(),
  lastCheckTimestamp: z.string().nullable(),
  lastFrostAlertDate: z.string().nullable(),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

const DEFAULT_CONFIG: NotificationConfig = {
  enabled: false,
  dismissed: false,
  lastCheckTimestamp: null,
  lastFrostAlertDate: null,
};

export function getNotificationConfig(): NotificationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return NotificationConfigSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveNotificationConfig(
  config: Partial<NotificationConfig>,
): NotificationConfig {
  const current = getNotificationConfig();
  const merged = { ...current, ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function clearNotificationConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
