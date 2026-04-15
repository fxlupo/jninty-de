import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearPouchDB } from "../db/pouchdb/testUtils.ts";
import { settingsRepository as settingsRepo } from "../db/index.ts";
import { SettingsProvider } from "../hooks/useSettings.tsx";
import { SyncProvider } from "../hooks/useSync.tsx";
import { ToastProvider } from "../components/ui/Toast.tsx";
import SettingsPage from "./SettingsPage.tsx";

// Mock exporter to avoid real ZIP creation
vi.mock("../services/exporter.ts", () => ({
  exportAll: vi.fn().mockResolvedValue(new Blob(["zip"])),
  triggerDownload: vi.fn(),
}));

// Mock search to avoid real index rebuild
vi.mock("../db/search.ts", () => ({
  rebuildIndex: vi.fn().mockResolvedValue(5),
}));

// Mock storageUsage
vi.mock("../services/storageUsage.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/storageUsage.ts")>();
  return {
    ...actual,
    getStorageUsage: vi.fn().mockResolvedValue({
      thumbnailBytes: 512,
      displayBytes: 1024,
      originalBytes: 0,
      dataBytes: 2048,
      totalBytes: 3584,
      quotaBytes: 100_000_000,
    }),
  };
});

import { exportAll, triggerDownload } from "../services/exporter.ts";
import { rebuildIndex } from "../db/search.ts";

beforeEach(async () => {
  await clearPouchDB();
  vi.clearAllMocks();
});

function renderSettings() {
  return render(
    <SettingsProvider>
      <SyncProvider>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </SyncProvider>
    </SettingsProvider>,
  );
}

describe("SettingsPage", () => {
  it("renders all sections after loading", async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getAllByText("Einstellungen").length).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getByText("Garteninformationen")).toBeInTheDocument();
    expect(screen.getByText("Datenverwaltung")).toBeInTheDocument();
  });

  it("renders growing zone dropdown with all zones", async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByLabelText("Klimazone")).toBeInTheDocument();
    });

    const select = screen.getByLabelText("Klimazone") as HTMLSelectElement;
    // 13 zones × 2 subzones = 26 options
    expect(select.options.length).toBe(26);
    expect(select.options[0]?.textContent).toBe("Zone 1a");
    expect(select.options[25]?.textContent).toBe("Zone 13b");
  });

  it("renders frost date inputs", async () => {
    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByLabelText("Letzter Fruehlingsfrost"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByLabelText("Erster Herbstfrost"),
    ).toBeInTheDocument();
  });

  it("renders unit and theme toggles", async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Fuss")).toBeInTheDocument();
    });

    expect(screen.getByText("Meter")).toBeInTheDocument();
    expect(screen.getByText("°F")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();
    expect(screen.getByText("Hell")).toBeInTheDocument();
    expect(screen.getByText("Dunkel")).toBeInTheDocument();
    expect(screen.getByText("Automatisch")).toBeInTheDocument();
  });

  it("renders storage dashboard", async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/Vorschaubilder:/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Anzeige:/)).toBeInTheDocument();
    expect(screen.getByText(/Daten:/)).toBeInTheDocument();
    expect(screen.getByText(/Gesamt:/)).toBeInTheDocument();
  });

  it("renders app version", async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/Jninty v/)).toBeInTheDocument();
    });
  });

  it("changing growing zone persists to DB", async () => {
    const user = userEvent.setup();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByLabelText("Klimazone")).toBeInTheDocument();
    });

    const select = screen.getByLabelText("Klimazone");
    await user.selectOptions(select, "5b");

    await waitFor(async () => {
      const stored = await settingsRepo.get();
      expect(stored?.growingZone).toBe("5b");
    });
  });

  it("changing grid unit persists to DB", async () => {
    const user = userEvent.setup();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Meter")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Meter"));

    await waitFor(async () => {
      const stored = await settingsRepo.get();
      expect(stored?.gridUnit).toBe("meters");
    });
  });

  it("export button calls exportAll and triggerDownload", async () => {
    const user = userEvent.setup();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Alle Daten exportieren")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Alle Daten exportieren"));

    await waitFor(() => {
      expect(exportAll).toHaveBeenCalledOnce();
      expect(triggerDownload).toHaveBeenCalledOnce();
    });
  });

  it("shows error when export fails", async () => {
    vi.mocked(exportAll).mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Alle Daten exportieren")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Alle Daten exportieren"));

    await waitFor(() => {
      expect(
        screen.getByText("Export fehlgeschlagen. Bitte erneut versuchen."),
      ).toBeInTheDocument();
    });
  });

  it("rebuild button calls rebuildIndex and shows count", async () => {
    const user = userEvent.setup();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Suchindex neu aufbauen")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Suchindex neu aufbauen"));

    await waitFor(() => {
      expect(rebuildIndex).toHaveBeenCalledOnce();
      expect(screen.getByText("5 Eintraege indiziert.")).toBeInTheDocument();
    });
  });

  it("shows error when rebuild fails", async () => {
    vi.mocked(rebuildIndex).mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Suchindex neu aufbauen")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Suchindex neu aufbauen"));

    await waitFor(() => {
      expect(
        screen.getByText("Neuaufbau fehlgeschlagen. Bitte erneut versuchen."),
      ).toBeInTheDocument();
    });
  });
});
