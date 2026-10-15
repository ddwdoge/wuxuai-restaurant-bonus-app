# Staging v2 – Release-Lücken und isolierter Stripe-Abo-Lebenszyklus

Stand: 2026-10-15 19:24 CEST
Projekt: `mbgveqbhessaunrhfudm`
Branch: `codex/v1-release-integration`
Basis: `98717a855d9a928ca00107b49a48b696ce73d1d1`

## Aufgabe und Grenze

Die Integrität des autoritativen Git-Branches wurde in einem frischen Checkout
geprüft, der alte beschädigte Checkout ausschließlich gelesen, die vorhandenen
lokalen und Hosted-Nachweise nach Evidenzart getrennt und die fehlende isolierte
Stripe-TEST-Abo-Lifecycle-Strecke lokal ergänzt. In diesem Paket gab es keine
Hosted-Migration, kein Deployment, kein Stripe-Ereignis, keine Session, keinen
Grant und keinen Provider-Write.

TEST_ONLY-Nachweise werden in diesem Bericht ausdrücklich nicht als Nachweis
für reale KYB-, Legal-, Aktivierungs-, Trial-, Entitlement-, Billing- oder
Mailfreigaben verwendet.

## 1. Git-Integrität

### Autoritativer Checkout

- Frischer Checkout: `/private/tmp/wuxuai-release-gaps-20261015`
- Frischer Remote-Abruf: PASS.
- `HEAD`: `98717a855d9a928ca00107b49a48b696ce73d1d1`
- `origin/codex/v1-release-integration`: identisch.
- Ahead/Behind: `0/0`.
- `git fsck --full --strict --no-reflogs`: PASS, keine Ausgabe.
- Die relevanten Vorgänger `461daaa942f77425fba3841f76e4d44b4acf24b6`,
  `27bb572bf4ea8ccc13b905fddbe54b54473ac64a` und
  `45dc3adf579bd85b40bf31c05cbb60cd263e3201` sind Vorfahren des Tips.
- Kein Force-Push, kein Commit und keine History-Änderung.

### Alter beschädigter Checkout

Der alte Checkout unter
`/Users/dongdongwu/Documents/wuxuai restaurant bonus app` wurde nicht
verändert. Sein Ref zeigt auf `a64b46e8d20d5c44c4c54a7e6236312f355e98d5`;
der Commit ist lesbar, der referenzierte Baum nicht:

- `git status`: `bad tree object HEAD`.
- Pack `pack-2fb6...`: `fatal: early EOF`, `bad`.
- Pack `pack-fadd...`: `fatal: early EOF`, `bad`.
- Mehrere `.idx`/`.rev` stammen vom Juli/September, während zugehörige
  `.pack`-Dateien am 2. Oktober verändert wurden. Das ist mit einer
  inkonsistenten beziehungsweise unvollständigen lokalen Objektablage
  vereinbar.

Der Remote und der neue Checkout sind davon nicht betroffen. Der alte Checkout
darf nicht als Releasequelle verwendet oder in-place repariert werden. Ein
späterer Ersatz erfolgt nur durch einen neuen Clone und gesonderte Übernahme
etwaiger noch benötigter Arbeitsdateien.

## 2. Frischer Hosted-Readback

- Supabase-Projekt: `ACTIVE_HEALTHY`, Region `eu-west-1`, PostgreSQL 17.
- Projekt-/Originbindung: exakt `mbgveqbhessaunrhfudm`,
  `https://mbgveqbhessaunrhfudm.supabase.co/auth/v1` und
  `https://staging-v2.bonus.wuxuaisbi.com`.
- Environment: `STAGING`.
- AT: reales Intake `BLOCKED`, TEST_ONLY `READY`; Legal und Privacy
  `PENDING_CONFIGURATION`.
- Hosted-Migrationen: 231, letzter Stand
  `20261013154250_test_only_stripe_checkout_isolation`.
- Neue lokale Migration `20261015170349...` ist nicht Hosted.
- Aktive Stripe-Testfunctions: Checkout v13 (`verify_jwt=true`) und Webhook v12
  (`verify_jwt=false` mit eigener Stripe-Signaturprüfung). Die neue
  Lifecycle-Function ist nicht deployed.
