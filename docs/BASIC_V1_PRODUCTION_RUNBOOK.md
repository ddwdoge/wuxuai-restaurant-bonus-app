# WUXUAI Bonus BASIC V1 – Production Runbook

Status: **DRAFT / PRODUCTION OPEN**
Stand: 2026-09-28
Gültigkeit: ausschließlich BASIC V1; PRO, Stripe LIVE und Production bleiben
bis zur ausdrücklichen Releasefreigabe gesperrt.

## 1. Verantwortlichkeiten

| Rolle | Aufgabe |
|---|---|
| Founder / Release Owner | Releasefenster, Seller-/Tax-/Rechtsfreigaben und finalen GO/NO-GO bestätigen |
| Platform Admin | AAL2-Zugang und zwei funktionsfähige TOTP-Faktoren vor dem Fenster bestätigen |
| Technical Executor | Commit-, Build-, Migrations-, Edge- und Worker-Parität herstellen |
| Independent Observer | Fingerprints, Stop-Kriterien und Nachweise gegenprüfen |

Keine Person darf einen offenen Seller-, Tax-, Legal-, Country-, KYB- oder
Kassa-Blocker durch eine technische Ausnahme ersetzen.

## 2. Unverzichtbare GO-Voraussetzungen

- Exakter freigegebener Release-Commit ist normal per Fast-forward auf dem
  kanonischen Integrationsbranch und als unveränderlicher Releasekandidat
  dokumentiert.
- Staging besitzt App-, Schema- und Edge-Parität mit diesem Commit.
- Der vollständige synthetische BASIC-Flow ist auf Staging physisch bestanden.
- Sellerstatus, Tax Readiness, Preis-Tax-Behavior, Rechnungstexte und
  zahlungsrechtliche Informationen sind final bestätigt.
- Stripe TEST ist vollständig bestanden; Stripe LIVE besitzt separat geprüfte
  Product-/Price-/Webhook-/Portal-Bindungen. TEST-Werte werden nie übernommen.
- Reales KYB, Datenschutz, Dokumentkatalog, Aufbewahrung und manuelle
  Aktivierungsregel sind freigegeben.
- Zwei verifizierte TOTP-Faktoren des Platform Admin sind funktionsfähig; der
  letzte Faktor wird niemals entfernt.
- Customer-Mail-Scheduler bleibt deaktiviert, bis sein eigener Releasevertrag
  bestanden ist.

## 3. Konfigurationsnamen – niemals Werte in den Bericht aufnehmen

### Web-App-Build

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Redemption Edge

- `REDEMPTION_EDGE_MODE`
- `REDEMPTION_STAGING_PROJECT_REF` beziehungsweise der separat bestätigte
  Production-Projektbezug

### BASIC Billing Edge

- `BASIC_BILLING_MODE`
- `BASIC_BILLING_PROJECT_REF`
- `STRIPE_TEST_SECRET_KEY` nur auf Staging
- `STRIPE_TEST_WEBHOOK_SECRET` nur auf Staging
- spätere LIVE-Namen nur nach separater Freigabe; niemals TEST-Namen umdeuten

Supabase-Runtime-Namen (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) werden ausschließlich von der vorgesehenen
Runtime bereitgestellt. Service Role darf nie in Browserassets gelangen.

## 4. Preflight und Fingerprints

1. Branch, Release-Commit, Remote-HEAD, lineare Ancestry und Sign-off prüfen.
2. Deployment-Automatik und exakt betroffenen Worker bestimmen.
3. Production-Projekt, Organisation und Projektname unabhängig bestätigen.
4. Tatsächlichen Migrationsstand read-only erfassen; keine Versionsannahme.
5. SHA-256 aller ausstehenden Migrationen erfassen; historische Migrationen
   müssen bytegleich mit dem freigegebenen Commit sein.
6. Edge-Funktionsnamen, Versionen und `verify_jwt`-Vertrag erfassen.
7. Vorher-Fingerprints mindestens für Restaurants, Branches, Memberships,
   Subscriptions, Trialentscheidungen, Billing-/Providerbindungen, KYB,
   Legal-/Country-/Kassa-Gates, Customer-Konten, Punkte, Rewards, Offers,
   Redemption, Audit und alle neuen BASIC-Evidenztabellen erstellen.
8. Secret Scan, Diff Checks, Full Suite, Typecheck, Lint und Build des exakten
   Releasekandidaten bestätigen.

## 5. Kontrollierte Rollout-Reihenfolge

1. Wartungsfenster aktivieren; Platform-Admin-Mutationen einfrieren.
2. Falls Production noch vor Migration 173 steht: zuerst ausschließlich die
   Dual-TOTP-fähige UI deployen und beide Faktoren physisch bestätigen.
