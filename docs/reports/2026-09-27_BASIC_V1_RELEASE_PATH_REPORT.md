# WUXUAI Bonus – BASIC V1 Release Path Report

Datum: 2026-09-28
Branch: `codex/v1-release-integration`

## Ursache und Scope

Dieser Lauf priorisiert ausschließlich den BASIC-V1-Releasepfad. PRO,
PRO-Benachrichtigungen, Speisekarte, weitere Länder, Stripe LIVE und Production
blieben gesperrt. Migration 180 wurde reproduzierbar in den kanonischen Branch
übertragen und auf Staging angewendet. Der zusammenhängende Folgeumfang für
Trialende, ausdrückliche BASIC-Annahme, 60-Tage-Einlösung und Stripe TEST wurde
als additive Migration 181 plus zwei Edge Functions eng committed, per normalem
Fast-forward gepusht, auf Staging migriert und fail-closed deployed.

## Source- und Staging-Endstand

- Basis-HEAD: `8960ec5ec5ecf4ff2bfaf47aa4a336a382decb76`
- BASIC-Implementierungscommit Migration 182:
  `2889c5193317ff1f96f29c4ab563f34068bd3e07`
- Trial-Textkorrektur sowie lokaler/Remote-HEAD:
  `182a4fd500d46025c1e9ff129f2d666ec8ca1f4a`
- Remote-Parität nach frischem Fetch: `0/0`
- Migration 180:
  `20260927004000_v1_manual_basic_trial_activation.sql`
- Migration-180-SHA-256:
  `885afab3cfef1283d289deae9b05afd86d85a3b3d234e80d7c90de22d0c52c33`
- Verifiziertes Staging-Projekt: `bwhvfjuwixgwduoeqaya` /
  `wuxuai-bonus-staging`
- Staging vor Migration 180: `179/179`
- Staging nach Migration 180: `180/180`
- Staging vor Migration 181: `180/180`
- Staging nach Migration 181: `181/181`; Repeat-Dry-Run leer.
- Staging nach Migration 182: `182/182`; Repeat-Dry-Run leer; Remote-DB-Lint
  ohne Befund.
- Die Staging-App wurde ausschließlich über den vorhandenen Wrangler-
  Stagingweg aus exakt `182a4fd…` gebaut und auf den Worker
  `wuxuai-restaurant-bonus-app-staging` ausgerollt. Aktive Version:
  `18c223b3-02fa-4259-9513-73ca4e883401`. Lokales und ausgeliefertes HTML
  besitzen denselben SHA-256
  `3278a439912cb43bb66818c85e44cd1a725297700a2b0f3bbb8d4b3d75ce36f9`;
  alle sechs direkt referenzierten JS-/CSS-Assets stimmen überein.

## Migration 180 – tatsächlicher Staging-Nachweis

Migration 180 wurde einzeln angewendet. Der unmittelbare Repeat-Dry-Run nach
der Anwendung war leer. Der DB-Linter meldete ausschließlich bereits bekannte
Bestandswarnungen und keinen Migration-180-spezifischen Fehler.

Vorher/Nachher blieben die geprüften Bestandszahlen identisch:

- Restaurants: 17 / 17
- Subscriptions: 17 / 17
- Auditzeilen: 4.092 / 4.092
- Customer-QR-Referenzen: 98 / 98
- Punktetransaktionen: 22 / 22
- Rewards: 32 / 32
- Angebote: 18 / 18
- Verification Cases: 1 / 1
- Legal Publication Decisions: 0 / 0
- Kassa-Bestätigungen: 3 / 3
- manuelle Trial-Entscheidungen: 0 / 0
- PRO-Grants und Add-ons: 0 / 0

In diesem Lauf wurde kein positiver Trial gestartet. Die lokalen AAL1-/Rollen-/
Gate-Tests für Migration 180 sind bestanden. Ein bestehender synthetischer
TEST_ONLY-Betrieb zeigte physisch einen aktiven, manuell begonnenen
Drei-Kalendermonats-Trial ohne Zahlungsmethode. Ein neuer positiver
Ein-Kalendermonats-AAL2-Flow und der vollständige Aktivierungsnachweis bleiben
OPEN. Country-, KYB-, Legal- und Kassa-Gates wurden nicht umgangen.

