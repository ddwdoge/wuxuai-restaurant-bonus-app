# Phase 7B.1A – Commercial Pro Contract Reconciliation

Datum: 2026-09-15
Basis-HEAD: `c6f77bb79f7433516c1c6359a98fceb3ea380453`
Arbeitsstand: lokal, uncommitted, nicht gepusht

## Ursache

Die erste Phase-7B.1-Migration implementierte einen vollständigen
fail-closed Lock ohne Runtime-Mutator. Der neuere Founder-Vertrag erlaubt nun
einen streng geschützten Länder-Mutator und verlangt zusätzlich getrennte,
zeitbegrenzte reale Pilot- und interne TEST_ONLY-Berechtigungen.

## Geänderte Verträge

- Jede konfigurierte Länderpolicy startet unabhängig als `LOCKED`.
- `set_platform_commercial_pro_country_release` gibt genau ein Land frei oder
  sperrt es erneut. AT verlangt `PRO AT FREIGEBEN` beziehungsweise
  `PRO AT SPERREN`.
- `set_platform_commercial_pro_access` vergibt, verlängert und widerruft echte
  Piloten oder interne TEST_ONLY-Zugänge.
- Beide Mutatoren verlangen `platform_owner` oder `platform_admin`, eine
  aktuelle Session, eine höchstens zehn Minuten alte Authentifizierung,
  eindeutige Bestätigung, Begründung und globale Request-ID.
- Policy, Grants und Audit sind RLS-geschützt. Public, anon, authenticated und
  service_role besitzen keine direkte Tabellen-DML. Authenticated erhält nur
  die beiden serverseitig rollenprüfenden RPCs.
- Advisory Locks, Row Locks und eindeutige Request-IDs verhindern parallele
  Doppelmutationen.
- Der neue Audit ist append-only und enthält Akteur, Rolle, Zeit, Land,
  Betrieb/Organisation, Grund, Request-ID und Vorher-/Nachher-Zustand.

## Effektive Regel

```text
effective_pro =
(
  valid_country_release
  AND
  (valid_paid_pro_subscription OR valid_pro_trial OR valid_real_business_pilot)
)
OR valid_internal_test_only_override
```

Eine Länderfreigabe allein lässt Basic unverändert. Ein realer Pilot gilt nur
im freigegebenen Betriebsland. TEST_ONLY vor Länderfreigabe gilt nur bei exakt
passender aktiver serverseitiger Marker-Zuordnung für Restaurant,
Organisation, Owner und Namen. Alte Admin-/Feature-Overrides bleiben
gespeichert, sind aber keine eigenständige Pro-Autorität.

## Ablauf, Widerruf und Datenerhalt

Piloten und TEST_ONLY-Zugänge besitzen Start und verpflichtendes Ende. Es gibt
keine automatische Verlängerung, Rechnung, Belastung oder Stripe-Konvertierung.
Nach Ablauf, Widerruf oder Länder-Sperrung fällt der effektive Plan auf Basic.
Grant-Historie, Subscription, Kunden, Punkte, Besuche, Ledger und historische
Pro-Daten werden nicht gelöscht.

## Lokale Datenbankprüfung

- Fresh: PASS
- Upgrade mit bestehenden Paid-/Trial-/Admin-/Feature-Pro-Zuständen: PASS
- Repeat: PASS; sechs getrennte Policies, alle wieder `LOCKED`
- Rollen: Platform Admin PASS; Owner/Staff/Customer/rollenlos/anon BLOCKED
- Cross-Tenant/Cross-Country: PASS
- Länderfreigabe/Sperrung und Basic-kein-Autoupgrade: PASS
- Paid Subscription und Trial nur mit Länderfreigabe: PASS
- echter Pilot, Verlängerung, Widerruf und automatischer Ablauf: PASS
- TEST_ONLY vor Länderfreigabe und unmarkierter Negativfall: PASS
- append-only Audit: PASS
- Parallelität: 12 Länderrequests und 12 Pilotrequests; je ein Write/Audit: PASS

Der Test lief ausschließlich gegen einen temporären lokalen PostgreSQL-17-
Cluster. Keine Remote-Datenbank und keine realen Geschäftsdaten wurden
kontaktiert oder verändert.

## Automatische Gates

- Focused Commercial Lock: 13/13 PASS
- Focused Pro/Security Contracts: 40/40 PASS
- Full Tests: 1824/1824 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler / 8 bestehende Warnungen
- Build: PASS, 2126 Module
- Secret Scan: PASS
- Git Diff Check: PASS

## Abgrenzung und offene Punkte

- Kein Produkt-/UI-Code geändert.
- Kein gemeinsames oder zusätzliches Pro-Passwort eingeführt.
- Kein Stripe-Produkt, -Preis oder Subscription Item geändert.
- Der Founder-Zielpreis 149 EUR ist dokumentiert; der historische technische
  Pro-Katalogpreis und bestehende Unlimited-Darstellungen wurden in diesem
  Release-/Pilot-Sicherheitsgate nicht geändert und bleiben für den dafür
  freigegebenen Folgeumfang offen.
- Keine Migration auf Staging, kein Deployment, keine Production, keine realen
  Daten, kein Commit und kein Push.

## Pflichtausgabe

```text
COUNTRY RELEASE MUTATOR: PASS
MUTATOR REQUIRES PLATFORM ADMIN: PASS
RECENT AUTH REQUIRED: PASS
DIRECT DML: BLOCKED
COUNTRY ISOLATION: PASS
REAL BUSINESS PILOT: PASS
PILOT AUTO EXPIRY: PASS
PILOT AUTO BILLING: NONE
TEST_ONLY PRE-RELEASE ACCESS: PASS
BASIC AUTO-UPGRADE ON COUNTRY RELEASE: NO
AUDIT LOG: PASS
FAIL-CLOSED: PASS
MIGRATION APPLIED TO STAGING: NO
STATUS: PHASE 7B.1A LOCAL CONTRACT RECONCILIATION
```

## Abschluss

- Aufgabe: Phase 7B.1A Contract Reconciliation
- Build: Ja
- Migration: lokal reconciled / nicht auf Staging angewendet
- Flow-Test: isolierte lokale SQL-/RPC-/Rollen-/Parallelitätsmatrix bestanden
- RLS/Security: lokal bestanden
- Alte Logik geprüft: Ja
- Report: `docs/reports/2026-09-15_PHASE_7B_1A_CONTRACT_RECONCILIATION_REPORT.md`
- Prüf-ZIP: `exports/2026-09-15_PHASE_7B_1A_CONTRACT_RECONCILIATION.zip`
- Offene Risiken: Staging-Anwendung/-Nachweis nicht freigegeben; Pricing- und
  Unlimited-Folgeumfang nicht Bestandteil dieses Gates
- Status: CODE LOCK / NOT READY FOR STAGING

Desktop/Tablet/Mobile: nicht erneut physisch geprüft, da keine UI-Änderung.
