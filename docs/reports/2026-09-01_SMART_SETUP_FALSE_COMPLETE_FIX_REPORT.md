# Smart Setup False-Complete Fix Report

Datum: 2026-09-01
Branch: `codex/v1-canonical-recovery`
Ausgangs-HEAD: `3cdc3fcbad08d4bb0893de8a028932a182387fb6`

## Ursache

Der Dashboard-Setup-Loader leitete `staffReady` aus einem direkten
`staff_members`-Count mit `active = true` ab. Dieser rohe Legacy-Zustand ist
nicht der kanonische Staff-Zugangsvertrag. Der echte geschuetzte Staff-Bereich
verlangt eine gebundene Auth-Identitaet, aktive Membership und
`account_status = active`. Dadurch konnte der Resolver fuer `WUXUAI Bonus
Testbetrieb` `null` liefern und `Heute fuer dich` ausblenden, obwohl kein
nutzbarer Staff-Zugang eingerichtet war.

Die Publikationsbereitschaft wurde ausserdem nur aus dem Standortobjekt
abgeleitet. Der Fix verbindet sie mit der serverseitigen Legal-/
Registrierungsfreigabe und dem aktiven Restaurantstatus. Die QR-Bereitschaft
verlangt nun objektiv einen aktiven Restaurantstatus und einen gueltigen Slug.

## Aktueller Gate-Zustand

- PUBLICATION: PASS. Aktives Restaurant, oeffentlich auffindbarer aktiver
  Standort mit vollstaendiger Adresse/Koordinaten sowie veroeffentlichte
  Pflichtdokumente und freigegebene Registrierung.
- POINT REDEMPTION: PASS. Eine aktive nutzbare Nicht-Starter-Einloesung ist im
  oeffentlichen Partnervertrag vorhanden.
- OFFER: PASS. Vier veroeffentlichte, aktive und nicht abgelaufene Angebote.
- BIRTHDAY: PASS. Authentifizierter Birthday-Pool-Status bereit; aktiver
  Starter-Gift-Pool oeffentlich bestaetigt.
- QR: PASS. Aktiver Restaurantstatus und gueltiger Slug `wuxuai-bonus`.
- STAFF: INCOMPLETE. Kein kanonisch aktiver nutzbarer Staff-Zugang; die zuvor
  zaehlende rohe Legacy-Zeile ist kein Abschlussnachweis.
- SETUP ACTUALLY COMPLETE: NO.
- CURRENT RESOLVER RESULT vor Fix: `null`.
- EXPECTED RESOLVER RESULT nach Fix: `setup_staff_access`.
- NEXT RECOMMENDATION: `Mitarbeiterzugang einrichten`.

## Geaenderte Dateien

- `src/modules/admin/dashboardNoticeService.ts`
- `src/modules/admin/ownerDashboardSetupStatus.mjs`
- `src/modules/admin/ownerDashboardSetupStatus.d.mts`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `tests/owner-dashboard-smart-setup-assistant.test.mjs`
- aktuelle Smart-Setup-Vertragsdokumentation und Reports

## Was wurde geaendert

- Staff-Setup verwendet `get_owner_staff_members` ueber den bereits
  bestehenden Owner-Service; nur `status = active` erfuellt den Gate.
- Publikation verlangt Restaurant aktiv, Registrierung serverseitig erlaubt
  und oeffentliche Discovery-Bereitschaft.
- QR-Bereitschaft verlangt aktives Restaurant und gueltigen kanonischen Slug.
- Alle sechs Einzel-Gates, vollstaendiges Setup und Action Center sind als
  Resolver-Regressionstests abgedeckt.

## Was wurde nicht geaendert

- Keine Staff-, Offer-, Reward-, Birthday-, Punkte-, Legal-, Referral- oder
  Tenant-Businesslogik.
- Keine RLS-, RPC-, Grant- oder Datenbankaenderung.
- Keine Migration und kein Deployment.
- `operational_new_offer` bleibt entfernt.

## Pruefung

- Fokustests: 15/15 PASS.
- Gesamttests: 1231/1231 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bereits vorhandene Warnungen ausserhalb des
  Scopes.
- Build: PASS mit Fail-Closed-Build-Guard und nicht geheimen
  Testplatzhaltern. Der erste Aufruf ohne Buildvariablen wurde vom Guard wie
  vorgesehen abgebrochen; der anschliessende vollstaendige Build war gruen.
- `git diff --check`: PASS.
- Secret Scan des aktuellen Diffs: PASS.
- Statische UI-/Resolver-Pruefung: `Heute fuer dich` wird vor den Kennzahlen
  gerendert; jeder einzelne fehlende Gate liefert den korrekten ersten Schritt.
- Physischer Founder-Gate: PENDING.

## Status

Maximal `CODE LOCK` nach gruenem Quality-Gate. Kein `FINAL LOCK` ohne
Deployment und physischen Founder-Test.
