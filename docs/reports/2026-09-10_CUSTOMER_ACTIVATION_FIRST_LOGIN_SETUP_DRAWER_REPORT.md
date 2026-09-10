# WUXUAI Bonus - Customer Activation First-Login Setup Drawer

Datum: 2026-09-10
Branch: `codex/v1-customer-activation-ux`
Umgebung: Staging
Production: unverändert

## Ursache

Nach dem ersten erfolgreichen Kunden-Login gab es keinen kompakten, optionalen
Einrichtungsablauf für E-Mail-Bestätigung, Home-Bildschirm-Installation und
verfügbare Browser-Benachrichtigungen. Der Status musste wahrheitsgemäß aus
Auth- und Browser-Laufzeitdaten entstehen und durfte nicht als lokaler
Erfolgswert erfunden werden.

## Geänderte Dateien

- `src/modules/customer/CentralCustomerPage.tsx`
- `src/modules/customer/central-customer.css`
- `src/modules/customer/customerActivationSetup.mjs`
- `src/modules/customer/customerActivationSetup.d.mts`
- `src/shared/components/AppDrawer.tsx`
- `src/shared/i18n/catalog.mjs`
- `tests/customer-activation-setup.test.mjs`
- `tests/kpi-drawer-ux.test.mjs`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/19_CHANGELOG.md`
- `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`
- `docs/reports/2026-09-10_CUSTOMER_ACTIVATION_FIRST_LOGIN_SETUP_DRAWER_REPORT.md`

## Was wurde geändert

- Der Drawer öffnet sich einmalig auf der Kunden-Startseite, wenn relevante
  Einrichtungsschritte offen und automatische Hinweise nicht deaktiviert sind.
- `Später` schließt den Drawer; ein kompakter Reminder bleibt bei offenen
  Schritten sichtbar.
- Unter `Konto -> App & Benachrichtigungen` ist der vollständige, aktuelle
  Status jederzeit wieder erreichbar.
- E-Mail-Bestätigung stammt aus dem geladenen Kundenkonto.
- Installation stammt ausschließlich aus `display-mode`, iOS-Standalone,
  `beforeinstallprompt` und `appinstalled`.
- Push unterscheidet verfügbar, freigegeben, blockiert und nicht verfügbar.
- Eine Browserfreigabe wird ausschließlich nach Klick auf `Jetzt einrichten`
  angefragt, niemals beim Öffnen des Drawers.
- Lokaler Speicher enthält nur nutzerbezogene Darstellungspräferenzen für den
  Reminder; keine erfundenen Installations-, Push- oder E-Mail-Erfolgswerte.
- Der automatische Drawer zeigt nur offene Schritte. Die manuell geöffnete
  Einstellungsansicht zeigt den vollständigen Status.
- Singular und Plural sind in DE, EN, FR, IT, ES, ZH und KO korrekt hinterlegt.
- Die allgemeine Drawer-Schließen-Beschriftung folgt nun der aktiven Sprache.

## Was wurde nicht geändert

- Keine Datenbank, Migration, RLS-Policy oder RPC.
- Keine Auth-, Customer-, QR-, Punkte-, Geschenk- oder Kassa-Geschäftslogik.
- Keine Production-Konfiguration und kein Production-Deployment.
- Keine Push-Registrierung und keine automatische Berechtigungsabfrage.

## Prüfergebnis

- Fokustests: `10/10 PASS`
- Vollständige Tests: `1398/1398 PASS`
- Typecheck: PASS
- Lint: PASS mit 9 bereits vorhandenen Warnungen und 0 Fehlern
- Build: PASS
- Secret Scan der Änderung: PASS
- `git diff --check`: PASS
- Responsive Browser-Matrix: PASS bei 320, 375, 390, 414, 430, 768, 1024 und 1280 px
- Touch-Ziele: mindestens 44 px
- Horizontaler Überlauf: 0

## Staging-Ergebnis

- Worker: `wuxuai-restaurant-bonus-app-staging`
- Deployment-Version: `7c22b676-739b-417f-8aed-3bb1973f3b57`
- Route: `https://staging-app.bonus.wuxuaisbi.com/customer/account`
- Reale Kunden-Sitzung: PASS
- Vollständige Ansicht unter `App & Benachrichtigungen`: PASS
- Abgeschlossener Setup-Zustand ohne Reminder: PASS
- `Später` und Schließen: PASS
- Deutsch und Englisch einschließlich Schließen-Beschriftung: PASS
- Push-Berechtigungsdialog beim Öffnen: 0
- Der automatische Zustand mit einem offenen Schritt wurde mit einem isolierten
  Browser-Harness gegen die gebaute Anwendung geprüft. Dabei wurden keine
  Staging- oder Production-Daten verändert.

## Risiken

- Ein echter Android-/iOS-Installationsdialog ist browser- und gerätegesteuert.
  Die Anwendung reagiert auf die kanonischen Laufzeitereignisse; eine reale
  Geräteinstallation bleibt Teil der späteren Golden-Path-Geräteprüfung.
- Die 9 bestehenden Lint-Warnungen liegen außerhalb dieses Changesets.

## Status

`LOCK`

Der implementierte Umfang ist gebaut, getestet und auf Staging geprüft. Eine
Production-Freigabe oder ein Production-Rollout ist nicht Teil dieser Aufgabe.
