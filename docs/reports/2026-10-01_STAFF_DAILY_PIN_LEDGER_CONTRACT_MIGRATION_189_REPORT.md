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

## Noch nicht ausgeführt

- Migration 189 ist in diesem Bericht noch nicht auf Staging angewendet.
- Staging-Web-App ist noch nicht aus `8d2a9d6` deployt.
- Der physische Staging-Feldtest ist noch offen.
- Ein neuer positiver Staging-Punkteversuch und ein Staging-PRO-Testgrant bleiben ausdrücklich gesperrt.

## Unverändert

Production, Stripe, LEGACY-Tenant, BASIC-Final-Code-Lock außerhalb dieses bestätigten Releasefehlers, bestehende Ledgerdaten und bestehende Membership-/Tokendaten wurden nicht verändert.

## Status

`LOCAL CODE LOCK / STAGING MIGRATION AND WEB RESTGATE OPEN`
