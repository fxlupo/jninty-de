import { describe, it, expect, beforeEach } from "vitest";
import {
  getNotificationConfig,
  saveNotificationConfig,
  clearNotificationConfig,
} from "./notificationConfigStore.ts";

const STORAGE_KEY = "jninty:notificationConfig";

describe("notificationConfigStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default config when nothing is stored", () => {
    const config = getNotificationConfig();
    expect(config).toEqual({
      enabled: false,
      dismissed: false,
      lastCheckTimestamp: null,
      lastFrostAlertDate: null,
    });
  });

  it("returns default config when stored value is invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    const config = getNotificationConfig();
    expect(config.enabled).toBe(false);
  });

  it("returns default config when stored value fails validation", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: "yes" }));
    const config = getNotificationConfig();
    expect(config.enabled).toBe(false);
  });

  it("saves and retrieves config", () => {
    saveNotificationConfig({ enabled: true });
    const config = getNotificationConfig();
    expect(config.enabled).toBe(true);
    expect(config.dismissed).toBe(false);
  });

  it("merges partial updates with existing config", () => {
    saveNotificationConfig({ enabled: true });
    saveNotificationConfig({ dismissed: true });
    const config = getNotificationConfig();
    expect(config.enabled).toBe(true);
    expect(config.dismissed).toBe(true);
  });

  it("saves lastCheckTimestamp", () => {
    const ts = new Date().toISOString();
    saveNotificationConfig({ lastCheckTimestamp: ts });
    expect(getNotificationConfig().lastCheckTimestamp).toBe(ts);
  });

  it("saves lastFrostAlertDate", () => {
    saveNotificationConfig({ lastFrostAlertDate: "2026-01-15" });
    expect(getNotificationConfig().lastFrostAlertDate).toBe("2026-01-15");
  });

  it("clears config", () => {
    saveNotificationConfig({ enabled: true, dismissed: true });
    clearNotificationConfig();
    const config = getNotificationConfig();
    expect(config.enabled).toBe(false);
    expect(config.dismissed).toBe(false);
  });
});