- BASIC-TEST-Bindung: `VERIFIED`, `livemode=false`, EUR 59,00 monatlich,
  Product `prod_VJULxwnQMyqxRc`, Price
  `price_1UIrMd59e5GrFXdMfnSrKlRA`, Lookup-Key
  `wuxuai_bonus_basic_monthly`.
- Betrieb: `draft` / `pending_activation`; Operational, Legal und Security
  bleiben false. Subscription `pending_activation`, Zahlung `not_required`,
  Trial und Stripe-Customer/-Subscription NULL.
- Letzter BASIC-Beleg ist `REVOKE`; der vorherige Grant ist abgelaufen.
- Isolierter Checkout: Requests/Events/Audits `1/1/3`.
- Reale Paid-Acceptances, Trial-Claims und Entitlement-Overrides: `0/0/0`.
- Reale transaktionale bzw. Angebotsmail-Deliveries: `0/0`.

Zusätzliche rein synthetische Hosted-Belege: KYB Receipts/Audit `2/2`,
Readiness `ACTIVATION_READINESS_TEST=1` und `TRIAL_READINESS_TEST=1`,
Platform-Publikation/TEST-Identität/Join `1/1/1`, synthetische
Legal-Publikation `1`, BASIC Offer Publications `2`, PRO Grant/Revoke `1/1`,
PRO Consent/Notification/Open `1/1/1`, Einmal-App-Mail Queue/Provider/Audit
`1/1/6`. Die abgefragten realen Legal-Entscheidungs- und Customer-Legal-
Consent-Zähler sind `0`.

## 3. Release-Lückenliste

| Funktion | Evidenzstatus | Nachweis | Releasegrenze / nächster Blocker |
| --- | --- | --- | --- |
| Git-Branch und Objekte | Hosted/Remote positiv geprüft | Frischer Fetch, Parität `0/0`, `fsck` PASS | Alter lokaler Checkout beschädigt; nicht mehr als Quelle verwenden |
| Cloudflare-Access-geschütztes Staging-Frontend | Hosted positiv aus bestehendem Prüfbericht | Authentifizierter Reload und anonyme Sperre im aktuellen 15.10.-Bericht | Kein Production-/öffentlicher Release-Nachweis; in diesem Paket nicht erneut mutierend geprüft |
| Owner-Auth und Tenantanlage | Hosted positiv geprüft | Ein Pending-Betrieb mit gebundener Branch-/Subscriptionzeile | Reale Aktivierung bleibt offen |
| KYB-Dokumentupload und TEST_ONLY-Review | Hosted positiv, ausschließlich synthetisch | Zwei TEST_ONLY Receipts/Audits; dokumentierte v3-Bytes | Reale KYB-Entscheidung, Aufbewahrungs-/Altbildprozess und echte Prüferfreigabe offen |
| Legal-/Plattformfassungen | Teilweise Hosted positiv, synthetisch | Je eine Testpublikation und Platform-Testpublikation | Reale Legal-/Privacy-Freigabe und reale Customer-Legal-Consents `0` |
| Aktivierungs-/Trial-Readiness | Hosted positiv, ausschließlich synthetisch | TEST_ONLY `2/2` | Reale Aktivierung und `activate_v1_manual_basic_trial` nicht nachgewiesen und weiter gesperrt |
| BASIC Testbetrieb, Offer, QR/PIN/Punkte | Hosted positiv, ausschließlich synthetisch | Grant-/Revoke-Historie, zwei Testpublikationen und vorhandene Testhistorie | Kein Nachweis des realen Entitlement-/Pending-Activation-Pfads; aktueller Grant geschlossen |
| PRO In-App Inbox | Hosted positiv, ausschließlich synthetisch | Consent, Notification, Open je `1`; Grant widerrufen | Reales PRO-Entitlement und kommerzielle Freigabe `0` |
| Mail | Hosted positiv nur für genau einen synthetischen Einmalpfad; real nur negativ | Test-Queue/Provider/Audit `1/1/6`, reale Deliveries `0/0` | Allgemeiner Dispatcher/Scheduler, reale Consents, Bounce/Complaint und Production-SMTP offen |
| Stripe TEST Checkout | Hosted positiv, isoliert | Request/Event/Audit `1/1/3`, historisches Replay HTTP 200 und idempotent | Kein realer Paid-Acceptance-/Entitlement-/Aktivierungspfad belegt |
| Stripe Abo-Lifecycle | Lokal positiv geprüft | Neuer isolierter Vertrag für paid renewal, failure, update/cancel und deletion | Migration/Function/Provider-Webhook noch nicht Hosted; keine reale Subscriptionwirkung |
| Refund, Chargeback, Proration, Tax | Offen / fail-closed | Nicht im erlaubten Eventset | Fachvertrag, Price-/Invoice-/Credit-Note-Bindung und eingeschränkte Providerrechte fehlen |
| Stripe LIVE / Seller | Nur negativ geprüft | LIVE unbound; Realzähler `0` | Seller, Tax, LIVE-Produkte/-Preise/-Webhook und formale Billing-Freigabe fehlen |
| Production-Rollout | Offen | Kanonischer Vertrag hält Production gesperrt | Aktuelle Production-Migration/App/Edge-Parität, Restore-Probe, Monitoring und Releasefreigabe fehlen |

