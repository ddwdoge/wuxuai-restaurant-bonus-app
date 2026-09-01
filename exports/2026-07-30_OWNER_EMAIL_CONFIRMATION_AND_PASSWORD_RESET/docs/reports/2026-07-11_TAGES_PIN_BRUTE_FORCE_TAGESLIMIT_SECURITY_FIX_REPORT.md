# Tages-PIN Brute-Force-Schutz und Tageslimit Security Fix

Datum: 2026-07-11

Status: NOT READY

## Ursache

Vor dem Fix konnte `collect_bonus_points` mit Kundentoken und Tages-PIN öffentlich aufgerufen werden, ohne serverseitige Fehlversuchsbegrenzung. Dadurch war die 4-stellige Tages-PIN theoretisch brute-force-bar.

Zusätzlich gab es nur einen kurzen Wiederholschutz. Ein Gast konnte mit bekannter Tages-PIN mehrfach am selben lokalen Tag Punkte sammeln.

## Geänderte Dateien

- `supabase/migrations/20260711006000_daily_pin_bruteforce_and_points_daily_limit.sql`
- `src/modules/loyalty/loyaltyService.ts`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Neue Migration

Migration:

`20260711006000_daily_pin_bruteforce_and_points_daily_limit.sql`

Die Migration ergänzt serverseitigen Schutz für:

- öffentliche Punktebuchung über `collect_bonus_points`
- Mitarbeiter-Punktebuchung über `apply_staff_daily_pin_loyalty_action`

## Neue Tabelle `daily_pin_attempts`

Neue Tabelle:

`daily_pin_attempts`

Zweck:

- falsche Tages-PIN-Versuche pro Gast / Restaurant / Filiale / lokalem Tag zählen
- Sperre nach zu vielen Fehlversuchen speichern
- Tageslogik für `Europe/Vienna` einheitlich halten

Wichtige Felder:

- `restaurant_id`
- `organization_id`
- `branch_id`
- `customer_id`
- `customer_token_hash`
- `valid_date`
- `failed_attempts`
- `locked_until`
- `last_failed_at`
- `created_at`
- `updated_at`

Unique-Regel:

- `restaurant_id`
- `branch_id`
- `customer_id`
- `valid_date`

Die Unique-Regel verwendet `NULLS NOT DISTINCT`, damit auch eine fehlende `branch_id` nicht zu doppelten Attempt-Zeilen führt.

## Geänderte RPCs

### `collect_bonus_points`

Die aktive 5-Parameter-Variante prüft jetzt:

- Restaurant-Slug ist gültig
- Kundentoken ist gültig
- Tages-PIN-Datensatz existiert oder wird serverseitig erzeugt
- keine aktive Tages-PIN-Sperre besteht
- Tages-PIN korrekt ist
- Tageslimit noch nicht erreicht ist
- 5-Minuten-Duplikatschutz weiterhin gilt
- Punkte werden erst danach berechnet und gebucht

Die alte 3-Parameter-Variante bleibt blockiert und bucht keine Punkte.

### `apply_staff_daily_pin_loyalty_action`

Die Mitarbeiter-Punktebuchung prüft jetzt dieselben Sicherheitsregeln:

- Tages-PIN erforderlich
- falsche PIN wird gezählt
- Sperre wird berücksichtigt
- Tageslimit gilt bei Punktebuchungen
- Stempelbuchungen bleiben von Punkte-Tageslimit getrennt

## Fehlversuchslogik

Regel:

- maximal 5 falsche Tages-PIN-Versuche pro Gast / Restaurant / Filiale / lokalem Tag
- beim 5. Fehlversuch wird `locked_until` auf Ende des lokalen Tages gesetzt
- richtige PIN wird während aktiver Sperre nicht akzeptiert

Fehlermeldung bei falscher PIN:

```text
Die Tages-PIN ist nicht korrekt.
```

Fehlermeldung bei Sperre:

```text
Zu viele falsche Versuche. Bitte wende dich an das Restaurant.
```

## Audit

Bei falscher Tages-PIN:

- `daily_pin_failed`

Bei Sperre:

- `daily_pin_locked`

Bei blockierter dritter Punktebuchung:

- `points_daily_limit_blocked`

Audit-Metadaten enthalten:

- `customer_id`
- `restaurant_id`
- `branch_id`
- `valid_date`
- `failed_attempts` oder `successful_collections_today`
- Quelle (`bonus_qr` oder `staff_portal`)

## Tageslimitlogik

Regel:

