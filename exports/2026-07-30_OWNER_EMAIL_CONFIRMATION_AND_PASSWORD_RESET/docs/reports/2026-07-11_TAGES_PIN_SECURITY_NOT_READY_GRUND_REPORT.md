# Tages-PIN Security NOT-READY Grund Analyse

Datum: 2026-07-11

Status: ANALYSE LOCK

## Hauptgrund NOT READY

Der Security-Fix ist laut Report implementiert und `npm run build` war erfolgreich.

Der Status bleibt trotzdem **NOT READY**, weil die neue Migration nicht gegen Supabase Staging angewendet wurde und die kritischen Sicherheitsfälle nicht live mit echten Staging-Daten geprüft wurden.

Für `FINAL LOCK` fehlen konkret:

1. Staging-Migration anwenden.
2. Live-Test gegen Supabase Staging.
3. RLS-/Rechteprüfung mit echten Rollen.
4. Prüfung der Fehlversuchs-, Sperr- und Tageslimitfälle mit echten Testkunden.

## Prüfpunkte

### 1. Wurde die Migration auf Staging angewendet?

Nein.

Der Report sagt ausdrücklich:

```text
Die Migration wurde noch nicht gegen Supabase Staging angewendet.
```

Betroffene Migration:

`supabase/migrations/20260711006000_daily_pin_bruteforce_and_points_daily_limit.sql`

### 2. Wurde live gegen Supabase Staging getestet?

Nein.

Im Report sind alle Validierungen A-G als Codepfad umgesetzt, aber mit:

```text
Live-Test: offen
```

markiert.

Nicht live geprüft:

- falsche PIN 1-4 mal
- falsche PIN 5. mal
- richtige PIN nach Sperre
- richtige PIN ohne Sperre
- Tageslimit 1., 2. und 3. Punktebuchung
- neuer lokaler Tag
- RLS / Security

### 3. Fehlt SUPABASE_ACCESS_TOKEN?

Im gelesenen Report wird `SUPABASE_ACCESS_TOKEN` nicht erwähnt.

Der konkrete Blocker ist nicht als fehlender Token dokumentiert, sondern als:

- Migration nicht gegen Staging angewendet
- kein Live-Test gegen Staging ausgeführt

Ob der Token fehlt, muss im nächsten Staging-Schritt geprüft werden.

### 4. Gibt es offene Risiken im Report?

Ja.

Offene Risiken laut Report:

- Die Migration wurde noch nicht gegen Supabase Staging angewendet.
- Die SQL-Funktionen wurden noch nicht live mit echten Testkunden geprüft.
- RLS wurde statisch geprüft, aber nicht durch echte anon/authenticated-Abfragen validiert.
- Die Bible enthält ältere Hinweise zu Rechnungsstufen ohne freie Betragseingabe; das ist nicht Teil dieses Security-Fixes.

### 5. Ist ein alter Punktebuchungsweg noch offen?

Laut Report: Nein.

Geprüfte aktive Wege:

- `collect_bonus_points`
- alte 3-Parameter-Variante von `collect_bonus_points`
- `apply_staff_daily_pin_loyalty_action`
- Frontend-Aufrufe in `loyaltyService.ts`

Ergebnis laut Report:

- Kundenpunktebuchung nutzt `collect_bonus_points`.
- Staff-Punktebuchung nutzt `apply_staff_daily_pin_loyalty_action`.
- beide aktiven RPCs prüfen Tages-PIN, Fehlversuche und Tageslimit.
- die alte 3-Parameter-Variante bucht keine Punkte.

Restunsicherheit:

Diese Aussage ist statisch geprüft, aber nicht live gegen die Staging-Datenbank validiert.

### 6. Ist der Staff-Pfad vollständig geschützt?

Laut Report: Ja, implementiert.

`apply_staff_daily_pin_loyalty_action` prüft:

- Tages-PIN erforderlich
- falsche PIN wird gezählt
- Sperre wird berücksichtigt
- Tageslimit gilt bei Punktebuchungen
- Stempelbuchungen bleiben getrennt

Restunsicherheit:

Kein Live-Test gegen Staging.

### 7. Ist Europe/Vienna Tageslogik vollständig geprüft?

Nein.

Sie ist laut Report im Codepfad umgesetzt:

```text
timezone('Europe/Vienna', now())::date
```

Aber der Test „Neuer lokaler Tag“ ist als offen markiert.

Die Tageslogik ist daher implementiert, aber nicht vollständig live geprüft.

### 8. Gibt es RLS- oder Rechte-Probleme?

Im Report sind keine konkreten RLS-Fehler dokumentiert.

Aber:

- RLS wurde nur statisch geprüft.
- echte anon/authenticated-Abfragen wurden nicht ausgeführt.
- die Migration wurde nicht gegen Staging angewendet.

Damit ist RLS nicht als fehlerhaft bestätigt, aber auch nicht live freigegeben.

### 9. Warum steht am Ende NOT READY?

Weil der Fix nur lokal/statisch validiert wurde.

Zitat aus der Report-Begründung:

```text
Der Security-Fix ist implementiert und der Build ist erfolgreich. Für FINAL LOCK fehlt noch die echte Anwendung der Migration und ein Live-Test der Fehlversuchs-, Sperr- und Tageslimitfälle gegen Supabase.
```

## Kritischer Blocker

Ja.

Begründung:

Ohne angewendete Staging-Migration und Live-Test ist nicht bewiesen, dass der Brute-Force-Schutz und das Tageslimit in der echten Supabase-Umgebung aktiv sind.

Das blockiert den Pilot-Freigabestatus, obwohl der Code implementiert ist.

## Erforderlicher nächster Fix

Kein Code-Fix als erster Schritt.

Erforderlicher nächster Schritt:

1. Supabase Staging-Zugriff prüfen.
2. `npx supabase db push --include-all` ausführen.
3. Prüfen, ob `20260711006000_daily_pin_bruteforce_and_points_daily_limit.sql` angewendet wurde.
4. Live-Test mit Staging-Testkunde durchführen:
   - 1-4 falsche PINs
   - 5. falsche PIN mit Sperre
   - richtige PIN nach Sperre blockiert
   - richtige PIN ohne Sperre bucht Punkte
   - 1. und 2. Sammlung erlaubt
   - 3. Sammlung blockiert
   - RLS direkt mit anon/authenticated prüfen
5. Erst danach Status auf `FINAL LOCK` setzen.

## Zusammenfassung

- Implementierung: vorhanden
- Build: erfolgreich
- Alte Wege: statisch geprüft
- Staff-Pfad: statisch geschützt
- Staging-Migration: nicht angewendet
- Live-Test: nicht ausgeführt
- RLS-Liveprüfung: nicht ausgeführt

## Status

ANALYSE LOCK
