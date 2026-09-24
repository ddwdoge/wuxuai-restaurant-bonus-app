# Phase 7C.6C3B2B – Owner-only Staging Checkout Restgate

Stand: 2026-09-24. Branch `codex/v1-release-integration`, Ausgangs-HEAD `6022445391a0258c4dab32676c5b2c8c3369b008`. Verifiziertes Staging-Projekt: `bwhvfjuwixgwduoeqaya`. Migrationen: 168/168, in diesem Gate unverändert. Checkout-Edge-Funktion v6 unverändert; kein Deployment.

## Ursache und enger Umfang

Offen war der physische authentifizierte Owner-Checkout-Negativtest. Der frühere Staff-Test, CORS-Code, lokale Full Suite, Migrations- und Webhook-Tests wurden nicht wiederholt. Der Owner wurde über die bestehende Chrome-Sitzung geprüft; Auth-ID-Verschiedenheit, Owner-/Staff-Rollen und gemeinsamer Testbetrieb wurden serverseitig ausschließlich als boolesche Ergebnisse abgefragt. Die Session war vorhanden und nicht abgelaufen. Ein Access-Token wurde nur innerhalb einer einzelnen Ausführung im ursprünglichen Chrome-Tab für den Authorization-Header des freigegebenen Staging-Checkout-Endpunkts referenziert; kein Tokenwert wurde ausgegeben, exportiert, gespeichert oder für einen anderen Endpunkt verwendet.

## Physischer Negativtest

- Vorher: technische Inbox **1**, Checkout-Audit **0**, Subscriptions **16**.
- Vier vorhandene Code-Vertragsnamen wurden temporär ausschließlich über `supabase secrets set --env-file` gesetzt: `BILLING_ARCHITECTURE_MODE`, `BILLING_STAGING_PROJECT_REF`, `BILLING_ENVIRONMENT`, `BILLING_STAGING_ALLOWED_ORIGIN`. Die geschützte Datei lag außerhalb des Repositorys (Verzeichnis 0700, Datei 0600); keine Stripe- oder Webhook-Secrets wurden gesetzt.
- Exakter Staging-Origin: OPTIONS **204**, CORS-Origin exakt passend.
- Ein authentifizierter Owner-POST: **403 `KYB_NOT_VERIFIED`**. Die Owner-Rollenprüfung wurde durchlaufen; der Readiness-Guard blockierte vor dem Providerpfad.
- **24** parallele identische Owner-POSTs mit demselben Request/Payload: **24/24 403 `KYB_NOT_VERIFIED`**.
- Die Architektur enthält im Staging-Negativmodus keinen erreichbaren Provideradapter-/Session-Creator-Aufruf. Stripe-/Provideraufrufe: **0**; positive Aktivierungen: **0**.
- Nachher: technische Inbox **1**, Checkout-Audit **1** (genau ein idempotenter blockierter Request), Subscriptions **16**. Vorher/Nachher-MD5 der gesamten Subscription-, Restaurant-, Country-Policy- und Seller-Version-Zeilen waren jeweils identisch. Trial-/Periodenfelder sind im Subscription-Fingerprint enthalten. Es wurden keine Subscription-, Trial-, Entitlement- oder Geschäftsdaten durch diesen Negativpfad verändert.

## Cleanup und Grenzen

Alle vier task-eigenen temporären Secret-Namen wurden per `supabase secrets unset` entfernt; die anschließende Secret-Namensliste enthielt keinen davon. Die lokale Env-Datei und das task-eigene Temp-Verzeichnis wurden entfernt. Ein nachfolgender anonymer Checkout-POST blieb **401**. Keine Migration, kein Edge-/Frontend-Deployment, keine Stripe-API, kein Webhook, keine Production-Aktion. Vorbestehende fremde Datei `supabase/.temp/cli-latest` und vorbestehender ungetrackter B1-Bericht blieben unangetastet.

Der Lock bestätigt ausschließlich die negative Checkout-/Webhook-Architektur. Positiver Stripe-Checkout, Zahlung, Trial, Entitlement-Aktivierung und LIVE bleiben offen beziehungsweise gesperrt. Der vorangegangene Staff-Resttest und signierte Webhook-Gate sind separate bestehende Evidenz; sie wurden hier nicht erneut ausgeführt.

Status: **PHASE 7C.6C3B STAGING NEGATIVE BILLING RESTGATE LOCK**.
