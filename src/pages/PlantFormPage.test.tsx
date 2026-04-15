import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { clearPouchDB } from "../db/pouchdb/testUtils.ts";
import { plantRepository } from "../db/index.ts";
import { _resetIndex } from "../db/search.ts";
import { SettingsProvider } from "../hooks/useSettings.tsx";
import PlantFormPage from "./PlantFormPage.tsx";

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
});

function renderCreateForm() {
  return render(
    <SettingsProvider>
      <MemoryRouter initialEntries={["/plants/new"]}>
        <Routes>
          <Route path="plants/new" element={<PlantFormPage />} />
          <Route path="plants/:id" element={<div>Detail Page</div>} />
          <Route path="plants" element={<div>Plants List</div>} />
        </Routes>
      </MemoryRouter>
    </SettingsProvider>,
  );
}

function renderEditForm(id: string) {
  return render(
    <SettingsProvider>
      <MemoryRouter initialEntries={[`/plants/${id}/edit`]}>
        <Routes>
          <Route path="plants/:id/edit" element={<PlantFormPage />} />
          <Route path="plants/:id" element={<div>Detail Page</div>} />
          <Route path="plants" element={<div>Plants List</div>} />
        </Routes>
      </MemoryRouter>
    </SettingsProvider>,
  );
}

