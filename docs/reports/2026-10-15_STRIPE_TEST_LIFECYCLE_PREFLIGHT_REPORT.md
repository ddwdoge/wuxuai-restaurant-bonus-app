# Stripe-TEST-Lifecycle – lokaler Preflight

Datum: 2026-10-15

Projekt: `mbgveqbhessaunrhfudm`

Origin: `https://staging-v2.bonus.wuxuaisbi.com`

Stripe-TEST-Konto: `acct_1UIqrj59e5GrFXdM`

Basis: `bc190c3b0db680b96b784b90da1dbdf1b4b281f2` (`origin/codex/v1-release-integration`, Ahead/Behind `0/0`)

## Ergebnis

Der bisherige Checkout konnte keine Stripe-Subscription auf einer Test Clock erzeugen: Die Checkout Session enthielt keinen vorhandenen `customer`; Stripe erzeugte daher einen normalen TEST-Customer. Der engste lokale Kandidat erzeugt jetzt vor der Session genau eine idempotente Test Clock und genau einen daran gebundenen TEST-Customer. Die Checkout Session erhält dessen exakte Customer-ID. Eine neue private, unveränderliche DB-Zuordnung bindet Clock, Customer, Projekt, Organisation, Restaurant, Filiale und Checkout-Request. Der vorhandene Lifecycle-Anchor wird ohne diese Zuordnung serverseitig abgewiesen.

Es gab keine Hosted-, Stripe- oder Cloud-Änderung. Beide Enable-Gates bleiben geschlossen. Es wurden kein Schlüssel, Webhook, Test Clock, Customer, Checkout, Event, Grant, Abonnement oder Businesswrite erzeugt.

Status: **CODE LOCK**. Nach dem Docker-Update antwortete die Engine wieder. Der Kandidat ist jetzt statisch, im Runtime-Harness, auf echten lokalen Fresh-/Upgrade-Supabase-Stacks und im lokalen Lifecycle-DB-Flow geprüft. Hosted-Migration, Deployment und Stripe-Providerflow bleiben ausdrücklich offen; deshalb kein FINAL LOCK.

## Ursache und Abgrenzung

Ursache der ursprünglichen Lücke war zweigeteilt: Der bestehende Checkout erzeugte keinen an eine Test Clock gebundenen Customer, und die damals nicht erreichbare lokale Docker Engine blockierte den verpflichtenden echten Fresh-/Upgrade- sowie DB-Nachweis. Der Produktkandidat ergänzt ausschließlich die isolierte TEST_ONLY-Clock-/Customer-Bindung; der Prüf-Harness berücksichtigt nun den tatsächlich vorhandenen Migrationssatz einschließlich der neuen Migration.

Geändert wurden ausschließlich die unten aufgeführten neun Produkt-/Testdateien sowie dieser Bericht. Nicht geändert wurden Hosted-Systeme, Stripe-Objekte, Enable-Gates, reale Subscription-/Entitlement-/Trial-/Aktivierungswriter und die vorhandenen gestoppten Docker-Ressourcen. Da keine UI-Datei geändert wurde, sind Desktop-, Tablet- und Mobile-Prüfungen in diesem Scope nicht anwendbar.

## Tatsächlicher Aufrufpfad

1. Owner-UI → `test-only-stripe-checkout` mit verifiziertem User-JWT.
2. Projekt-, Issuer-, Origin-, Owner-, Tenant-, BASIC-Grant- und Checkout-Gate-Prüfung bleiben unverändert.
3. Checkout-Key und neuer Lifecycle-Setup-Key lesen unabhängig `/v1/account`; beide müssen exakt auf das gebundene TEST-Konto zeigen und voneinander sowie vom Webhook-Key verschieden sein.
4. `prepare_test_only_stripe_checkout` erzeugt ausschließlich den isolierten Checkout-Request.
5. Bei der ersten Ausführung:
   - `POST /v1/test_helpers/test_clocks` mit deterministischem Idempotency-Key,
   - `POST /v1/customers` mit exakt dieser Clock und fünf gebundenen Metadaten,
   - unveränderlicher DB-Beleg `TEST_CLOCK_CUSTOMER_BOUND`.
