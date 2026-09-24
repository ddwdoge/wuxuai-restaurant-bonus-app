# Phase 7C.6C3B2A – Checkout-CORS Local Code Lock

Stand: 2026-09-24. Basis: `codex/v1-release-integration` bei `a4b1b53544ec0f43300726f4a85bff1c401b8b01`, Remote gleich. Staging-Projekt: `bwhvfjuwixgwduoeqaya`, Migrationen 168/168. Der exakte App-Origin `https://staging-app.bonus.wuxuaisbi.com` wurde mit `window.location.origin` in der bestehenden legitimen Chrome-Sitzung ermittelt.

## Ursache und Änderung

Der Checkout-Edge-Handler beantwortete browserseitige `OPTIONS`-Preflights mit 405 ohne CORS-Header. Geändert wurde ausschließlich `supabase/functions/billing-checkout-architecture/index.ts` sowie zwei eng betroffene Testdateien. Der Handler beantwortet zulässige OPTIONS vor Auth und Body mit 204 und leerem Body. Staging braucht `staging_negative_only` und die separate exakte Bindung `BILLING_STAGING_ALLOWED_ORIGIN`; lokale Tests brauchen `local_only` und eine exakt gebundene Loopback-Origin. Fremde, ähnliche, fehlende und `null`-Origins sowie nicht erlaubte Methoden oder Header erhalten keine CORS-Freigabe. Zulässige POST-Antworten behalten ihren Status und tragen Origin und `Vary: Origin`, ohne Credentials-Freigabe oder Wildcard.

Webhook, Checkout-Businesslogik, Auth/Rollen, Readiness-Gates, Provider/Stripe, Datenbank und Migrationen wurden nicht verändert. Die Webhook-Datei ist bytegleich zum Basiscommit. Die vorbestehende fremde Datei `supabase/.temp/cli-latest` und der ungetrackte 7C.6C3B1-Bericht blieben unangetastet.

## Lokale Gates

- Fokussierte Architektur-/HTTP-/CORS-/Security-Tests: 14/14 PASS. Preflight: 0 RPC-Aufrufe, 0 Writes und 0 Provideraufrufe im isolierten HTTP-Test.
- Full Tests: 1977/1977 PASS.
- Typecheck: PASS. Lint: PASS, 0 Fehler und 8 vorbestehende Warnungen.
- Build: PASS mit synthetischer Loopback-URL und öffentlichem Platzhalter für die zwei lokal fehlenden Vite-Variablen. Kein App-Deployment.
- Webhook-Hash gegen `HEAD`: bytegleich (`fe93446b7dea293e42134c14b0695f4ffd941e6d`).
- `git diff --check`: PASS. Keine Migration erstellt oder angewendet.

## Staging-Restgate

Dieses Dokument bescheinigt nur den lokalen Code Lock. Vor einem Staging-Lock bleiben der enge Commit/Push, Checkout-only-Deployment, physischer Owner-/Staff-HTTP-Test, Vorher-/Nachher-Fingerprints und vollständige Entfernung temporärer Staging-Secrets erforderlich. Keine positive Aktivierung, Zahlung oder Stripe-API ist freigegeben.
