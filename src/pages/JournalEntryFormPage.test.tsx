import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { clearPouchDB } from "../db/pouchdb/testUtils.ts";
import { journalRepository, plantRepository, gardenBedRepository, seasonRepository } from "../db/index.ts";
import { SettingsProvider } from "../hooks/useSettings.tsx";
import { ToastProvider } from "../components/ui/Toast.tsx";
import { _resetIndex } from "../db/search.ts";
import JournalEntryFormPage from "./JournalEntryFormPage.tsx";

// Mock search module
vi.mock("../db/search.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../db/search.ts")>();
  return {
    ...actual,
    loadIndex: vi.fn().mockResolvedValue(true),
    rebuildIndex: vi.fn().mockResolvedValue(0),
    serializeIndex: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock usePhotoCapture — camera/file APIs are not available in jsdom
vi.mock("../hooks/usePhotoCapture.ts", () => ({
  usePhotoCapture: () => ({
    capturePhoto: vi.fn(),
    selectPhoto: vi.fn(),
    isProcessing: false,
    error: null,
  }),
}));

beforeEach(async () => {
  await clearPouchDB();
  _resetIndex();
  vi.clearAllMocks();

  // Seed an active season (migration only runs on upgrade, not fresh DB)
  await seasonRepository.create({
    name: "2026 Growing Season",
    year: 2026,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    isActive: true,
  });
});

function renderPage() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={["/journal/new"]}>
          <Routes>
            <Route path="journal/new" element={<JournalEntryFormPage />} />
            <Route path="journal" element={<div>Journal Page</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>,
  );
}