6. `POST /v1/checkout/sessions` enthält den exakten `customer`; Session, Customer, Preis und Tenant werden zurückgelesen.
7. `checkout.session.completed` bleibt am getrennten Checkout-Webhook. Erst dessen signierter, provider-gelesener Beleg darf den isolierten Lifecycle-Anchor erzeugen.
8. Die vier Lifecycle-Eventtypen bleiben am getrennten Lifecycle-Webhook und schreiben ausschließlich synthetische Tabellen.

## Minimal notwendige Stripe-Rechte

### Bestehende Schlüssel unverändert

- Checkout-Runtime-Key: `Accounts: Read`, `Checkout Sessions: Write`.
- Checkout-Webhook-Read-Key: `Accounts: Read`, `Checkout Sessions: Read`.
- Keine Erweiterung dieser Schlüssel.

### Neuer, getrennter Lifecycle-Setup-Key

Name: `wuxuai-staging-v2-lifecycle-setup`

- `Accounts: Read` – exakter Account-Readback vor jedem Providerwrite.
- `Customers: Write` – einmaliges Erzeugen und exakter Readback des Test-Customers.
- `Test Clocks: Write` – Erzeugen, Readback, spätere Zeitfortschaltung und Cleanup der Clock.
- Alle übrigen Ressourcen: `None`.
- Keine Checkout-Session-, Subscription-, Invoice-, Refund-, Payment-Intent- oder Connect-Berechtigung.
- Falls Stripe im Dialog `Accounts: Read` nicht sicher auf das eigene Konto ohne Connect-Lesereichweite begrenzen kann, ist das vor Erstellung ein Stopgrund. Diese bekannte zusätzliche mögliche Lesereichweite muss ausdrücklich akzeptiert werden.

Die laufende Function braucht keinen Subscription-Read-Zugriff: Sie erhält Customer und Subscription aus dem signierten Checkout-Event; der Lifecycle-Webhook erhält Subscription-/Invoice-Daten aus den signierten Events. Für einen optionalen API-Readback wäre ein separater kurzlebiger Observer-Key nötig (`Accounts`, `Customers`, `Subscriptions`, `Test Clocks`: jeweils `Read`; alles andere `None`). Er darf nicht mit einem Runtime-Key zusammengelegt werden.

Maßgebliche aktuelle Stripe-Dokumentation:

- Checkout Session mit vorhandenem Customer: <https://docs.stripe.com/api/checkout/sessions/create>
- Test Clocks erstellen, lesen, fortschalten und löschen: <https://docs.stripe.com/api/test_clocks>
- Test-Clock-Simulation und Cleanup: <https://docs.stripe.com/billing/testing/test-clocks/simulate-subscriptions>
- Customer wird nur bei seiner Erstellung an eine Test Clock gebunden: <https://docs.stripe.com/api/customers>
- Restricted Keys und ressourcenbezogene Rechte: <https://docs.stripe.com/keys>
- Events und Webhook-Endpunkte: <https://docs.stripe.com/api/events> und <https://docs.stripe.com/api/webhook_endpoints>
- Testkarten: <https://docs.stripe.com/testing>

## Eigener Lifecycle-Webhook

Späterer TEST-Account-Endpunkt:

`https://mbgveqbhessaunrhfudm.supabase.co/functions/v1/test-only-stripe-lifecycle-webhook`

Exakt zugelassene Eventtypen:

- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Vorgaben: TEST-Modus, Account-Webhook, keine Connect-Zustellung, keine Wildcards, keine weiteren Events. Das Signatursecret wird vom Founder persönlich in die geschützte lokale Datei eingetragen; kein Browserwerkzeug liest die Secretanzeige. Vorbereiteter Pfad:

`/private/tmp/wuxuai-staging-v2-stripe-lifecycle/provider-input.env`

Verzeichnisrechte `700`, Dateirechte `600`; beide Secretfelder sind derzeit leer.

## Ausführbarer Einmal-Testplan

### Geschlossener Ausgangszustand

