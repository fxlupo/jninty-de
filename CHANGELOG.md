# Changelog

All notable changes to Jninty will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-04-15

### Phase 5 — PouchDB vollständig entfernt, API-Architektur abgeschlossen

Diese Version schließt die Migration von PouchDB/IndexedDB auf eine vollständige Client-Server-Architektur ab. Alle Datenzugriffe laufen jetzt über die Hono-REST-API (SQLite via Drizzle ORM).

### Hinzugefügt

- **Docker-Deployment** — `docker-compose.yml` mit Traefik-Labels für `garten2.creano.de`; separates `Dockerfile.server` für den Node.js-Backend-Container; `nginx.conf` mit `/api/*`-Proxy zum Backend
- **API-Reset-Endpunkt** — `POST /api/reset` löscht alle Benutzerdaten (für Import-Replace und Demo-Reset); vollständig in der Test-Mock implementiert
- **Drizzle-Migration 0001** — Korrektur der SQLite-Standardwerte für `last_frost_date` und `first_frost_date` (`"03-15"` → `"2026-04-15"` / `"11-01"` → `"2026-10-15"`)

### Geändert

- **Importer** (`src/services/importer.ts`) — Entity-Writes nutzen jetzt `PUT /api/{collection}/{id}` (Upsert-by-ID); `executeImportReplace` ruft `POST /api/reset` vor dem Neu-Import auf; `importPlantsFromCsv` nutzt `plantRepository.create()`
- **Weather-Cache** (`src/services/weather.ts`) — PouchDB-Cache durch `localStorage` ersetzt (`jninty_weather_cache`)
- **Speichernutzung** (`src/services/storageUsage.ts`) — PouchDB-Attachment-Abfragen entfernt; gibt jetzt nur noch Storage-API-Schätzwert zurück
- **Benachrichtigungs-Listener** (`src/services/notificationListener.ts`) — `localDB.changes()`-Subscription durch Polling mit `setInterval` ersetzt
- **Demo-Seeder** (`src/services/demoSeeder.ts`) — `destroyAndRecreate()` durch `POST /api/reset` ersetzt
- **useSync** (`src/hooks/useSync.tsx`) — Zu No-Op-Stub umgebaut (`status: "disabled"`); `SyncProvider` bleibt als Wrapper erhalten
- **AppShell** — `SyncStatusBadge` und `stopCloudSync`-Aufrufe entfernt
- **App.tsx** — `startCloudSync`-Aufrufe nach Login und Session-Restore entfernt
- **LoginModal** — `startCloudSync`-Aufruf nach erfolgreichem Login entfernt
- **SettingsPage** — CouchDB-Sync-Karte vollständig entfernt; Sync-Zustandsvariablen und Handler bereinigt; `CloudSyncSettings` nur noch für authentifizierte Nutzer angezeigt
- **`src/db/index.ts`** — PouchDB-Sync-Exports entfernt (`localDB`, `setupSync`, `stopSync`, `destroyAndRecreate` u.a.)
- **useSettings** (`src/hooks/useSettings.tsx`) — `try/catch/finally` um den Lade-Block ergänzt, sodass `loading` auch bei API-Fehlern (z.B. nicht eingeloggt beim App-Start) auf `false` gesetzt wird; Server-Standardwerte für Frostdaten normalisiert
- **Server-Settings-Route** — `normalizeFrostDate()`-Hilfsfunktion korrigiert beim ersten `GET /api/settings` automatisch veraltete `MM-DD`-Datumsformate im Bestand

### Behoben

- **Einstellungsseite leer nach Login** — `SettingsProvider` startet beim App-Start, bevor der Nutzer eingeloggt ist; `PUT /api/settings` warf einen Fehler (401), der `setLoading(false)` verhinderte und die Seite dauerhaft im Skeleton-Zustand ließ
- **`npm run dev:server` schlug fehl** mit `ERR_MODULE_NOT_FOUND: Cannot find module 'watch'` — `tsx`-Unterbefehl `watch` stand hinter `--env-file` und wurde als Dateipfad interpretiert; Reihenfolge in `package.json` korrigiert

### Tests

- **`src/services/importer.test.ts`** vollständig neu geschrieben — nutzt jetzt Mock-API statt In-Memory-PouchDB; `seedEntity()`-Hilfsfunktion für Testdaten-Vorbereitung; Verifikation über `plantRepository.getAll()` / `settingsRepository.get()`
- **`tests/setup.ts`** — `POST /api/reset`-Handler im Mock-Server ergänzt

### Hinzugefügt

- **Mehrere Fotos pro Pflanze** — Pflanzenformular unterstützt jetzt beliebig viele Fotos (vorher max. 1)
- **Aufnahmedatum pro Foto** — Neues `takenAt`-Feld im Foto-Schema; im Formular als Datumseingabe pro Foto bearbeitbar; in der Timeline-Ansicht als Sortierkriterium genutzt
- **Titelbild festlegbar** — Das erste Foto in der Liste gilt als Titelbild (Übersichtsanzeige); per "Als Titelbild"-Button kann jedes Foto an die erste Stelle gesetzt werden
- **Titelbild-Badge in der Galerie** — In der Pflanzendetailseite ist das Titelbild mit einem "Titelbild"-Badge markiert; Aufnahmedatum wird unter jedem Pflanzenfoto angezeigt
- Neuer Hook `usePlantPhotoManager` kapselt die gesamte Multi-Foto-Logik (hinzufügen, entfernen, Reihenfolge, speichern)
- Neue Komponente `PlantPhotoManager` als Foto-Verwaltungs-UI im Formular
- `photoRepository`: `updateMeta()` für metadaten-only Updates; `getPhotosMeta()` für leichtgewichtiges Laden ohne Blobs

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
