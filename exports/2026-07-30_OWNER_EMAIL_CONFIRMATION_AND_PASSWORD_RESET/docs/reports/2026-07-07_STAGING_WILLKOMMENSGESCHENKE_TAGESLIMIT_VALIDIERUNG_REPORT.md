# Staging Validierung Willkommensgeschenke Tageslimit

Datum: 2026-07-07

## Ziel

Die neue Willkommensgeschenke- und Tageslimit-Migration wurde gegen Supabase Staging angewendet und validiert.

## Staging Projekt

- Projekt-Ref: `bwhvfjuwixgwduoeqaya`
- Validierung: echte Supabase Staging-Datenbank
- Testdaten: transaktional erstellt und per `ROLLBACK` wieder verworfen
- UI: nicht geändert

## Angewendete Migrationen

`npx supabase db push --include-all` wurde erfolgreich ausgeführt.

Angewendet:

- `20260706006000_fix_owner_trial_subscription_upsert.sql`
- `20260706007000_reward_management_v2_prep.sql`
- `20260707001000_welcome_gifts_management.sql`
- `20260707002000_welcome_gift_daily_limits.sql`

Bestätigt in `supabase_migrations.schema_migrations`:

- `20260707002000` / `welcome_gift_daily_limits`

## Schema- und RPC-Prüfung

Geprüft und vorhanden:

- `customer_rewards.status`
- `customer_rewards.unlocked_at`
- `assign_welcome_starter_reward`
- `welcome_gift_category_weight`
- `welcome_gift_daily_limit`
- `collect_bonus_points(text,text,text,text)`
- `redeem_reward_with_staff_session(uuid,uuid,text,uuid,text)`

## Testfall A - Normale Registrierung

Ergebnis: bestanden.

Geprüft:

- Normaler Gast registriert sich über Restaurant-QR.
- Ein Willkommensgeschenk wird serverseitig zugeteilt.
- Status ist zunächst `locked`.
- Geschenk ist im Kundenportal sichtbar.
- Geschenk ist nicht sofort als eingelöst markiert.

## Testfall B - Erste Punktebuchung

Ergebnis: bestanden.

Geprüft:

- Gast sammelt Punkte über Bonus-QR.
- Punkte werden gutgeschrieben.
- Gesperrtes Willkommensgeschenk wird freigeschaltet.
- `welcome_starter_reward_unlocked` wird in `audit_log` geschrieben.

## Testfall C - Freunde-Einladung

Ergebnis: bestanden.

Geprüft:

- Freund registriert sich über Referral-Link.
- Kein Willkommensgeschenk wird erstellt.
- Referral bleibt bis zur ersten Punktebuchung ausstehend.
- Nach erster Punktebuchung wird Referral aktiviert.
- Bonus Boost wird für beide Gäste erstellt.
- Nachträglich erscheint kein Willkommensgeschenk.

## Testfall D - Tageslimit

Ergebnis: bestanden.

Geprüft:

- Gratis Menü bleibt bei maximal 3 Vergaben pro Tag.
- Gratis Hauptspeise bleibt bei maximal 3 Vergaben pro Tag.
- Wenn beide Tageslimits erreicht sind, werden diese Kategorien übersprungen.
- Andere aktive Kategorien werden weiter verwendet.
- Kein Fehler und kein Crash für neue Gäste.

## Testfall E - RLS und Sicherheit

Ergebnis: bestanden.

Geprüft:

- Direkte Tabellenreads als `anon` liefern 0 sichtbare Zeilen für:
  - `customers`
  - `rewards`
  - `customer_rewards`
  - `referrals`
- Direkte Tabellenreads als `authenticated` ohne Membership-Kontext liefern 0 sichtbare Zeilen.
- Public Routes müssen sichere RPCs verwenden.
- Direkter Aufruf von `assign_welcome_starter_reward` ist für `anon` nicht erlaubt.
- `redeem_reward_with_staff_session` ist nur für `authenticated` ausführbar.

Hinweis: Einige Tabellen besitzen SELECT-Grants für Rollen, werden aber durch RLS geschützt. Die praktische RLS-Prüfung ergab 0 sichtbare Zeilen ohne Tenant-Kontext.

## SQL/RLS/RPC Fehler

Keine produktiven SQL-, RLS- oder RPC-Fehler in der finalen Validierung.

Während der Erstellung des transaktionalen Testskripts traten nur Testdaten-Setup-Themen auf:

- FK auf `auth.users` erforderte bestehenden Auth-User.
- `restaurants.onboarding_status` erlaubt in Staging `draft` und `ready`, nicht `completed`.
- Branching und Branding werden auf Staging automatisch per Trigger angelegt.
- JSON-Rückgabe der Customer-Registrierung enthält keine direkte Kunden-ID; die ID wurde korrekt über den signierten Customer-Token aufgelöst.

Diese Punkte wurden im Testskript korrigiert und sind keine Fehler der neuen Migration.

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Die Validierung lief transaktional und hat keine dauerhaften Testdaten hinterlassen.
- Eine Browser-E2E-Prüfung der echten Customer-UI wurde in diesem Schritt nicht ausgeführt.
- SELECT-Grants auf public Tabellen sind vorhanden, werden aber durch RLS blockiert. Für spätere Production-Hardening-Runden kann geprüft werden, ob Grants weiter reduziert werden sollen.

## Status

LOCK