## Migration 181 und Edge-Deployment

Datei:
`supabase/migrations/20260927005000_basic_post_trial_and_stripe_test.sql`

SHA-256:
`4e0606bea6de22173ec0933661ea015d3cd4ddd957f0e664403ae974a7508a53`

Migrationen 001–180 wurden nicht verändert. Der Staging-Dry-Run wies vor dem
Write ausschließlich Migration 181 aus. Nach der Anwendung bestätigten
Migrationsliste und leerer Repeat-Dry-Run `181/181`; der Remote-DB-Lint meldete
keinen Befund.

Der geschützte Vorher-/Nachher-Datenvergleich umfasste alle `public`-Relationen.
Alle 140 bestehenden Relationsinhalte blieben bytegleich. Hinzu kamen exakt
fünf leere Tabellen aus Migration 181: `basic_paid_offer_acceptances`,
`basic_post_trial_redemption_grace`, `basic_test_checkout_requests`,
`basic_stripe_test_event_inbox` und `basic_test_billing_write_context`.

Kontrolliert deployed wurden ausschließlich:

- `billing-stripe-test-webhook`, Version 1, Gateway-JWT aus, da die Funktion
  selbst den Stripe-Raw-Body signaturprüft;
- `billing-basic-test-checkout`, Version 1, Gateway-JWT an.

Andere Edge Functions wurden nicht verändert.

### Trialende und 60-Tage-Vertrag

- Ein bezahlter BASIC-Folgezeitraum verlangt eine ausdrückliche,
  unveränderbar auditierte Owner-Annahme nach Trialende.
- Trialende löst weder Checkout noch Belastung noch Vertragsumwandlung aus.
- Ohne bestätigten bezahlten Providerzustand endet die aktive Nutzung.
- Bereits vorhandene Punkte und Belohnungen können technisch während eines
  exakt 60 Tage langen Einlösefensters weiter eingelöst werden.
- Während dieses Fensters sind neue Kundenregistrierungen, positive Punkte-
  und Stempelbuchungen, Punkte-QRs, neue Angebote und neue Veröffentlichungen
  serverseitig gesperrt.
- Negative Einlösungsbuchungen und risikoreduzierende Korrekturen bleiben im
  vorgesehenen Umfang möglich.
- Verfall, Löschung und physische Datenbereinigung sind ausdrücklich nicht
  autorisiert und bleiben rechtlich offen.

### Stripe TEST

- Checkout ist nur nach ausdrücklicher BASIC-Annahme möglich.
- Preisauflösung erfolgt serverseitig über die verifizierte BASIC-TEST-Bindung
  (59 EUR netto, monatlich, licensed/per-unit).
- Die Edge Function akzeptiert ausschließlich Staging, `livemode=false` und
  einen Stripe-TEST-Schlüssel; LIVE ist fail-closed.
- Webhooks verlangen die Signaturprüfung über den unveränderten Raw Body.
- Event-ID und Payload-Hash schützen vor Replay und Konflikten.
- `invoice.paid`, `invoice.payment_failed` und
  `customer.subscription.deleted` steuern den gespiegelt bestätigten Zustand.
- Ein `invoice.paid`, das vor dem älteren Checkout-Event eintrifft, wird über
  die signierte Acceptance-Zuordnung verarbeitet; das verspätete Checkout-
  Event wird als `STALE` klassifiziert.
- Automatische Steuerberechnung bleibt deaktiviert. Stripe Tax und Tax-
  Readiness werden nicht verändert.
- Migration 182 modelliert eine Reaktivierung als neuen, ausdrücklich
  angenommenen Vertrag. Dieser Umfang ist lokal geprüft und auf Staging
  angewendet; ein positiver Providerflow bleibt gesperrt.

## Migration 182 – lokaler und Staging-Nachweis

Datei:
`supabase/migrations/20260928001000_basic_preexpiry_acceptance_and_reactivation.sql`

SHA-256:
`394f358bd923adb1bde9325af333cbca2196a212aef662d25b155b798903078e`

