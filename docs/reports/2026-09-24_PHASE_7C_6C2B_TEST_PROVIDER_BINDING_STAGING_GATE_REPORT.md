# Phase 7C.6C2B – TEST-Provider-Bindung: Staging-Backend-Gate

Status: **TEST-ONLY PROVIDER BINDING STAGING BACKEND LOCK / TAX READINESS
PENDING / CHECKOUT, WEBHOOK, TAX, ACTIVATION AND LIVE GATES OPEN**.
Pruefung am 2026-09-24. Kanonischer Branch `codex/v1-release-integration`.

## Ursache und Umfang

Vier in 7C.6C1C read-only verifizierte Stripe-Sandbox-Preise waren bisher im
Anwendungssystem `UNBOUND`. Der Founder hat ihre versionierte technische
TEST-Bindung und einen getrennten, noch nicht verifizierten Tax-Readiness-
Vertrag freigegeben. Migration 166 wurde ohne App-Deployment oder Stripe-API-
Aufruf ausschliesslich auf das eindeutig gepruefte Supabase-Staging-Projekt
`bwhvfjuwixgwduoeqaya` (`wuxuai-bonus-staging`) angewendet.

## Source- und Migrationsnachweis

- Ausgangs-HEAD und Remote vor dem Commit:
  `56b6341f807d937ce7be3c6b2d7e0920fa2dd247`; frischer Fetch und
  Remote-Paritaet bestaetigt.
- Enger Implementierungscommit:
  `045cd8ff9f1070a06b76eb5309260971ec79f0a2`; neun Phase-7C.6C2-
  Dateien, Push nur auf `origin/codex/v1-release-integration`.
- Lokaler Code Lock: Fresh 166/166, Upgrade 165→166, Repeat 1/2, fokussierte
  SQL-/Security- und Parallelitaetspruefungen PASS; Full Tests 1.963/1.963,
  Typecheck, Lint (0 Fehler, 8 bekannte Warnungen), Build, Secret Scan und
  Diff-Checks PASS. Die Produkt-/Migrationsquelle wurde seither nicht
  veraendert; diese Gates wurden fuer den reinen Staging-Schritt nicht
  wiederholt.
- Neue Datei: `20260924001000_test_provider_binding_tax_readiness.sql`;
  SHA-256 `48a46dcd37680ff52c0fbc6a735b41a1a26bf5cb2654afa05cf647fde7b53988`.
  Migrationen 001–165 blieben unveraendert. Das lokale Code-Lock-Pruef-ZIP
  blieb ausserhalb von Git; dessen SHA-256 ist
  `1627d6fac40c0aa20ab67c4d083ce17971d2ff53a44d0bacc7f07f2c14558093`.
- Vorher: Staging 165/165, nur Migration 166 im `--skip-vault`-Dry-Run.
  Nachher: 166/166, leerer Repeat-Dry-Run, DB-Lint `public` ohne Fehler.
  Keine Rollen, Seeds oder Vault-Secrets wurden gepusht.

## Vorher-/Nachher-Fingerprints

Fingerprints sind serverseitige MD5-Werte aus sortierten JSONB-Zeilen;
personenbezogene Zeilen und vollstaendige Provider-IDs wurden nicht
exportiert. Die folgenden 18 Bestandsrelationen wurden vor und nach der
Migration verglichen. Bei der Provider-Tabelle wurden die sieben neu
angehaengten Spalten fuer den Vergleich der acht alten Revisionen
ausgeklammert; diese alten Revisionen sind dadurch bytegleich nachgewiesen.

| Relation | Zeilen vorher/nachher | Vorher-Fingerprint | Nachher |
| --- | ---: | --- | --- |
| billing_product_versions | 4/4 | `78871b3849a58061305ef173481f9e9b` | identisch |
| billing_provider_binding_versions, alte Revisionen | 8/8 | `16a7c3a88d05f67934f8b8b0a592f863` | identisch, neue Spalten ausgenommen |
| billing_seller_versions | 1/1 | `208c2ebc37694a397e1b3257629de42f` | identisch |
| branch_subscriptions | 16/16 | `c227507fb1b5963faac5188b43c76ff3` | identisch |
| billing_trial_claims | 0/0 | `d41d8cd98f00b204e9800998ecf8427e` | identisch |
| billing_legacy_eligibility | 16/16 | `991fd8f9656ad1a38c11a0f2a8824f9b` | identisch |
| commercial_capacity_addon_versions | 2/2 | `e6b028fafb47e0bbede806568c6baba2` | identisch |
| commercial_capacity_plan_versions | 2/2 | `a25f46e4e8773197d2ec0b1e79a5f1e8` | identisch |
| restaurant_capacity_addon_entitlements | 0/0 | `d41d8cd98f00b204e9800998ecf8427e` | identisch |
| branch_entitlement_overrides | 1/1 | `58617169c4e441e9d0f0519ca1ab002a` | identisch |
| commercial_pro_access_grants | 0/0 | `d41d8cd98f00b204e9800998ecf8427e` | identisch |
| commercial_pro_access_audit | 0/0 | `d41d8cd98f00b204e9800998ecf8427e` | identisch |
| restaurants | 16/16 | `105c34227a6397cc3ad41d0a2f2cea40` | identisch |
| country_launch_policy | 6/6 | `8c7eb0028aca304b141b646c27c2a4c2` | identisch |
| restaurant_offers | 18/18 | `172eb4cec3a12d6aa66e89694ab73176` | identisch |
| restaurant_members | 18/18 | `142a33bf022ebe835fa90ee647302fe6` | identisch |
| commercial_plan_release_policy | 6/6 | `8d22ec520109433e465b83652f8510f9` | identisch |
| country_launch_readiness | 48/48 | `0489989b27d0bb0e43058abe9a0dbb33` | identisch |

