# Bewässerung Handover

Stand: 2026-05-06
Version: 1.3.4
Branch der Umsetzung: `main`

## Kurzfassung

Das bisherige Bewässerungs-Backend wurde als natives Jninty-Modul in den bestehenden React/Hono/Drizzle/SQLite-Stack integriert. Die Weboberfläche läuft unter `/irrigation`, der ESP32-S3 synchronisiert über token-geschützte Device-Endpunkte.

Die Lösung ist produktiv nutzbar für:

- vier Bewässerungszonen/Ventile,
- manuelle Ventilsteuerung,
- automatische Zeitpläne,
- GW1200/WH52 Sensorwerte,
- ESP-Status und Ventilzustände,
- Eventlog,
- Sensorhistorie als Graphen.

## Architektur

```text
Browser
  -> /irrigation
  -> /api/irrigation/*
  -> better-auth Session

ESP32-S3
  -> /api/irrigation/device/*
  -> Authorization: Bearer <IRRIGATION_DEVICE_TOKEN>
  -> schreibt auf IRRIGATION_DEVICE_USER_ID

Backend
  -> Hono Router server/src/routes/irrigation.ts
  -> Drizzle Tabellen in server/src/db/schema.ts
  -> SQLite data/jninty.db
```

## Environment

Die Variablen gehören in den `server`-Service des Docker Compose Setups:

```env
IRRIGATION_ENABLED=true
IRRIGATION_DEVICE_TOKEN=<langes-zufaelliges-token>
IRRIGATION_DEVICE_USER_ID=<jninty-user-id>
```

`IRRIGATION_DEVICE_USER_ID` ist die Jninty User-ID, der die ESP-Daten zugeordnet werden.

## Web UI

Route: `/irrigation`

Tabs:

- `Dashboard`: Zonenstatus, Sensorwerte, nächster Lauf, Plan-/Skip-Grund, Statuskarten
- `Programme`: Zeitpläne erstellen, bearbeiten, löschen, Konfigurations-Export
- `Manuell`: Ventile 15/30/60/90 Minuten öffnen, Ventil schließen, alle stoppen
- `Eventlog`: filterbare Events mit Datum, Aktion, Zone, Trigger und Dauer
- `History`: Sensorgraphen für Bodenfeuchte und Bodentemperatur

Mobile Layouts wurden verdichtet, damit die vier Zonen auf kleinen Bildschirmen möglichst ohne Scrollen sichtbar sind.

## Backend-Endpunkte

Web-Endpunkte mit normaler Session:

- `GET /api/irrigation/dashboard`
- `GET /api/irrigation/zones`
- `PATCH /api/irrigation/zones/:id`
- `GET /api/irrigation/schedules`
- `POST /api/irrigation/schedules`
- `PATCH /api/irrigation/schedules/:id`
- `DELETE /api/irrigation/schedules/:id`
- `GET /api/irrigation/events?limit=200`
- `GET /api/irrigation/history?days=1|7|30|90|365`
- `POST /api/irrigation/commands`

Device-Endpunkte mit Bearer Token:

- `GET /api/irrigation/device/config`
- `GET /api/irrigation/device/commands`
- `GET /api/irrigation/device/events?limit=12`
- `POST /api/irrigation/device/status`
- `POST /api/irrigation/device/events`
- `POST /api/irrigation/device/sensors`
- `POST /api/irrigation/device/commands/:id/ack`
- `POST /api/irrigation/device/commands/:id/done`

## Datenmodell

Tabellen:

- `irrigation_zone`: Ventilnummer, Name, WH52-Kanal, Grenzwerte, Max-Dauer
- `irrigation_schedule`: Zone, Programm, Wochentage, Startzeit, Dauer
- `irrigation_sensor_reading`: Bodenfeuchte, Bodentemperatur, EC, Batterie
- `irrigation_event`: Öffnen, Schließen, Skip, Trigger, Detail, Dauer
- `irrigation_command`: Backend-Kommandos für den ESP
- `irrigation_status`: Heartbeat, RSSI, GW1200-Status, Ventilzustände, Firmware

