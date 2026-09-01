# Referral Live UI Version Mismatch Fix

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `919141181223aa414ef004a09aa3f02637f2b7fd`

## Ursache

Die Live-Domain `https://bonus.wuxuaisbi.com` liefert für die Route
`/r/:restaurantSlug/:referralToken` weiterhin die alte Referral-Komponente.
Der öffentliche Root-Build referenzierte bei der Prüfung den Chunk
`/assets/ReferralLanding-S1dG1I_B.js`. Dieser Chunk enthält nachweislich:

- `Einladung von ${referrer.first_name}` ohne Null-Guard,
- das separate Formular mit Vorname, Telefon und Geburtstag,
- den Button `Mitglied werden`,
- dieselbe konfigurierte Dauer für beide Beteiligten.

Dieses Verhalten entspricht
`origin/main:src/modules/customer/ReferralLanding.tsx`, nicht dem aktuellen
kanonischen Arbeitsstand. Der Branch `codex/v1-canonical-recovery` existiert
nicht auf `origin`; die kanonische Referral-Integration liegt lokal im
uncommitteten Recovery-Arbeitsbaum. Deshalb konnte sie nicht durch den auf
`main` konfigurierten Cloudflare-Build ausgeliefert werden.

Der konkrete Null-Fehler entsteht durch einen Versionsmix: Die auf Staging
angewendete Migration `20260824004000_authenticated_referral_registration_bridge.sql`
liefert mangels ausdrücklicher Public-Name-Einwilligung absichtlich
`referrer.first_name = null`. Der alte Client interpoliert dieses Feld
ungeprüft und zeigt deshalb `Einladung von null`.

Die angezeigten 30 Tage sind kein hart codierter Wert im Live-Chunk. Der alte
Client liest `referral_boost_duration_days` und behauptet fälschlich, beide
Personen erhielten diese volle Dauer. Die Migration `20260824001000` setzt den
Default für neue Einstellungen auf 14 Tage, verändert bestehende
Restaurant-Einstellungen aber absichtlich nicht rückwirkend. Die reale
30-Tage-Anzeige belegt daher einen bestehenden konfigurierten 30-Tage-Wert,
den der veraltete Client zusätzlich falsch auf den eingeladenen Freund
überträgt.

## Deployment-Nachweis

- Live-Chunk: `ReferralLanding-S1dG1I_B.js`
- Live-ETag: `e58e2333a5cf2fe4e29bbe93619c70e1`
- Cloudflare-Cache bei Prüfung: `HIT`
- Live-Inhalt: alte separate Registrierung
- Kanonischer lokaler Build-Chunk nach Fix: `ReferralLanding-DdF9Whow.js`
- Remote `main`: `aeb4fa2f4fc565077828f350ab410e58e62424b7fd`
- Remote `codex/v1-release-finishing-sprint`: `919141181223aa414ef004a09aa3f02637f2b7fd`
- Remote `codex/v1-canonical-recovery`: nicht vorhanden

Der exakte Cloudflare-Deployment-SHA und der ursprüngliche Build-Zeitpunkt
werden weder in den öffentlichen HTTP-Headern noch in den Assets exponiert.
Der schreibgeschützte Wrangler-Abruf war ohne `CLOUDFLARE_API_TOKEN` nicht
möglich. Es wird daher kein unbelegter Deployment-SHA behauptet. Der
ausgelieferte Quellvertrag ist durch den Chunk-Inhalt dennoch eindeutig als
legacy nachgewiesen.

## Geänderte Dateien

- `src/modules/customer/referralInviteFlow.mjs`
- `src/modules/customer/ReferralLanding.tsx`
- `tests/referral-invite-full-registration-flow.test.mjs`
- `docs/reports/2026-08-24_REFERRAL_LIVE_UI_VERSION_MISMATCH_FIX.md`

## Was geändert wurde

- Gültiger öffentlicher Vorname: `<Vorname> lädt dich ein`.
- Fehlender oder ungültiger Vorname: `Ein Freund lädt dich ein`.
- Keine E-Mail, Telefonnummer, Customer-ID oder Auth-ID wird angezeigt.
- Die Karte nennt klar `2× Punkte für euch beide`.
- Der einladende Gast erhält den vollen konfigurierten Zeitraum.
- Der eingeladene Freund erhält dynamisch die Hälfte.
- Beim Default 14 Tage ergibt sich für den Freund exakt 7 Tage.
- Die kanonische Registrierung bleibt zentral unter `/customer/register` mit
  E-Mail, Passwort, Passwortbestätigung und E-Mail-Bestätigung.