Die erwarteten neuen Systemdaten sind exakt vier `TEST`-Binding-Revisionen 2
und eine `TEST`-Tax-Readiness-Revision. Es gibt keine neue Subscription,
keinen Trial-Claim, keinen Grant und keine Add-on-Einheit. Bestehende
Subscriptions samt Trial-/Periodenfeldern sind im Fingerprint enthalten;
Stripe-verknuepfte Subscriptions: 0.

## Technischer Staging-Vertrag

- Revisionen: LIVE/1 `UNBOUND` × 4; TEST/1 `UNBOUND` × 4;
  TEST/2 `VERIFIED` × 4. Keine fuenfte oder doppelte neue Bindung.
- BASIC 5.900 Cent, PRO 14.900 Cent, Offer Add-on 1.900 Cent und Customer
  Add-on 2.900 Cent; EUR/Monat, `licensed`, `per_unit`, `livemode=false`.
  Product-/Price-IDs wurden in Staging nur als irreversible Kurz-Hashes mit
  den vier im Migrationsfile festgelegten Paaren abgeglichen; Lookup Keys
  stimmten ebenfalls. Keine IDs oder Secrets im Bericht.
- Tax Readiness: genau eine TEST-Revision, Account Country AT,
  `PENDING_CONFIGURATION`, beobachtetes `UNSPECIFIED`, Automatic Tax `false`,
  nicht verifiziert. LIVE-Tax-Readiness fehlt und ist fail-closed.
- Der private TEST-Resolver gab `VERIFIED`/`PENDING_CONFIGURATION`, aber
  `commercial_activation_allowed=false` und `purchase_allowed=false`
  zurueck. Ein LIVE-Aufruf wurde mit `BILLING_TEST_ENVIRONMENT_REQUIRED`
  abgewiesen. Der bestehende Katalogresolver meldet fuer TEST
  `provider_ready=false`/`purchase_allowed=false`, fuer LIVE `UNBOUND`.
- Seller bleibt `PLANNED`; 0 Stripe-verknuepfte Subscriptions. AT ist im
  technischen Registrierungs-Gate aktiviert; dies ist keine kommerzielle
  Freigabe. `AT + PRO` bleiben kommerziell `LOCKED`.
- Beide Binding-/Tax-Tabellen haben RLS aktiv. `anon`, `authenticated` und
  `service_role` besitzen weder INSERT/UPDATE/DELETE noch EXECUTE auf dem
  privaten TEST-Resolver. Damit sind Owner, Staff und Customer ueber die
  Browser-Rolle nicht schreibberechtigt. Der Resolver ist `STABLE`,
  `SECURITY DEFINER` und hat einen festen `search_path`.

## Nicht geaendert und offene Gates

Kein Cloudflare- oder Edge-Deployment, keine Secrets oder Scheduler, kein
Stripe-Write, Checkout, Webhook, Customer Portal, Test-/Live-Zahlung oder
Production-Zugriff. Keine Businessdaten wurden veraendert. Die vorbestehende
fremde Datei `supabase/.temp/cli-latest` blieb unangetastet und uncommitted.
Tax-/Invoice-Readiness, Checkout/Webhook, positive Pending-Aktivierung,
Seller-Verifikation, Country-/KYB-/Legal-Freigaben und LIVE bleiben offen und
erfordern eigene Freigabe und Pruefung.

Status: **PHASE 7C.6C2B TEST-ONLY PROVIDER BINDING STAGING BACKEND LOCK /
TAX READINESS PENDING / CHECKOUT, WEBHOOK, TAX, ACTIVATION AND LIVE GATES OPEN**.