describe("JournalEntryFormPage", () => {
  it("renders the form with all fields", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Neuer Journaleintrag" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Aktivitaetstyp" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pflanze")).toBeInTheDocument();
    expect(screen.getByLabelText("Gartenbeet")).toBeInTheDocument();
    expect(screen.getByLabelText("Titel")).toBeInTheDocument();
    expect(screen.getByLabelText(/Inhalt/)).toBeInTheDocument();
    expect(screen.getByLabelText("Meilenstein")).toBeInTheDocument();
  });

  it("shows validation error when no activity type is selected", async () => {
    const user = userEvent.setup();
    renderPage();

    // Fill body but skip activity type
    await user.type(screen.getByLabelText(/Inhalt/), "Some note");
    await user.click(screen.getByRole("button", { name: "Eintrag speichern" }));

    await waitFor(() => {
      expect(
        screen.getByText("Bitte einen Aktivitaetstyp auswaehlen."),
      ).toBeInTheDocument();
    });
  });

  it("shows validation error when body is empty", async () => {
    const user = userEvent.setup();
    renderPage();

    // Select activity but leave body empty
    await user.click(screen.getByText("Giessen"));
    await user.click(screen.getByRole("button", { name: "Eintrag speichern" }));

    await waitFor(() => {
      expect(
        screen.getByText("Der Inhalt ist erforderlich."),
      ).toBeInTheDocument();
    });
  });

  it("shows milestone type required when milestone is toggled on", async () => {
    const user = userEvent.setup();
    renderPage();

    // Select "Allgemein" activity type (not Meilenstein, to avoid name collision)
    await user.click(screen.getByText("Allgemein"));
    await user.type(screen.getByLabelText(/Inhalt/), "Big day");
    // Toggle milestone switch on
    await user.click(screen.getByRole("switch", { name: "Meilenstein" }));

    await user.click(screen.getByRole("button", { name: "Eintrag speichern" }));

    await waitFor(() => {
      expect(
        screen.getByText("Bitte einen Meilensteintyp auswaehlen."),
      ).toBeInTheDocument();
    });
  });

  it("shows harvest weight field only when activity is harvest", async () => {
    const user = userEvent.setup();
    renderPage();

    // Not visible initially
    expect(screen.queryByLabelText("Erntegewicht (g)")).not.toBeInTheDocument();

    // Select harvest activity
    await user.click(screen.getByText("Ernte"));

    // Now visible
    expect(screen.getByLabelText("Erntegewicht (g)")).toBeInTheDocument();

    // Switch to different activity
    await user.click(screen.getByText("Giessen"));

    // Hidden again
    expect(screen.queryByLabelText("Erntegewicht (g)")).not.toBeInTheDocument();
  });

  it("shows milestone type picker when milestone is toggled on", async () => {
    const user = userEvent.setup();
    renderPage();

    // Not visible initially
    expect(
      screen.queryByLabelText(/Meilensteintyp/),
    ).not.toBeInTheDocument();

    // Toggle milestone on
    await user.click(screen.getByLabelText("Meilenstein"));

    // Now visible
    expect(screen.getByLabelText(/Meilensteintyp/)).toBeInTheDocument();
    expect(screen.getByText("Erster Keimling")).toBeInTheDocument();
    expect(screen.getByText("Erste Bluete")).toBeInTheDocument();
  });

  it("saves a basic entry and navigates to journal", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Allgemein"));
    await user.type(screen.getByLabelText(/Inhalt/), "A good garden day");
    await user.click(screen.getByRole("button", { name: "Eintrag speichern" }));

    await waitFor(() => {
      expect(screen.getByText("Journal Page")).toBeInTheDocument();
    });

    const entries = await journalRepository.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.body).toBe("A good garden day");
    expect(entries[0]?.activityType).toBe("general");
  });

  it("saves entry with plant and garden bed", async () => {
    const plant = await plantRepository.create({
      species: "Tomato",
      type: "vegetable",
      isPerennial: false,
      source: "seed",
      status: "active",
      tags: [],
    });
    const bed = await gardenBedRepository.create({
      name: "Raised Bed A",
      type: "vegetable_bed",
      gridX: 0,
      gridY: 0,
      gridWidth: 4,
      gridHeight: 2,
      shape: "rectangle" as const,
      color: "#7dbf4e",
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Giessen"));

    // Wait for dropdown options to load
    await waitFor(() => {
      expect(screen.getByText("Tomato")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("Pflanze"), plant.id);
    await user.selectOptions(screen.getByLabelText("Gartenbeet"), bed.id);
    await user.type(screen.getByLabelText(/Inhalt/), "Watered everything");
    await user.click(screen.getByRole("button", { name: "Eintrag speichern" }));

    await waitFor(() => {
      expect(screen.getByText("Journal Page")).toBeInTheDocument();
    });

    const entries = await journalRepository.getAll();
    expect(entries[0]?.plantInstanceId).toBe(plant.id);
    expect(entries[0]?.bedId).toBe(bed.id);
  });

  it("saves harvest entry with weight", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Ernte"));
    await user.type(screen.getByLabelText(/Inhalt/), "Great harvest today");
    await user.type(screen.getByLabelText("Erntegewicht (g)"), "450");
    await user.click(screen.getByRole("button", { name: "Eintrag speichern" }));

    await waitFor(() => {
      expect(screen.getByText("Journal Page")).toBeInTheDocument();
    });

    const entries = await journalRepository.getAll();
    expect(entries[0]?.activityType).toBe("harvest");
    expect(entries[0]?.harvestWeight).toBe(450);
  });

  it("saves milestone entry", async () => {
    const user = userEvent.setup();
    renderPage();

    // Select "Allgemein" activity type first
    await user.click(screen.getByText("Allgemein"));
    await user.type(screen.getByLabelText(/Inhalt/), "First flower appeared!");
    // Toggle milestone switch on
    await user.click(screen.getByRole("switch", { name: "Meilenstein" }));
    await user.selectOptions(
      screen.getByLabelText(/Meilensteintyp/),
      "first_flower",
    );
    await user.click(screen.getByRole("button", { name: "Eintrag speichern" }));

    await waitFor(() => {
      expect(screen.getByText("Journal Page")).toBeInTheDocument();
    });

    const entries = await journalRepository.getAll();
    expect(entries[0]?.isMilestone).toBe(true);
    expect(entries[0]?.milestoneType).toBe("first_flower");
  });

  it("cancel button navigates back", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Abbrechen"));

    await waitFor(() => {
      expect(screen.getByText("Journal Page")).toBeInTheDocument();
    });
  });
});