1. Projekt, Issuer, Origin, Account, Produkt und Preis frisch lesen.
2. `TEST_ONLY_STRIPE_CHECKOUT_ENABLED=false` und `TEST_ONLY_STRIPE_LIFECYCLE_ENABLED=false` bestätigen.
3. Keine aktive BASIC-Testfreigabe; Realzähler und isolierte Lifecycle-Zähler unverändert.
4. Migration, Hosted-Function-Bytes und getrennte Secrets erst nach Fresh-/Upgrade-PASS ausrollen; Functions zunächst geschlossen prüfen.

### Genau eine isolierte Subscription

1. Founder bestätigt frisches Platform-TOTP in der UI; kurzer BASIC-Testgrant, Receipt und Ablauf werden gelesen.
2. Checkout-Gate kurz öffnen und genau einen neuen Owner-App-Checkout starten.
3. Initiale Zahlung mit Stripe-Testkarte `4242 4242 4242 4242` persönlich abschließen.
4. Der Checkout-Webhook muss genau einen Request, ein `checkout.session.completed`-Event, die Clock-/Customer-Zuordnung und einen Lifecycle-Anchor erzeugen. Erwarteter Checkout-Audit-Zuwachs für diesen neuen Request: vier Belege (`REQUEST_PREPARED`, `TEST_CLOCK_CUSTOMER_BOUND`, `SESSION_CREATED`, `CHECKOUT_SESSION_COMPLETED`).
5. Checkout-Gate sofort schließen und BASIC-Grant regulär widerrufen.

### Provider-Lifecycle ohne automatisches Ereignisrauschen

1. Die Stripe-Lifecycle-Vorgänge zunächst ohne aktiven Lifecycle-Endpunkt durchführen; dadurch entstehen keine unkontrollierten Zustell-Retries gegen die App.
2. Test Clock um eine Abrechnungsperiode fortschalten. Die erfolgreiche Verlängerung erzeugt ein neues `invoice.paid`.
3. Für den Customer die Stripe-Testkarte `4000 0000 0000 0341` als Standard hinterlegen; sie lässt sich anhängen, spätere Abbuchungen schlagen fehl.
4. Clock erneut fortschalten. Erwartet: `invoice.payment_failed` und ein `customer.subscription.updated` mit `past_due`.
5. Subscription im TEST-Dashboard kündigen. Erwartet: bei sofortiger Kündigung `customer.subscription.deleted`; bei Kündigung zum Periodenende zuerst `customer.subscription.updated`, nach der nächsten kontrollierten Fortschaltung `customer.subscription.deleted`.
6. Erst nachdem alle Providerereignisse vorhanden sind, den eigenen Account-Webhook mit den vier exakten Typen anlegen, sein Secret geschützt ablegen und das Lifecycle-Gate kurz öffnen.

### Deterministische Zustellung und Negativbeweise

Die ausgewählten vorhandenen Stripe-Events werden einzeln manuell erneut zugestellt:

1. neuere Verlängerung `invoice.paid` → `ACTIVE_TEST`, `projection_applied=true`;
2. ältere initiale `invoice.paid` → Eventbeleg, aber `projection_applied=false`;
3. dasselbe ältere Event erneut → HTTP 200, `idempotent=true`, keine Zähleränderung;
4. `invoice.payment_failed` → `PAST_DUE_TEST`;
5. passendes `customer.subscription.updated` → gebundener Statusbeleg;
6. `customer.subscription.deleted` → `CANCELLED_TEST`.

Damit entstehen mindestens fünf unterschiedliche Lifecycle-Eventobjekte, weil `invoice.paid` für Initialzahlung und Verlängerung je eine eigene Event-ID besitzt. Zusätzliche natürliche `customer.subscription.updated`-Events werden nicht pauschal zugestellt, sondern erst nach exaktem Binding-Readback einzeln ausgewählt.

Bereits lokal geprüft: falsche Signatur, LIVE, falscher Account, fremder Tenant, falscher Customer/Subscription/Preis, manipulierte Metadaten, Replay, Parallelität, ältere Events und Refund-Eventtypen. Reale Subscription-, Entitlement-, Trial- und Aktivierungswriter bleiben unberührt.

### Cleanup und Rückfall

