# Staff QR Primary Drawer UX Report

Datum: 25.08.2026  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `9225d17f8a1b147d397df84ace77d127ffb53451`

## Ursache

Der bestehende iPhone-kompatible ZXing-Scanner wurde nach dem Tippen auf
`QR scannen` als normaler Seiteninhalt innerhalb des langen Staff-Kundenflows
gerendert. Die Navigation war aktiv, die Kamera lag aber unterhalb des
sichtbaren Bereichs und erforderte Scrollen. Scanner und Decoder selbst waren
nicht die Ursache.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/staff/staff-premium.css`
- `tests/staff-bottom-navigation.test.mjs`
- `tests/staff-customer-flow-priority.test.mjs`
- `tests/staff-mobile-customer-qr-scanner.test.mjs`
- `tests/staff-points-drawer-error-ux.test.mjs`
- `tests/staff-qr-primary-action-ui.test.mjs`
- `tests/staff-qr-primary-drawer-ux.test.mjs`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Bottom-Navigation und bestehende QR-Aktionen öffnen unmittelbar einen großen
  operativen `AppDrawer`.
- Die einzige vorhandene ZXing-Kamera steht direkt unter dem mobilen Header;
  erklärende Langtexte werden dort nicht vor die Kamera gesetzt.
- Nach dem Scan wird die Kamera gestoppt und im selben Drawer in der Reihenfolge
  Status, sichere Kundenkarte, Punkteformular, Tages-PIN und Erfolg gewechselt.
- Die autoritative Vorschau zeigt vor der finalen Buchung Gastname,
  Punktestand, Basispunkte, Multiplikator und Gutschrift.
- Preview-, PIN-, Tageslimit- und Serverfehler bleiben inline; blockierte
  Zustände besitzen keine scheinbar ausführbare Bestätigung.
- `Anderen Gast wählen` und `Nächsten Gast scannen` löschen QR-, Vorschau-,
  PIN-, Fehler- und Kundenzustand und starten dieselbe Kamera neu.
- Der manuelle Suchweg ist eine sekundäre Aktion im Drawer und steht nicht vor
  der Kamera.
- Schließen, Escape, Browser-Zurück und Komponenten-Unmount stoppen Controls
  und sämtliche MediaStream-Tracks.
- Owner im Staff-Portal nutzt unverändert dieselbe Komponente und denselben
  Ablauf.

## Was wurde nicht geändert

- QR-Payload und Decoder
- Restaurant- und Kundenbindung
- Punkteberechnung, Limits und Idempotenz
- Tages-PIN und serverseitige Bestätigung
- Staff-/Owner-Autorisierung und Actor-Attribution
- RPCs, RLS, Grants oder Datenbankschema
- Production oder Stripe

## Prüfungen

- Vollständige Tests: 967/967 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret Scan der geänderten und neuen Dateien: PASS
- Responsive Quell-/CSS-Verträge: 320, 375, 390, 414, 430, 768 und 1024 PASS
- Desktop geprüft: Build und automatisierter Layoutvertrag
- Tablet geprüft: Build und automatisierter Layoutvertrag
- Mobile geprüft: Build und automatisierter Layoutvertrag

## Migration und Staging

- Migration erstellt: Nein
- Migration auf Staging angewendet: Nicht erforderlich
- RLS/RPC geändert: Nein
- Staging-Deployment: Nicht durchgeführt
- Physischer iPhone-Safari-Test: Offen

## Risiken

- Der neue Drawer wurde nicht auf Staging deployt; daher kann der verpflichtende
  reale iPhone-Ablauf Kamera, Scan, Vorschau, Punkte, PIN, Erfolg und nächsten
  Gast noch nicht als bestanden gelten.
- Die sichere Kundenidentität wird weiterhin erst mit der autoritativen
  serverseitigen Punkte-Vorschau aufgelöst. Vorher zeigt der Drawer bewusst nur
  den erkannten QR- und Prüfstatus und erfindet keine Kundendaten.

## Ergebnis

QR BOTTOM NAV ONE-TAP: PASS  
SCANNER DRAWER: PASS  
CAMERA IMMEDIATELY VISIBLE: PASS im Layoutvertrag, physisch offen  
SCROLL REQUIRED BEFORE CAMERA: NO  
SINGLE SCANNER IMPLEMENTATION: PASS  
CAMERA LIFECYCLE: PASS  
CUSTOMER PREVIEW SAME DRAWER: PASS  
CUSTOMER NAME BEFORE SUBMIT: PASS  
2X STATUS: PASS  
POINT FORM: PASS  
PIN FLOW: PASS  
BLOCKED ERROR UX: PASS  
CHANGE CUSTOMER: PASS  
MANUAL SEARCH FALLBACK: PASS  
NEXT CUSTOMER: PASS  
OWNER MODE: PASS im gemeinsamen Codepfad, physisch offen  
NESTED DRAWERS: NO  
375: PASS im automatisierten Layoutvertrag  
390: PASS im automatisierten Layoutvertrag  
414: PASS im automatisierten Layoutvertrag  
430: PASS im automatisierten Layoutvertrag  
PHYSICAL IPHONE: FAIL - noch nicht durchgeführt  
BUSINESS LOGIC CHANGED: NO  
DB MIGRATION: NONE  
TESTS: 967/967 PASS  
STAFF QR PRIMARY DRAWER READY: NO - physisches Staging-Gate offen  
PRODUCTION: LOCKED  
STRIPE: DEFERRED

## Status

`CODE LOCK / NOT READY FOR FINAL LOCK`