describe("PlantFormPage", () => {
  describe("create mode", () => {
    it("renders the create form with all fields", () => {
      renderCreateForm();

      expect(
        screen.getByRole("heading", { name: "Pflanze hinzufuegen" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Art/)).toBeInTheDocument();
      expect(screen.getByLabelText("Spitzname")).toBeInTheDocument();
      expect(screen.getByLabelText("Sorte")).toBeInTheDocument();
      expect(screen.getByLabelText("Typ")).toBeInTheDocument();
      expect(screen.getByLabelText("Mehrjaehrig")).toBeInTheDocument();
      expect(screen.getByLabelText("Quelle")).toBeInTheDocument();
      expect(screen.getByLabelText("Status")).toBeInTheDocument();
      expect(screen.getByLabelText("Kaufdatum")).toBeInTheDocument();
      expect(screen.getByLabelText("Schlagwoerter")).toBeInTheDocument();
      expect(screen.getByLabelText("Pflegenotizen")).toBeInTheDocument();
    });

    it("shows photo section with capture buttons", () => {
      renderCreateForm();

      expect(screen.getByText("Fotos")).toBeInTheDocument();
      expect(screen.getByText("Foto aufnehmen")).toBeInTheDocument();
      expect(screen.getByText("Foto auswählen")).toBeInTheDocument();
      expect(screen.getByText("Noch keine Fotos hinzugefügt")).toBeInTheDocument();
    });

    it("shows validation error when species is empty", async () => {
      const user = userEvent.setup();
      renderCreateForm();

      await user.click(screen.getByRole("button", { name: "Pflanze hinzufuegen" }));

      await waitFor(() => {
        expect(
          screen.getByText("Die Art ist erforderlich."),
        ).toBeInTheDocument();
      });
    });

    it("creates a plant and navigates to detail page", async () => {
      const user = userEvent.setup();
      renderCreateForm();

      await user.type(screen.getByLabelText(/Art/), "Tomato");
      await user.selectOptions(screen.getByLabelText("Typ"), "vegetable");
      await user.selectOptions(screen.getByLabelText("Quelle"), "seed");
      await user.click(screen.getByRole("button", { name: "Pflanze hinzufuegen" }));

      // Should navigate to detail page
      await waitFor(() => {
        expect(screen.getByText("Detail Page")).toBeInTheDocument();
      });

      // Verify plant was created in DB
      const plants = await plantRepository.getAll();
      expect(plants).toHaveLength(1);
      expect(plants[0]?.species).toBe("Tomato");
      expect(plants[0]?.type).toBe("vegetable");
      expect(plants[0]?.source).toBe("seed");
    });

    it("saves optional fields when provided", async () => {
      const user = userEvent.setup();
      renderCreateForm();

      await user.type(screen.getByLabelText(/Art/), "Apple");
      await user.type(screen.getByLabelText("Spitzname"), "Old Apple");
      await user.type(screen.getByLabelText("Sorte"), "Honeycrisp");
      await user.type(screen.getByLabelText("Schlagwoerter"), "orchard, heirloom");
      await user.type(
        screen.getByLabelText("Pflegenotizen"),
        "Needs yearly pruning",
      );
      await user.selectOptions(screen.getByLabelText("Typ"), "fruit_tree");
      await user.click(screen.getByLabelText("Mehrjaehrig")); // toggle on

      await user.click(screen.getByRole("button", { name: "Pflanze hinzufuegen" }));

      await waitFor(() => {
        expect(screen.getByText("Detail Page")).toBeInTheDocument();
      });

      const plants = await plantRepository.getAll();
      expect(plants[0]?.nickname).toBe("Old Apple");
      expect(plants[0]?.variety).toBe("Honeycrisp");
      expect(plants[0]?.tags).toEqual(["orchard", "heirloom"]);
      expect(plants[0]?.careNotes).toBe("Needs yearly pruning");
      expect(plants[0]?.isPerennial).toBe(true);
    });

    it("has a cancel button that navigates back", async () => {
      const user = userEvent.setup();
      renderCreateForm();

      await user.click(screen.getByText("Abbrechen"));

      await waitFor(() => {
        expect(screen.getByText("Plants List")).toBeInTheDocument();
      });
    });
  });

  describe("edit mode", () => {
    it("pre-fills all fields from existing plant", async () => {
      const plant = await plantRepository.create({
        species: "Basil",
        nickname: "Kitchen Basil",
        variety: "Genovese",
        type: "herb",
        isPerennial: false,
        source: "nursery",
        status: "active",
        tags: ["indoor", "culinary"],
        careNotes: "Keep moist",
      });

      renderEditForm(plant.id);

      await waitFor(() => {
        expect(screen.getByText("Pflanze bearbeiten")).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/Art/)).toHaveValue("Basil");
      expect(screen.getByLabelText("Spitzname")).toHaveValue("Kitchen Basil");
      expect(screen.getByLabelText("Sorte")).toHaveValue("Genovese");
      expect(screen.getByLabelText("Typ")).toHaveValue("herb");
      expect(screen.getByLabelText("Quelle")).toHaveValue("nursery");
      expect(screen.getByLabelText("Status")).toHaveValue("active");
      expect(screen.getByLabelText("Schlagwoerter")).toHaveValue("indoor, culinary");
      expect(screen.getByLabelText("Pflegenotizen")).toHaveValue("Keep moist");
    });

    it("saves changes and navigates to detail page", async () => {
      const plant = await plantRepository.create({
        species: "Basil",
        type: "herb",
        isPerennial: false,
        source: "nursery",
        status: "active",
        tags: [],
      });

      const user = userEvent.setup();
      renderEditForm(plant.id);

      await waitFor(() => {
        expect(screen.getByText("Pflanze bearbeiten")).toBeInTheDocument();
      });

      await user.clear(screen.getByLabelText(/Art/));
      await user.type(screen.getByLabelText(/Art/), "Sweet Basil");
      await user.click(screen.getByText("Aenderungen speichern"));

      await waitFor(() => {
        expect(screen.getByText("Detail Page")).toBeInTheDocument();
      });

      const updated = await plantRepository.getById(plant.id);
      expect(updated?.species).toBe("Sweet Basil");
    });

    it("redirects to plants list if plant not found", async () => {
      renderEditForm("non-existent-id");

      await waitFor(() => {
        expect(screen.getByText("Plants List")).toBeInTheDocument();
      });
    });
  });
});
