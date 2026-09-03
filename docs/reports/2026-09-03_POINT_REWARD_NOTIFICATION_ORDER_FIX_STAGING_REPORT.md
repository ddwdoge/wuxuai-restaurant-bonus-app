# WUXUAI Bonus - Point Reward Notification Order Fix

Datum: 2026-09-03
Umgebung: Staging `bwhvfjuwixgwduoeqaya`
Production: unveraendert und gesperrt

## Ursache

Der Insert in `points_transactions` erfolgt vor dem Update von
`customers.points_balance`. Die bisherige Notification-Pruefung las deshalb
beim Triggerlauf den alten Punktestand.

## Geaenderte Dateien

- `supabase/migrations/20260903004000_point_reward_notification_order_fix.sql`
- `tests/point-reward-notification-order-fix.test.mjs`

## Was wurde geaendert

Die Funktion `sync_point_reward_notification_state()` bewertet bei positiven
kanonischen Punktebuchungen den effektiven neuen Kontostand aus gespeichertem
Kontostand plus neuer Transaktion. Notification-State und Queue bleiben
idempotent.

## Was wurde nicht geaendert

Keine Aenderung an Punkteformel, Reward-Schwellenwert, Tageslimit, QR-Regeln,
Anomalieerkennung, Einloesung, Welcome Gift, Birthday Gift, RLS oder Multi-Role.
Production, Cloudflare, DNS, E-Mail-Versand und Stripe blieben unveraendert.

## Verifikation

- Pre-Dry-Run: genau `20260903004000` pending
- Migration: nur auf Staging angewendet
- Post-Dry-Run: 0 pending
- DB-Linter: 0 Fehler
- Reale kanonische Staging-Flows: PASS
- 50 + 8 = 58: keine Notification
- 50 + 9 = 59: genau eine Notification
- 58 + 1 = 59: genau eine Notification
- Oberhalb Schwelle: kein Duplikat
- Falsche PIN: keine Punkte und keine Notification
- Replay: keine doppelte Transaktion und keine doppelte Notification
- QR-Einmalverwendung: PASS
- Tageslimit: PASS
- Point-Anomaly Owner-Attribution: PASS
- Cross-Tenant: blockiert
- Testdaten: vollstaendig per Transaktions-Rollback entfernt
- Tests: 1271/1271 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- Secret Scan: PASS
- Git Diff Check: PASS

## Migration

- Erstellt: Ja
- Auf Staging angewendet: Ja
- Auf Production angewendet: Nein
- Relevante RPCs erreichbar: Ja
- RLS/Security geprueft: Ja

## Risiken

Keine offenen Staging-Risiken im geprueften Scope. Die Migration darf erst nach
separater Founder-Freigabe auf Production angewendet werden.

Status: **STAGING FINAL LOCK**
