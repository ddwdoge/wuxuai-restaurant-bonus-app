# WUXUAI Bonus - Staging Foreign Test Customer Cleanup

Datum: 2026-09-08
Umgebung: Staging (`bwhvfjuwixgwduoeqaya`)
Status: READY TO CONTINUE KASSA FLOW

## Ursache

Der isolierte Kassa-Test-Tenant enthielt neben `WUXUAI Testkunde` eine
versehentliche lokale Zuordnung des globalen Kundenkontos `Weifen xu`.
Der kanonische Cleanup blockierte korrekt mit
`FOREIGN_CUSTOMER_ACCOUNT_MEMBERSHIP` und `NON_TEST_CUSTOMER_PRESENT`.

## Aenderung

Der serverseitige Vertrag entfernt ausschliesslich die lokale Beziehung eines
fremden Kundenkontos zu einem explizit markierten TEST-ONLY-Tenant. Platform
Admin, Pflichtgrund, entity-bound starke Bestaetigung, Dependency-Preflight,
atomare Ausfuehrung und beibehaltener System-Audit sind erzwungen.

`20260908006000` klassifiziert den read-only Preflight als `VOLATILE`, damit
seine enge `FOR SHARE`-Sperre zulaessig ist.

## Physischer Staging-Nachweis

Tenant: `WUXUAI KASSA CLEANUP TEST 2026-09-08`
ID: `406bd92e-c5ac-4684-9cb5-0cfcda990e26`

Vorher:

- lokale Weifen-Mitgliedschaft: 1
- lokale Weifen-Punktebuchungen / Punktestand: 1 / 1
- lokale Ereignisse: 43
- lokale Rewards / Geschenke / Einloesungen / Benachrichtigungen: 1 / 1 / 0 / 0
- fremde Mitgliedschaften / Punktebuchungen: 4 / 10
- fremde zu aendernde Daten: 0

Nachher:

- Gaeste im Test-Tenant: 1, verbleibend: `WUXUAI Testkunde`
- lokale Weifen-Mitgliedschaft / Punktebuchungen: 0 / 0
- kanonischer Cleanup-Preflight: PASS
- beide urspruenglichen Blocker: CLEAR
- `Kaffee Konditorei bäckerei`: unveraendert 13 Gaeste

Die atomare Funktion prueft vor dem Commit, dass globales Konto und Auth-User
fortbestehen sowie 4 fremde Mitgliedschaften und 10 fremde Punktebuchungen
unveraendert bleiben. Jede Abweichung rollt die gesamte Transaktion zurueck.

## Verifikation

- fokussierte Cleanup-Tests: 15/15 PASS
- erweiterte Cleanup/Tenant/RLS/Punkte-Tests: PASS
- Gesamttests: 1356/1356 PASS
- Typecheck, Build, Secret Scan, `git diff --check`: PASS
- Lint: 0 Fehler, 9 bestehende Warnungen
- Staging Post-Dry-Run: aktuell
- DB Linter: 0 Fehler; bekannte Warnungen ausserhalb des Scopes
- Production: unveraendert

## Abschluss

- Aufgabe: versehentliche fremde Test-Tenant-Beziehung entfernen
- Build: Ja
- Migration: Auf Staging angewendet
- Flow-Test: Ja
- RLS/Security: Ja
- Alte Logik geprueft: Ja
- Report: diese Datei
- Pruef-ZIP: `exports/2026-09-08_STAGING_FOREIGN_TEST_CUSTOMER_CLEANUP.zip`
- Offene Risiken: keine im autorisierten engen Cleanup
- Status: FINAL LOCK fuer den engen Cleanup
