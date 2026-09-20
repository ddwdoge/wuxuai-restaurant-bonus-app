# WUXUAI Bonus – Phase 7B.4F Touch-Target und LOCKED-Country Pilot-Preview

Datum: 2026-09-21  
Branch: `codex/v1-release-integration`  
Ausgangs-HEAD/Remote: `dc3f76cc60569d610fdd54330720955ec713bb0a`  
Implementierungscommit: `fd8fea0fbc822f847ba8227a642458a387905ec7`  
Staging Worker: `wuxuai-restaurant-bonus-app-staging`  
Staging Version: `a56d9dba-7b37-4c7c-974e-156d7a1f11f8`

## Ursache

Der gemeinsame `.button`-Vertrag besaß eine Mindesthöhe von 42 CSS-px. Der
sichtbare Platform-Admin-Logout hatte keinen engeren 44-px-Vertrag. Außerdem
war der Pilot-Button für Betriebe in einem `LOCKED`-Land vollständig
deaktiviert. Dadurch blieb der sichere Server-Lock zwar erhalten, die
read-only Oberflächenprüfung des Pilot-Drawers war jedoch unmöglich.

## Geänderte Dateien

- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/PlatformProControlCenter.tsx`
- `src/modules/platform/proControlCenterI18n.ts`
- `src/styles.css`
- `tests/platform-pro-control-center-ui.test.mjs`

## Was geändert wurde

- Der Platform-Admin-Logout besitzt einen eigenen, responsiv stabilen Vertrag
  von mindestens 44 × 44 CSS-px.
- Der Pilot-Button öffnet bei `LOCKED` jetzt eine explizite Vorschau.
- Die Vorschau zeigt Betriebssuchbereich, ausgewählten Betrieb, Land, Status
  `LOCKED`, Laufzeit, Start, Ablauf und Begründung.
- Laufzeit, Datum und Begründung sind im LOCKED-Modus deaktiviert.
- Bestätigungsphrase und Mutationsbutton werden im LOCKED-Modus nicht
  gerendert.
- `valid`, Formular-Submit und `submit()` besitzen jeweils einen zusätzlichen
  fail-closed Client-Guard. Der bestehende Server-Lock blieb unverändert.
- Der neue Hinweis ist für DE/EN/FR/IT/ES/ZH/KO lokalisiert.

## Was nicht geändert wurde

Keine Datenbankfunktion, RPC, RLS-Regel, Länderpolicy, Migration, Subscription,
Entitlement-, Billing-, Stripe-, Produkt-, Kunden- oder Image-Render-Logik
wurde verändert. Es wurden keine Grants und keine TEST_ONLY-Marker erstellt.
Production wurde nicht adressiert. Migration `20260915003000` blieb bytegleich
mit SHA-256
`5ff37ab21bab8b3727587d9370dbd581c391d9260f661b7ca0ca860d6f00db91`.

## Automatische Gates

- Fokussierte UI-/Security-Verträge: 56/56 PASS
- Full Tests: 1879/1879 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 8 unveränderte Bestandswarnungen
- Build: PASS, 2128 Module transformiert
- Secret Scan: PASS
- `git diff --check`: PASS
- Branch-/Remote-Parität vor Implementierung und nach Push: PASS
- Serververtrag: Rollenprüfung, Country-Lock, keine Browser-DML und
  fail-closed Entitlement-Auflösung unverändert und PASS

Ein zusätzlich aufgerufener DB-Parallelitätstest wurde nicht als Gate gezählt,
weil kein isolierter lokaler Datenbankport gestartet war. Er meldete
ausschließlich die dafür vorgesehene Infrastrukturvorbedingung; die
produktbezogenen Testläufe blieben vollständig grün. Für diesen reinen UI-Fix
wurde weder eine Migration noch ein lokaler oder Staging-Mutator ausgeführt.

## Physischer Staging-Resttest

Die vom Founder legitim hergestellte Platform-Admin-Sitzung blieb aktiv.
Nach cache-frischem Laden zeigte die echte Staging-Route den neuen Vertrag.

| Viewport | Logout B×H | kleinstes aktives Control-Center-Ziel | horizontaler Overflow |
| ---: | ---: | ---: | ---: |
| 320 | 131 × 44 | 54.765625 × 44 | 0 |
| 375 | 154.5 × 44 | 54.765625 × 44 | 0 |
| 390 | 162 × 44 | 54.765625 × 44 | 0 |
| 430 | 182 × 44 | 54.765625 × 44 | 0 |
| 767 | 350.5 × 44 | 54.765625 × 44 | 0 |
| 768 | 347 × 44 | 54.765625 × 44 | 0 |
| 1024 | 108.96875 × 44 | 54.765625 × 44 | 0 |
| 1440 | 108.96875 × 44 | 54.765625 × 44 | 0 |

Bei 320 px war der LOCKED-Drawer mit `overflow-y: auto` scrollbar. Die
tatsächlich aktiven Drawer-Ziele maßen 44 × 44 und 288 × 46 CSS-px. Die
deaktivierten Laufzeit-, Start-, Ablauf- und Begründungsfelder waren sichtbar.
Ein Submit-/Freigabebutton und eine Bestätigungsphrase waren nicht vorhanden.

Abbrechen, X und Escape schlossen den Drawer. Die Betriebssuche wurde gesetzt
und wieder geleert. DE/EN/FR/IT/ES/ZH/KO zeigten jeweils eine vollständige
Seite und AT eindeutig als gesperrt. Es wurde nichts gespeichert.

## Datenintegrität

Vorher, nach dem funktionalen Smoke und nach der finalen 320-px-Messung waren
die relevanten Staging-Fingerprints identisch:

- `branch_subscriptions`: `16:be47a2c1045634fae3aa044717589367`
- `commercial_plan_release_policy`: `6:4ebd52fc9bb687b0b94feb4475392a53`
- `commercial_pro_access_audit`: `0:d41d8cd98f00b204e9800998ecf8427e`
- `commercial_pro_access_grants`: `0:d41d8cd98f00b204e9800998ecf8427e`
- `platform_admin_operations`: `31:f4cf7ce2deabdaaaa2b09c3d8522d081`
- `platform_test_tenant_registry`: `2:af3fcb6f095450225b6984b6e5c5d911`

Damit verursachten Öffnen, Suche, Abbrechen, X, Escape, Sprachwechsel und
Responsive-Messung exakt 0 relevante Writes. Alle sechs Länder blieben
`LOCKED`, Grants und Commercial Audit blieben bei 0.

## Staging-Asset-Parität

- Aktive Version: `a56d9dba-7b37-4c7c-974e-156d7a1f11f8`
- Hauptasset: `assets/index-v703Ljg9.js`
- Lokaler und remote SHA-256:
  `187a6dae9da9be79ce9f1ca2eb3b77fc1a4d30ae48f7b89dab30be38f5dfda5d`
- Bytevergleich: PASS

## Abschlussmatrix

```text
LOGOUT TOUCH TARGET: PASS
ALL CONTROL CENTER TOUCH TARGETS >=44PX: PASS
LOCKED COUNTRY PILOT PREVIEW: PASS
LOCKED NOTICE: PASS
BUSINESS SEARCH AREA: PASS
DURATION FIELD: PASS
END DATE FIELD: PASS
REASON FIELD: PASS
MUTATION CONTROL DISABLED: PASS – nicht gerendert
CLIENT BYPASS: BLOCKED
SERVER BYPASS: BLOCKED
CANCEL WRITES: 0
CLOSE WRITES: 0
ESCAPE WRITES: 0
DE/EN/FR/IT/ES/ZH/KO: PASS
RESPONSIVE MATRIX: PASS
BEFORE/AFTER FINGERPRINTS: IDENTICAL
COUNTRY POLICIES CHANGED: NO
AT + PRO AFTER QA: LOCKED
PRO GRANTS CREATED: 0
TEST_ONLY MARKERS CREATED: 0
DATABASE MIGRATION: NONE
STRIPE CHANGED: NO
PRODUCTION CHANGED: NO
IMPLEMENTATION COMMIT: fd8fea0fbc822f847ba8227a642458a387905ec7
EVIDENCE COMMIT: siehe finalen Remote-HEAD dieses Berichts
STAGING VERSION: a56d9dba-7b37-4c7c-974e-156d7a1f11f8
STATUS: PHASE 7B.4F FINAL LOCK
```

## Pflichtstatus

- Aufgabe: Phase 7B.4F Touch-Target und LOCKED-Country Pilot-Preview
- Build: Ja
- Migration: Keine; bestehende Migration unverändert
- Flow-Test: Ja, echtes Staging mit legitimer Platform-Admin-Sitzung
- RLS/Security: Ja; unverändert und erneut geprüft
- Alte Logik geprüft: Ja
- Offene Risiken: Keine im beauftragten Scope
- Status: FINAL LOCK

```text
TASK-OWNED BACKGROUND PROCESSES STARTED: 0
TASK-OWNED BACKGROUND PROCESSES STOPPED: 0
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS
UNRELATED NODE PROCESSES CHANGED: NO
```
