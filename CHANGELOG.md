# Changelog

All notable changes to Jninty will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Geändert

- **Pflanzentypen erweitert** — Neue Typen "Strauch" (`shrub`) und "Hecke" (`hedge`) hinzugefügt; Umlaute in den Labels korrigiert (Gemüse, Kräuter); Gartenplan-Farben für neue Typen ergänzt

- **UI-Übersetzung (Teil 2)** — Verbliebene englische Passagen ins Deutsche übersetzt:
  - `NotFoundPage`: "Seite nicht gefunden", "Zurück zum Dashboard"
  - `PlantsListPage`: Überschrift, Suche, Filter, Ansichtsumschalter, leere Zustände, Buttons
  - `GardenMapPage`: Beettypen, Sonneneinstrahlung, alle Panel- und Modal-Texte (Buttons, Platzhalter, Labels)
  - `SeedBankPage`: Status-Badges (Abgelaufen, Wenig Vorrat, Läuft ab), Suche, Sortierung, leere Zustände
  - `SeasonComparisonPage`: Ergebnis-Labels, Abschnittsnamen "Was gut lief" / "Was verbessert werden sollte"
  - `QuickLogPage`, `PlantDetailPage`, `JournalPage`, `SeedFormPage`: Fehlermeldungen übersetzt
  - `TimelineView`: Fehlermeldungen, leerer Zustand, Hinweistexte
  - `PhotoTimelineGrid`: "Noch keine Fotos"
  - `CropPickerSearch`, `VarietySelector`, `StepSelectVariety`: Leer-Zustände für Sorten/Kulturen
  - `StepSelectBed`, `StepConfirm`: "Kein Beet"
  - `CsvImportDialog`, `ImportDialog`: Import-Fehlermeldungen
  - `SubscriptionActions`: Abo-Fehlermeldungen
  - `useTaskSuggestions`: Aufgaben-Fehlermeldungen

---

## [0.1.0] - 2026-03-03

Initial open-source release. Includes all Phase 1 (MVP) features and several Phase 2 additions.

### Phase 1 — Core Features

- **Plant Inventory** — Track plants with photos, species, care notes, and lifecycle status
- **Garden Journal** — Log daily garden activities with photos, linked to specific plants
- **Quick Log** — 3-tap photo-first logging workflow for fast field notes
- **Task Management** — Create, prioritize, and track garden tasks with due dates
- **Full-Text Search** — MiniSearch-powered search across plants and journal entries
- **Data Export/Import** — Export all data as a ZIP backup; import from backup
- **Dashboard** — Overview of recent activity, upcoming tasks, and garden stats
- **PWA** — Installable progressive web app with full offline support
- **Settings** — App preferences, theme, data management

### Phase 2 — Additional Features

- **Dark Mode** — System-aware and manual dark/light theme switching
- **High Contrast Mode** — Enhanced visibility accessibility option
- **Font Size Settings** — Adjustable text size for accessibility
- **Keyboard Shortcuts** — Full keyboard navigation and shortcut support
- **Push Notifications** — Task reminders and frost alert notifications
- **Multi-Device Sync** — Optional CouchDB replication for syncing across devices
- **Garden Map** — Visual garden bed layout editor (Konva.js)
- **Seed Bank** — Track seed inventory with sow-by dates and germination rates
- **Seasons** — Season-based planting records with frost date awareness
- **Task Rules** — Automated task generation based on plant care schedules
- **Plant Knowledge Base** — Built-in community-contributed plant data (vegetables, herbs, fruits, flowers)

### Infrastructure

- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- PouchDB v9 with IndexedDB adapter
- Zod schema validation for all entities and plant data
- Comprehensive test suite (Vitest + Testing Library)
- Tailwind CSS v4 with custom garden theme tokens

---

For the full roadmap, see the [design document](docs/plans/Jninty-Design-v1.md).
