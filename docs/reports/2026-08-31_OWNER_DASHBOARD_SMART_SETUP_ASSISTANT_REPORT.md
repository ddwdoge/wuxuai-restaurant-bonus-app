# Owner Dashboard Smart Setup Assistant Report

Datum: 2026-08-31

## Ursache

Die schwarze Karte `Heute fuer dich` enthielt eine statische Empfehlung,
waehrend ein zweiter historischer Resolver einen separaten Hinweis oberhalb der
Kennzahlen steuerte. Dadurch gab es keine einzige kanonische, sichtbare
Empfehlungskette fuer die noch offene Restaurant-Einrichtung. Neue
Welcome-/Starter-Gifts waren zudem in den aktiven Erstellungswegen nicht
standardmaessig fuer den vorhandenen Birthday-Pool vorausgewaehlt.

## Geaenderte Dateien

- `src/modules/admin/ownerDashboardRecommendation.mjs`
- `src/modules/admin/ownerDashboardRecommendation.d.mts`
- `src/modules/admin/dashboardNoticeService.ts`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/admin/admin-premium.css`
- `tests/dashboard-next-step.test.mjs`
- `tests/automated-legal-onboarding.test.mjs`
- `tests/owner-dashboard-smart-setup-assistant.test.mjs`
- aktuelle kanonische Produkt-, Portal-, CTO- und Changelog-Dokumentation

## Was wurde geaendert

- `Heute fuer dich` verwendet genau einen zentralen Resolver mit der Reihenfolge
  Publikation, Punkteeinloesung, Angebot, Geburtstag, QR und Staff.
- Legal Readiness, Restaurantstatus, aktive Branch, Adresse, Koordinaten und
  Auffindbarkeit bilden gemeinsam den bestehenden Publikationspfad ab.
- Aktive Angebote, Birthday-Pool und Staff-Zugang werden tenantbezogen aus den
  bestehenden Datenquellen ermittelt.
- Nach vollstaendiger Einrichtung erscheint deterministisch eine operative
  Angebotsempfehlung.
- Neue Welcome-/Starter-Gifts erhalten in den aktuellen Erstellungswegen den
  Birthday-Pool-Default `true`; bestehende Werte werden beibehalten.

## Was wurde nicht geaendert

- Keine Datenbankmigration oder Bestandsumschreibung.
- Keine Aenderung an Birthday Eligibility, 14-Tage-Catch-up, Assignment,
  Redemption, Punkte, Legal Readiness, Referral, Multi-Role oder QR-Payloads.
- Kein Download- oder Drucktracking fuer das Starter Kit erfunden.
- Keine Production- oder Stripe-Aktion.

## QR-Nachweisgrenze

V1 besitzt keinen autoritativen Zustand fuer einen erfolgten PDF-Download oder
physischen Ausdruck. Der Resolver verwendet deshalb nur die objektive
technische QR-Bereitschaft des Restaurants. Er behauptet keinen physischen
Abschluss.

## Migration

Keine. Die Birthday-Vorauswahl wird ausschliesslich in den aktiven
Anwendungserstellungswegen gesetzt, damit absichtliche Bestandsentscheidungen
nicht veraendert werden.

## Sicherheit

Alle neuen Setup-Abfragen sind mit der aktiven `restaurant_id` begrenzt. Es
werden keine privaten Customer-Daten gelesen und keine RLS-Regel gelockert.

## Verifikation

- Fokussierte Resolver-/Dashboard-Tests: PASS
- Vollstaendige Testsuite: 1208/1208 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 unveraenderte Bestandswarnungen
- Production-Build: PASS
- `git diff --check`: PASS
- Secret Scan der 30 geaenderten/unversionierten Dateien: PASS, 0 Treffer
- Responsive CSS-/Layout-Pruefung bei 320, 375, 390, 414, 430, 768 und
  1440 px: PASS; kein horizontaler Overflow, keine abgeschnittenen Inhalte,
  sichtbare Empfehlung und Touchflaeche groesser als 44 px

## Risiken

- Physischer Founder-Test bleibt ausstehend.
- Ein physisch platziertes Starter Kit kann ohne neuen autoritativen
  Produktvertrag nicht automatisch erkannt werden.

Status: CODE LOCK. Der physische Founder-Gate bleibt PENDING.
