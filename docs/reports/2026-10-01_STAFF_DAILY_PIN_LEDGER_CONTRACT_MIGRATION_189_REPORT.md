# Migration 189 – Staff-Tages-PIN und Ledgervertrag

Datum: 2026-10-01
Branch: `codex/v1-release-integration`

## Ursache

Der bisherige Staff-Tages-PIN-RPC schrieb den `earn`-Ledgerpfad ohne den seit dem kanonischen Punktevertrag verpflichtenden `collection_source`. Der unveränderte Check-Constraint blockierte diesen inkonsistenten Insert korrekt. Die historische konkrete Serverantwort ist nicht dauerhaft als Primärevidenz gespeichert; der aktuelle Code-/Schema-Widerspruch ist dagegen lokal reproduzierbar und behoben.

## Vertrag und Änderung

- Kanonischer Source für den kompatiblen, vom Customer initiierten Staff-Suchpfad: `customer_initiated`.
- Der primäre QR-Pfad bleibt unverändert `restaurant_controlled`.
- Neuer RPC `apply_staff_daily_pin_loyalty_action_v2` akzeptiert ausschließlich geprüfte Integer-Cents und einen Idempotency-Key.
- Punkte werden ausschließlich serverseitig über `award_points_v1` berechnet.
- Staff-, PIN-, Tenant-, Membership-, RLS-, Betrags-, Tageslimit- und Idempotenzgrenzen bleiben fail-closed.
- Der alte Amount-/Menü-RPC antwortet deterministisch mit `STAFF_POINTS_RPC_UPGRADE_REQUIRED`; der bestehende Stamp-Pfad bleibt kompatibel.
- Keine Constraint-Lockerung, kein Backfill, keine Ledgerlöschung und keine Änderung von Tarifen, Limits oder Reward-Schwellen.

Migration: `20261001001000_staff_daily_pin_ledger_contract.sql`
SHA-256: `c14556ed4fd72a987d1bde6fdf27f95ba79a3f5b704cc9d017b4ee2b22cd1b1c`

## Lokale Nachweise

- Fresh Replay: 189/189 PASS.
- Upgrade: 188 → 189 PASS; v2 war vor dem Upgrade nicht vorhanden.
- Repeat-Dry-Run 1/2: leer / PASS.
- Repeat-Dry-Run 2/2: leer / PASS.
- DB-Lint `public` und `extensions`: 0 Fehler.
- Fokussierte Source-/UI-/Security-Tests: 73/73 PASS.
- Full Suite: 2155/2155 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen.
- Build mit ausschließlich lokalen Supabase-Clientbindungen: PASS.
- `git diff --check`: PASS.
- Secret Scan des jeweiligen Commitumfangs: PASS.
- Migrationen 001–188: im Diff unverändert.

## Reales synthetisches lokales E2E

- Getrennte Platform-Admin-, Owner-, Staff- und Customer-Identitäten.
- TEST_ONLY-Tenant und befristeter lokaler PRO-Testgrant ausschließlich als synthetische Fixture.
- Tages-PIN und Rechnungsbetrag `62,00 EUR` / `6200` Integer-Cents.
- 24 parallele identische Requests: exakt ein Collection-Request, eine Earn-Buchung und ein Transaktions-Identifier.
- `collection_source = customer_initiated`, Betrag `6200`, serverseitig berechnete 62 Punkte.
- Erstmalige Reward-Schwelle: exakt ein Reward-Inboxeintrag.
- E-Mail, Push und Scheduler: 0.
- Idempotente Wiederholung: dieselbe Transaktion; abweichender Payload mit gleichem Key: blockiert.
- Owner, Customer, Anonymous, Platform Admin, Service Role, gesperrter Staff, falscher Customer/Tenant, direkter Ledger-Insert und ungültige Beträge: blockiert.
- Falsche PIN: blockiert; keine Punktebuchung.
- Shared-Storage-Rollenwechsel Staff → Platform Admin: Staff-RPC fail-closed, 0 Punktewrites.
- Cleanup: Grant widerrufen; alle lokalen synthetischen Auth- und Businessfixtures entfernt.

## Commits

