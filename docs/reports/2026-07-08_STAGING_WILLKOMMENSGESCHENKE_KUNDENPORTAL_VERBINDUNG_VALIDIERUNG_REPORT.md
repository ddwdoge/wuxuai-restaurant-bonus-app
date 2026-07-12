# Staging-Validierung: Willkommensgeschenke und Kundenportal-Verbindung

Datum: 2026-07-08  
Status: LOCK

## Angewendete Migration

- `20260708001000_v1_registration_welcome_gift_connection_fix.sql`: angewendet auf Supabase Staging.

Weitere offene Migrationen:

- Keine. `supabase db push --include-all` hat nur diese Migration zur Anwendung angeboten.

## Test A: Normale Registrierung

Ergebnis: bestanden.

- Customer wurde erstellt.
- Aktiver Customer-Token wurde erstellt.
- Genau ein Willkommensgeschenk wurde zugeteilt.
- Status in der Datenbank: `locked`.
- Kundenportal enthält das gesperrte Willkommensgeschenk.
- Keine `campaign_customer_offers`.
- Keine `coupon_redemptions`.
- Keine alte Campaign-/Coupon-/Reward-Zuteilung.
- Keine sofort einlösbare normale Punkte-Belohnung.

Validierte Werte:

- `active_customer_token_count`: 1
- `locked_welcome_gifts`: 1
- `campaign_customer_offers`: 0
- `coupon_redemptions`: 0
- `non_starter_customer_rewards`: 0
- `portal_starter_status`: `locked`

## Test B: Erste Punktebuchung

Ergebnis: bestanden.

- Punkte wurden gutgeschrieben.
- Willkommensgeschenk wurde nach der ersten Punktebuchung freigeschaltet.
- Datenbankstatus der Zuteilung: `active`.
- Kundenportalstatus: `unlocked`.
- Audit wurde geschrieben.

Validierte Werte:

- `points_added`: 200
- `welcome_gift_unlocked_flag`: `true`
- `unlocked_welcome_gifts`: 1
- `portal_starter_status`: `unlocked`
- `audit_register_count`: 1
- `audit_unlock_count`: 1
- `audit_points_count`: 1

## Test C: Freunde-Einladung

Ergebnis: bestanden.

- Referral-Gast wurde registriert.
- Vor erster Punktebuchung wurde kein Willkommensgeschenk erstellt.
- Referral blieb bis zur ersten Punktebuchung im Status `pending_registered`.
- Nach erster Punktebuchung wurde Referral aktiviert.
- Beide Kunden haben Bonus Boost erhalten.
- Nachträglich wurde kein Willkommensgeschenk erstellt.

Validierte Werte:

- `welcome_gifts_before_points`: 0
- `referral_pending_registered_count`: 1
- `referral_activated_count`: 1
- `boost_rows_for_both_customers`: 2
- `welcome_gifts_after_points`: 0

## Test D: Alte Campaign-Logik

Ergebnis: bestanden.

Der Test hat bewusst eine aktive alte Campaign mit Starter-Coupon und Starter-Reward angelegt. Die normale Restaurant-QR-Registrierung hat trotzdem ausschließlich die V1-Willkommensgeschenk-Logik verwendet.

- Keine Campaign-Starter-Offers.
- Keine Coupon-Redemptions.
- Keine alte Campaign-Reward-Zuteilung.

## Test E: Kundenportal

Ergebnis: bestanden.

- Gesperrtes Willkommensgeschenk wird separat angezeigt.
- Freigeschaltetes Willkommensgeschenk wird korrekt als freigeschaltet zurückgegeben.
- Belohnungsbilder oder Standardbilder sind im Kundenportal implementiert.
- Quelltextprüfung: keine sichtbaren 0-Punkte-/0,00-Euro-Fehlanzeigen für Willkommensgeschenke.
- Quelltextprüfung: relevante Kundenportaltexte sind Deutsch.

Hinweis:

- Technische Begriffe wie `Customer`, `Token` und `Slug` erscheinen nur als Code-Identifier, nicht als sichtbare UI-Texte.

## Test F: QR Center und Dashboard

Ergebnis: bestanden.

- QR Center sichtbarer Download nutzt PNG:
  - `gaeste-qr.png`
  - `bonus-qr.png`
- SVG ist nicht der sichtbare Standarddownload im QR Center.
- Dashboard-KPI heißt: `Bonus Boost aktiv`.

## RLS / Sicherheitsprüfung

Ergebnis: bestanden.

- `anon` sieht keine direkten Zeilen aus:
  - `customer_rewards`
  - `customers`
  - `customer_qr_tokens`
- Fremder `authenticated`-Kontext sieht keine direkten Zeilen aus:
  - `customer_rewards`
  - `customers`
  - `customer_qr_tokens`
- Customer Portal nutzt sichere Token-/RPC-Logik.
- RPC-Tests prüfen `restaurant_id` über Restaurant-Slug und Tokenauflösung.
- `branch_id` und `organization_id` wurden über Staging-Backfill/Trigger korrekt gesetzt.

## SQL / RPC / RLS Fehler

Finaler Staging-Test: keine SQL-, RPC- oder RLS-Fehler.

Während der Erstellung des Testskripts wurden zwei Testdaten-Konflikte sichtbar:

- `restaurant_members` wird auf Staging automatisch per Trigger angelegt.
- `restaurant_branding` wird auf Staging automatisch per Trigger angelegt.

Das Testskript wurde entsprechend angepasst. Diese Punkte sind keine Produktfehler.

## Build-Ergebnis

Ergebnis: bestanden.

Befehl:

```bash
npm run build
```

Build lief erfolgreich durch.

## Offene Risiken

- Die Live-Validierung lief als SQL-/RPC-Test in einer Rollback-Transaktion. Sie prüft echte Staging-RPCs und RLS, erzeugt aber keine permanenten Testkunden.
- Vollständige visuelle Mobile-Prüfung im Browser wurde in diesem Lauf nicht zusätzlich dokumentiert, weil keine UI geändert wurde.

## Status

LOCK