Die additive Migration erlaubt die ausdrückliche BASIC-Entscheidung erst in
den letzten sieben Kalendertagen des Trials. Vor dem tatsächlichen Trialende
bleibt die Checkout-Vorbereitung serverseitig blockiert. Nach einer
providerbestätigten Kündigung verlangt die Reaktivierung eine neue immutable
Acceptance mit eigener Request-/Correlation-ID und Bindung an die vorherige
Provider-Subscription. Der alte Vertrag wird nicht wiederverwendet.

Lokale Gates:

- Fresh Replay `182/182`: PASS
- Upgrade `181→182`: PASS
- Repeat-Dry-Run leer: PASS
- DB-Lint: 0 Befunde
- bestehende 181-SQL-Regression: PASS
- Vorabentscheidung, Early-Checkout-Sperre, Reaktivierungsannahme und
  Idempotenz: PASS
- Full Suite: `2.090/2.090` PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler / 8 vorbestehende Warnungen
- Build: PASS

Migration 182 wurde im Commit `2889c519…` committed, normal per Fast-forward
gepusht und kontrolliert auf das verifizierte Staging-Projekt angewendet.
Migrationsliste, leerer Repeat-Dry-Run und Remote-DB-Lint bestätigen `182/182`.
Die Migration erzeugt ausschließlich additive Vertrags- und Evidenzstruktur;
in diesem Lauf wurde dadurch keine positive Billing- oder Trialaktion erzeugt.

Die physische Provideraktivierung blieb absichtlich aus. Der frische
Staging-Checkpoint bestätigt Seller `PLANNED`, Tax Readiness
`PENDING_CONFIGURATION`, Automatic Tax aus und LIVE-Bindungen `UNBOUND`.
Deshalb wurden weder Stripe-Testschlüssel noch Webhook-Secret oder positive
Checkoutdaten gesetzt. Es gab keine Stripe-API-Anfrage.

### Staging-Negativmatrix

| Prüfung | Ergebnis | Nachweisgrenze |
|---|---|---|
| Checkout ohne Auth | PASS | Gateway `401 / UNAUTHORIZED_NO_AUTH_HEADER`; 0 Datenwrites |
| Checkout ohne Owner-Annahme | PASS lokal / OPEN physisch | SQL-/Edge-Vertrag blockiert; kein legitimer positiver Staging-Kontext erzeugt |
| Trialaktion ohne AAL2 | PASS lokal / OPEN physisch in diesem Lauf | Migration-180-Securitymatrix PASS; die vorhandene Admin-Sitzung wurde ausschließlich read-only genutzt |
| Webhook ohne Signatur | PASS fail-closed | `503 / BASIC_TEST_WEBHOOK_NOT_ENABLED`; 0 Datenwrites |
| Webhook mit falscher Signatur | BLOCKED vor Signaturprüfung | wegen fehlender, bewusst nicht gesetzter TEST-Konfiguration ebenfalls `503` |
| Event-ID-/Payload-Duplikat | PASS lokal / OPEN physisch | fokussierte Tests PASS; signierter Staging-Webhook bewusst nicht aktiviert |
| vertauschte Ereignisreihenfolge | PASS lokal / OPEN physisch | Invoice-vor-Checkout lokal PASS; keine Providerkonfiguration auf Staging |

Der normalisierte Datendump vor und nach den HTTP-Negativrequests war
bytegleich; der rohe Dump unterschied sich ausschließlich durch den zufälligen
`pg_dump`-Restrict-Marker.

## Physischer synthetischer Staging-Nachweis

- Owner-KYB: TEST_ONLY-Betrieb `PENDING_ACTIVATION`, vier private synthetische
  Dokumentversionen und append-only Versionsverlauf sichtbar; Upload allein
  aktiviert nichts.
- Platform Admin: derselbe Fall unter der getrennten Admin-Sitzung sichtbar;
  echte Verifikation/Aktivierung bleibt gesperrt.
- Drei-Kalendermonats-Trial: bestehender TEST_ONLY-Betrieb zeigt Start,
  Ende, 75 verbleibende Tage, BASIC-Status und keine automatische Abrechnung.