3. Alle ausstehenden Migrationen ausschließlich in numerischer Reihenfolge
   anwenden. Für den aktuellen BASIC-Pfad ist die Abhängigkeit insbesondere:
   `173 → 174 → 175 → 176 → 177 → 178 → 179 → 180 → 181 → 182`.
4. Nach jeder Migration: History, erwartete Relation-/Funktionsdeltas,
   geschützte Fingerprints und Abbruchkriterien prüfen. Nie zur nächsten
   Migration springen, wenn ein Delta ungeklärt ist.
5. Leeren Repeat-Dry-Run und DB-Lint bestätigen.
6. Nur die zum Releasecommit gehörenden Edge Functions deployen. BASIC-
   Checkout und Webhook erst nach Schema 181/182.
7. App aus dem exakten Releasecommit auf den ausdrücklich bestätigten
   Production-Worker deployen. Staging- und Production-Worker dürfen nicht
   verwechselt werden.
8. Asset-Manifest, HTML-/Asset-Hashes, Worker-Version und Commitmarker prüfen.
9. Erst nach negativem Smoke und erneutem GO die freigegebenen LIVE-
   Providerbindungen aktivieren. Trialende allein löst nie Checkout oder
   Belastung aus.

## 6. Smoke-Matrix

### Fail-closed zuerst

- Anonymous, Customer, Staff und Owner ohne Berechtigung: Platform-Aktionen
  blockiert.
- Platform Admin AAL1: geschützte RPCs blockiert.
- Fremder Tenant und falscher Restaurant-/Branchbezug: blockiert.
- Trialaktivierung mit offenem Country-, KYB-, Legal- oder Kassa-Gate:
  blockiert.
- Checkout ohne ausdrückliche Owner-Annahme, vor Trialende oder ohne gültige
  Providerbindung: blockiert.
- Falsche Webhooksignatur, `livemode=false` im LIVE-Pfad, unbekannte Events,
  Hashkonflikt und Replay: blockiert oder idempotent klassifiziert.
- PRO, Customer-Mail-Scheduler und neue Länder bleiben gesperrt.

### Positiv erst danach

- Manuelle AAL2-BASIC-Trialaktivierung für einen freigegebenen synthetischen
  Smoke-Tenant mit einem und drei Kalendermonaten.
- Entscheidung in den letzten sieben Tagen; kein Checkout vor Trialende.
- Trialende ohne Folgeauftrag: aktive Nutzung endet, 60 Tage ausschließlich
  bestehende Ansprüche einlösbar, keine neuen Beitritte/Punkte/QRs/Angebote.
- Ausdrückliche BASIC-Bestellung zu 59 EUR netto/Monat, signierter Checkout,
  Rechnung, bezahltes Event, Zahlungsausfall und Kündigung.
- Reaktivierung ausschließlich als neuer ausdrücklich angenommener Vertrag.
- Duplicate-/Out-of-order-Webhooks bleiben idempotent und tenantgebunden.

## 7. Stop-Kriterien

Sofort stoppen bei falschem Projekt/Worker, Remote-Divergenz, anderem
Migration-Hash, unerwartetem Daten-Fingerprint, fehlendem AAL2, nur einem
funktionsfähigen TOTP-Faktor, offenem Seller-/Tax-/Legal-Gate, Service Role im
Browserbundle, LIVE-/TEST-Vermischung, unbekannter Providerbindung, echter
Kundenzustellung oder jeder nicht ausdrücklich erwarteten Businessmutation.

Kein Merge, Rebase, Force-Push, Datenlöschen oder improvisierter Gate-Bypass.

## 8. Rollback

- App: auf die vorher verifizierte Worker-Version zurückrollen; Asset-Hashes
  und Healthcheck erneut prüfen.
- Edge: betroffene Funktion deaktivieren beziehungsweise vorherige verifizierte
  Version erneut deployen; Webhookziel nur über den freigegebenen Providerweg
  ändern.
- Schema: additive Migrationen nicht rückwärts löschen. Schreibpfade
  fail-closed deaktivieren, Evidenz erhalten und ausschließlich eine geprüfte
  additive Korrekturmigration verwenden.
- Provider: neue Checkouts sperren; bestehende Providerereignisse unverändert
  sichern und reconciliieren. Keine Subscription oder Rechnung pauschal löschen.
- Nach jedem Rollback Fingerprints und Audit-Prefix erneut prüfen.

## 9. Abschlussnachweis

Erforderlich sind Releasecommit, Remote-Parität, Worker-/Asset-/Edge-Versionen,
Migrationsstand, Migration-Hashes, Before-/After-Fingerprints, DB-Lint,
Smoke-Matrix, Providerinventar, Secret Scan, Prozess-Cleanup und eine explizite
Bestätigung: `Production unverändert` bis zum tatsächlichen freigegebenen
Releasefenster.
