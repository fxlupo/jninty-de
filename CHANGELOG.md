# Changelog

All notable changes to Jninty will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

Versioning-Regel: `feat:` → MINOR-Bump (0.x.0) · `fix:`/`chore:` → PATCH-Bump (0.0.x)

## [Unreleased]

---

## [0.9.7] - 2026-04-16

### Geändert

- **Wetter-Widget** — alle UI-Strings ins Deutsche übersetzt: Frostwarnung, Tiefstwert, Luftfeuchte, Standort-Hinweis, Fehlermeldung
- **WMO-Wettercodes** — alle 29 Wettercode-Bezeichnungen ins Deutsche übersetzt (z. B. „Partly cloudy" → „Teilweise bewölkt")
- **Geocoding-Suche** — Ortssuche über Open-Meteo läuft jetzt auf `language=de` statt `en`

---

## [0.9.6] - 2026-04-16

### Behoben

- **iOS-Layout (Safari & Chrome)** — `font-size < 16px` auf Inputs löst automatischen Viewport-Zoom aus; nach Tastatur-Schließen setzt iOS den Zoom oft nicht zurück → Layout wird breiter, Bottom-Nav schwimmt; CSS-Regel `font-size: 16px !important` für alle `input`/`textarea`/`select`-Elemente auf Mobilgeräten behebt den Zoom
- **Foto-Upload: kein Feedback bei Fehler** — `saveAll()` schluckte Upload-Fehler; Pflanze wurde trotzdem gespeichert und App navigierte weg → Benutzer sah weder Fehler noch Foto-Verlust; jetzt: nach allen Uploads wird geworfen wenn mindestens ein Foto fehlschlug → Formular bleibt offen, Fehlermeldung erscheint, fehlgeschlagene Fotos sind rot markiert
- **Foto-Upload: kein Fortschrittsbalken** — Fortschritt startete bei `null` statt `0`, dadurch war `isUploading = false` bis zum ersten XHR-Progress-Event; Progress wird jetzt sofort auf `0` gesetzt wenn der Upload beginnt

---

## [0.9.5] - 2026-04-16

### Behoben

- **Foto-Upload auf Mobile (hängende Buttons)** — Datei-Input wurde nicht ins DOM eingefügt; auf Android-WebView und älterem iOS feuerten `change`-Events dann nicht zuverlässig → `isProcessing` blieb dauerhaft `true`; Input wird jetzt ins `document.body` gehängt und nach Abschluss entfernt; `visibilitychange` als Fallback-Abbrucherkennung ergänzt (für Browser ohne `cancel`-Event)
- **Mobiles Layout bricht nach Formular-Navigation** — fehlende `overflow-x: hidden` auf `html`/`body` ließ breite Formularelemente den Viewport dauerhaft erweitern; danach „schwammen" fixierte Elemente (Bottom-Nav) und nachfolgende Seiten passten sich nicht mehr an; `min-w-0` in der AppShell-Flex-Kette verhindert jetzt das unkontrollierte Wachsen

---

## [0.9.4] - 2026-04-16

### Behoben

- **Ausgaben-Widget** — Betrag wurde in `$` statt `€` angezeigt; Leerstand-Icon (`$` → `€`) und Texte ins Deutsche übersetzt („Gartenausgaben verfolgen", „Saisonausgaben")
- **Saatgut-Formular** — alle englischen Texte ins Deutsche übersetzt (Seitenüberschrift, Feldbezeichnungen, Platzhalter, Schaltflächen, Fehlermeldungen)
- **Foto-Upload** — HEIC-Fotos werden mit verständlicher Fehlermeldung abgelehnt; nicht unterstützte Formate zeigen den MIME-Typ; „Failed to load image" auf Deutsch
- **Foto-Upload** — Fortschrittsanzeige (0–100 %) je Foto während des Uploads via XHR statt fetch
- **Foto-Upload** — Fehlermeldung pro Foto bei Upload-Fehler; übrige Fotos werden trotzdem hochgeladen

