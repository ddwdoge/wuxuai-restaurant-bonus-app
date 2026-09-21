# WUXUAI BONUS – Phase 7C.3 Angebots-Capacity-Enforcement

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Ausgangs-HEAD/Remote: `78c031a9ca0bd68668e6bcc7d31b57ead6d438af`
Status: **LOCAL CODE LOCK**

## Ursache

Der aktive Offer-Tabellentrigger verwendete noch den historischen
Entitlement-Resolver, `NULL = unlimited`, alte Overrides und eine zeitliche
Ueberlappungsberechnung. Damit war Migration 153 nicht die alleinige
Capacity-Autoritaet und zukuenftig geplante Angebote wurden nicht nach dem
Founder-Vertrag reserviert. Die Owner-Seite las ebenfalls den alten
Entitlement-Limitwert.

## Vollstaendiges Schreibpfad-Inventar

- `save_restaurant_offer`: erstellt Entwuerfe und bearbeitet bestehende
  Angebote; Datumsbearbeitung kann einen abgelaufenen Datensatz wieder in die
  zaehlende Menge fuehren.
- `change_restaurant_offer_status`: `PUBLISH`, `DISABLE`, `ARCHIVE`; der
  Publish-Pfad umfasst auch geplante und reaktivierte Angebote.
- `duplicate_restaurant_offer`: erzeugt ausschliesslich einen Entwurf.
- `delete_restaurant_offer_draft`: loescht ausschliesslich Entwuerfe.
- `save_restaurant_offer_image_presentation`: aendert nur Bildmetadaten und
  keinen Capacity-Zustand.
- Browserrollen besitzen keine direkte INSERT-/UPDATE-/DELETE-Berechtigung auf
  `restaurant_offers`. Vertrauenswuerdige direkte DML bleibt durch denselben
  Tabellen-Trigger geschuetzt.
- Es wurden keine weiteren Platform-Admin-, Edge-, Import-, Hintergrund- oder
  Script-Schreibpfade fuer `restaurant_offers` gefunden.

## Geaenderte Dateien

- `supabase/migrations/20260921002000_offer_capacity_enforcement.sql`
- `src/modules/offers/restaurantOfferService.ts`
- `src/modules/offers/offerCapacityMessages.mjs`
- `src/modules/offers/offerCapacityMessages.d.mts`
- `src/modules/admin/pages/RestaurantOffersPage.tsx`
- `tests/phase-7c3-offer-capacity-contract.test.mjs`
- `tests/phase-7c3-offer-capacity-contract.local.sql`
- `tests/phase-7c3-offer-capacity-concurrency.local.mjs`
- aktualisierte historische UI-Vertragsassertionen in
  `tests/pro-package-entitlements.test.mjs`,
  `tests/pro-override-forward.test.mjs` und
  `tests/restaurant-offers-v1.test.mjs`
- dieser Canonical Contract, Changelog und Bericht

## Was wurde geaendert

- Slotverbrauchende Uebergaenge werden vor dem Schreiben tenantbezogen per
  Transaction Advisory Lock serialisiert.
- Kapazitaetsrelevant ist exakt `PUBLISHED AND is_active AND valid_to >
  statement_timestamp()`; `valid_from` ist absichtlich kein Zaehlfilter.
- Nur `nicht zaehlend -> zaehlend` benoetigt einen freien Slot. Bearbeitung
  bereits zaehlender Angebote und kapazitaetsreduzierende Aktionen bleiben
  auch bei Over-Limit moeglich.
- Limit und Nutzung stammen ausschliesslich aus
  `resolve_restaurant_capacity_internal`. Der stabile Fehlercode ist
  `OFFER_CAPACITY_REACHED`.
- Multirow-Schreibvorgaenge rollen bei Ueberschreitung vollstaendig zurueck.
- `get_restaurant_capacity` meldet `write_enforcement_active=true` und bleibt
  owner-/platform-authorisiert und read-only.
- Die Owner-Seite verwendet fuer Anzeige und Counter die zentrale endliche
  Capacity. Plan-Geltungsdaten werden separat read-only bewahrt.
