# Phase 7C.6C1C/7C.6C2 – Stripe-Sandbox-Inventar und lokaler TEST-Providervertrag

Status: **LOCAL CODE LOCK – TAX READINESS PENDING – LIVE BILLING BLOCKED**.
Stichtag: 2026-09-24. Branch `codex/v1-release-integration`, Basis-HEAD
`56b6341f807d937ce7be3c6b2d7e0920fa2dd247`. Kein Commit/Push.

## Ursache und abgegrenzter Umfang

Der bisherige Katalog enthielt TEST/LIVE nur als `UNBOUND`. Die vier manuell
angelegten Sandbox-Preise waren noch nicht versioniert gebunden. Die Founder-
Entscheidung trennt nun verifizierte Provider-Objekte strikt von ausstehender
Steuerkonfiguration. Es wurden weder Stripe-Einstellungen noch Staging,
Production, Seller-Status oder Businessdaten verändert.

## Read-only Providerbeleg 7C.6C1C

- Legitim angemeldete Stripe-Sandbox `WUXUAI Digital & Trading GmbH Sandbox`;
  Account-Objekt: `country=AT`, `default_currency=eur`,
  `charges_enabled=false`, `payouts_enabled=false`,
  `details_submitted=false`. LIVE wurde nicht geöffnet.
- Vollständig paginierte Products/Prices: jeweils genau vier aktive, null
  inaktive/historische, `has_more=false`. Keine Duplikate oder unbekannten
  aktiven Lookup Keys. Alle vier Product-Default-Prices stimmen zu den
  zugehörigen Price-Objekten.
- Alle vier Prices: `livemode=false`, `currency=eur`, `type=recurring`,
  `interval=month`, `billing_scheme=per_unit`, `usage_type=licensed`,
  `trial_period_days=null`, `tax_behavior=unspecified`, Metadata leer.
- BASIC 59 EUR (`wuxuai_bonus_basic_monthly`), PRO 149 EUR
  (`wuxuai_bonus_pro_monthly`), Offer Add-on 19 EUR
  (`wuxuai_bonus_offers_addon_5_monthly`), Customer Add-on 29 EUR
  (`wuxuai_bonus_customers_addon_5000_monthly`). Die drei aktualisierten
  Produktbeschreibungen enthalten „exakt 365 Tage“; das Offer-Add-on blieb
  unverändert.
- Testkunden, Testsubscriptions, Payment Links, Webhook-Endpunkte, v2 Event
  Destinations und Billing-Portal-Konfigurationen: jeweils 0.
- Stripe Tax: `status=pending`, `head_office` fehlt; Tax-Registrierungen 0,
  Default-Tax-Behavior nicht festgelegt. Keine Tax-/Accountmutation.
- Vollständige Stripe-IDs stehen nur in der notwendigen lokalen Migration,
  nicht in diesem Bericht. Keine Schlüssel oder personenbezogenen
  Verifikationsdaten wurden erfasst.

## Lokale Implementierung 7C.6C2

Neue additive Migration:
`20260924001000_test_provider_binding_tax_readiness.sql` (166).
Migrationen 001–165 blieben bytegleich.
SHA-256 der Migration:
`48a46dcd37680ff52c0fbc6a735b41a1a26bf5cb2654afa05cf647fde7b53988`.

- `billing_provider_binding_versions`: sieben additive Price-Vertragsfelder;
  genau vier neue `TEST`-Revisionen mit `binding_status=VERIFIED`, den
  geprüften Product-/Price-Paaren, Lookup Keys, EUR, Monat, Betrag in Cent,
  `licensed`, `per_unit`, `livemode=false`. Alte Revisionen bleiben erhalten.
  Die Statusmenge `UNBOUND / VERIFIED / RETIRED` wurde nicht verändert.
