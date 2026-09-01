# Smart Setup Owner Operational Staff Readiness Report

Datum: 2026-09-01
Branch: `codex/v1-canonical-recovery`
Ausgangs-HEAD: `e00c7fb68fb599b73457affd70ce5eef65604f55`

## Ursache

Der korrigierte Staff-Gate akzeptierte nur einen kanonisch aktiven eingeladenen
Staff-Zugang. Der bereits freigegebene V1-Vertrag erlaubt Ownern, Admins und
Managern jedoch den operativen Mitarbeiterbereich fuer ihr eigenes Restaurant
mit unveraenderter Betreiberrolle zu verwenden. Ein Owner-geführtes Restaurant
wurde deshalb faelschlich zur Einladung eines zweiten Benutzers aufgefordert.

## Umsetzung

- Der bestehende serverseitige Resolver `get_my_staff_restaurant_access` wird
  fuer den exakten Restaurant-Slug wiederverwendet.
- Nur `success = true`, `access_mode = operator` sowie exakt passende
  Restaurant-ID und Slug zaehlen als Owner-Betreiberzugriff.
- Staff-Readiness lautet Betreiberzugriff ODER mindestens ein kanonisch aktiver
  eingeladener Staff-Zugang.
- Wenn kein Nachweis positiv ist und eine der beiden autoritativen Quellen
  nicht geladen werden konnte, bleibt der Dashboard-Status fail-closed.
- Es gibt keine Datenbankschreiboperation, keine neue Staff-Zeile und keine
  Rollen- oder Membership-Aenderung.

## Sicherheitsvertrag

- Owner-Aktionen bleiben `OWNER` beziehungsweise `Restaurantinhaber` und
  werden nicht als Staff attribuiert.
- Separate Staff-Nutzer benoetigen weiterhin Einladung, Aktivierung, aktive
  Staff-Membership und exakte Tenant-Autorisierung.
- Multi-Role, Customer-Rollen und Staff-Actor-Vertraege bleiben unveraendert.

## Pruefung

- Owner aktiv, Staff 0: Readiness PASS.
- Owner aktiv, Staff aktiv: Readiness PASS.
- Owner aktiv, Staff nur eingeladen: Readiness PASS durch Owner-Zugang.
- Kein Betreiberzugriff, Staff aktiv: Readiness PASS.
- Kein Betreiberzugriff, Staff nur eingeladen: INCOMPLETE.
- Owner-only und alle anderen Gates vollstaendig: Resolver `null`, Karte
  verborgen.
- Fokustests fuer Readiness, Owner-Zugang, Tenant und Actor: 31/31 PASS.
- Gesamttests: 1233/1233 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bereits vorhandene Warnungen ausserhalb des
  Scopes.
- Build: PASS mit Fail-Closed-Build-Guard und nicht geheimen
  Testplatzhaltern.
- `git diff --check`: PASS.
- Secret Scan des aktuellen Diffs: PASS.

## Migration und Deployment

- DB-Migration: Keine.
- RLS/RPC/Grants: Unveraendert.
- Production: Nicht deployed.

## Status

Status: `CODE LOCK`. Ein Development/Test-Deployment war nicht Bestandteil
dieser Aufgabe.
