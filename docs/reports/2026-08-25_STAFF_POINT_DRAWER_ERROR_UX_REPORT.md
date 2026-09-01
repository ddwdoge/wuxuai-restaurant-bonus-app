# Staff Point Drawer Error UX Report

Datum: 25.08.2026  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `9225d17f8a1b147d397df84ace77d127ffb53451`

## Ursache

Der Submit-Handler `executePinAction` schrieb Fehler der laufenden Punkteaktion
in den globalen Seiten-State `message`. Der aktive `AppDrawer` renderte diesen
State nicht. Dadurch erschien beispielsweise das erreichte Tageslimit im
Staff-Kundenflow hinter dem Drawer, während der Drawer weiterhin ein
Tages-PIN-Feld und die Aktion `Bestätigen` zeigte.

Die autoritative Punkte-Vorschau liefert aktuell Gast, Punktestand,
Punkteberechnung und Booster, prüft das Tageslimit aber nicht. Das Tageslimit
wird unverändert erst in der atomaren Bestätigungs-RPC geprüft. Deshalb wurde
keine clientseitige Vorhersage und keine neue Datenbanklogik eingeführt.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/staff/staff-premium.css`
- `tests/staff-points-drawer-error-ux.test.mjs`

## Was wurde geändert

- Drawer-eigener Status für Fehler, endgültige Sperren und Erfolg ergänzt.
- Tageslimit nennt den betroffenen Gast direkt im Drawer und entfernt die
  Bestätigungsaktion.
- Falsche Tages-PIN wird direkt unter dem PIN-Feld angezeigt; der Drawer bleibt
  für einen kontrollierten Retry geöffnet.
- Abgelaufener Kunden-QR, nicht verfügbarer Gast, Betragslimit und PIN-Sperre
  werden als sichere blockierte Zustände behandelt.
- Unbekannte Netzwerk- und Serverfehler werden ohne SQLSTATE, RPC-Interna,
  Tokens oder Datenbanktexte angezeigt.
- Gastname, aktueller Punktestand, geplanter Punktewert und aktiver Booster
  bleiben im Drawer sichtbar.
- Erfolg zeigt zuerst im Drawer Basis, Multiplikator und tatsächlich
  gutgeschriebene Punkte; erst `Fertig` beendet den Vorgang.
- `Anderen Gast wählen` löscht Drawer-, PIN-, QR-, Vorschau- und
  Kundenauswahlzustand gemeinsam.
- Fehler und Sperren verwenden `role="alert"`, verknüpfte Feldhinweise und
  programmatischen Fokus.

## Was wurde nicht geändert

- Tageslimit und seine Zeitzonenberechnung
- Tages-PIN-Erzeugung und serverseitige Prüfung
- Punkteberechnung und 2x-Multiplikator
- Kunden-QR-, Tenant- und Actor-Vertrag
- Staff- und Owner-Autorisierung
- RPCs, RLS, Grants und Datenbankschema
- Production und Stripe

## Prüfungen

- Gezielte Drawer- und Kundenflow-Tests: 30/30 PASS
- Vollständige Tests: 953/953 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Responsive Assertions: 320, 375, 390, 414, 430, 768 und 1024 PASS
- Desktop geprüft: statisch und per Build/Testvertrag
- Tablet geprüft: statisch und per Build/Testvertrag
- Mobile geprüft: statisch und per Build/Testvertrag

## Migration und Staging

- Migration erstellt: Nein
- Migration auf Staging angewendet: Nicht erforderlich
- RLS/RPC geändert: Nein
- Neuer Staging-Deploy: Nein
- Physischer iPhone-Retest des neuen Fixes: Offen

## Risiken

- Das bestehende Preview-RPC meldet das Tageslimit nicht vor der PIN-Abfrage.
  Der neue Drawer behandelt die autoritative Ablehnung korrekt direkt nach dem
  Bestätigungsversuch. Eine Vorabprüfung würde einen separaten freigegebenen
  Backendvertrag erfordern und wurde bewusst nicht improvisiert.
- Der reale iPhone-Befund muss nach einem gesondert freigegebenen
  Staging-Deployment erneut bestätigt werden.

## Status

`CODE LOCK`

Kein `FINAL LOCK`, solange Staging-Deployment und physischer iPhone-Retest des
neuen Drawer-Zustands offen sind.