1. Lifecycle-Gate schließen.
2. Account-Webhook deaktivieren und anschließend entfernen.
3. Lifecycle-Webhook-Secret aus Hosted Secrets entfernen; lokalen Secretwert löschen.
4. Test-Clock-Simulation beenden beziehungsweise Clock löschen. Stripe entfernt die daran gebundenen TEST-Objekte; synthetische DB-Belege bleiben unveränderlich.
5. Setup-Secret aus Hosted entfernen, Restricted Key widerrufen und lokalen Secretwert löschen.
6. Beide Gates, fehlende aktive Grants, geschlossene Owner-Aktionen und unveränderte reale Tabellen/Zähler erneut lesen.
7. Refunds, Chargebacks, Proration und Stripe LIVE bleiben außerhalb dieses Laufs.

## Exakte Founder-Schritte – noch nicht ausführen

1. Nach CODE-/Migration-LOCK im bestätigten Stripe-TEST-Konto den Restricted Key `wuxuai-staging-v2-lifecycle-setup` mit exakt `Accounts: Read`, `Customers: Write`, `Test Clocks: Write`, sonst `None`, Connect aus, erstellen.
2. Die Rechteübersicht vor dem Erstellen visuell kontrollieren. Bei nicht trennbarer Connect-Reichweite stoppen.
3. Den Key persönlich kopieren und ausschließlich in `TEST_ONLY_STRIPE_LIFECYCLE_SETUP_RESTRICTED_KEY=` der geschützten lokalen Datei eintragen; „gespeichert und geschlossen“ melden.
4. Den Lifecycle-Webhook erst im oben beschriebenen späteren Schritt als Account-Webhook anlegen; vier Eventtypen einzeln auswählen, Connect aus.
5. Das `whsec_…` persönlich in `TEST_ONLY_STRIPE_LIFECYCLE_WEBHOOK_SECRET=` derselben Datei eintragen; Secretanzeige schließen und nur „gespeichert und geschlossen“ melden.
6. TOTP, Testkartendaten, Clock-Fortschaltung, Zahlungsartenwechsel und Kündigung jeweils persönlich in den vorgesehenen UIs durchführen; keine Codes oder Secrets im Chat.

## Geänderte Dateien und SHA-256

- `supabase/functions/_shared/testOnlyStripeCheckout.mjs` — `6ffa82ff5f6a2b4004fab45bfefb38e8874d84eeec2d45e932a4d251d2d7dea3`
- `supabase/functions/test-only-stripe-checkout/index.ts` — `81036992ac20ff37ceac21881708354ea3286298ded4ef460b59e9fb20d264cd`
- `supabase/migrations/20261015174851_test_only_stripe_test_clock_customer_binding.sql` — `d0c9d8a415e78d877717a1ebe455c44a79ea032ddf9f6a44b24529ea73db6a09`
- `tests/project-binding-runtime.local.mjs` — `df763c8e5f26d60259549bbd8360edf7d4eff5540610a302790df677de53f7e5`
- `tests/test-only-stripe-checkout.local.mjs` — `00ed4c0eadc0f5c39098671325a9901a7853cfba8028d097282506148e1012cc`
- `tests/test-only-stripe-checkout.test.mjs` — `ef374d6a8f5717ced17f46e90e127e8b487650438b3628805a3bd63f22fbefdc`
- `tests/test-only-stripe-restricted-key-runtime.test.mjs` — `c96e519f61f5f0de382ba6c5da047c1ad70914a5b0123ee63413336c78c195bc`
- `tests/test-only-stripe-subscription-lifecycle.local.mjs` — `0b4fe93ef39a9781ad360b1df14c04c9a42bfe373d056a23b044a267bf80f932`
- `tests/test-only-stripe-test-clock-customer.test.mjs` — `aa9fe8c84d3dde567855b4d1a8ef89946910ee072f6faf0e3820cf1190ab7724`

Der bereits vorhandene ungetrackte Hosted-Rollout-Bericht wurde nicht verändert und gehört nicht zu diesem Scope.

Der Produkt-/Testscope umfasst exakt neun Dateien mit `+507/-265` Zeilen. Der vorliegende Bericht ist das getrennte zehnte Prüfartefakt.

