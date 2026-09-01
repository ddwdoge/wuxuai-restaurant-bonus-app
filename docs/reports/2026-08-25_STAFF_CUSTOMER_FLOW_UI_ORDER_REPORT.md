# Staff Customer Flow UI Order Report

Datum: 25.08.2026  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `b5bf73f331df416d4515d99a93e3f5b23f12fd5e`

## Ursache

Im aktiven Staff-Kundenflow stand die Kundenkarte bereits oben, die Schnellsuche wurde jedoch noch vor dem Punktebereich gerendert. Globale Erfolgs- und Fehlermeldungen erschienen zusätzlich erst unterhalb der Navigation und Drawer. Auf dem iPhone war deshalb der aktuelle Vorgangsstatus nicht zuerst sichtbar und die Fallback-Suche unterbrach den Zusammenhang zwischen erkanntem Gast und Punktevergabe.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/staff/staff-premium.css`
- `tests/staff-customer-flow-priority.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-25_STAFF_CUSTOMER_FLOW_UI_ORDER_REPORT.md`

## Was wurde geändert

- Aktive Status- oder Fehlermeldung an die erste Position des Staff-Kundenflows verschoben.
- Kundenkarte unmittelbar darunter beibehalten und Lade- sowie Fehlerzustand explizit gemacht.
- Punktebereich bei ausgewähltem Gast vor die Schnellsuche verschoben.
- Schnellsuche bei ausgewähltem Gast visuell als sekundärer Wechselweg dargestellt.
- Im leeren Zustand bleibt die Schnellsuche direkt nach Status und leerer Kundenkarte die erste echte Aktion; ein leeres Punkteformular wird nicht angezeigt.
- QR-Auswahl und manuelle Auswahl verwenden dieselbe Reihenfolge.
- Punkteüberschrift nennt den sicher aufgelösten Vornamen, sobald die serverseitige Vorschau vorliegt.
- Aktiver 2x-Status, Restdauer und Ablauf bleiben prominent in der Kundenkarte.
- Preview-Fehler sperrt den Punktebereich und bietet Retry oder Gastwechsel.
- Statusmeldungen verwenden `status` beziehungsweise bei Fehlern `alert` mit passender Live-Region.

## Was wurde nicht geändert

- QR-Decoding und QR-Nutzlast
- Punkteberechnung und Punkte-RPCs
- Tages-PIN
- Staff- und Owner-Autorisierung
- Staff- und Owner-Attribution
- Restaurant- und Tenantkontext
- Bottom Navigation
- Datenbank, RLS und Grants

## Responsive Prüfung

Automatisierte Struktur- und CSS-Regressionen prüfen 320, 375, 390, 414, 430, 768 und 1024 Pixel. Der Flow bleibt einspaltig, lange Texte dürfen umbrechen und Touch-Aktionen bleiben mindestens 44 Pixel hoch. Ein erneuter physischer iPhone-Test setzt ein Staging-Deployment voraus und wurde in dieser lokalen Aufgabe nicht behauptet.

## Qualität

- Tests: 938/938 bestanden
- Typecheck: bestanden
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: bestanden
- `git diff --check`: bestanden
- Secret Scan: bestanden

## Migration

Keine Migration erstellt oder angewendet.

## Risiken

Der persönliche Kunden-QR enthält absichtlich keine Klartextidentität. Name, Punktestand und 2x-Status werden deshalb erst durch die vorhandene sichere serverseitige Punkte-Vorschau sichtbar. Es wurde kein zusätzlicher Identity-RPC eingeführt. Physische Safari-Abnahme bleibt bis zu einem freigegebenen Staging-Deployment offen.

Status: CODE LOCK
