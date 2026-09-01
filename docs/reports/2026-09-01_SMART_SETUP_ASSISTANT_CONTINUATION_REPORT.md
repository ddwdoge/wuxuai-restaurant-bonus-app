# Smart Setup Assistant Continuation Report

Datum: 2026-09-01

## Ursache

Die Dashboard-CTA `Heute für dich` führte korrekt zum wichtigsten offenen
Setup-Bereich, übergab aber keinen sicheren Herkunftskontext. Erfolgreiche Saves
konnten deshalb nicht zwischen geführtem Setup und normaler Bearbeitung
unterscheiden und ließen den Owner im Editor.

## Geänderte Dateien

- `src/modules/admin/ownerSmartSetupContinuation.mjs`
- `src/modules/admin/ownerSmartSetupContinuation.d.mts`
- `src/modules/admin/useOwnerSmartSetupContinuation.ts`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/RestaurantOffersPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/admin/pages/StaffPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/legal/OwnerLegalSettingsPage.tsx`
- `tests/owner-smart-setup-continuation.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Dashboard-Empfehlungen übergeben einen kurzlebigen Router-Kontext mit fester
  Quellenkennung und validierter Recommendation-ID.
- Nur bestätigte Erfolge aus diesem Kontext navigieren mit einem festen
  Erfolgscode zum Dashboard zurück.
- Standort, Punkteeinlösung, Offer-Veröffentlichung, aktiver Birthday-Pool,
  Staff-Einladung/Reaktivierung, Legal-Veröffentlichung und
  Onboarding-Abschluss sind angebunden.
- Das Dashboard zeigt die feste Erfolgsmeldung, verbraucht den Router-State und
  lädt beim Mount den kanonischen Legal-, Restaurant- und Setup-Zustand neu.
- Der bestehende zentrale Resolver bestimmt danach die nächste tatsächlich
  offene Empfehlung oder den Betriebsmodus.

## Was wurde nicht geändert

- Kein globaler Redirect normaler Einstellungen.
- Kein Redirect bei Validierungs-, Server-, Geocoding- oder Legal-Fehlern.
- Kein Redirect bei Abbruch.
- Angebotsentwürfe gelten nicht als veröffentlichte Angebote.
- QR-Download oder physischer Druck werden nicht erfunden oder gespeichert.
- Keine Businesslogik, Prioritätsregel, Berechtigung, RLS, Tenant- oder
  Datenbankänderung.

## Prüfung

- Fokustests: 17/17 PASS.
- Gesamttests: 1225/1225 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 7 bereits vorhandene Warnungen außerhalb des Scopes.
- Build: PASS mit Fail-Closed-Build-Guard und nicht geheimen Testplatzhaltern.
- `git diff --check`: PASS.
- Mobile-Vertrag: 320, 375, 390, 414 und 430 px durch die bestehende
  `max-width: 430px`-Regel, begrenzte Dashboard-Breite und umbrechende
  Statusmeldung abgedeckt.

## Migration und Sicherheit

- Migration: Keine.
- Staging-Migration: Nicht erforderlich.
- RLS/Security: Keine Regel oder RPC geändert. Router-State verleiht keine
  Rechte und wird ausschließlich nach bereits autorisiertem Save ausgewertet.

## Offene Risiken

- Der echte Development/Test-Flow und der physische iPhone-Gate sind noch
  ausstehend. Daher kein FINAL LOCK.

## Status

CODE LOCK
