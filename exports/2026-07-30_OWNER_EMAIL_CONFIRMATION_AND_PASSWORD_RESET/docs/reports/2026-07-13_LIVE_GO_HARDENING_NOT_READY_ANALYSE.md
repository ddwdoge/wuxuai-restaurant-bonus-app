# Live-Go Hardening NOT-READY Analyse

Datum: 2026-07-14

Status: ANALYSE FERTIG

## Aufgabe

Analyse des Reports:

- `docs/reports/2026-07-13_LIVE_GO_HARDENING_RATE_LIMIT_OWNER_RACE_REPORT.md`

Ziel:

Exakt klären, warum der Hardening-Block trotz erfolgreicher Code-Prüfpunkte und erfolgreichem Build den Status `NOT READY` erhalten hat.

## Gelesene Dateien

- `AGENTS.md`
- `docs/reports/2026-07-13_LIVE_GO_HARDENING_RATE_LIMIT_OWNER_RACE_REPORT.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`

Hinweis:

- `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert im geprüften Repository nicht als eigene Datei.
- Die Selbstkontroll-Regeln sind in `AGENTS.md` und `docs/18_CODEX_REGELN.md` enthalten und wurden für die Bewertung verwendet.

## NOT-READY Ursache

Der Status `NOT READY` wurde nicht wegen eines gemeldeten Codefehlers gesetzt.

Der Report nennt als Ursache:

- neue Migration wurde erstellt,
- Migration wurde nicht auf Supabase Staging angewendet,
- `npx supabase db push --include-all` wurde nicht ausgeführt,
- Rate-Limit wurde nicht live gegen Staging geprüft,
- Owner Registration Race Fix wurde nicht live gegen Staging geprüft,
- RLS/RPC/Grant-Verhalten wurde nicht live gegen Staging verifiziert.

Der konkrete Grund im Report:

> In der lokalen Umgebung war kein `SUPABASE_ACCESS_TOKEN` gesetzt. Deshalb wurde kein `npx supabase db push --include-all` gegen Staging ausgeführt.

Zusätzlich steht im Report:

> Wegen neuer Migration und Security-relevantem RPC-Verhalten ist nach Engineering Bible jedoch Staging-Migration plus echter Flow-Test Pflicht. Beides konnte ohne Supabase Access Token nicht durchgeführt werden.

## Klassifizierung A-G

### A. Migration nicht auf Staging angewendet

Ja.

Die Migration `20260713004000_live_go_hardening_rate_limit_owner_race.sql` wurde erstellt, aber nicht auf Supabase Staging angewendet.

### B. Live/Staging-Test nicht durchgeführt

Ja.

Im Report steht `Staging Ergebnis: Nicht durchgeführt.`

Nicht live geprüft wurden unter anderem:

- gültiger Token mit eigenem Reward,
- fremder Reward,
- ungültiger Token mehrfach,
- bereits eingelöstes Willkommensgeschenk mehrfach,
- Owner Registration nach E-Mail-Bestätigung und wiederholtem Login.

### C. RLS/RPC nicht live geprüft

Ja.

Die RLS-/Security-Prüfung war nur eine Code-Prüfung.

Im Report steht ausdrücklich:

- Live-/Staging-Prüfung: Nicht durchgeführt.

### D. Rate-Limit nur lokal geprüft

Ja.

Der Rate-Limit-Pfad wurde im Code geprüft, aber nicht gegen eine echte Supabase-Staging-Datenbank mit realer RPC-Ausführung bestätigt.

### E. Owner Registration nur simuliert geprüft

Ja.

Der Retry-/Idempotenz-Pfad wurde im Code geprüft. Der echte Auth-Flow mit Supabase-Session-Propagation wurde nicht live gegen Staging geprüft.

### F. Offene kritische Bugs

Nein.

Der Report nennt keine offenen kritischen Codebugs.

Es gibt offene Validierungsrisiken, aber keine bestätigten kritischen Implementierungsfehler.

### G. Report-Status versehentlich falsch gesetzt

Nein.

Der Status `NOT READY` ist korrekt.

Begründung:

- Eine neue Migration wurde erstellt.
- Security-relevantes RPC-Verhalten wurde geändert.
- Nach `AGENTS.md` und `docs/18_CODEX_REGELN.md` ist dafür Staging-Migration, echte Flow-Prüfung und RLS/RPC-Prüfung erforderlich.
- Diese Prüfungen fehlen.

## Entscheidung

### CODE LOCK möglich

Ja.

Begründung:

- Code-Änderungen sind implementiert.
- Build war erfolgreich.
- Dokumentation wurde aktualisiert.
- Report und Prüf-ZIP wurden erstellt.
- Der Report nennt keine offenen kritischen Codebugs.

Einschränkung:

CODE LOCK bedeutet hier nur: lokal implementiert und buildfähig.

### FINAL LOCK möglich

Nein.

Begründung:

FINAL LOCK ist nach Engineering Bible nur möglich, wenn zusätzlich:

- Migration auf Staging angewendet wurde,
- echter Staging-Flow getestet wurde,
- RLS/Security gegen Staging geprüft wurde,
- keine offenen Risiken bleiben.

Diese Punkte fehlen.

## Was fehlt exakt für FINAL LOCK?

1. Supabase Staging-Zugriff bereitstellen.
2. Migration anwenden:
   `npx supabase db push --include-all`
3. Prüfen, dass diese Migration angewendet wurde:
   `20260713004000_live_go_hardening_rate_limit_owner_race.sql`
4. RPC `redeem_customer_reward` live gegen Staging testen:
   - gültiger Customer Token,
   - eigener aktiver Reward,
   - fremder Reward,
   - ungültiger Token,
   - mindestens 6 ungültige Versuche für Rate-Limit,
   - bereits eingelöstes Willkommensgeschenk,
   - deutsche Fehlermeldung.
5. Attempt Logging live prüfen:
   - Token nur gehasht,
   - keine Klartext-Tokens,
   - success/failure/reason korrekt.
6. RLS/RPC/Grant-Verhalten live prüfen:
   - anon darf die RPC ausführen,
   - anon darf Attempts nicht direkt lesen,
   - Restaurant-Mitglied sieht nur eigene Attempt-Daten,
   - fremde Restaurantdaten bleiben isoliert.
7. Owner Registration Race Fix live testen:
   - E-Mail-Bestätigung / Login,
   - verzögerte Session,
   - Retry,
   - Pending-Daten bleiben bei Fehler erhalten,
   - Wiederholung erzeugt kein zweites Restaurant,
   - Membership und Subscription sind vorhanden.
8. Ergebnis in einem Staging-Abnahmebericht dokumentieren.

## Kritischer Blocker

Ja, als Freigabe-Blocker für `FINAL LOCK`.

Nein, als bestätigter Codebug.

Die blockierende Ursache ist fehlende Staging-/Live-Verifikation, nicht ein im Report bestätigter Implementierungsfehler.

## Zusammenfassung

Der Hardening-Block ist lokal implementiert und buildfähig.

`CODE LOCK` ist fachlich möglich.

`FINAL LOCK` ist nicht möglich, weil Migration, Rate-Limit, RLS/RPC und Owner Registration nicht gegen Supabase Staging geprüft wurden.

## Status

ANALYSE FERTIG
