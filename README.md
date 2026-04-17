> This repository is a translated and adapted copy of the original project at https://github.com/HapiCreative/jninty — UI and documentation have been translated to German, and the backend has been migrated from PouchDB to a Hono/Drizzle/SQLite API server with better-auth authentication.

# Jninty

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline--ready-5A0FC8?logo=pwa&logoColor=white)

**Persönliches Gartenjournal und Verwaltungs-PWA — komplett selbst gehostet.**  
Pflanzen, Journal, Aufgaben, Saatgut, Ausgaben, Gartenkarte und Wetter in einer App. Mehrere Benutzer werden unterstützt — jeder sieht nur seine eigenen Daten.

---

## Funktionen

- **Pflanzenbestand** — Pflanzen mit Fotos, Art, Sorte, Pflegenotizen und Lebenszyklusstatus verwalten; direkte Verknüpfung mit einem Wissenseintrag
- **Gartenjournal** — Tägliche Aktivitäten mit Fotos dokumentieren, optional mit Wetter-Snapshot
- **Schnellprotokoll** — Foto-zentrierter 3-Tap-Ablauf für schnelle Notizen im Garten
- **Wissensbasis** — Anbauhinweise für Gemüse, Kräuter, Obst und Blumen; Import per URL (NaturaDB u. a.); KI-gestützte Feldextraktion; eigene Einträge möglich
- **Pflanzkalender** — Zeitachsen-, Jahres- und Monatsansichten für Anbauplanung und Saisonorganisation
- **Aufgabenverwaltung** — Aufgaben anlegen, priorisieren und nachverfolgen; automatische Erstellung aus Pflegeplänen
- **Gartenkarte** — Visueller Karteneditor (Konva.js) mit metrischem Raster (1 Zelle = 50 cm), Zoom, Pan, drei Modi:
  - *Ansehen* — Karte navigieren, Beet-Details anzeigen, Pflanzenpins direkt zur Pflanzenseite verlinken
  - *Bearbeiten* — Beete und Pflanzenpins per Drag & Drop verschieben (Snap to Grid); Pingrößen anpassen; Einträge löschen
  - *Beet anlegen* — Rechteck auf dem Raster zeichnen, Beet benennen und einfärben
  - *Pflanze platzieren* — Pflanzen als skalierbare Kreismarkierungen direkt auf der Karte platzieren (ohne Beet)
