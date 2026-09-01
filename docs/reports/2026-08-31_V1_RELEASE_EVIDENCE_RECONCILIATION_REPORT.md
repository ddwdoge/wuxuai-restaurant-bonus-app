# WUXUAI Bonus V1 - Release Evidence Reconciliation

Stand: 2026-08-31

Branch: `codex/v1-canonical-recovery`

Local/Remote HEAD: `bc3a0905bb032409f8bb18595b6c436c100336e8`

## Auftrag

Spaetere Live- und Founder-Nachweise wurden gegen historische `PENDING`-Angaben
abgeglichen. Referral- und Multi-Role-Businessflows wurden ausdruecklich nicht
wiederholt. Es wurden ausschliesslich Release-Evidenz und Dokumentation
aktualisiert.

## Referral

Founder-Evidenz nach den relevanten Aenderungen:

- Native iPhone Share: PASS
- Referral-Link geoeffnet: PASS
- bestehendes Konto aktiviert: PASS
- Teilnahmebedingungen, Datenschutz und Einladung angenommen: PASS
- Customer Portal: PASS
- qualifizierender Besuch/Punkteflow: PASS
- 2x Referral-Bonus fuer beide Seiten: PASS
- Continuation nach Aktivierung ohne zweiten Login: physisch PASS

REFERRAL ACTUALLY OPEN: `NO`

MISSING EVIDENCE: `NONE`

## Multi-Role

Live-Evidenz: Deployment `9cbb8de7-3a07-40f0-a30e-ba7650041513`, Commit
`bb6ce42f8937bded4a28bad6545b84e8e71a6eba`.

- Staff Login: PASS
- stale Customer Access entfernt: PASS
- servervalidierter Join: PASS
- Membership: genau 1, tenant-korrekt
- zweiter Auth-User: NO
- Staff-Rolle erhalten: PASS
- Cross-Tenant Staff-Zugriff: BLOCKED
- Wiedereroeffnung ohne erneuten Join: PASS
- gleiche E-Mail / gleiches Passwort fuer Staff und Customer: physisch PASS

MULTI-ROLE ACTUALLY OPEN: `NO`

MISSING EVIDENCE: `NONE`

## Geschlossene spaetere Founder-Gates

- QR Center / A6 Preview Seite 1/2/3: Founder `PASS`
- E-Mail Initial Confirmation, Link, Success UI und Login: Founder `PASS`
- Resend fuer noch unbestaetigtes Konto / zweite Mail: Founder `PASS`
- Customer Password Reset, Update und Login mit neuem Passwort: Founder `PASS`
- Staff direkter Login mit gueltigem Staff-Konto: Founder `PASS`

## Verbleibende Release-Blocker

### 1. Point Anomaly Attribution

Bereits live belegt:

- 100 EUR unter 80 Prozent: PASS
- 240 EUR exakt 80 Prozent: PASS
- 250 EUR Staff-Buchung ueber 80 Prozent: PASS
- Owner-Warnung vorhanden, gelesen und geschlossen: PASS

Noch nicht abschliessend belegt:

- Staff-Detailattribution wurde beim physischen Test nicht eindeutig abgelesen.
- Owner-Hochbetragsbuchung mit sichtbarer Attribution `Restaurantinhaber` wurde
  nicht live bestaetigt.

Automatisierte Tests allein schliessen dieses Founder-/Live-Gate nicht.

### 2. Customer Discovery Direct Join

- Commit `bc3a0905bb032409f8bb18595b6c436c100336e8` ist lokal und remote synchron.
- Tests: `1172/1172 PASS`, Typecheck PASS, Lint 0 Fehler / 7 bestehende
  Warnungen, Build PASS.
- Der korrigierte Success-UI-Stand und das physische iPhone-Gate sind noch
  nicht als abgeschlossen dokumentiert.

## Repository- und Qualitaetsstand

- Worktree vor dieser reinen Dokumentationsaenderung: CLEAN
- Local/Remote vor dieser Dokumentationsaenderung: SYNCHRON
- Tests letzter aktueller Anwendungscode-Stand: `1172/1172 PASS`
- Typecheck: PASS
- Lint: PASS, 0 Fehler / 7 bestehende Warnungen
- Build: PASS
- Migration dieser Aufgabe: NONE
- Migration History: PASS, letzter dokumentierter Development/Test-Stand
- DB Linter: PASS, 0 Fehler, letzter dokumentierter Development/Test-Stand
- RLS/Security: UNCHANGED
- Businesslogik: UNCHANGED

## Finale Neuberechnung

OPEN P0: `0`

OPEN P1: `2`

OPEN PRODUCT RELEASE BLOCKERS: `2`

OPEN PHYSICAL FOUNDER GATES: `2`

REFERRAL: `PASS`

MULTI-ROLE: `PASS`

POINT ANOMALY: `FAIL / ATTRIBUTION LIVE GATE OPEN`

CUSTOMER DISCOVERY DIRECT JOIN: `CODE PASS / LIVE + IPHONE GATE OPEN`

V1 FINAL LOCK: `NO`

READY TO MERGE TO MAIN: `NO`

READY FOR PLATFORM V4: `NO`

PRODUCTION: `LOCKED`

STRIPE: `DEFERRED`

## Status

`NOT READY`. Referral und Multi-Role sind durch spaetere Evidenz geschlossen.
Es bleiben zwei P1-Release-Blocker; keine bestandenen Businessflows muessen
erneut ausgefuehrt werden.
