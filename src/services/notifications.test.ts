import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isNotificationSupported,
  hasNotificationPermission,
  requestNotificationPermission,
  isIOSDevice,
  showNotification,
  checkAndNotifyTasks,
  notifyTaskDueToday,
  checkAndNotifyFrost,
} from "./notifications.ts";
import { saveNotificationConfig } from "./notificationConfigStore.ts";

// ─── Mock Notification global ───

class MockNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn<() => Promise<NotificationPermission>>();

  title: string;
  options: NotificationOptions | undefined;
  constructor(title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
  }
}

// ─── Mock taskRepository ───

vi.mock("../db/index.ts", () => ({
  taskRepository: {
    getUpcoming: vi.fn(),
    getOverdue: vi.fn(),
  },
}));

import { taskRepository } from "../db/index.ts";

const mockedGetUpcoming = vi.mocked(taskRepository.getUpcoming);
const mockedGetOverdue = vi.mocked(taskRepository.getOverdue);

describe("notifications", () => {
  let originalNotification: typeof globalThis.Notification;

  beforeEach(() => {
    localStorage.clear();
    originalNotification = globalThis.Notification;
    Object.defineProperty(globalThis, "Notification", {
      value: MockNotification,
      writable: true,
      configurable: true,
    });
    MockNotification.permission = "granted";
    MockNotification.requestPermission.mockResolvedValue("granted");
    mockedGetUpcoming.mockResolvedValue([]);
    mockedGetOverdue.mockResolvedValue([]);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "Notification", {
      value: originalNotification,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  // ─── Capability checks ───

  describe("isNotificationSupported", () => {
    it("returns true when Notification is defined", () => {
      expect(isNotificationSupported()).toBe(true);
    });

    it("returns false when Notification is undefined", () => {
      Object.defineProperty(globalThis, "Notification", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(isNotificationSupported()).toBe(false);
    });
  });

  describe("hasNotificationPermission", () => {
    it("returns true when permission is granted", () => {
      MockNotification.permission = "granted";
      expect(hasNotificationPermission()).toBe(true);
    });

    it("returns false when permission is denied", () => {
      MockNotification.permission = "denied";
      expect(hasNotificationPermission()).toBe(false);
    });

    it("returns false when permission is default", () => {
      MockNotification.permission = "default";
      expect(hasNotificationPermission()).toBe(false);
    });
  });

  describe("requestNotificationPermission", () => {
    it("calls Notification.requestPermission", async () => {
      const result = await requestNotificationPermission();
      expect(MockNotification.requestPermission).toHaveBeenCalled();
      expect(result).toBe("granted");
    });

    it("returns null when not supported", async () => {
      Object.defineProperty(globalThis, "Notification", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const result = await requestNotificationPermission();
      expect(result).toBeNull();
    });
  });

  describe("isIOSDevice", () => {
    it("returns false for non-iOS user agents", () => {
      // Default jsdom navigator is not iOS
      expect(isIOSDevice()).toBe(false);
    });
  });

  // ─── showNotification ───

  describe("showNotification", () => {
    it("returns null when not enabled", () => {
      saveNotificationConfig({ enabled: false });
      expect(showNotification("Test")).toBeNull();
    });

    it("returns null when permission not granted", () => {
      saveNotificationConfig({ enabled: true });
      MockNotification.permission = "denied";
      expect(showNotification("Test")).toBeNull();
    });

    it("creates Notification when enabled and permitted", () => {
      saveNotificationConfig({ enabled: true });
      const result = showNotification("Test Title", { body: "Test body" });
      expect(result).toBeInstanceOf(MockNotification);
      expect((result as unknown as MockNotification).title).toBe("Test Title");
    });
  });

  // ─── checkAndNotifyTasks ───

  describe("checkAndNotifyTasks", () => {
    it("returns 0 when not enabled", async () => {
      const count = await checkAndNotifyTasks();
      expect(count).toBe(0);
      expect(mockedGetUpcoming).not.toHaveBeenCalled();
    });

    it("returns 0 when within throttle window", async () => {
      saveNotificationConfig({
        enabled: true,
        lastCheckTimestamp: new Date().toISOString(),
      });
      const count = await checkAndNotifyTasks();
      expect(count).toBe(0);
      expect(mockedGetUpcoming).not.toHaveBeenCalled();
    });

    it("checks tasks when throttle has expired", async () => {
      const fourHoursAgo = new Date(
        Date.now() - 4 * 60 * 60 * 1000 - 1000,
      ).toISOString();
      saveNotificationConfig({
        enabled: true,
        lastCheckTimestamp: fourHoursAgo,
      });

      mockedGetUpcoming.mockResolvedValue([]);
      mockedGetOverdue.mockResolvedValue([]);

      const count = await checkAndNotifyTasks();
      expect(count).toBe(0);
      expect(mockedGetUpcoming).toHaveBeenCalledWith(0);
      expect(mockedGetOverdue).toHaveBeenCalled();
    });

    it("notifies for a single task due today", async () => {
      saveNotificationConfig({ enabled: true });

      mockedGetUpcoming.mockResolvedValue([
        { title: "Water tomatoes" } as ReturnType<
          typeof taskRepository.getUpcoming
        > extends Promise<infer T> ? T extends (infer U)[] ? U : never : never,
      ]);
      mockedGetOverdue.mockResolvedValue([]);

      const count = await checkAndNotifyTasks();
      expect(count).toBe(1);
    });

    it("notifies for multiple tasks due today", async () => {
      saveNotificationConfig({ enabled: true });

      mockedGetUpcoming.mockResolvedValue([
        { title: "Water tomatoes" },
        { title: "Prune basil" },
      ] as Awaited<ReturnType<typeof taskRepository.getUpcoming>>);
      mockedGetOverdue.mockResolvedValue([]);

      const count = await checkAndNotifyTasks();
      expect(count).toBe(1);
    });

    it("notifies for overdue tasks", async () => {
      saveNotificationConfig({ enabled: true });

      mockedGetUpcoming.mockResolvedValue([]);
      mockedGetOverdue.mockResolvedValue([
        { title: "Old task" },
      ] as Awaited<ReturnType<typeof taskRepository.getOverdue>>);

      const count = await checkAndNotifyTasks();
      expect(count).toBe(1);
    });

    it("notifies for both today and overdue tasks", async () => {
      saveNotificationConfig({ enabled: true });

      mockedGetUpcoming.mockResolvedValue([
        { title: "Today task" },
      ] as Awaited<ReturnType<typeof taskRepository.getUpcoming>>);
      mockedGetOverdue.mockResolvedValue([
        { title: "Old task" },
      ] as Awaited<ReturnType<typeof taskRepository.getOverdue>>);

      const count = await checkAndNotifyTasks();
      expect(count).toBe(2);
    });
  });

  // ─── notifyTaskDueToday ───

  describe("notifyTaskDueToday", () => {
    it("shows notification when enabled", () => {
      saveNotificationConfig({ enabled: true });
      const result = notifyTaskDueToday("Harvest beans");
      expect(result).toBeInstanceOf(MockNotification);
    });

    it("returns null when disabled", () => {
      expect(notifyTaskDueToday("Harvest beans")).toBeNull();
    });
  });

  // ─── checkAndNotifyFrost ───

  describe("checkAndNotifyFrost", () => {
    it("returns null when no frost warning", () => {
      saveNotificationConfig({ enabled: true });
      expect(checkAndNotifyFrost(false)).toBeNull();
    });

    it("returns null when not enabled", () => {
      expect(checkAndNotifyFrost(true)).toBeNull();
    });

    it("shows frost notification on first alert of the day", () => {
      saveNotificationConfig({ enabled: true });
      const result = checkAndNotifyFrost(true);
      expect(result).toBeInstanceOf(MockNotification);
    });

    it("deduplicates frost alerts for the same day", () => {
      saveNotificationConfig({ enabled: true });
      checkAndNotifyFrost(true);
      const second = checkAndNotifyFrost(true);
      expect(second).toBeNull();
    });

    it("allows frost alerts on a new day", () => {
      saveNotificationConfig({
        enabled: true,
        lastFrostAlertDate: "2025-01-01",
      });
      const result = checkAndNotifyFrost(true);
      expect(result).toBeInstanceOf(MockNotification);
    });
  });
});
