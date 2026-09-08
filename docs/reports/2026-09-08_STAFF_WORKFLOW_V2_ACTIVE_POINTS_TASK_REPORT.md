# Staff Workflow V2 - Active Points Task

Datum: 2026-09-08

## Ursache

Der kanonische Staff-Punkteablauf wurde beim Schliessen des Scanner-Drawers
vollstaendig verworfen. Staff konnten deshalb den Tages-PIN oder eine andere
Staff-Ansicht nicht oeffnen, ohne den persoenlichen Kunden-QR erneut zu scannen.

## Geaenderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/staff/staff-premium.css`
- `src/modules/staff/staffActivePointsTask.mjs`
- `src/modules/staff/staffActivePointsTask.d.mts`
- `src/shared/i18n/catalog.mjs`
- `tests/staff-active-points-task.test.mjs`
- `tests/staff-bottom-navigation.test.mjs`
- `tests/staff-qr-primary-drawer-ux.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-09-08_STAFF_WORKFLOW_V2_ACTIVE_POINTS_TASK_REPORT.md`

## Staff Workflow Audit

- Aktueller Punkteablauf: QR-Scan, QR-Erkennung, Betrag, sichere
  Server-Vorschau, Tages-PIN, Server-Bestaetigung, Erfolg.
- Operative Zustaende vor dem Abschluss: 5.
- Erforderliche Seitenwechsel: 0 im Drawer; zuvor erzwang jede Navigation
  ausserhalb des Drawers einen Neustart.
- Destruktives Altverhalten: Schliessen, Browser-Zurueck und Navigation
  loeschten QR-Referenz, Betrag und Vorschau.
- Tages-PIN waehrend eines laufenden Vorgangs: zuvor nicht erreichbar, ohne
  den Vorgang zu verwerfen.
- Doppelte operative Einstiege: QR-Aktion auf Start und Bottom Navigation;
  beide verwenden weiterhin denselben Scanner.

## Was Wurde Geaendert

- Maximal ein aktiver Punkte-Task wird an Auth-Identitaet, Restaurant und
  Rollen-Kontext gebunden.
- Minimieren behaelt nur den notwendigen fluechtigen React-Zustand. Es gibt
  keine Speicherung in `localStorage`, `sessionStorage` oder Datenbank.
- Der Tages-PIN-Entwurf wird beim Minimieren geloescht und nie in den
  Task-Kontext geschrieben.
- Die serverseitige Vorschau liefert die autoritative QR-Ablaufzeit. Ohne
  Vorschau gilt weiterhin hoechstens die bestehende Fuenf-Minuten-Grenze ab
  Scan; Minimieren verlaengert keine Frist.
- Ein abgelaufener oder kontextfremder Task wird verworfen und verlangt einen
  neuen QR-Scan.
- Schliessen, Outside-Click und Browser-Zurueck minimieren. Ein expliziter
  Abbruch verlangt Bestaetigung.
- Ein weiterer QR-Start bietet nur Fortsetzen oder Abbrechen und neuer Scan.
- Der kompakte Task-Hinweis liegt oberhalb der Bottom Navigation und zeigt
  keine Kundenidentitaet.

## Was Wurde Nicht Geaendert

- Keine Datenbankmigration.
- Keine RPC-, RLS- oder Grant-Aenderung.
- Keine Aenderung an QR-Hash, QR-Ablaufzeit oder QR-Einmalverwendung.
- Keine Aenderung an Tages-PIN, Fehlversuchen, Tageslimit, Rate Limits,
  Punkteformel, Tenantbindung oder Transaktionserstellung.
- Keine Aenderung an Gift-, Redemption- oder Kassa-Flows.
- Keine Production-Aenderung und kein GitHub-Push.

## Pruefergebnis

- Fokus Scanner/Active Task: 40/40 PASS.
- Spezifische Active-Task-Matrix: 25/25 PASS.
- Volltests: 1388/1388 PASS.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 9 vorbestehenden Warnungen.
- Build: PASS mit Staging Supabase und
  `https://staging-app.bonus.wuxuaisbi.com` als App-Basis.
- Secret Scan: PASS.
- `git diff --check`: PASS.
- Staging Deployment: PASS, Worker
  `wuxuai-restaurant-bonus-app-staging`, Version
  `ba54c0ad-8c72-4fe6-b5b2-d352e0e6d760`.
- Physisch geprueft: kanonische Staging-Domain, Owner-as-Staff-Zugang,
  Staff Home, Tages-PIN und QR-Drawer ohne fatalen Fehler.

## Responsive

- Strukturtests fuer 320, 375, 390, 414, 430, 768, 1024 und 1280+ PASS.
- Touchziele des aktiven Tasks: mindestens 44 Pixel.
- Der echte minimierte Task wurde auf der kanonischen Staging-Domain mit einem
  gueltigen persoenlichen Kunden-QR physisch geprueft: PASS.

## Risiken

Keine offenen Risiken im genehmigten Staff-Workflow-V2-Scope. Der Founder hat
den physischen Staging-Ablauf mit persoenlichem QR, sicherer Vorschau, Betrag,
Minimieren, Tages-PIN, Fortsetzen und Abschluss als bestanden bestaetigt. Die
unveraenderte QR-Ablaufzeit ist automatisiert abgedeckt und wurde durch das
Minimieren nicht verlaengert.

## Abschluss

- Aufgabe: Staff Workflow V2 - minimierbarer aktiver Punktevorgang
- Build: Ja
- Migration: Keine
- Flow-Test: Ja; echter persoenlicher QR-Endlauf auf Staging physisch bestaetigt
- RLS/Security: Ja, unveraenderte Serververtraege und Regressionstests
- Alte Logik geprueft: Ja
- Report: `docs/reports/2026-09-08_STAFF_WORKFLOW_V2_ACTIVE_POINTS_TASK_REPORT.md`
- Pruef-ZIP: `exports/2026-09-08_STAFF_WORKFLOW_V2_ACTIVE_POINTS_TASK.zip`
- Offene Risiken: Keine im genehmigten Scope
- Status: FINAL LOCK