### Priorität

1. **P0 Releaseblocker:** echte KYB/Legal/Privacy/Kassa-/AT-Freigaben und reale
   Aktivierungsentscheidung. Kein TEST_ONLY-Beleg ersetzt diese Gates.
2. **P0 Billingblocker:** Seller/Tax/Stripe-LIVE-Vertrag, reale Price-/Account-
   Bindung und ein separat autorisierter realer Paid-Entitlement-Pfad.
3. **P1 Lifecycle:** den vorliegenden isolierten Sandbox-Vertrag erst nach
   Review committen, auf Staging migrieren, Function fail-closed ausrollen und
   mit neuen isolierten Events testen.
4. **P1 Billing-Fachlücken:** Refund/Chargeback/Proration/Dunning-Recovery und
   Invoice-/Credit-Note-Semantik entscheiden; aktuell bewusst geschlossen.
5. **P1 Betrieb:** allgemeine Mailzustellung, Monitoring/Alarmierung,
   Backup-Restore-Nachweis und Production-Parität schließen.

## 4. Ursache und lokaler Lifecycle-Vertrag

Der vorhandene `test-only-stripe-webhook` verarbeitete ausschließlich
`checkout.session.completed`. Der ältere
`billing-stripe-test-webhook`/`record_basic_stripe_test_event` kennt zwar
Lifecycle-Events, schreibt aber in reale Subscriptiontabellen und ist deshalb
kein zulässiger isolierter positiver Sandbox-Nachweis.

Der neue Vertrag:

- übernimmt beim isolierten Checkout zusätzlich die exakte Customer- und
  Subscription-ID in einen unveränderlichen TEST_ONLY-Anker;
- kopiert die exakte Checkout-Metadatenbindung auf die Stripe-TEST-
  Subscription;
- akzeptiert nur `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated` und `customer.subscription.deleted`;
- prüft rohe Stripe-Signatur vor JSON, Account, Projekt, Origin, Tenant,
  Checkout-Request, Customer, Subscription, BASIC-Price, EUR 59,00,
  `livemode=false`, Zeitraum und Status;
- serialisiert Event und Subscription getrennt, speichert jedes Ereignis
  unveränderlich, behandelt identische Replays idempotent und protokolliert
  ungeordnete Ereignisse ohne rückwärts gerichtete Projektion;
- macht `CANCELLED_TEST` terminal;
- schreibt nur in `test_only_checkout.subscription_*` und niemals in reale
  Subscriptions, Entitlements, Trial, Aktivierung, Outbox oder Katalog;
- besitzt keinen Scheduler, keinen Outbound-Trigger und bleibt ohne explizites
  Function-Gate sowie ohne Secrets geschlossen.

Refunds wurden nicht erfunden: der kanonische Vertrag bezeichnet Refund,
Chargeback und Proration als unentschieden. `charge.refunded` bleibt daher
explizit abgewiesen.