- Die Capacity-Fehlermeldung ist fuer DE/EN/FR/IT/ES/ZH/KO fest definiert.

## Was wurde nicht geaendert

- Keine bestehende Migration veraendert.
- Keine Daten geloescht, remediated oder auf Staging geschrieben.
- Keine Reward-, Gift-, Redemption-, Points-, Billing-, Stripe-, Country-,
  PRO-, TEST_ONLY- oder Entitlement-Mutation geaendert.
- Kein Kauf-, Checkout- oder Upgrade-Pfad hinzugefuegt.
- Keine Customer-Capacity-Schreibdurchsetzung implementiert.
- Kein Commit, Push, Deployment oder Remote-Datenbankzugriff.

## Lokale Datenbank- und Security-Matrix

- Fresh-Replay aller Migrationen bis 154: PASS.
- Upgrade 153 auf 154: PASS; vor Upgrade war der Alttrigger eindeutig aktiv.
- Repeat: Migration 154 erneut angewendet, danach identische SQL-Matrix: PASS.
- BASIC 5, BASIC +1 Add-on 10, PRO 15, PRO +1 Add-on 20: PASS.
- Letzter Slot erfolgreich, naechster Slot mit `OFFER_CAPACITY_REACHED`
  abgewiesen: PASS.
- Geplantes veroeffentlichtes Angebot reserviert sofort: PASS.
- Draft-Save, deaktiviert, archiviert und abgelaufen: PASS.
- Publish, Reaktivierung, Restore und Ablaufverlaengerung am Limit blockiert:
  PASS.
- Bearbeitung eines bereits zaehlenden beziehungsweise grandfathered
  Over-Limit-Angebots: PASS.
- Deaktivierung, Archivierung und Draft-Loeschung: PASS.
- Multirow-Ueberschreitung ohne Teilcommit: PASS.
- Tenant-ID unveraenderbar; Cross-Tenant-Read und authentifizierte direkte DML
  blockiert: PASS.
- 96 parallele Publish-Versuche auf vier isolierten Tenants: exakt 5/10/15/20
  Erfolge, alle restlichen Fehler `OFFER_CAPACITY_REACHED`, keine Deadlocks,
  vollstaendige Fixture-Bereinigung: PASS.

## Build- und Testresultate

- `npm test`: PASS, 1.898/1.898.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS mit 0 Fehlern und 8 bereits bestehenden Warnungen in
  nicht geaenderten Dateien.
- `npm run build`: PASS; nur der bekannte Vite-Chunkgroessenhinweis.
- `git diff --check`: PASS.
- Staging-/Production-Flow-Test: nicht ausgefuehrt und nicht freigegeben.

## Risiken

- Migration 154 ist lokal und auf Staging noch nicht angewendet; daher kein
  FINAL LOCK.
- Customer-Capacity-Enforcement ist eine spaetere separate Phase.
- Der Text nennt das freigegebene Add-on, bietet aber absichtlich noch keinen
  Buchungsweg.
- Acht vorbestehende Lint-Warnungen bleiben ausserhalb dieses Scopes offen.

## Abschluss

- Aufgabe: Phase 7C.3 serverseitiges Angebots-Capacity-Enforcement
- Build: Ja
- Migration: Erstellt / lokal Fresh, Upgrade und Repeat geprueft / nicht auf Staging angewendet
- Flow-Test: Ja, lokal synthetisch; kein Staging-Flow
- RLS/Security: Ja
- Alte Logik geprueft: Ja; aus produktiver Offer-Schreibautoritaet entfernt
- Report: `docs/reports/2026-09-21_PHASE_7C_3_OFFER_CAPACITY_ENFORCEMENT_REPORT.md`
- Pruef-ZIP: `exports/2026-09-21_PHASE_7C_3_OFFER_CAPACITY_ENFORCEMENT.zip`
- Offene Risiken: Staging-Gate und Customer-Capacity-Enforcement separat
- Status: **LOCAL CODE LOCK**
