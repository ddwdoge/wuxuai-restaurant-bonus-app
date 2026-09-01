# Freundschaftsbonus-Dauer konfigurierbar

Datum: 2026-07-28
Branch: `codex/v13-legal-maps-hardening`

## Ursache

Die drei benötigten Felder existierten bereits in `loyalty_settings`. Eine spätere V1-Retention-Migration, der atomare Boost-Helper, der allgemeine Loyalty-Service und das Kundenportal erzwangen die Dauer jedoch unabhängig voneinander auf 30 Tage. Dadurch konnte ein restaurantbezogener Wert weder gespeichert noch bei neuen Empfehlungen verwendet oder korrekt angezeigt werden.

## Geänderte Dateien

- `supabase/migrations/20260728002000_referral_bonus_duration_settings.sql`
- `src/modules/admin/pages/LoyaltyPage.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/loyalty/referralBonusSettings.mjs`
- `src/modules/loyalty/referralBonusSettings.d.mts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/styles.css`
- `tests/referral-bonus-duration-settings.test.mjs`
- `tests/v1-retention-features.test.mjs`
- `docs/12_FLOW_05_BONUS_BOOST.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Umsetzung

- Standard bleibt `2×` für `30` Tage.
- Owner/Admin können restaurantbezogen 7, 14, 30, 60, 90 oder einen eigenen ganzzahligen Wert von 1 bis 365 Tagen speichern.
- Der dedizierte RPC `update_referral_bonus_settings` prüft Rolle, Restaurant, Multiplikator und Dauer serverseitig.
- Ein zusätzlicher Trigger verhindert, dass Manager die Referral-Felder über den allgemeinen Tabellenzugriff umgehen.
- Der allgemeine Loyalty-Speicherpfad überschreibt die Referral-Konfiguration nicht mehr mit 30 Tagen.
- `upsert_referral_boost` verwendet bei einer neuen Qualifizierung die übergebene, serverseitig geladene Dauer und bleibt per Advisory Lock atomar.
- Laufende Datensätze in `customer_bonus_boosts` werden durch die Migration nicht aktualisiert.
- Eine weitere erfolgreiche Einladung verlängert ab `greatest(active_until, now())` um die dann gültige Dauer.
- Das Kundenportal zeigt Konfiguration und verbleibende Laufzeit datengetrieben.
- Änderungen schreiben genau ein Audit-Event `REFERRAL_BONUS_SETTINGS_UPDATED` mit alter und neuer sicherer Einstellung.

## Sicherheitsprüfung

- Owner/Admin des Zielrestaurants: erlaubt.
- Manager/Mitarbeiter: Referral-Änderung durch RPC und Trigger blockiert.
- Kunde/anon: keine Schreibberechtigung; RPC für anon widerrufen.
- Fremdes Restaurant: durch `restaurant_members.restaurant_id = input_restaurant_id` blockiert.
- Multiplikator bleibt serverseitig exakt `2`.
- RLS wurde nicht gelockert.
- Keine Secrets, Kundentokens, PINs oder Einlösecodes ergänzt.

## Tests

- Standardwert 30 Tage: bestanden.
- Presets und eigener Wert: bestanden.
- 1 und 365 Tage erlaubt: bestanden.
- 0, 366 und Dezimalwerte blockiert: bestanden.
- Owner/Admin- und Tenant-Scope-Vertrag: bestanden.
- Manager-Umgehungsschutz: bestanden.
- Neue Einladung verwendet aktuelle Dauer: bestanden.
- Aktiver Zeitraum wird nicht rückwirkend verändert: bestanden.
- Weitere Einladung verlängert um aktuelle Dauer: bestanden.
- Kundenportal verwendet restaurantbezogene Dauer: bestanden.
- Auditvertrag: bestanden.
- Gesamttests: 236/236 bestanden.

## Qualität

- Typecheck: erfolgreich.
- Lint: 0 Fehler, 7 bereits bestehende Warnungen.
- Build: erfolgreich.
- `git diff --check`: erfolgreich.
- Mobile CSS: einspaltig unter 700 px, Hauptaktion mindestens 48 px hoch.
- Authentifizierte visuelle Owner-Prüfung: lokal ohne Testzugang nicht vollständig ausführbar; der Route Guard leitete korrekt zum Restaurant-Login.

## Migration

- Migration erstellt: Ja, additiv.
- Staging-Dry-Run: erfolgreich.
- Auf Staging angewendet: Nein.
- Dry-Run-Reihenfolge: `20260727001000`, `20260728001000`, `20260728002000`.
- Kein echter Push, kein Production-Zugriff.

## Nicht geändert

- Punkteberechnung außerhalb Referral
- Rewardlogik
- Tages-PIN
- Einlösecodes
- Customer Identity
- Legal Center
- bestehende aktive Bonuszeiträume

## Offene Risiken

- Der neue RPC und Constraint sind erst nach kontrollierter Staging-Anwendung verfügbar.
- Die vorgelagerte Migration `20260727001000_customer_identity_v1_no_sms.sql` ist wegen bekannter Staging-Datenbereinigung noch ausstehend; deshalb wurde keine Migration angewendet.
- Owner-/Manager-/Cross-Tenant-Verhalten muss nach Migration mit echten Staging-Rollen live bestätigt werden.

Status: `READY_FOR_GITHUB_DESKTOP_PUSH`
