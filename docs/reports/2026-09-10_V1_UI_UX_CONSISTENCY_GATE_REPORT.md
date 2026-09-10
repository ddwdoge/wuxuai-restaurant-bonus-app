# WUXUAI Bonus V1 UI/UX Consistency Gate Report

Datum: 2026-09-10

## Ursache

Der aktive V1-Stand verwendete bereits das gemeinsame Premium-Designsystem,
hatte aber zwei launchrelevante Inkonsistenzen: Der globale Sprachschalter lag
als feste Ebene ueber den Rollenoberflaechen, und sichtbare deutsche
Rollenbegriffe waren nicht durchgehend am aktuellen Master Contract
ausgerichtet. Erklaerungen im Customer-Flow brauchten ausserdem einen
einheitlichen, barrierearmen Info-Trigger.

## Audit

Geprueft wurden die aktiven Customer-, Owner-, Staff- und Platform-Admin-
Oberflaechen einschliesslich Auth, Navigation, Setup, Rewards, QR, Angebote,
Staff Scanner/Task, Kassa, Platform-Diagnose und Audit. Der bestehende
Designsystem-Stand fuer Typografie, Buttons, Formulare, Karten, Dialoge,
Status, Navigation sowie Leer-, Lade- und Fehlerzustaende blieb kanonisch.

Erklaerungen wurden nach `WORKFLOW CRITICAL`, `DECISION RELEVANT`,
`EXPLANATORY` und `LEGAL / COMPLIANCE` bewertet. Pflichtaktionen, Fehler,
Punkte-, Preis-, Ablauf-, Legal- und Security-Inhalte bleiben sichtbar.
Sekundaere Customer-Erklaerungen verwenden den kanonischen Info-Trigger.

## Geaenderte Dateien

- Rollen-Shells und direkt betroffene aktive UI-Seiten
- globale und rollenbezogene Premium-Styles
- `src/shared/components/InfoTrigger.tsx`
- `src/shared/i18n/LanguageSelector.tsx`
- i18n-Katalog und Quelltext-Aliase fuer sieben Sprachen
- direkte UI-, Customer-, Auth-, Owner- und Multi-Role-Regressionstests
- kanonischer Master-Status und Changelog

## Was wurde geaendert

- Sprachwahl aus der globalen festen Ebene entfernt und in die jeweilige
  Kopf-/Menuezeile integriert.
- Kompakter Locale-Code mit vollstaendig beschriftetem Select und mindestens
  44 Pixel Bedienflaeche eingefuehrt.
- Wiederverwendbaren Info-Button mit `type=button`, ARIA-Label, Fokuszustand und
  44 x 44 Pixel Touch-Ziel eingefuehrt.
- Sichtbare deutsche Rollenbegriffe auf Mitarbeiterbereich,
  Mitarbeiteransicht, Inhaberbereich, Restaurant-Dashboard, Gaesteportal und
  Gaestekonto vereinheitlicht.
- Bestehende Uebersetzungen ueber Quelltext-Aliase erhalten; keine erneute
  Maschinenuebersetzung ausgefuehrt.

## Was wurde nicht geaendert

- Keine Auth-, Session-, Rollen-, RLS- oder Tenant-Autorisierung
- Keine QR-, Tages-PIN-, Punkte-, Gift-, Redemption- oder Kassa-Logik
- Keine Datenbankmigration und keine Staging-Datenmutation
- Keine Production-Anwendung, Production-Datenbank oder Production-Konfiguration
- Keine Stripe-, PRO-, V2-, V3- oder V4-Funktion

## Pruefergebnis

- Fokussierte UI-/i18n-/Kassa-/Platform-Tests: 50/50 PASS
- Vollstaendige Tests: 1408/1408 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 9 bereits bestehende Warnungen
- Build: PASS
- Secret Scan: PASS
- `git diff --check`: PASS
- Nicht-deutsche Leakage-Pruefung: 0 fuer EN/FR/IT/ES/ZH/KO
- Browsermatrix: 336/336 PASS
- Breiten: 320, 375, 390, 414, 430, 768, 1024 und 1280 Pixel
- Sprachen: DE, EN, FR, IT, ES, ZH und KO
- Horizontaler Ueberlauf: 0
- Kleinste gepruefte Sprach-/Passwort-Bedienflaeche: 44 Pixel
- Browserfehler in der Matrix: 0

## Staging Ergebnis

Staging Worker: `wuxuai-restaurant-bonus-app-staging`

Worker-Version: `8e2adff7-4c5b-40f7-bac6-eb2bf1541018`

Physisch geprueft wurden Customer Account/Home, Staff Scanner, Owner Dashboard,
Platform Admin und Platform Audit. Der finale Staging-Stand laedt ueber
`https://staging-app.bonus.wuxuaisbi.com`, verwendet die integrierte
Sprachwahl, zeigt keine globale schwebende Sprachsteuerung und erhaelt die
geschuetzten Rollensitzungen. Die letzten Deployment-Schritte enthielten nur
die abschliessende deutsche Terminologieangleichung und die 44-Pixel-
Mindesthoehe der Audit-Filter; Berechtigungen und Fachlogik blieben gegenueber
dem physisch geprueften Kandidaten unveraendert.
Die finale Audit-Messung ergab 44 Pixel als kleinste wirksame Klickflaeche,
keinen Ueberlauf und keine veralteten deutschen Rollenbegriffe.

## Responsive und Barrierefreiheit

- Desktop geprueft: Ja
- Tablet geprueft: Ja
- Mobile geprueft: Ja
- Keine verdeckte Navigation oder Safe-Area-Kollision in der Matrix
- Info- und Passwort-Schalter sind beschriftet, fokussierbar und nicht sendend
- Sprachwahl bleibt im normalen Dokumentfluss und unter Dialog-/Sheet-Ebenen
- Platform-Audit-Aktionen behalten mindestens 44 Pixel Touch-Hoehe

## Migration und Sicherheit

- Migration erstellt: Nein
- Migration auf Staging angewendet: Nicht erforderlich
- RLS geprueft: Unveraendert / bewahrt
- RPC geprueft: Unveraendert
- Service Role im Frontend: Nein
- Alte QR-/PIN-/Punkte-/Gift-/Kassa-Logik: Unveraendert

## Risiken

Der tokengebundene Passwort-Reset-/Aenderungsweg bleibt entsprechend dem
Master Contract fuer den finalen Founder-kontrollierten Golden-Path-Nachweis
vorgemerkt. Er ist keine Regression dieses UI/UX-Scopes. Die neun bestehenden
Lint-Warnungen sind unveraendert und enthalten keinen Fehler.

## Status

UI/UX CONSISTENCY GATE: FINAL LOCK

OPEN UI P0: 0

OPEN UI P1: 0
