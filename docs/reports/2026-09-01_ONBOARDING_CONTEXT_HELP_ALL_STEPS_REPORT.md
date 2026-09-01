# Onboarding Context Help for All Steps Report

## Ursache

Die vorhandene Onboarding-Hilfe war in sieben Detailfragen gegliedert und
dadurch laenger als fuer eine schnelle Owner-Einrichtung noetig. Der Founder
hat fuer alle sieben bestehenden Schritte eine kurze, praktische und
algorithmusneutrale Hilfe freigegeben.

## Geaenderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `tests/onboarding-context-help.test.mjs`
- aktuelle kanonische Onboarding-/Vertragsdokumentation und Changelog

## Was wurde geaendert

- Jeder bestehende Onboarding-Schritt beantwortet im selben kompakten Drawer:
  `Was richtest du ein?`, `Warum ist das wichtig?` und
  `Worauf solltest du achten?`.
- Restaurant/Unternehmen und Standort bleiben im bestehenden ersten Schritt;
  es wurde kein neuer Schritt und kein zweites Adressmodell angelegt.
- Branding, Oeffnungszeiten, Punkte, Welcome Gifts, Starter Kit und Abschluss
  besitzen jeweils eine kurze, zum realen Formular passende Hilfe.
- Die Abschluss-Hilfe verweist auf `Heute fuer dich` und
  `Einstellungen -> Setup & Einrichtung`.

## Was wurde nicht geaendert

- Keine Schrittfolge, Formulare, Save-/Continue-Handler oder Publikation.
- Keine Punkteformel, Oeffnungszeiten-Kopie, Smart-Setup-Fortsetzung oder
  Setup-Uebersicht.
- Keine Welcome-/Birthday-Zuteilung, Gewichtung, Normalisierung, Eligibility,
  RLS, Tenant Isolation, Redemption oder Duplicate Protection.
- Keine Auth-, Legal-, Datenbank-, Migrations- oder Deployment-Aenderung.

## Welcome Gift FINAL LOCK

Die originale wertorientierte Kategoriengewichtung, gewichtete Zufallsauswahl
und Normalisierung sind Founder `FINAL LOCK`. Die Owner-Hilfe nennt weder
Gewichte noch Prozentsaetze, Wahrscheinlichkeiten, erwartete Zuteilungen,
Kosten oder eine Gleich-/Gewichtungsverteilung. Restaurants koennen keine
Quote konfigurieren.

## Qualitaetspruefung

- Tests: `1253/1253 PASS`
- Typecheck: `PASS`
- Lint: `PASS` mit sieben bereits bestehenden Warnungen und null Fehlern
- Build: `PASS` mit lokalen nichtproduktiven Build-Platzhaltern; keine
  Supabase-Verbindung und kein Deployment
- `git diff --check`: `PASS`
- Responsive Markup/CSS: `320/375/390/414/430/1024/1440 PASS`; kein
  horizontaler Overflow und Hilfe-Touchziel mindestens 44 px
- Migration erstellt/angewendet: `NEIN / NEIN`
- RLS/Security: keine Aenderung; bestehende Rollen-, Zuteilungs- und
  Tenant-Vertraege bleiben durch die vollstaendige Regression abgedeckt

## Pruef-ZIP

`exports/2026-09-01_ONBOARDING_CONTEXT_HELP_ALL_STEPS.zip`

## Status

`CODE LOCK` nach erfolgreicher vollstaendiger Qualitaets- und Responsive-
Pruefung. Production bleibt `LOCKED`, Stripe bleibt `DEFERRED`.
