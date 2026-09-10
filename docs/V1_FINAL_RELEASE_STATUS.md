# WUXUAI Bonus V1 - Final Release Status

Status: **SUPERSEDED STATUS SNAPSHOT / 2026-09-01**
Stand: 2026-09-01
Branch: `codex/v1-canonical-recovery`

**SUPERSEDED (2026-09-10):** Dieses Dokument belegt den Stand vom 2026-09-01,
ist aber keine aktuelle Austria-Launch-Statusquelle mehr. Aktueller Scope und
Reihenfolge stehen in `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`; der aktuelle
Ist-Status muss gegen diesen Master neu auditiert werden.

## Produkt- und Founder-Gates

- Owner / Legal Company Data: PASS
- Owner-Onboarding inklusive kontextbezogener Hilfe: FINAL LOCK; physischer
  Founder-Gate PASS
- Customer: PASS
- Staff: PASS
- Multi-Role: FINAL LOCK
- Password Recovery: PASS
- E-Mail-Bestaetigung und Resend: PASS
- Referral inklusive Native Share und Continuation: FINAL LOCK
- Discovery Direct Join: FINAL LOCK
- Welcome Gift: FINAL LOCK
- Birthday Gift 14-Day Catch-up: FINAL LOCK
- Customer Home Multi-Gift: FINAL LOCK
- Punkte und Point Anomaly: FINAL LOCK
- Rewards / Offers / automatische Rabattdarstellung: PASS
- QR Center / A6 Starter Kit / Physical iPhone: FINAL LOCK
- Commercial Contract: 3 Kalendermonate kostenlos, danach 59 EUR pro Monat
  exkl. USt.: PASS
- Security / RLS / Guardrails: PASS

## Datenbank

- Development/Test Supabase: `bwhvfjuwixgwduoeqaya`
- Migration History bis `20260831001000`: synchron
- Pending approved V1 migrations: 0
- Post-Dry-Run: PASS
- DB-Linter Level Error: 0
- Production-Migration: keine

## Offene Gates

- Open P0: 0
- Open P1: 0
- Open Product Release Blockers: 0
- Open Physical Founder Gates: 0

## Git- und Releasegrenze

- V1 Final Lock: YES
- Ready for Founder Main Merge: YES
- Main modified by this freeze: NO
- Production deployed: NO
- Production: LOCKED bis zur ausdruecklichen Founder-Release-Freigabe
- Stripe: DEFERRED; Vorbereitung und Live-Aktivierung sind separate Gates

## Main-Reconciliation

- Die Legal-/Security-Hardening-Historie von `main` ist im V1-Branch enthalten.
- Die beiden bisherigen main-only Commits enthalten ausschliesslich den Merge
  und historische ZIP-Evidenz. Es fehlt keine Anwendungsaenderung im V1-
  Branch; alte Source wird nicht rueckwirkend in V1 kopiert.
- Die spaetere Integration darf die main-only Evidenzhistorie bewahren, aber
  erfolgt erst nach Founder-Freigabe. Dieser Freeze fuehrt weder Merge noch Tag
  oder Production-Deployment aus.

## Platform V4

Nach dem bewussten V1-Release bleibt `main` die stabile V1-Basis. Platform V4
beginnt auf separatem Branch und getrenntem Development/Staging-Worker. Neue
Pakete erweitern den identifizierbaren V1-Basistarif; experimentelle V4-Arbeit,
Stripe-Live-Aktivierung und unfertige Add-ons werden nicht direkt auf `main`
oder in Production entwickelt.