Die vorhandenen getrennten Restricted Keys reichen für diesen lokalen
Vertrag: Stripe-Signatur plus Account-Readback. Es wurde kein Invoice- oder
Subscription-Leserecht angefordert oder erweitert.

## 5. Exakter Diff

Produkt-/Testscope: zehn Dateien, `+662/-10`. Zusätzlich dieser Pflichtbericht.

| Datei | Diff | SHA-256 nach Änderung |
| --- | ---: | --- |
| `supabase/config.toml` | `+5/-0` | `ed2898094ec5a710ffdf6554a79d2893b4e73107ca873c4e0fbcc74388ef31e6` |
| `supabase/functions/_shared/testOnlyStripeCheckout.mjs` | `+81/-2` | `9f496e1e75e1d39c3b0d79e4b076ff77b288673ff373ede285dc2b437bfabe6f` |
| `supabase/functions/test-only-stripe-webhook/index.ts` | `+1/-1` | `38aadd871f4c0dff18a1ae61d67457f42a08b474c21c95aec6574e9df05e0778` |
| `supabase/functions/test-only-stripe-lifecycle-webhook/index.ts` | `+50/-0` | `3f3167150ed6eda016cf6386a819981f55e6d4ead350e0f04274f96742112f13` |
| `supabase/migrations/20261015170349_test_only_stripe_subscription_lifecycle.sql` | `+272/-0` | `1ef33fde67877b5db68ee76c5fa9199dbb252f7330bbef81724a66ae014b9d65` |
| `tests/test-only-stripe-checkout.test.mjs` | `+4/-1` | `251124ad612ba6ec3b0dc324dec80bba90ca0beac5f5d25bdd5fafdbef57f109` |
| `tests/test-only-stripe-webhook-restricted-runtime.test.mjs` | `+7/-6` | `a2ce60552db89f351ab04469b48a7bea1d4cc5eff446fcacdc41afda7817cf65` |
| `tests/test-only-stripe-subscription-lifecycle.test.mjs` | `+68/-0` | `d648b46e0e43ffe8516f1b77fce719967a2bb9e855bbf7759f36d4c74b52c954` |
| `tests/test-only-stripe-lifecycle-webhook-runtime.test.mjs` | `+64/-0` | `c92bc3bb7a8776d0e296348b6d912558d92765019d22fe3994bc22d7105d33ae` |
| `tests/test-only-stripe-subscription-lifecycle.local.mjs` | `+110/-0` | `b492fe39ae8699369959be525e0331b18312692d1421c14fb2c18f8d0cb7ddea` |

Keine reale Billing-, UI-, Entitlement-, Aktivierungs-, Trial-, Mail- oder
Katalogdatei wurde geändert.

## 6. Prüfungen

- Fresh-Migrationen: **232/232 PASS**.
- Upgrade der neuen Migration auf bestehendem 231er-Wegwerfstack: **PASS**.
- Wiederholungs-Dry-Run: `applied=[]`.
- DB-Lint: `results=[]`.
- Lokaler Integrationslauf: ein Anker, sechs Lifecycle-Events, acht parallele
  Zustellungen, Replay PASS, out-of-order evidenzgesichert/nicht projiziert,
  terminale Kündigung sticky, Fremdtenant und falscher Preis DENIED, Refund
  CLOSED, reales Businessdelta `0`.
- ACL/RLS: vier neue Tabellen RLS-aktiv, keine direkte DML-Berechtigung für
  anon/authenticated/service_role; Writer und Readback nur explizit für
  `service_role` ausführbar; append-only Trigger aktiv.
- Edge-Runtime: unveränderte Function-Bytes unter
  `supabase-edge-runtime-1.74.3` / Deno 2.1.4 geladen; ohne Gate/Secrets
  HTTP 503 `TEST_ONLY_SUBSCRIPTION_LIFECYCLE_DISABLED`.
- Fokussierte Vertragstests: **21/21 PASS**.
- Gesamtsuite: **2515/2515 PASS**.
- Typecheck: **PASS**.
- Production-Build: **PASS**, 2201 Module. Das lokale Build nutzte die
  autoritative öffentliche Projekt-/Test-Control-Bindung und einen nicht
  auslieferungsfähigen lokalen Anon-Platzhalter; es wurde nicht deployed.
