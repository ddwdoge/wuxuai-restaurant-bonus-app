# Einlösequote als Dropdown – Report

Datum: 2026-07-29  
Branch: `codex/v13-legal-maps-hardening`

## Ursache

Die Einlösequote war zentral in `loyalty_settings.redemption_return_rate`
gespeichert, aber nur als Teil der Berechnung sichtbar. Die Datenbank erlaubte
nur 3, 5, 8 und 10 Prozent und verwendete 5 Prozent als Default. Im
Reward-Dialog fehlte eine bewusste, rewardbezogene Auswahl.

## Geänderte Dateien

- `src/modules/admin/components/RedemptionRateSelect.tsx`
- `src/modules/admin/pages/LoyaltyPage.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/loyalty/redemptionRate.mjs`
- `src/modules/loyalty/redemptionRate.d.mts`
- `src/modules/loyalty/loyaltyService.ts`
- `src/styles.css`
- `supabase/migrations/20260729004000_redemption_rate_dropdown.sql`
- `tests/redemption-rate-dropdown.test.mjs`
- relevante Produktdokumentation

## Was wurde geändert

- Native Dropdown-Auswahl mit exakt 1 bis 10 Prozent.
- Standardwert für neue Einstellungen: 3 Prozent.
- Keine freie Eingabe und keine Dezimalwerte.
- Sofortige Aktualisierung von Konsumation, benötigten Punkten und
  wirtschaftlicher Einordnung im Reward-Dialog.
- Formel: `ceil(product_price / (redemption_rate_percent / 100) - points_per_euro)`.
- `points_per_euro` wird aus dem bestehenden `amount_per_point` abgeleitet,
  ohne die Punktebuchungslogik zu verändern.
- Bestehende Reward-Beschreibungen liefern ihren bisherigen Quotewert. Werte
  außerhalb 1 bis 10 Prozent werden als Legacy-Wert gezeigt und blockieren das
  Speichern, bis der Owner aktiv auswählt.
- Die Migration ändert nur Default und Constraint. Sie enthält keinen Backfill
  und überschreibt keine bestehenden Einstellungen oder Rewards.

## Was wurde nicht geändert

- Historische Einlösungen und deren Punktesnapshots.
- Punktebuchung, Tages-PIN, Reward-Einlösung und Customer Portal.
- RLS, Grants, RPCs und Tenant-Isolation.

## Prüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 270/270 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Native Tastaturbedienung: durch semantisches `select` und Komponententest geprüft
- Mobile CSS: 44 px Mindesthöhe, `width: 100%`, `min-width: 0`
- Authentifizierte visuelle Owner-Abnahme: nicht möglich, da lokal keine
  Owner-Sitzung vorhanden war

## Migration

- Migration erstellt: Ja
- Auf Staging angewendet: Nein
- RLS geändert: Nein
- RPC geändert: Nein

## Risiken

- Bis zur Anwendung von `20260729004000_redemption_rate_dropdown.sql` lehnt die
  verbundene Datenbank die neuen Werte 1, 2, 4, 6, 7 und 9 Prozent ab.
- Die authentifizierte mobile Darstellung muss nach Anwendung der Migration in
  einer Owner-Sitzung visuell geprüft werden.

Status: **NOT READY** bis Migration und authentifizierter Owner-Flow auf Staging
geprüft sind.
