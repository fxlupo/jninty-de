# Irrigation Review Follow-ups

Stand: 2026-05-06  
Basis: Review der Version 1.3.1 nach Pull von `main`.

## Ziel

Die Irrigation-Integration bleibt produktiv stabil, bekommt aber einen sauberen Migrationspfad und klare Nacharbeiten fuer API-Vertrag, UI-Verhalten und Tests.

## Prioritaet 1: Migration 0010 absichern

Status: umgesetzt in `server/migrations/0010_harsh_baron_zemo.sql`.

- Vor dem neuen Unique-Index wird der alte normale Index `irrigation_zone_user_valve_idx` per `DROP INDEX IF EXISTS` entfernt.
- Beim Rebuild von `irrigation_command` werden alte oder unerwartete Statuswerte auf gueltige Werte gemappt:
  - bekannter Status bleibt erhalten
  - `completed_at` gesetzt -> `done`
  - `acked_at` gesetzt -> `acked`
  - sonst `pending`
- Nach dem Tabellen-Rebuild wird `irrigation_command_user_status_idx` wieder angelegt.

Offen:

- Falls echte Duplikate in `irrigation_zone(user_id, valve_number)` existieren, muss vor dem Unique-Index manuell oder per separater Migration dedupliziert werden. Das sollte nicht blind automatisch geloescht werden, weil Zeitplaene und historische Referenzen betroffen sein koennen.

## Prioritaet 2: UI/API-Vertrag fuer Zeitplaene klaeren

Finding:

- Die UI erlaubt beim Bearbeiten eines Zeitplans eine andere Zone auszuwaehlen.
- Der Server ignoriert `zoneId` beim PATCH absichtlich.

Entscheidung:

- Entweder Zone beim Bearbeiten in der UI nicht editierbar machen.
- Oder `zoneId` serverseitig als erlaubtes Patch-Feld aufnehmen und Besitz der Zielzone validieren.

Empfehlung:

- Fuer weniger Ueberraschung im Frontend: Zone beim bestehenden Zeitplan als read-only anzeigen. Fuer Zone-Wechsel einen neuen Zeitplan anlegen und alten loeschen.

Status: umgesetzt. Bestehende Zeitplaene zeigen die Zone read-only; nur neue Zeitplaene haben eine Zonen-Auswahl.

## Prioritaet 3: Default-Zone-Race sauber behandeln

Finding:

- `ensureDefaultZones()` macht Select, dann Insert.
- Der Unique-Index verhindert Duplikate, kann bei parallelen Erstaufrufen aber einen transienten Constraint-Fehler erzeugen.

Empfehlung:

- Defaults mit `onConflictDoNothing` einfuegen.
- Danach Zonen erneut selektieren und zurueckgeben.

Status: umgesetzt. `ensureDefaultZones()` fuegt konfliktfest ein und liest danach erneut.

## Prioritaet 4: Version-Endpoint konsistent abrufen

Finding:

- `SettingsPage` ruft `/api/version` direkt am aktuellen Origin auf.
- Andere API-Aufrufe nutzen die konfigurierte API-Basis.

Empfehlung:

- Version-Request ueber dieselbe API-Hilfsfunktion oder dieselbe `apiUrl`-Basis laufen lassen.

Status: umgesetzt. `VersionInfo` verwendet die konfigurierte `apiUrl`-Basis oder faellt lokal auf `/api` zurueck.

## Prioritaet 5: Tests ergaenzen

Empfohlene Tests:

- Migration 0009 -> 0010 auf leerer DB. Status: umgesetzt.
- Migration 0009 -> 0010 mit unerwartetem Command-Status. Status: umgesetzt.
- Version-Endpoint nutzt konfigurierte API-Basis. Status: umgesetzt.
- Migration 0009 -> 0010 mit bestehenden Commands in allen gueltigen Statuswerten.
- `POST /api/irrigation/schedules` validiert Zone-Besitz.
- `PATCH /api/irrigation/schedules/:id` spiegelt die UI-Entscheidung zu `zoneId`.
- `GET /api/irrigation/device/commands` liefert nur frische pending Commands.
- `POST /api/irrigation/device/commands/:id/ack` und `/done` setzen den Status korrekt.

## Prioritaet 6: Dokumentation glattziehen

- README-Badge auf aktuelle Version setzen. Status: umgesetzt fuer `1.3.7`.
- Handover um den Migrationshinweis zu 0010 ergaenzen. Status: umgesetzt.