- Asset-Sammelhash: `0ec80f5a4ecf8d946edefed6b53a39778bc553144da3ab3f677e5db3e1f42c64`.
- Build-Projektreferenzen: neuer Ref 12 Vorkommen, bekannte alte Refs 0.
- Secret-Scan: keine Secretwerte; zwei erwartete `rk_live_`-Fragmente sind
  ausschließlich negative Testliterale.
- `git diff --check`: **PASS**.

## 7. Konkreter späterer Hosted-Testplan

Dieser Plan ist nicht Bestandteil des aktuellen Schreibscopes:

1. Zehn Produkt-/Testdateien erneut hashen, engen Commit erstellen, Remote-Tip
   frisch prüfen und nur per normalem Fast-forward integrieren.
2. Hosted-Zustand erneut lesen: Projekt/Issuer/Origin, STAGING, AT BLOCKED,
   Checkout `1/1/3`, BASIC geschlossen, reale Zähler `0`.
3. Migration `20261015170349...` ausschließlich auf
   `mbgveqbhessaunrhfudm` anwenden; ACL/RLS, `0/0/0/0` neue
   Lifecycle-Tabellen und leeren Repeat lesen.
4. Bestehenden Checkout-/Webhook-Code und neue Lifecycle-Function bytegleich
   deployen. Lifecycle-Gate bleibt `false`; ohne Binding/Secret/signierte
   Events muss die Function 503/400 liefern.
5. Separaten Stripe-TEST-Webhook ausschließlich für die vier erlaubten Events
   anlegen. Keine Connect- und keine LIVE-Zustellung. Exakte Account-/Endpoint-
   und Signatursecret-Bindung lesen.
6. Erst in einem separaten autorisierten Test einen neuen isolierten Checkout
   erzeugen, um den Customer-/Subscription-Anker unter den neuen Bytes zu
   erhalten. Reale Paid-Acceptance und Entitlement bleiben `0`.
7. Mit exakt dieser Subscription kontrolliert je ein signiertes Renewal-,
   Failure-, Cancel-at-period-end- und Deleted-Testevent prüfen. Vor jedem
   Event Zähler lesen; identisches Replay muss HTTP 200/idempotent sein;
   ungeordnetes Event darf die Projektion nicht zurücksetzen.
8. Gate schließen, Webhook deaktivieren/entfernen und nur testbezogene
   Function-Secrets gemäß Rückfallplan entfernen. Immutable Belege bleiben.
9. Reale Subscriptions, Entitlements, Aktivierung, Trial, PRO, Mail, Katalog
   und LIVE erneut mit Delta `0` nachweisen.

Refund/Chargeback/Proration bleiben bis zu einem eigenen fachlichen und
technischen Vertrag außerhalb dieses Plans.

## Abschluss

- Ursache: Checkout-TEST war isoliert belegt, der Abo-Lifecycle hatte keinen
  gleichwertigen isolierten positiven Vertrag.
- Was wurde geändert: ausschließlich TEST_ONLY-Checkout-Anker,
  Lifecycle-Parser/-Function, additive private Evidenztabellen und Tests.
- Was wurde nicht geändert: Hosted, reale Billingpfade, Aktivierung, Trial,
  Entitlements, PRO, Mail, Katalog, Cloudflare und Stripe Providerzustand.
- Migration erstellt: Ja.
- Migration auf Staging angewendet: Nein.
- `npx supabase db push --include-all`: Nein, bewusst ausgeschlossen.
- Relevante RPCs lokal erreichbar: Ja.
- Relevante RPCs Hosted erreichbar: Nein; Migration nicht installiert.
- Desktop geprüft: nicht UI-relevant.
- Tablet geprüft: nicht UI-relevant.
- Mobile geprüft: nicht UI-relevant.
- Risiko: Hosted-Lifecycle noch ungeprüft; Refund-/Tax-/LIVE-/Real-Entitlement-
  Verträge bleiben offen.
- Status: **CODE LOCK / HOSTED NOT READY**.