- DB/Security/E2E: `152a6be` – `fix(points): bind staff daily PIN flow to ledger contract`
- UI/Fehlerklassifizierung: `8d2a9d6` – `fix(staff): accept exact invoice cents and classify failures`
- Lokaler Code-Lock-Bericht: `b4c0153e7aa3f858e913c46403ed926b201d40eb` – `docs(points): record migration 189 local code lock`
- Remote-Parität nach Push: `0/0` bei `b4c0153e7aa3f858e913c46403ed926b201d40eb`.

## Staging-Anwendung und Web-Deployment

- Projektidentität: verifiziertes Staging-Projekt `wuxuai-bonus-staging`; Production war nicht verknüpft und wurde nicht aufgerufen.
- Ausgangsstand: 188/188; der Dry-Run plante ausschließlich Migration 189.
- Migration 189: kontrolliert angewendet; Endstand 189/189.
- Remote Repeat-Dry-Run: leer / PASS.
- DB-Lint `public` und `extensions`: 0 Fehler / PASS.
- RPC-ACL und RLS der betroffenen Punkte-, Request- und Idempotenzrelationen: PASS.
- `points_transactions_earn_source_check`: Definition unverändert; ausschließlich `restaurant_controlled` und `customer_initiated` bleiben zulässig.
- Geschützter Staging-Businessfingerprint vor/nach Migration: `148|6827|7fdb09610d8a2618e7d761819b23043c` / identisch.
- Aktiver Staging-Worker: `wuxuai-restaurant-bonus-app-staging`.
- Deployment-ID: `6bd02fb2-1066-4054-abc4-ae4d94a8793d`.
- Worker-Version: `da6cdabd-3635-4f7c-9c5d-59817c72bb63`, 100 Prozent aktiv.
- Ausgeliefertes Hauptasset: `/assets/index-CVNsnyfF.js`.
- Asset-SHA-256 lokal und ausgeliefert: `00dcce39df4b3f89393d532caa861ee77782643acc31e173a1028d357e2e668d` / bytegleich.
- Öffentlicher Staging-Healthcheck: HTTP 200.
- Service-Role-, Production-Projektreferenz- und Secret-Scan des Bundles: PASS.

## Physischer Staging-Feldtest

- Staff-Route des synthetischen TEST_ONLY-Tenants war serverseitig erreichbar.
- Rechnungsbetrag leer: PASS; das Feld sprang nicht auf `0` zurück.
- `62`: PASS; Anzeige 62 Punkte.
- `62,00`: PASS; Anzeige blieb 62 Punkte.
- `62.00`: PASS; Anzeige blieb 62 Punkte.
- Abbruch erfolgte über `Zur Startseite` ohne Tages-PIN und ohne Klick auf `Punkte buchen`.
- Sichtbare Tagesstatistik blieb bei 0 Bonuspunkten; der Testpfad führte keinen Buchungs-RPC aus.
- Staging-Punkte-, Reward-, Inbox- und PRO-Testgrant-Writes: 0.
- Evidenzgrenze: Das sichtbare Chrome-Fenster war mit Profilname `Dongdong` gekennzeichnet. Der schreibfreie UI-Test ist dadurch nicht entwertet; ein späterer positiver Punkte-/Reward-Test erfordert weiterhin ein physisch getrenntes Staff-Profil und darf aus diesem Nachweis nicht abgeleitet werden.

## Weiterhin offen

- Ein neuer positiver Staging-Punkteversuch ist nicht Bestandteil dieses Loops.
- Ein Staging-PRO-Testgrant wurde nicht erstellt.
- Der physische positive Staging-Reward-/Inbox-Flow bleibt separat freizugeben und in getrennten Browserkontexten auszuführen.

## Unverändert

Production, Stripe, LEGACY-Tenant, BASIC-Final-Code-Lock außerhalb dieses bestätigten Releasefehlers, bestehende Ledgerdaten und bestehende Membership-/Tokendaten wurden nicht verändert.

## Status

`STAFF DAILY-PIN LEDGER CONTRACT LOCAL PASS / MIGRATION 189 STAGING APPLIED / AMOUNT INPUT UX STAGING DEPLOYED / PHYSICAL POSITIVE STAGING REWARD FLOW OPEN`