## Prüfergebnisse

- Fokussierte Stripe-Tests: `26/26` PASS.
- Gesamte Repository-Suite: `2516/2516` PASS.
- Typecheck: PASS.
- Production-Build: PASS, 2201 Module.
- `git diff --check`: PASS.
- Secret-Muster: PASS; Treffer ausschließlich absichtliche synthetische Negativtest-Literale.
- Fresh-/Upgrade-Migrationsstack: PASS auf zwei echten lokalen Supabase-Stacks. Beide Stacks enthalten `233/233` Migrationen. Im Upgrade-Stack wurden `20261009190125_project_binding_runtime_guards.sql` und `20261015174851_test_only_stripe_test_clock_customer_binding.sql` entfernt und anschließend in Reihenfolge erneut angewendet. Eigentümer- und ACL-Diff: PASS; Wiederholungslauf: leer; Projekt-Bootstrap-Lint: PASS; `LOCAL_RUNTIME_BINDING_PASS` mit 129 Assertions.
- Lokaler Lifecycle-DB-Flow: PASS (`TEST_ONLY_STRIPE_SUBSCRIPTION_LIFECYCLE_LOCAL_PASS`). Ein Anchor, sechs Lifecycle-Events, acht parallele Zustellungen, idempotentes Replay, fremder Tenant und falscher Preis abgewiesen, älteres Ereignis nur mit Beleg und ohne Projektion, Kündigung terminal, Refund geschlossen.
- Lokaler DB-Readback: `customer_preparations=1`, `subscription_anchors=1`, `subscription_events=6`, `subscription_audit=7`; reale `paid_acceptances=0`, `branch_subscriptions=0`, `entitlements=0`, `trial_claims=0`, `real_activation=0`.
- RLS/ACL tatsächlich geprüft: PASS. Alle fünf neuen Tabellen haben RLS aktiv; `anon`, `authenticated` und `service_role` besitzen keine direkten `SELECT`-/`INSERT`-/`UPDATE`-/`DELETE`-Rechte. Der Schema-Lint auf `test_only_checkout` meldet keine Fehler.
- Deno-CLI: lokal nicht installiert; Edge-Laufzeit durch den bestehenden isolierten Node-Edge-Harness geprüft.
- Lokaler Wiederholungs-Dry-Run: leer (`applied=[]`).
- Docker-Ressourcen: Die sechs vorgefundenen gestoppten Container und alle vorgefundenen Volumes blieben erhalten. Der lokale Prüfstack wurde regulär gestoppt; ausschließlich sein neu erzeugtes, danach unreferenziertes DB-Testvolume wurde entfernt.
- Hosted-Migration: nicht angewendet.
- Hosted-Flow: nicht ausgeführt.

## Verbleibende Voraussetzungen

Der lokale Kandidat ist CODE LOCK. Für FINAL LOCK fehlen weiterhin der eng freigegebene Integrationscommit, die Migration ausschließlich auf `mbgveqbhessaunrhfudm`, der geschlossene Function-Rollout, der Hosted-Negativtest und der einzeln kontrollierte Stripe-TEST-Lifecycle mit anschließendem Rückfall. In diesem Auftrag wurden diese Schritte bewusst nicht ausgeführt.

## Pflichtabschluss

- Aufgabe: Stripe-TEST-Lifecycle und Test-Clock-Customer-Bindung lokal vorbereiten
- Build: Ja
- Migration: Erstellt / Nicht angewendet
- Flow-Test: Ja (lokaler DB-Flow); Hosted Nein
- RLS/Security: Ja (statisch, Runtime-Harness und echter lokaler DB-Stack)
- Alte Logik geprüft: Ja
- Report: `docs/reports/2026-10-15_STRIPE_TEST_LIFECYCLE_PREFLIGHT_REPORT.md`
- Prüf-ZIP: `exports/2026-10-15_STRIPE_TEST_LIFECYCLE_PREFLIGHT.zip`
- Offene Risiken: Hosted-Migration, Function-Rollout und positiver Stripe-TEST-Lifecycle noch nicht ausgeführt
- Status: CODE LOCK
