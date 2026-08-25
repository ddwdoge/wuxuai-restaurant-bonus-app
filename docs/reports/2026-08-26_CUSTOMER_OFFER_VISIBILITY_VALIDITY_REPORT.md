# Customer Offer Visibility & Validity Report

## Ursache

`get_public_restaurant_offers` behandelte `valid_from`, Wochentage und tägliche
Zeitfenster als Sichtbarkeitsfilter. Dadurch verschwanden veröffentlichte aktive
Marketingbeiträge außerhalb ihrer aktuellen Gültigkeit vollständig aus dem
Customer-Feed. Beim Kaffee-Testrestaurant ergab das nachts 0 statt 2 sichtbare
veröffentlichte Beiträge.

## Geänderte Dateien

- `supabase/migrations/20260826001000_customer_offer_visibility_validity_split.sql`
- `src/modules/offers/restaurantOffers.mjs`
- `src/modules/offers/restaurantOffers.d.mts`
- `src/modules/offers/restaurantOfferService.ts`
- `src/modules/customer/components/RestaurantOfferCard.tsx`
- `src/modules/customer/components/restaurant-offer-card.css`
- `src/modules/admin/pages/RestaurantOffersPage.tsx`
- `tests/restaurant-offers-v1.test.mjs`
- kanonische Produkt-, Portal-, CTO- und Changelog-Dokumentation

## Was wurde geändert

- Öffentliche Sichtbarkeit ist jetzt `PUBLISHED + aktiv + korrektes Restaurant
  + noch nicht final abgelaufen`.
- Das Startdatum, Wochentage und tägliche Uhrzeiten erzeugen getrennte
  Europe/Vienna-Gültigkeitszustände.
- Customer-Karten und Details zeigen Status, Zeitplan und Zeitraum.
- Owner sehen Veröffentlichung, Kundensichtbarkeit und aktuelle Gültigkeit als
  getrennte Angaben.
- Mobile Karten behalten eine kontrollierte 16:9-Bildfläche, begrenzen lange
  Vorschautexte und verwenden eine einheitliche volle CTA-Breite.

## Was wurde nicht geändert

- Reward-, Punkte-, Claim- und Einlöselogik
- Restaurant-Sortierung und bestehende Angebotspriorität
- RLS, Tabellenrechte oder Tenant-Zuordnung
- maximale Anzahl gleichzeitig veröffentlichter Beiträge

## Sicherheit

Die additive RPC-Migration behält `SECURITY DEFINER`, den festen `search_path`
und die bisherigen engen Execute-Rechte. Entwürfe, deaktivierte, abgelaufene
und fremde Restaurantbeiträge bleiben ausgeschlossen. Es werden weiterhin nur
öffentliche Angebotsfelder zurückgegeben.

## Prüfung

- Gezielte Offer-Tests: 28/28 PASS
- Vollständige Tests: 1001/1001 PASS
- Typecheck: PASS
- Lint: PASS mit 0 Fehlern und 7 bereits vorhandenen Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret-Scan der Aufgaben-Dateien: PASS
- Staging-Migration: angewendet auf `bwhvfjuwixgwduoeqaya`
- Local/Remote-Migrationshistorie: synchron bis `20260826001000`
- Staging DB-Linter: 0 Fehler
- Öffentlicher RPC: HTTP 200
- Kaffee-Testrestaurant: 3 veröffentlichte aktive, nicht abgelaufene Beiträge
- Akakiko-Testrestaurant: 1 veröffentlichter aktiver, nicht abgelaufener Beitrag
- unbekannter Restaurant-Slug: HTTP 200 mit 0 Beiträgen
- Cloudflare-Staging-Version: `42836bb7-5269-477d-8f0a-1c37799a4b6c`
- Deployment-Zeit: 2026-08-26 00:39:42 Europe/Vienna
- Live-Bundle enthält die neuen Gültigkeitszustände und die korrekte
  Staging-Supabase-Projektkonfiguration.
- Responsive Staging-CSS-Prüfung: 320, 375, 390, 414, 430, 768 und 1024 Pixel
  ohne horizontalen Überlauf; Bildverhältnis jeweils 1,778 (16:9), volle CTA-
  Breite und begrenzte Titel-/Beschreibungshöhe.
- Vollständiges Prüfarchiv:
  `exports/2026-08-26_CUSTOMER_OFFER_VISIBILITY_VALIDITY_FULL_APP.zip`
  mit 857 Projektdateien; `.git`, `node_modules`, Build-Ausgaben, `.env`-Dateien,
  Dumps, temporäre Supabase-Dateien und ältere Archive sind ausgeschlossen.

## Risiken

Die responsive Prüfung nutzte die tatsächlich ausgelieferte Staging-CSS und
reale RPC-Daten in einer kontrollierten Playwright-Kartenmatrix. Ein erneuter
physischer iPhone-Rundgang mit einer authentifizierten Customer-Sitzung bleibt
als manuelles Pilot-Gate sinnvoll, ist aber kein offener Code- oder DB-Blocker.

Status: CODE LOCK – authentifizierter Customer-Live-Sichttest bleibt manuelles Gate