- Referral-Kontext wird als geprüftes `returnTo` über Callback und Anmeldung
  erhalten.
- Registrierung und Annahme bleiben `pending`; erst der qualifizierende erste
  Besuch löst den serverseitigen Grant aus.

## Was nicht geändert wurde

- Keine alte Referral-Formularlogik wurde repariert oder reaktiviert.
- Keine rückwirkende Änderung bestehender Bonuszeiträume.
- Keine neue Migration.
- Keine RLS-, Grant- oder Tenant-Änderung.
- Kein Push, Merge oder Deployment.
- Migration `20260824005000` wurde nicht angewendet.
- Keine Production- oder Stripe-Aktion.

## Migration und Sicherheit

`npx supabase migration list --linked` bestätigt für das Projekt
`bwhvfjuwixgwduoeqaya`:

- `20260824004000`: lokal und Staging vorhanden, also **APPLIED**.
- `20260824005000`: nur lokal, weiterhin **BLOCKED/PENDING**.

Die 04000-RPC begrenzt die öffentliche Identität auf den neutralen
`first_name: null`-Vertrag, prüft Restaurant, Referral-Token, Ablauf,
Legal-Status und authentifiziertes Kundenkonto serverseitig. Die neue UI gibt
bei `null` ausschließlich den neutralen Fallback aus.

## Qualität

- Tests: `837/837 PASS`
- Typecheck: `PASS`
- Lint: `PASS`, 0 Fehler, 7 bestehende Warnungen
- Build: `PASS`
- `git diff --check`: `PASS`
- Scope-Secret-/Artefaktprüfung: `PASS`

## Live- und Gerätetest

Der Legacy-Flow wurde auf der öffentlichen Live-Auslieferung anhand des
geladenen Route-Chunks reproduziert. Ein erneuter physischer iPhone-Safari-Test
des korrigierten Flows ist noch nicht möglich, weil dieser Auftrag weder Push
noch Deployment freigibt und die Live-Domain weiterhin den alten Build
ausliefert.

Erforderliche nächste Reihenfolge:

1. den vollständigen kanonischen Recovery-Stand fachlich reviewen und committen,
2. den vorgesehenen Remote-Branch pushen,
3. kontrollierten Staging-Frontend-Build aktivieren,
4. Live-Chunk und ETag gegen den neuen Build prüfen,
5. Referral-Registrierung einschließlich realer E-Mail-Bestätigung auf einem
   physischen iPhone testen.

## Abschlussmatrix

```text
LEGACY REFERRAL PAGE REPRODUCED:
YES

CURRENT RENDERING COMPONENT:
origin/main:src/modules/customer/ReferralLanding.tsx
(live asset: /assets/ReferralLanding-S1dG1I_B.js)

"NULL" ROOT CAUSE:
04000 liefert absichtlich first_name = null; der stale Live-Client interpoliert
das Feld ohne Guard.

30-DAY ROOT CAUSE:
Bestehende Restaurant-Einstellung = 30 Tage; der Legacy-Client verwendet die
volle konfigurierte Dauer fälschlich auch für den eingeladenen Freund.

FRONTEND DEPLOYMENT STALE:
YES

04000 STATUS:
APPLIED

SAFE REFERRER DISPLAY:
PASS (lokaler kanonischer Build)

CURRENT DURATION COPY:
PASS (lokaler kanonischer Build)

FULL CUSTOMER REGISTRATION:
PASS (lokaler kanonischer Build)

PASSWORD CONFIRMATION:
PASS (lokaler kanonischer Build)

EMAIL CONFIRMATION:
PASS (Code/Tests), LIVE RETEST PENDING

DEFAULT FRIEND DURATION:
7 DAYS

PHYSICAL IPHONE SAFARI:
FAIL (korrigierter Build noch nicht ausgeliefert)

REFERRAL INVITE FLOW COMPLETE:
NO

05000:
BLOCKED

PRODUCTION:
LOCKED

STRIPE:
DEFERRED
```

## Status

**NOT READY**

Der Quellstand und Staging-RPC-Vertrag sind korrigiert und geprüft. Der live
ausgelieferte Frontend-Build ist jedoch weiterhin legacy; Push, kontrollierte
Aktivierung und physischer E2E-Test fehlen.
