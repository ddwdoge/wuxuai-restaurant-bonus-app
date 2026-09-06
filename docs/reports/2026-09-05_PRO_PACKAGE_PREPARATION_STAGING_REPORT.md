# WUXUAI Bonus - PRO-Paket Vorbereitung auf Staging

Datum: 2026-09-05
Branch: `codex/pro-entitlements-preparation`
Basis: `da2777ba453b430e6e031e3ce1b42233a33bb942`
Staging: `bwhvfjuwixgwduoeqaya`
Production: `fuqhljgesclipzduhykl` (unveraendert)

## Ursache

PRO soll technisch und tenantgebunden auf Staging vorbereitet werden, ohne
oeffentlichen Verkauf, Stripe-Aktivierung oder Production-Aenderung. Plan,
Angebotslimit und Benachrichtigungsrechte benoetigten einen zentralen,
serverseitigen und auditierten Berechtigungsvertrag.

## Geaenderte Dateien

- `supabase/migrations/20260905004000_pro_package_entitlements.sql`
- `supabase/functions/_shared/transactionalMailTemplates.mjs`
- `src/modules/platform/PlatformPlanEntitlementsPanel.tsx`
- `src/modules/platform/PlatformRestaurantControlCenter.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/modules/offers/restaurantOfferService.ts`
- `src/modules/admin/pages/RestaurantOffersPage.tsx`
- `src/modules/admin/pages/restaurant-offers.css`
- `src/styles.css`
- `tests/pro-package-entitlements.test.mjs`
- `tests/transactional-mail-dispatcher.test.mjs`
- `docs/07_WUXUAI_ADMIN.md`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/22_PAYMENT_STRIPE_PLAN.md`
- `docs/19_CHANGELOG.md`
- dieser Report

## Was wurde geaendert

- Zentraler Plan-Katalog fuer BASIC (59 EUR), PRO (99 EUR) und das nicht
  oeffentlich freigegebene PREMIUM (199 EUR).
- Tenantgebundene Entitlement-Aufloesung fuer Angebotslimit,
  Angebotsbenachrichtigungen und Reward-Benachrichtigungen.
- Platform-Admin-Steuerung mit Begruendung, `CONFIRMED`, Idempotenz,
  Tenantbindung und unveraenderbarem Vorher-/Nachher-Audit.
- Owner-Ansicht fuer aktuelles Paket, wirksames Limit und aktive Angebote ohne
  Self-Upgrade oder Entitlement-Schreibrecht.
- Serverseitiges BASIC-Limit von fuenf aktiven Restaurant-Marketingangeboten;
  Limits 1 bis 7 sowie unbegrenzt als Support-Ausnahme.
- `OFFER_PUBLISHED` im bestehenden Queue-, Consent-, Sprach- und
  Deduplizierungsvertrag.
- Zentrales Entitlement-Gate vor bestehenden
  `POINT_REWARD_AVAILABLE`-Queue-Ereignissen; Schwellenlogik unveraendert.
- Deutsche Platform-/Owner-UI und sieben vorhandene Mailsprachen DE, EN, FR,
  IT, ES, ZH und KO mit EN-Fallback.

## Was wurde nicht geaendert

- Keine Welcome-Gift-, Birthday-, Punkte-, QR-, Daily-PIN-, Redemption-,
  Multi-Role-, RLS- oder Tenant-Fachlogik neu gebaut.
- Geschenkkarten und Kassenanbindung bleiben deaktiviert.
- Keine Stripe-Keys, Products, Prices, Checkout-Sessions oder Webhooks.
- Keine oeffentliche PRO-/PREMIUM-Freischaltung und keine Marketingaenderung.
- Keine Production-Migration, kein Production-Deployment, keine
  Production-Daten-, DNS- oder Cloudflare-Aenderung.

## Migration

- Pre-Dry-Run Staging: exakt eine pending Migration (`20260905004000`).
- Auf Staging angewendet: Ja.
- Post-Dry-Run: 0 pending, Remote-Datenbank aktuell.
- DB-Linter Staging: 0 Fehler.
- Production-Abgleich: `20260905004000` nicht angewendet; Production blieb auf
  dem vorherigen Migrationsstand.

## Staging-Ergebnis

- Worker: `wuxuai-restaurant-bonus-app-staging`.
- Frontend-Deployment: `5d676002-a1c4-42f5-af76-7b0212b2fcb3`.
- Staging `transactional-mail-dispatcher` wegen erweitertem gemeinsamem
  Template neu ausgerollt; keine andere Edge Function ausgerollt.
- Platform Admin BASIC -> PRO -> BASIC physisch erfolgreich.
- Limits 1, 7 und unbegrenzt physisch erfolgreich; Overrides anschliessend
  entfernt.
- PRO mit neun gleichzeitig aktiven Testangeboten erfolgreich; nach Downgrade
  blieben bestehende Angebote erhalten und ein weiteres aktives Angebot wurde
  serverseitig blockiert.
- Owner zeigte PRO `9 · unbegrenzt` und nach Rueckstellung BASIC `4 / 5`.
- PRO-Publish erzeugte fuer einen bestaetigten, tenantgebundenen Testempfaenger
  exakt ein `OFFER_PUBLISHED`-Queue-Ereignis.
- BASIC-Publish blieb sichtbar und erzeugte kein solches Ereignis.
- Der physische PRO-Reward-Nachweis wurde ueber den kanonischen Kundenfluss
  erbracht: persoenlicher zeitbegrenzter Customer-QR, Scan im Owner-/Staff-
  Portal, Tages-PIN und exakt eine regulaere `+1`-Punktebuchung.
- Der Punktestand wechselte von vorbereitet 110 auf 111 Punkte und erreichte
  damit exakt die konfigurierte Reward-Schwelle. Das System erzeugte genau
  einen `POINT_REWARD_AVAILABLE`-Queue-Eintrag mit Status `PENDING` und
  `attempt_count = 0`; ein Duplikat war nicht vorhanden.
- Serverseitig war fuer den Testtenant PRO mit aktiver
  `reward_notifications`-Berechtigung wirksam. Der BASIC-Negativvertrag blieb
  durch die fokussierten Regressionstests belegt: Core-Reward bleibt aktiv,
  outbound Reward Notification bleibt aus.
- Nach dem Nachweis wurde der Testtenant ueber den auditierten Platform-Admin-
  Pfad von PRO auf BASIC zurueckgestellt. Der unveraenderbare Audit-Eintrag
  belegt `PLAN_CHANGED`, `PRO -> BASIC` und `SUCCESS`.
- Die wirksamen BASIC-Rechte wurden anschliessend direkt in Staging geprueft:
  Angebotslimit 5, Angebotsbenachrichtigungen aus,
  Belohnungsbenachrichtigungen aus, Geschenkkarten aus und Kassenanbindung aus.
- Der exakt fuer den physischen Nachweis angelegte tenantgebundene Testkunde
  wurde anhand von Customer-ID, Tenant-ID, Name, Erstellzeit und Punktestand
  eingegrenzt und entfernt. Danach waren seine Customer-, Punkte-, QR-, Token-,
  Queue-, Notification-State-, Reward- und Membership-Bestaende jeweils 0.
  Keine fremde Staging-Zeile war Teil der Loeschanweisung; Auth-Identitaeten,
  Migrationen, Schema, Entitlements und Audit blieben erhalten.
- Alle fuenf Audit-Aktionstypen sind als `SENSITIVE`, erfolgreich und mit
  Vorher-/Nachher-Zustand vorhanden.
- Anonyme RPC-/Override-Aufrufe wurden mit 401/42501 blockiert. Der direkte
  Tabellenversuch veraenderte keine Zeile; der Plan blieb BASIC.
- Alle in diesem Loop angelegten Offer-, Account-, Customer-, Consent-,
  Membership- und Queue-Testobjekte wurden entfernt und mit Nullbestaenden
  nachgeprueft.

## Verifikation

- PRO-Fokustests: 20/20 PASS.
- Platform-Admin-Tests: 53/53 PASS.
- Vollstaendige Tests: 1298/1298 PASS.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 8 bereits vorhandenen Warnungen.
- Build mit ausschliesslich Staging-Variablen: PASS.
- Secret Scan: PASS.
- `git diff --check`: PASS.
- RLS/Security: PASS fuer die geprueften Grants, anonymen Negativpfade,
  Platform-Admin-Schreibpfade und direkte Browser-DML-Sperre.
- Desktop: Platform Admin und Owner physisch geprueft.
- Tablet/Mobile: responsive CSS-/Regressionstests PASS; keine neue feste
  Breite, 44-Pixel-Steuerziele fuer den Platform-Bereich.

## Risiken

- PRO und PREMIUM bleiben nicht oeffentlich und nicht verkaufbar.
- Der physische SMTP-Versand war fuer dieses Vorbereitungsgate ausdruecklich
  nicht erforderlich; belegt wurden Queue, Entitlement und Deduplizierung.

## Status

PLAN/ENTITLEMENT/OFFER-PFAD: **STAGING FINAL LOCK**
REWARD-NOTIFICATION-PHYSICAL-GATE: **STAGING FINAL LOCK**
PRO TECHNICAL PREPARATION: **FINAL LOCK**
PRO PUBLIC RELEASE: **NO**

## Abschlussformat

- Aufgabe: PRO-Paket technisch auf Staging vorbereiten
- Build: Ja
- Migration: Auf Staging angewendet
- Flow-Test: Ja - Plan, Limits, Owner, Offer Notification und physischer QR-/Tages-PIN-Reward-Schwellenlauf
- RLS/Security: Ja
- Alte Logik geprueft: Ja
- Report: `docs/reports/2026-09-05_PRO_PACKAGE_PREPARATION_STAGING_REPORT.md`
- Pruef-ZIP: `exports/2026-09-05_PRO_PACKAGE_PREPARATION_STAGING.zip`
- Offene Risiken: keine fuer die freigegebene technische PRO-Vorbereitung; oeffentliche Freigabe bleibt gesperrt
- Status: FINAL LOCK
