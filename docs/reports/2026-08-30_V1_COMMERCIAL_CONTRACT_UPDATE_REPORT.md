# WUXUAI Bonus V1 Commercial Contract Update

Datum: 2026-08-30  
Branch: `codex/v1-canonical-recovery`  
Production: `LOCKED`  
Stripe: `DEFERRED`

## Ursache

Der aktive V1-Vertrag war nicht zentral abgebildet. Die Owner-Akquise zeigte
`30 Tage kostenlos`, ein Owner-Settings-Fallback berechnete 30 Tage und die
autorisierte Trial-RPC verwendete `interval '30 days'`. Dadurch konnten Copy,
Client-Fallback und serverseitiger Vertrag auseinanderlaufen.

## Geänderte Dateien

- `src/shared/commercialContract.mjs`
- `src/shared/commercialContract.d.mts`
- `src/modules/public/PublicHome.tsx`
- `src/modules/auth/RegisterPage.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `supabase/migrations/20260830001000_v1_commercial_contract_three_month_trial.sql`
- `tests/v1-commercial-contract.test.mjs`
- aktuelle Produkt-, Portal-, Datenbank-, Pilot-, Go-Live-, Payment-, CTO- und
  Canonical-Contract-Dokumentation
- `docs/19_CHANGELOG.md`

Bereits vorhandene Legal-Company-Änderungen im Working Tree wurden nicht
zurückgesetzt oder inhaltlich verändert.

## Was wurde geändert

- Ein kanonischer V1-Vertrag definiert drei Kalendermonate Trial, 59 EUR pro
  Monat, EUR, exkl. USt., monatliches Intervall, deaktivierte automatische
  Abrechnung und Stripe `deferred`.
- Ein leerer, nicht sichtbarer Add-on-Katalog stellt nur den künftigen
  Erweiterungspunkt bereit.
- Startseite, Owner-Registrierung und Aboansicht verwenden die zentrale Copy.
- Die CTA lautet `3 Monate kostenlos starten` und die Preiszeile
  `Danach 59 € pro Monat exkl. USt.`.
- Eine kalenderbasierte Client-Fallback-Berechnung behandelt Monatsenden
  korrekt.
- Die additive Migration ersetzt nur die aktive Owner-Trial-RPC und setzt neue
  Trials auf `now() + interval '3 months'`.

## Was wurde nicht geändert

- Keine bestehenden Trial-Enddaten wurden umgeschrieben.
- Keine Stripe-, Checkout-, Zahlungs- oder automatische Conversion-Logik wurde
  aktiviert.
- Keine Zusatzpakete wurden veröffentlicht oder verkauft.
- Keine RLS-Policy, Rolle, Grant-Grenze, Restaurantlogik oder
  Onboarding-Geschäftslogik wurde gelockert.
- Historische Migrationen wurden nicht editiert.
- Keine Production-Aktion, kein Push und kein Merge.

## Prüfung

- Gezielte Contract-Tests: 5/5 PASS
- Vollständige Tests: 1131/1131 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 7 bestehende Warnungen
- Production Build: PASS mit lokaler Staging-Env, keine Werte ausgegeben
- Responsive Owner-Registrierung: 320, 390, 430, 768, 1024, 1440 PASS
- Globaler horizontaler Overflow auf `/register`: NO
- Git diff check: PASS
- Migration gegen vorherige RPC: exakt identisch außer `30 days` zu `3 months`
- Staging Migration Dry Run: PASS
- Staging DB Linter: 0 Fehler; bestehende Warnungen wurden nicht versteckt

## Migration

Erstellt:
`20260830001000_v1_commercial_contract_three_month_trial.sql`

Auf Staging angewendet: **NEIN**

Der Dry-Run zeigt folgende Reihenfolge:

1. `20260829002000_customer_swipe_redemption_atomic_confirmation.sql`
2. `20260830001000_v1_commercial_contract_three_month_trial.sql`

Die neue Commercial-Migration wurde deshalb nicht isoliert oder außerhalb der
autoritativen Reihenfolge angewendet. Ein lokaler vollständiger DB-Reset war
nicht möglich, weil Docker/Podman auf dem Rechner fehlt.

## Risiken

- Bis zur kontrollierten Staging-Anwendung erzeugt die Live-Datenbank weiterhin
  neue Trials nach dem bisherigen 30-Tage-Vertrag.
- Die offene Migration `20260829002000` muss vor `20260830001000` gemäß
  Migrationsreihenfolge geprüft und angewendet werden.
- Stripe bleibt absichtlich deaktiviert; nach Trial-Ende findet derzeit keine
  automatische Abbuchung statt.

## Status

`CODE LOCK`

Kein `FINAL LOCK`, solange die Migration nicht auf Staging angewendet und ein
realer neuer Owner-Trial dort mit drei Kalendermonaten verifiziert wurde.