Beim ersten Dashboard-Aufruf werden Default-Zonen für den Benutzer angelegt, falls noch keine existieren.
Das Anlegen ist konfliktfest: parallele Erstaufrufe verwenden `onConflictDoNothing` und lesen die Zonen danach erneut.

Migration `0010` härtet das Bewässerungsmodul nach:

- Der alte normale Zone-Index wird vor dem neuen Unique-Index entfernt.
- `irrigation_command` wird neu aufgebaut und alte/unerwartete Statuswerte werden auf `pending`, `acked` oder `done` normalisiert.
- Der Status-Index für Commands wird nach dem Rebuild wieder angelegt.

Falls in einer Bestandsdatenbank echte Duplikate für `(user_id, valve_number)` existieren, müssen diese vor dem Unique-Index bewusst bereinigt werden. Das wird nicht automatisch gelöscht, weil Zeitpläne und Historie an den Zonen hängen können.

## ESP-Verhalten

Der ESP pollt regelmäßig:

- Konfiguration,
- offene Kommandos,
- Status-Heartbeat,
- Sensorwerte,
- Events.

Manuelle Befehle aus dem Web werden als `irrigation_command` gespeichert. Der ESP holt pending Commands, bestätigt sie mit `ack` und schließt sie mit `done` ab.

Bei manuellen Läufen mit Dauer schreibt der ESP:

- `open / manual / Manuell X min`
- nach Ablauf automatisch `close / manual / Dauer abgelaufen`

Vorzeitiges manuelles Schließen oder `Alle stoppen` löscht den Laufzeit-Tracker und erzeugt keinen falschen Ablauf-Event.

## Eventlog

Filter in der UI:

- Alle
- Öffnen
- Schließen
- Skip
- Manuell
- Scheduler
- Zone

Skip-Texte sind benutzerfreundlich benannt:

- `Skip: Boden zu feucht`
- `Skip: Boden zu kalt`
- `Skip: es regnet`
- `Skip: keine Sensor Daten`

## History

Die History ist kein erweitertes Eventlog, sondern ein Sensorverlauf:

- Bodenfeuchte, Skala 0 bis 100 %
- Bodentemperatur, Skala -10 bis 40 °C
- Zeiträume: 24 Stunden, 7 Tage, 30 Tage, 90 Tage, 365 Tage
- Linien pro WH52-Kanal/Zone

## Deployment

Nach Merge auf `main`:

1. Docker Image neu bauen.
2. Container neu starten.
3. Server-Logs prüfen:
   - Migrationen erfolgreich
   - `Server läuft auf http://localhost:3001`
4. `/irrigation` im Browser öffnen.
5. Prüfen:
   - `/api/irrigation/dashboard`
   - `/api/irrigation/device/config` mit Device Token
   - ESP Logs für Config, Commands, Status, Events

Bei persistentem NAS-nginx muss sichergestellt sein, dass `/api/*` an den Server-Container geleitet wird und die SPA-Fallback-Regel nur für Frontend-Routen greift.

## Tests und Checks

Vor Release/Deployment ausführen:

```bash
npm run build:check
npm run test
npm run build
```

Für die Bewässerungs-Migration gibt es einen SQLite-Regressionscheck für `0009 -> 0010`. Der Test wird automatisch übersprungen, falls lokal kein `sqlite3` CLI verfügbar ist.

## Bekannte Hinweise

- Das ESP-Firmware-Projekt liegt außerhalb dieses Repos. Die Firmware wurde parallel angepasst und per OTA erfolgreich geflasht.
- Die alte PHP-Anwendung kann abgeschaltet werden, sobald der NAS-Betrieb mit Jninty `main` stabil läuft.

## Sinnvolle nächste Ausbaustufen

- Echte Ventil-Fehlererkennung über Strommessung oder Ausgangsdiagnose.
- Optionaler Import alter PHP/MySQL Sensordaten.
- Feineres Rollen-/Rechtemodell, falls mehrere Benutzer dieselbe ESP-Anlage verwalten sollen.
- Weitere Verdichtung/Politur der mobilen Darstellung nach realem Einsatz.
