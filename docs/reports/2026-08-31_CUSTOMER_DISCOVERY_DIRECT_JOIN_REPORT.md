# WUXUAI Bonus P1 - Customer Discovery Direct Join Report

Stand: 2026-08-31

Branch: `codex/v1-canonical-recovery`

Status: `CODE LOCK`

## Ursache

Die Restaurantdetails im Customer-Finder führten bisher für Mitglieder und
Nichtmitglieder über dieselbe Aktion `Bonus öffnen` zum Restaurantkontext.
Der bestehende sichere Membership-Join war bereits für QR- und zentrale
Customer-Kontexte vorhanden, wurde in der Discovery-Oberfläche aber nicht als
klarer, ausdrücklicher Beitritt dargestellt.

## Geänderte Dateien

- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/CustomerRestaurantAccess.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customerAccountService.ts`
- `src/modules/customer/customer-premium.css`
- `tests/customer-discovery-direct-join.test.mjs`
- bestehende Customer-Finder-, Kontext- und Schnellwechseltests
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/09_FLOW_02_GAST_WERDEN.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Nichtmitglieder sehen in Restaurantdetails `Bonusprogramm beitreten`,
  Mitglieder sehen `Restaurant öffnen`; `Route starten` bleibt sekundär.
- Der Beitritt verwendet unverändert den bestehenden Pflicht-Consent für
  Teilnahmebedingungen und Datenschutz sowie
  `join_customer_account_restaurant(...)`.
- Nach erfolgreichem Join wird der Restaurantkontext über denselben
  `open_customer_account_membership(...)`-Pfad wie beim globalen
  Restaurant-Schnellwechsel geöffnet.
- Der Server-Slug ist die maßgebliche Navigationsantwort. Der neue Kontext wird
  ohne Browser-Reload geöffnet und zeigt eine barrierefreie Erfolgsmeldung.
- Die Erfolgsmeldung folgt dem erfolgreichen Nichtmitglied-Flow und ist nicht
  vom internen Idempotenzfeld `joined` abhängig. Auch ein serverseitig bereits
  vollzogener Parallel-/Retry-Join endet damit verständlich im neuen Kontext.
- Mobile CTAs behalten mindestens 48 Pixel Höhe und die Drawer-Safe-Area.

## Was wurde nicht geändert

- Keine Punkte-, Visit-, Reward-, Welcome-Gift- oder Referral-Logik.
- Kein Besuch, keine Punkte und keine Referral-Zuordnung beim Beitritt.
- Keine neue Customer-Identität und kein zweiter Auth-Benutzer.
- Keine RPC-, RLS-, Grant- oder Datenbankänderung.
- Keine Migration, kein Deployment, keine Production- oder Stripe-Aktion.

## Prüfung

- Gezielte Customer-/Finder-Regression: `51/51 PASS`
- Gesamttests: `1172/1172 PASS`
- Typecheck: PASS
- Lint: PASS, 0 Fehler / 7 bestehende Warnungen
- Production-Build: PASS mit nicht geheimen Test-Platzhaltern
- Diff-Check: PASS
- Secret-Scan des Diffs: PASS
- 320 bis 430 Pixel: automatisierter Geometrie-/Overflow-Vertrag PASS
- Tablet/Desktop Drawer-Vertrag: automatisiert PASS

## Migration / Security

- Migration: NONE
- RLS: UNCHANGED
- RPC: bestehender authentifizierter, tenantgebundener und idempotenter Join
- Cross-Tenant: durch Membership-/Restaurantbindung serverseitig blockiert
- Direkte Browser-Tabellenwrites: NO
- Service Role im Frontend: NO

## Offene Live-Gates

- Development/Test-Deployment nicht beauftragt und nicht ausgeführt.
- Echte neue Membership, unmittelbarer Kontextwechsel und Persistenz nach
  Reload sind noch nicht live gegen Supabase bestätigt.
- Physischer iPhone-Test für Join, Consent, Welcome Gift und Visit-Nullzustand
  bleibt Founder-Gate.

## Risiken

Der bestehende Serververtrag ist durch Migration und Tests nachgewiesen, aber
ohne aktuellen Development/Test-Flow darf kein `FINAL LOCK` gemeldet werden.

Status: `CODE LOCK`