- `billing_tax_readiness_versions`: eigene versionierte, RLS-geschützte,
  DML-gesperrte und unveränderbare Struktur mit Seller-/Provider-/Umgebungs-
  Schlüssel, Account Country, Status, beobachtetem Tax-Behavior, Automatic
  Tax, Verifikationsfeldern, Evidenzreferenz und Zeitstempeln. Nur TEST hat
  eine Revision: `PENDING_CONFIGURATION / UNSPECIFIED / false / AT`.
  LIVE hat keinen Datensatz und bleibt fail-closed.
- `resolve_test_billing_binding_internal`: privater, stabiler serverseitiger
  Read-Resolver mit festem `search_path`; `anon`, `authenticated` und
  `service_role` besitzen kein EXECUTE. Er vergleicht Umgebung, Price-ID,
  Betrag, Währung, Lookup Key und Livemode gegen Binding und autoritativen
  Katalog. Unbekanntes oder abweichendes Input wird abgewiesen. Seine
  Antwort enthält ausdrücklich `commercial_activation_allowed=false` und
  `purchase_allowed=false`. Er ruft Stripe nicht auf und schreibt nichts.
- Seller bleibt `PLANNED`, `resolve_billing_product_internal` meldet selbst
  für TEST weiterhin `provider_ready=false`; LIVE bleibt `UNBOUND`. Country,
  Pending, Capacity, Entitlements, Trials und Subscriptions unverändert.
- Kein Checkout, Webhook, Customer Portal, Customer, Subscription, Trial,
  Rechnung, Zahlung, Grant, Add-on oder Tax-Konfiguration erstellt.

## Lokale Gates

| Gate | Ergebnis |
|---|---|
| Fresh Replay | 166/166 PASS |
| Historischer Replay und Upgrade | 165/165, danach 165→166 PASS |
| Migration 166 Repeat 1/2 | PASS, keine zusätzlichen Bindungs-/Tax-Zeilen |
| DB-Lint | Exit 0; nur Legacy-Warnungen, kein Befund zur neuen Funktion |
| Focused SQL, Rollen/RLS/Direct-DML | PASS; anon/authenticated/service_role ohne Tabellen- oder Resolverzugriff |
| TEST/LIVE/Fehleingaben | vier TEST-Produkte PASS; LIVE, falsche Price-ID, Betrag, Währung, Lookup Key und Livemode abgewiesen |
| Parallelität | 24 identische Read-Aufrufe, bytegleiche Antworten |
| Bestehende Billing/Pending/Capacity-Regression | PASS nach Isolierung synthetischer Testfixtures; alle Testtransaktionen zurückgerollt |
| Full Node Tests | 1.963/1.963 PASS |
| Typecheck | PASS |
| Lint | 0 Fehler, acht vorbestehende Warnungen |
| Build | PASS mit lokalem, nicht-geheimem Build-Platzhalter statt Runtime-Token |
| Secret Scan und Diff Check | PASS |

Die zwei geänderten älteren Testfixtures referenzieren jetzt einen eigenen,
rollback-geschützten synthetischen aktiven Betrieb statt eines zufällig
vorhandenen DB-Datensatzes. Dafür wurde kein Country Gate freigegeben und
kein Produktcode verändert.

## Nicht geändert und offene Folgegates

Stripe Products/Prices/Tax/Head Office/Konto: unverändert. Kein Staging-
Zugriff, keine Staging-Migration, kein Deployment, keine Production- oder
LIVE-Verbindung, kein Stripe-Write, keine echten oder synthetischen externen
Zahlungsdaten, keine Secrets. `supabase/.temp/cli-latest` blieb als vorbestehende
fremde Abweichung unangetastet.

Tax-/Invoice-Final-Lock, synthetischer Checkout, signierter Webhook,
Customer Portal, positive Pending-Aktivierung, Seller-Verifikation,
Country-/KYB-/Legal-Freigaben, Live Billing und Production bleiben gesonderte
Founder- und Implementierungsgates. Dieser lokale Code Lock ist keine
Staging- oder kommerzielle Freigabe.
