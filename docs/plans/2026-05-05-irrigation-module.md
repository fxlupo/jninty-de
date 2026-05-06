# Bewaesserungsmodul fuer Jninty

Status: umgesetzt und stabilisiert
Zielversion: 1.3.0, stabilisiert bis 1.3.2
Ausgangsversion: 1.2.7

## Ziel

Das bestehende Bewaesserungs-Backend wird nicht als PHP-Anwendung eingebettet, sondern als natives Jninty-Modul in den vorhandenen React/Hono/Drizzle/SQLite-Stack migriert.

Das Modul soll:

- die ESP32-S3 Steuerung ueber stabile API-Endpunkte anbinden,
- Zonen, Zeitplaene, Sensorwerte, Events, Status und Kommandos in derselben SQLite-Datenbank speichern,
- die bestehende better-auth Web-Session fuer Benutzer verwenden,
- fuer den ESP einen separaten Device-Token verwenden,
- eine React UI im bestehenden Jninty Layout bereitstellen.

## Architektur

```
ESP32-S3  ── Bearer Token ──▶  Hono /api/irrigation/device/*
Browser   ── Session Cookie ─▶  Hono /api/irrigation/*
                                 │
                                 ▼
                          Drizzle + SQLite
```

Die Web-Routen bleiben benutzergebunden ueber `requireAuth`.

Die ESP-Routen verwenden `IRRIGATION_DEVICE_TOKEN` und schreiben auf den Benutzer aus `IRRIGATION_DEVICE_USER_ID`. Dadurch bleibt das bestehende Multi-User-Modell erhalten, ohne dass der ESP einen normalen Login braucht.

## Environment

Neue optionale Variablen:

- `IRRIGATION_ENABLED=true`
- `IRRIGATION_DEVICE_TOKEN=<langes-zufaelliges-token>`
- `IRRIGATION_DEVICE_USER_ID=<jninty-user-id>`

Wenn `IRRIGATION_DEVICE_TOKEN` oder `IRRIGATION_DEVICE_USER_ID` fehlen, antworten Device-Endpunkte mit `503`.

## Datenmodell

### `irrigation_zone`

Konfiguration pro Ventil/Zone.

Wichtige Felder:

- `valve_number` 1-4
- `name`
- `wh52_channel`
- `active`
- `moisture_threshold`
- `temp_minimum`
- `rain_threshold_6h`
- `max_duration_min`

### `irrigation_schedule`

Bis zu mehrere Programme je Zone.

Wichtige Felder:

- `zone_id`
- `program`
- `active`
- `weekdays`
- `start_time`
- `duration_min`

### `irrigation_sensor_reading`

Vom ESP gemeldete GW1200/WH52 Werte.

Wichtige Felder:

- `channel`
- `soil_moisture`
- `soil_temp`
- `soil_ec`
- `battery_ok`
- `created_at`

### `irrigation_event`

Einzeiliges Eventlog.

Wichtige Felder:

- `zone_id`
- `zone_number`
- `action`: `open`, `close`, `skip`, `system`
- `reason`: `manual`, `schedule`, `sensor`, `system`
- `detail`
- `duration_sec`
- `created_at`

### `irrigation_command`

Backend -> ESP Kommandos.

Wichtige Felder:

- `zone_id`
- `zone_number`
- `command`: `open`, `close`, `close_all`
- `duration_min`
- `status`: `pending`, `acked`, `done`, `failed`
- `requested_by`
- `requested_at`
- `acked_at`
- `completed_at`

### `irrigation_status`

Letzter Heartbeat des ESP.

Wichtige Felder:

- `last_seen`
- `wifi_rssi`
- `ecowitt_ok`
- `valve_states`
- `firmware_version`
- `ip_address`
- `uptime_sec`

## API-Plan

### Web/API mit better-auth

- `GET /api/irrigation/dashboard`
- `GET /api/irrigation/zones`
- `PATCH /api/irrigation/zones/:id`
- `GET /api/irrigation/schedules`
- `POST /api/irrigation/schedules`
- `PATCH /api/irrigation/schedules/:id`
- `DELETE /api/irrigation/schedules/:id`
- `GET /api/irrigation/events?limit=50`
- `POST /api/irrigation/commands`

### ESP/API mit Device Token

- `GET /api/irrigation/device/config`
- `GET /api/irrigation/device/commands`
- `GET /api/irrigation/device/events?limit=12`
- `POST /api/irrigation/device/status`
- `POST /api/irrigation/device/events`
- `POST /api/irrigation/device/sensors`
- `POST /api/irrigation/device/commands/:id/ack`
- `POST /api/irrigation/device/commands/:id/done`

## Umsetzungsstand

- Schema und API sind in Jninty integriert.
- ESP Device-Endpunkte sind angebunden und werden produktiv vom ESP genutzt.
- Web UI ist als Tab-Oberfläche auf `/irrigation` umgesetzt.
- Manuelle Kommandos werden im Backend angelegt, vom ESP gepollt, geacknowledged und abgeschlossen.
- Sensorwerte, Status und Events werden vom ESP in die SQLite-Datenbank geschrieben.
- Migration `0010` ist gegen vorhandene Indizes und Legacy-Command-Status abgesichert.
- Default-Zonen werden konfliktfest angelegt und danach erneut gelesen.
- Bestehende Zeitpläne zeigen die Zone beim Bearbeiten read-only, damit UI und API-Vertrag eindeutig bleiben.
- Alte PHP/MySQL Daten können bei Bedarf noch separat migriert werden.

## UI-Plan

Route: `/irrigation`

Ansichten:

- Dashboard mit Zonenstatus, Sensorwerten, naechstem Lauf, Plan-/Skip-Grund und Statuskarten
- Programme fuer automatische Laeufe
- Manuelle Steuerung mit Laufzeitfeedback
- Eventlog mit Filtern
- History mit Sensorgraphen fuer Bodenfeuchte und Bodentemperatur
- Konfiguration fuer Zonen direkt ueber Dashboard-Bearbeitung
- JSON-Konfigurationsexport fuer Zonen und Zeitplaene

Die Navigation soll als normaler Eintrag in Sidebar und Mobile Navigation erscheinen.