- **Saatgutbank** — Saatgutbestand mit Kaufdatum, Ablaufdatum und Keimraten verwalten
- **Saisons & Pflanzungen** — Saisonbasierte Pflanzungsdaten mit Frostterminen und Jahresvergleich
- **Ausgaben** — Gartenausgaben nach Kategorien und Saison erfassen und filtern
- **Wetter** — Aktuelles Wetter und Frostwarnungen über [Open-Meteo](https://open-meteo.com) (kein API-Key nötig)
- **Volltextsuche** — Schnelle Suche über Pflanzen und Journaleinträge (MiniSearch)
- **Datenexport/-import** — ZIP-Backup und Wiederherstellung
- **Mehrere Benutzer** — Jeder Benutzer hat ein eigenes Login, Daten sind vollständig getrennt
- **PWA** — Installierbar auf jedem Gerät, funktioniert im Browser und als Home-Screen-App
- **Dark Mode & Barrierefreiheit** — Systemthema oder manuell; hoher Kontrast, anpassbare Schriftgröße, Tastaturkürzel

---

## Technischer Aufbau

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│         Frontend (nginx)        │     │         Backend (Node.js)         │
│                                 │     │                                  │
│  React 18 + TypeScript          │────▶│  Hono API-Server                 │
│  Tailwind CSS v4                │     │  Drizzle ORM + SQLite            │
│  React Router DOM v7            │     │  better-auth (Session-Cookies)   │
│  Vite PWA                       │     │  Foto-Uploads auf Dateisystem    │
└─────────────────────────────────┘     └──────────────────────────────────┘
        Port 80 (nginx)                          Port 3001 (intern)
```

| Schicht | Technologie |
|---------|-------------|
| Frontend-Framework | React 18 + TypeScript (strict) |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 (kein config-File, alles in `index.css`) |
| Routing | React Router DOM v7 |
| Backend | Hono auf Node.js 22 |
| Datenbank | SQLite via Drizzle ORM (`data/jninty.db`) |
| Authentifizierung | better-auth (E-Mail + Passwort, Session-Cookies) |
| Fotos | Multipart-Upload → Dateisystem (`data/uploads/`) |
| Suche | MiniSearch (client-seitig) |
| Validierung | Zod |
| Karteeditor | Konva.js |
| Tests | Vitest + Testing Library |
| Wetter | Open-Meteo (kostenlos, kein Key) |

### Verzeichnisstruktur

```
src/
  pages/              Seitenkomponenten (eine Datei pro Route)
  components/         Gemeinsame UI-Komponenten
  components/ui/      Primitive Bausteine (Button, Card, Input, Badge …)
  components/layout/  AppShell (Sidebar + Bottom-Navigation)
  db/                 API-Client, Repositories, Suchindex
  hooks/              React Hooks
  services/           Fachlogik (Kalender, Aufgaben, Fotos, Export/Import)
  validation/         Zod-Schemata für alle Entitäten
  store/              Auth-State (sessionStore, authStore)

server/src/
  routes/             Hono-Router je Entität (/api/plants, /api/journal …)
  db/                 Drizzle-Client + Schema + Migrationen
  middleware/         requireAuth (Session-Prüfung)
  auth.ts             better-auth Konfiguration

data/                 (Laufzeit, nicht im Repo)
  jninty.db           SQLite-Datenbankdatei
  uploads/            Hochgeladene Fotos
```

### Datentrennung

Alle Tabellen (Pflanzen, Journal, Aufgaben, Saatgut, Ausgaben, Saisons …) enthalten eine `userId`-Spalte. Die `requireAuth`-Middleware setzt `userId` aus der Session; jede Datenbankabfrage filtert automatisch nach diesem Wert — Benutzer können nie auf Daten anderer zugreifen.

---

## Docker-Deployment

### Voraussetzungen

- Docker + Docker Compose
- Ein Reverse Proxy (z. B. Traefik) der HTTPS terminiert, oder ein eigener nginx/Caddy
- Eine Domain oder Subdomain die auf den Server zeigt

### Dateien

Die folgenden drei Dateien müssen im Projektverzeichnis liegen (alle befinden sich bereits im Repository):

| Datei | Funktion |
|-------|----------|
| `Dockerfile` | Baut das Frontend (React → nginx) |
| `Dockerfile.server` | Baut den API-Server (Node.js + Hono) |
| `docker-compose.yml` | Verbindet beide Container, Traefik-Labels, Volume |

### docker-compose.yml anpassen

Öffne `docker-compose.yml` und ersetze die Platzhalter:

```yaml
services:
  server:
    environment:
      BETTER_AUTH_SECRET: "<zufälliger 64-Zeichen-String>"   # ← ändern
      BETTER_AUTH_URL: "https://deine-domain.de"              # ← ändern
      FRONTEND_ORIGIN: "https://deine-domain.de"              # ← ändern
      TRUSTED_ORIGINS: "https://deine-domain.de"              # ← ändern

  frontend:
    labels:
      - traefik.http.routers.jninty.rule=Host(`deine-domain.de`)  # ← ändern
```

Einen sicheren `BETTER_AUTH_SECRET` generieren:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Starten

```bash
docker compose up -d
```

Beim ersten Start führt der Server-Container automatisch alle Datenbank-Migrationen aus (`npm run db:migrate`), bevor der API-Server hochfährt.

### Traefik-Voraussetzungen

Das `docker-compose.yml` setzt ein bestehendes Traefik-Setup voraus:

- Externes Docker-Netzwerk `proxy` muss existieren: `docker network create proxy`
- Traefik muss auf diesem Netzwerk lauschen und HTTPS terminieren
- Der `certresolver` heißt in der Beispielkonfiguration `http` — ggf. an die eigene Konfiguration anpassen

Ohne Traefik kann stattdessen ein Port-Mapping ergänzt werden:

```yaml
  frontend:
    ports:
      - "80:80"
```

---

## Benutzer verwalten

Die App hat keine öffentliche Registrierung. Neue Benutzer werden von einem bereits eingeloggten Benutzer über die API angelegt.

### Ersten Benutzer anlegen

Da beim allerersten Start noch kein eingeloggter Benutzer existiert, gibt es einen Bootstrap-Endpunkt der **nur greift, wenn die Datenbank noch keine Benutzer enthält**:

```bash
curl -X POST https://deine-domain.de/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"sicheres-passwort"}'
```

> **Hinweis:** Dieser Endpunkt wird von better-auth bereitgestellt. Er akzeptiert nur dann neue Registrierungen, wenn `emailAndPassword.enabled: true` gesetzt ist. In der aktuellen Konfiguration ist die öffentliche Selbstregistrierung bewusst nicht abgesperrt — wer Selbstregistrierung verhindern möchte, kann `disableSignUp: true` in `server/src/auth.ts` ergänzen.

### Weitere Benutzer anlegen

Weitere Benutzer legt ein bereits eingeloggter Benutzer über den Admin-Endpunkt an. Zunächst einloggen und den Session-Cookie speichern:

```bash
# Einloggen und Cookie speichern
curl -c cookies.txt -X POST https://deine-domain.de/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"sicheres-passwort"}'

# Neuen Benutzer anlegen
curl -b cookies.txt -X POST https://deine-domain.de/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Zweiter User","email":"user2@example.com","password":"passwort123"}'
```

### Benutzer löschen

```bash
# ID des Benutzers aus der Benutzerliste holen
curl -b cookies.txt https://deine-domain.de/api/users

# Benutzer löschen (eigener Account kann nicht gelöscht werden)
curl -b cookies.txt -X DELETE https://deine-domain.de/api/users/<user-id>
```

### Passwort zurücksetzen

Better-auth bietet einen Passwort-Reset-Flow via E-Mail — dieser setzt einen konfigurierten SMTP-Server voraus. Alternativ kann das Passwort direkt über die better-auth-API gesetzt werden (wenn man bereits eingeloggt ist):

```bash
curl -b cookies.txt -X POST https://deine-domain.de/api/auth/change-password \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"altes-passwort","newPassword":"neues-passwort"}'
```

---

## Lokale Entwicklung

```bash
git clone https://github.com/fxlupo/jninty-de.git
cd jninty-de
npm install

# .env anlegen (Vorlage anpassen)
cp .env.example .env

# Frontend + Backend gleichzeitig starten
npm run dev:full
```

Öffne [http://localhost:5173](http://localhost:5173) im Browser.

### Befehle

```bash
npm run dev            # Nur Vite-Frontend (Port 5173)
npm run dev:server     # Nur API-Server (Port 3001, tsx watch)
npm run dev:full       # Beides parallel
npm run build          # TypeScript-Check + Produktions-Build
npm run build:check    # Nur TypeScript-Check (frontend + server)
npm run lint           # ESLint
npm run test           # Tests einmalig ausführen
npm run test:watch     # Tests im Watch-Modus
npm run db:generate    # Drizzle-Migration generieren
npm run db:migrate     # Migrationen anwenden
npm run db:studio      # Drizzle Studio öffnen
```

### .env für Entwicklung

```env
BETTER_AUTH_SECRET=beliebiger-lokaler-string
BETTER_AUTH_URL=http://localhost:3001
TRUSTED_ORIGINS=http://localhost:5173
```

---

## Changelog

### 1.0.0 (2026-04-17)

**Gartenkarte — vollständig überarbeitet**
- Metrisches Raster: 1 Zelle = 50 cm, Betonungslinien alle 1 m
- Standard-Ansicht: 25 m × 15 m sichtbarer Bereich beim Öffnen
- Zoom per Mausrad (auf Cursor zentriert) und Toolbar-Buttons
- Drei Werkzeugmodi: *Ansehen*, *Bearbeiten*, *Beet anlegen*, *Pflanze platzieren*
- **Bearbeiten-Modus**: Beete und Pflanzenpins per Drag & Drop verschieben (Snap to Grid); Pingrößen-Slider; Einträge löschen
- **Pflanzenpins**: Pflanzen als Kreismarkierungen direkt auf der Karte platzieren (ohne Beet); Größe skalierbar (Durchmesser in Metern); Klick navigiert direkt zur Pflanzenseite

**Pflanzen**
- Verknüpfung mit einem Wissenseintrag: durchsuchbares Dropdown im Pflanzenformular; klickbarer Link auf der Pflanzendetailseite

**Wissensbasis**
- KI-Prompt verbessert: Felder `verwendungInfo` und `schaedlingeInfo` werden jetzt zuverlässig befüllt
- Detailseite: neue Karten für Verwendung und Schädlinge & Krankheiten
- Formular: neue Textfelder für `verwendungInfo` und `schaedlingeInfo`

---

## Lizenz

[MIT](LICENSE)