---

## [0.9.3] - 2026-04-16

### Behoben

- **nginx `/uploads/`-Proxy** — Foto-Dateien lagen auf dem Server-Container; nginx leitete `/uploads/*` nicht weiter und Bilder wurden nicht angezeigt
- **Secure-Cookies hinter Traefik** — nginx überschrieb `X-Forwarded-Proto` mit `http` statt den Wert von Traefik (`https`) durchzureichen; better-auth setzte dadurch keine `Secure`-Cookies, die Session-Cookies wurden vom Browser verworfen
- **`auth.ts`** — `useSecureCookies: true` wenn `BETTER_AUTH_URL` mit `https://` beginnt; `baseURL` explizit aus `BETTER_AUTH_URL` gesetzt

---

## [0.9.2] - 2026-04-16

### Behoben

- **`tsx` nicht gefunden** — `tsx` liegt in `node_modules/.bin/`, ist aber nicht im `PATH` des Alpine-Containers; `Dockerfile.server` ruft jetzt `node_modules/.bin/tsx` direkt auf

---

## [0.9.1] - 2026-04-15

### Behoben

- **Erster Aufruf der Docker-Version zeigte Paywall** — `VITE_CLOUD_ENABLED=true` aktivierte `CloudGate` (SaaS-Paywall mit Stripe-Prüfung); dessen Login rief `POST /auth/login` auf, der auf dem better-auth-Server nicht existiert; für Self-Hosting `VITE_CLOUD_ENABLED` entfernt — `RequireAuth` + `LoginPage` übernehmen die Authentifizierung
- **Fehlende Deployment-Dateien** — `Dockerfile`, `Dockerfile.server` und `nginx.conf` im Repo ergänzt

---

## [0.9.0] - 2026-04-15

### Hinzugefügt

- **Docker-Deployment** — `docker-compose.yml` mit Traefik-Labels für `garten2.creano.de`; `Dockerfile.server` für den Node.js-Backend-Container; `nginx.conf` mit `/api/*`-Proxy zum Backend
- **API-Reset-Endpunkt** — `POST /api/reset` löscht alle Benutzerdaten (für Import-Replace und Demo-Reset)
- **Drizzle-Migration 0001** — Korrektur der SQLite-Standardwerte für Frostdaten (`"03-15"` → `"2026-04-15"` / `"11-01"` → `"2026-10-15"`)

### Geändert

- **PouchDB vollständig entfernt** — Importer, Weather-Cache, Speichernutzung, Benachrichtigungs-Listener und Demo-Seeder nutzen jetzt API bzw. `localStorage` statt `localDB`
- **`useSync`** — Zu No-Op-Stub umgebaut; Sync-UI aus AppShell und SettingsPage entfernt
- **`src/db/index.ts`** — PouchDB-Sync-Exports entfernt
- **Settings-Route** — Normalisiert veraltete `MM-DD`-Frostdaten auf `YYYY-MM-DD` beim nächsten `GET /api/settings`

### Behoben

- **Einstellungsseite leer nach Login** — `SettingsProvider` konnte `loading: true` nicht auflösen wenn API-Calls beim App-Start (vor Login) fehlschlugen; `try/catch/finally` ergänzt
- **`npm run dev:server` schlug fehl** — `tsx watch` stand hinter `--env-file` und wurde als Dateipfad interpretiert; Reihenfolge korrigiert

### Tests

- `src/services/importer.test.ts` auf Mock-API umgestellt (kein PouchDB mehr)
- `tests/setup.ts` — `POST /api/reset`-Handler ergänzt

---

## [0.8.1] - 2026-04-15

### Behoben

- **Tests** — Alle Tests auf deutsche UI-Strings aktualisiert; Reaktivität in Query-Hooks wiederhergestellt

---

## [0.8.0] - 2026-04-14

### Hinzugefügt