- maximal 2 erfolgreiche Punktebuchungen pro Gast / Restaurant / Filiale / lokalem Tag
- die 3. Punktebuchung am selben lokalen Tag wird serverseitig blockiert
- es wird keine `points_transactions`-Zeile geschrieben

Fehlermeldung:

```text
Du hast heute bereits Punkte gesammelt.
```

Die UI übersetzt dies verständlich:

```text
Du hast heute bereits Punkte gesammelt. Wenn das nicht stimmt, wende dich bitte an das Restaurant.
```

## Europe/Vienna Tageslogik

Alle neuen Tagesprüfungen verwenden:

```text
timezone('Europe/Vienna', now())::date
```

Für Tagesfenster wird der lokale Tagesstart und der nächste lokale Tagesstart berechnet.

Dadurch verwenden:

- Tages-PIN
- Fehlversuche
- Tageslimit

dieselbe lokale Tagesgrenze.

## Alte Wege Prüfung

Geprüfte aktive Wege:

- `collect_bonus_points`
- alte 3-Parameter-Variante von `collect_bonus_points`
- `apply_staff_daily_pin_loyalty_action`
- Frontend-Aufrufe in `loyaltyService.ts`

Ergebnis:

- Kundenpunktebuchung nutzt `collect_bonus_points`
- Staff-Punktebuchung nutzt `apply_staff_daily_pin_loyalty_action`
- beide aktiven RPCs prüfen Tages-PIN, Fehlversuche und Tageslimit
- die alte 3-Parameter-Variante bucht keine Punkte

Historische Migrationen enthalten ältere Funktionsstände, werden aber durch die neue spätere Migration überschrieben.

## RLS / Security Prüfung

Statische Prüfung:

- `daily_pin_attempts` hat RLS aktiviert
- direkte Anzeige ist nur für Restaurant-Mitglieder vorgesehen
- Kundenseite liest Attempts nicht direkt
- Frontend verwendet keine Service Role
- Tages-PIN wird nicht im Kundenportal angezeigt
- Punktebuchung bleibt serverseitig

Offen:

- echte RLS-Prüfung gegen Staging wurde in diesem Schritt nicht ausgeführt
- Migration wurde in diesem Schritt nicht gegen Supabase angewendet

## Validierung A-H

### A. Falsche PIN 1-4 mal

Codepfad umgesetzt:

- keine Punktebuchung
- `failed_attempts` steigt
- `daily_pin_failed` wird auditiert

Live-Test: offen

### B. Falsche PIN 5. mal

Codepfad umgesetzt:

- keine Punktebuchung
- `locked_until` wird gesetzt
- `daily_pin_locked` wird auditiert

Live-Test: offen

### C. Richtige PIN nach Sperre

Codepfad umgesetzt:

- aktive Sperre wird vor PIN-Akzeptanz geprüft
- keine Punktebuchung

Live-Test: offen

### D. Richtige PIN ohne Sperre

Codepfad umgesetzt:

- bestehende Punktebuchung bleibt erhalten
- Fehlversuche werden bei erfolgreicher Buchung zurückgesetzt, wenn keine Sperre aktiv ist

Live-Test: offen

### E. Tageslimit

Codepfad umgesetzt:

- 1. erfolgreiche Buchung erlaubt
- 2. erfolgreiche Buchung erlaubt
- 3. erfolgreiche Buchung blockiert

Live-Test: offen

### F. Neuer lokaler Tag

Codepfad umgesetzt:

- `valid_date` basiert auf `Europe/Vienna`
- Tagesfenster basiert auf lokalem Tagesstart

Live-Test: offen

### G. RLS / Security

Statisch geprüft.

Live-Test: offen

### H. Build

Build erfolgreich:

```text
npm run build
```

## Build Ergebnis

Erfolgreich.

## Offene Risiken

- Die Migration wurde noch nicht gegen Supabase Staging angewendet.
- Die SQL-Funktionen wurden noch nicht live mit echten Testkunden geprüft.
- RLS wurde statisch geprüft, aber nicht durch echte anon/authenticated-Abfragen validiert.
- Die Bible enthält ältere Hinweise zu Rechnungsstufen ohne freie Betragseingabe; das ist nicht Teil dieses Security-Fixes.

## Status

NOT READY

Begründung:

Der Security-Fix ist implementiert und der Build ist erfolgreich. Für `FINAL LOCK` fehlt noch die echte Anwendung der Migration und ein Live-Test der Fehlversuchs-, Sperr- und Tageslimitfälle gegen Supabase.