- Tariftext: nach dem engen Commit `182a4fd…` physisch auf Staging geprüft;
  Registrierung startet keinen Trial, BASIC wird manuell für ein oder drei
  Kalendermonate aktiviert, Add-ons haben keinen Trial und PRO bleibt separat.
- AT-Country-Gates: technische Registrierung aktiv, öffentliche Marktreife
  `Vorbereitet · Nicht live`, öffentliche Aktivierung aus. Recht, Datenschutz,
  Steuer, Abrechnung, Stripe, Übersetzungen, technischer Funktionstest und
  erforderliche Rechtsdokumentversionen stehen jeweils auf
  `Nicht konfiguriert`.
- Checkout ohne Auth: `401 / UNAUTHORIZED_NO_AUTH_HEADER`.
- Webhook ohne freigegebene TEST-Konfiguration: `503 /
  BASIC_TEST_WEBHOOK_NOT_ENABLED`.
- Ein-Kalendermonats-Trial, tatsächliches Trialende, 60-Tage-Fenster,
  Rechnung, Zahlungsausfall, Kündigung und Reaktivierung wurden nicht durch
  Zeit- oder Gate-Manipulation erzwungen und bleiben physisch OPEN.

## Geänderte Dateien

- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/billing/BasicPaidOfferPanel.tsx`
- `src/modules/billing/basicBillingService.ts`
- `src/shared/commercialContract.mjs`
- `src/shared/commercialContract.d.mts`
- `src/modules/capacity/billingCatalogMessages.mjs`
- `src/shared/i18n/catalog.mjs`
- `supabase/functions/_shared/billingArchitecture.mjs`
- `supabase/functions/billing-basic-test-checkout/index.ts`
- `supabase/functions/billing-stripe-test-webhook/index.ts`
- `supabase/migrations/20260927005000_basic_post_trial_and_stripe_test.sql`
- `tests/basic-post-trial-stripe-test.local.sql`
- `tests/basic-post-trial-stripe-test.test.mjs`
- `tests/i18n-complete-catalog.test.mjs`
- `supabase/migrations/20260928001000_basic_preexpiry_acceptance_and_reactivation.sql`
- `tests/basic-preexpiry-reactivation.local.sql`
- dieser Bericht

## Lokale Prüfungen

- Fresh Replay: `182/182` PASS
- Upgrade `181→182`: PASS
- Repeat-Dry-Run: leer / PASS
- fokussierte SQL-Matrix: PASS und vollständig zurückgerollt
- Webhook-Reihenfolge Invoice vor Checkout: PASS
- Replay-Idempotenz: PASS
- Zahlungsausfall und Kündigung: PASS
- neue Registrierung/Punkte/Angebote nach Trialende blockiert: PASS
- Redemption während der 60 Tage: PASS
- Redemption nach Ablauf der 60 Tage: blockiert / PASS
- fokussierte BASIC-/i18n-Tests: `18/18` PASS
- Full Suite: `2.090/2.090` PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 8 vorbestehende Warnungen
- Build: PASS
- DB-Lint: ausgeführt; ausschließlich vorbestehende Warnungen
- `git diff --check`: PASS
- Secret Scan: PASS

## BASIC-Release-Matrix

| Bereich | Technisch | Rechtlich | Gründung/Seller | Production |
|---|---|---|---|---|
| Migration 180 / manueller BASIC-Trial | Staging `182/182`; negative lokale Gates PASS; bestehender synthetischer 3-Monats-Trial physisch sichtbar; neuer 1-Monats-AAL2-Flow OPEN | Trialtext und Pilotbedingungen final zu bestätigen | Seller weiterhin `PLANNED` | BLOCKED |
| Trialende ohne Folgeauftrag | Schema auf Staging, lokal getestet; positiver Staging-Flow OPEN | 60-Tage-Kommunikation und Altbestand final zu bestätigen | offen | BLOCKED |
| Verfall und physische Löschung | bewusst nicht implementiert | OPEN | nicht einschlägig | BLOCKED |
| 60-Tage-Einlösung | Schema auf Staging; Grenz- und Sperrlogik lokal PASS; physisch OPEN | Verfall/Löschung bleiben ungeprüft und deaktiviert | offen | BLOCKED |
| ausdrückliche BASIC-Annahme | Schema auf Staging, lokal idempotent PASS; physisch OPEN | kostenpflichtiger Vertrag/AGB/Informationen OPEN | Seller `PLANNED` | BLOCKED |
| Stripe TEST Zahlung | Edge/Schema deployed, aber Providerkonfiguration absichtlich aus; E2E BLOCKED | Steuer-/Zahlungsvertrag OPEN | Seller `PLANNED`, Tax `PENDING_CONFIGURATION` | LIVE BLOCKED |
| Rechnung | nicht physisch erzeugt; BLOCKED | Rechnungstext und Steuervertrag OPEN | Rechnungsaussteller nicht verifiziert | BLOCKED |
| Kündigung | lokal PASS; physisch BLOCKED | Folgen für Gastbestand final OPEN | Seller/Tax offen | BLOCKED |
| Reaktivierung | lokal und Schema auf Staging PASS; neue Acceptance erforderlich; physischer Providerflow OPEN | Vertragstext/Informationspflichten OPEN | Seller/Tax offen | BLOCKED |
| synthetischer Owner-/KYB-Teilflow | Owner- und Admin-Ansicht physisch PASS; Aktivierung absichtlich gesperrt | reales KYB und Aktivierungsvertrag bleiben gesperrt | nicht einschlägig | BLOCKED |
| kompletter synthetischer Staging-Flow | teilweise PASS, Trialende/Stripe/60-Tage physisch OPEN | reale Freigaberegeln offen | Seller/Tax offen | BLOCKED |

## Offene externe und physische Gates

1. Neuer positiver Platform-Admin-AAL2-Test für einen zulässigen synthetischen
   Ein-Kalendermonats-Trial; kein reales Restaurant aktivieren.
2. Verifikation des Sellers und Abschluss des separaten Tax-Readiness-Vertrags.
3. Erst danach sichere Konfiguration von Stripe TEST Secret und signiertem TEST-
   Webhook; keine Werte in Git oder Berichten.
4. Physischer Stripe-TEST-Lauf für Checkout, Rechnung, Zahlungsausfall,
   Kündigung, Replay, verspätete Events und Cache-/Asset-Parität.
5. Vertrags-/Rechnungstexte für die neue ausdrücklich angenommene
   Reaktivierung fachlich und rechtlich bestätigen.
6. Vollständiger synthetischer Staging-Ablauf Owner-Onboarding → KYB → manuelle
   Platform-Freigabe → Trial → Annahme/keine Annahme → Ablauf → Einlösung.
7. Aktive kanonische Dokumente, die weiterhin den alten provideraktivierten
   Ein-Monats-Trial nennen, separat auf den freigegebenen manuellen
   1-/3-Monats-Vertrag abstimmen. Bis dahin besteht ein dokumentierter
   Code-/Contract-Mismatch.

## Was nicht geändert wurde

- PRO, PRO-Benachrichtigungen, Speisekarte und weitere Länder
- Stripe LIVE, Stripe Tax und Production
- reale Kunden-, Restaurant-, Zahlungs- oder KYB-Daten
- LEGACY-Tenant
- Customer-Mail-Scheduler
- Migrationen 001–181
- rechtlich ungeprüfte Verfalls- oder Löschregeln

## Status

**BASIC V1 MIGRATION 182 STAGING SCHEMA PASS / STAGING APP-ASSET PARITY PASS /
SYNTHETIC OWNER-KYB AND THREE-MONTH TRIAL OBSERVED / STRIPE TEST BLOCKED BY
SELLER AND TAX READINESS / PRODUCTION NOT READY**

Kein FINAL LOCK: Der neue positive Ein-Monats-AAL2-Trial, Trialende,
60-Tage-Fenster, Stripe TEST und der vollständige synthetische Staging-Flow
sind noch nicht physisch abgeschlossen. Migration 182 und die Staging-BASIC-UI
sind angewendet beziehungsweise deployed und technisch geprüft.