- **Better-Auth Session-Management** — Frontend-Authentifizierung mit `SessionProvider`, `useSession`-Hook und `RequireAuth`-Guard; `authClient` via better-auth SDK
- **`LoginPage`** — Dedizierte Anmeldeseite (`/login`) mit `authClient.signIn.email()`
- **Server-Endpunkt `POST /api/auth/sign-up/email`** — Benutzerregistrierung über better-auth

---

## [0.7.0] - 2026-04-13

### Hinzugefügt

- **Foto-Migration auf Server-Filesystem** — Fotos werden per `multipart/form-data` an `POST /api/photos/upload` gesendet und unter `data/uploads/{id}/` gespeichert; Hono liefert sie als statische Dateien unter `/uploads/*` aus
- **URL-basiertes Foto-Schema** — `thumbnailUrl`, `displayUrl` statt Blob-Referenzen; `originalStored`-Flag für serverseitige Originale

---

## [0.6.0] - 2026-04-12

### Hinzugefügt

- **Hono API-Server** — Node.js-Backend mit Hono, Drizzle ORM und SQLite (`data/jninty.db`); REST-Endpunkte für alle 13 Entitäten
- **API-backed Repositories** — Alle Client-Repositories (`plantRepository`, `journalRepository` etc.) nutzen jetzt `GET/POST/PUT/PATCH/DELETE /api/{collection}` statt PouchDB direkt
- **`requireAuth`-Middleware** — Prüft better-auth-Session für alle `/api/*`-Routen

---

## [0.5.1] - 2026-04-10

### Behoben

- TypeScript-Cast in `getPhotosMeta` korrigiert (`as` statt unsicherer Typ-Assertion)

---

## [0.5.0] - 2026-04-08

### Hinzugefügt

- **Mehrere Fotos pro Pflanze** — Pflanzenformular unterstützt beliebig viele Fotos (vorher max. 1)
- **Aufnahmedatum pro Foto** — `takenAt`-Feld im Foto-Schema; als Datumseingabe im Formular und Sortierkriterium in der Timeline
- **Titelbild festlegbar** — Erstes Foto gilt als Titelbild; "Als Titelbild"-Button setzt jedes Foto an erste Stelle; Titelbild-Badge in der Galerie
- Neuer Hook `usePlantPhotoManager` und Komponente `PlantPhotoManager`
- `photoRepository.updateMeta()` und `getPhotosMeta()` für leichtgewichtige Metadaten-Operationen

---

## [0.4.0] - 2026-04-05

### Geändert

- **Pflanzentypen erweitert** — Neue Typen "Strauch" (`shrub`) und "Hecke" (`hedge`); Umlaute in Labels korrigiert (Gemüse, Kräuter); Gartenplan-Farben für neue Typen ergänzt

---

## [0.3.0] - 2026-04-02

### Geändert

- **UI-Übersetzung Teil 2** — Verbliebene englische Passagen übersetzt: `NotFoundPage`, `PlantsListPage`, `GardenMapPage`, `SeedBankPage`, `SeasonComparisonPage`, `QuickLogPage`, `PlantDetailPage`, `JournalPage`, `SeedFormPage`, `TimelineView`, `PhotoTimelineGrid`, Wizard-Komponenten, Import-Dialoge

---

## [0.2.0] - 2026-03-28

### Geändert

- **UI vollständig auf Deutsch** — Navigation, Dashboard, Aufgaben, Ausgaben, Saatgut, Kalender, Journal, Wissen, Einstellungen, Formulare, Fehlermeldungen, leere Zustände
- **Datumsdarstellung** — App-Sprache auf Deutsch gesetzt; zentrale Locale-Helfer für deutsche Datumsanzeige; Datumseingaben im Frontend angepasst (ISO-Format in der DB unverändert)
- README vollständig ins Deutsche übersetzt; englischer Hinweis als Fork-Kennzeichnung ergänzt

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
