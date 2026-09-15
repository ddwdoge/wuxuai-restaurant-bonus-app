# Phase 7B.3C – Platform-Admin Pro Control Center

Datum: 2026-09-15
Branch: `codex/v1-phase-7-pro-entitlements`
Implementierungscommit: `766d69e2a17b47e8273ab272a9bf608b7dc64b43`
Staging-Version: `caa6ca49-725f-4206-bdce-49af3183590d`

## Ursache

Der in Phase 7B.3A/3B bereitgestellte serverseitige Read-Vertrag benötigte eine ausschließlich für Platform Admins erreichbare Bedienoberfläche. Der Commercial Release Lock und AT + PRO mussten dabei unverändert fail-closed bleiben.

## Geänderte Dateien

- `src/modules/platform/PlatformAdminLayout.tsx`
- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/PlatformProControlCenter.tsx`
- `src/modules/platform/platformAdminNavigationI18n.ts`
- `src/modules/platform/platformAdminService.ts`
- `src/modules/platform/proControlCenterI18n.ts`
- `src/styles.css`
- `tests/platform-pro-control-center-ui.test.mjs`
- `tests/phase6-mobile-reference.test.mjs`

Der vorhandene uncommitted Phase-7B.3B-Bericht blieb unverändert erhalten.

## Was wurde geändert

- Neue Route und Menüsektion `Pro-Freigaben`.
- Länderstatus mit Sperrstatus, Herkunft, Grund und typisierten Berechtigungszahlen.
- Getrennte Bereiche für reale Pilotbetriebe und exakt serverseitig markierte TEST_ONLY-Betriebe.
- Grant-Historie für active, scheduled, expired und revoked sowie read-only Commercial-Audit.
- Geschützte Drawer-Verträge mit Grund, exaktem Bestätigungstext, Recent-Auth-Hinweis, Vorschau, Idempotenz-ID und Single-Flight-Schutz.
- Vollständige sichtbare Texte und ARIA-Bezeichnungen für DE/EN/FR/IT/ES/ZH/KO.
- Responsive Layoutverträge bis 320 CSS-px und Touchziele ab 44 CSS-px.
- Der bestehende Drawer-Inventartest wurde additiv von 43 auf 44 Instanzen aktualisiert.

## Was wurde nicht geändert

- Keine Migration oder Datenbankstruktur.
- Keine Stripe-Konfiguration und keine Production-Ressource.
- Keine Länder-, Pilot-, TEST_ONLY-, Verlängerungs- oder Widerrufsmutation.
- Keine direkte Browser-DML; die UI verwendet ausschließlich die fünf freigegebenen Read-RPCs und die vorhandenen geschützten Mutator-RPCs.
- Keine Pricing-, Unlimited-, Catalog-, Phase-7C- oder Phase-8-Arbeit.

## Automatische Gates

- Focused UI/Security: 27/27 PASS.
- Full Tests: 1836/1836 PASS.
- Typecheck: PASS.
- Lint: PASS mit acht bekannten, nicht scope-bezogenen Warnungen und null Fehlern.
- Build: PASS; 2128 Module transformiert.
- Secret Scan: PASS.
- `git diff --check` und Cached Diff Check: PASS.
- Remote-Branch exakt auf Implementierungscommit: PASS.

## Staging-Ergebnis

- Ausschließlich Worker `wuxuai-restaurant-bonus-app-staging` deployt.
- Cloudflare-Traffic: 100 % auf Version `caa6ca49-725f-4206-bdce-49af3183590d`.
- Route `/admin/platform/pro` als angemeldeter Platform Admin erreichbar.
- AT und alle sechs gelesenen Länder: `LOCKED`; AT sichtbar `Pro gesperrt`.
- Ein gespeicherter PRO-Zustand wurde weiterhin als effektiver Plan BASIC angezeigt.
- Berechtigungsbestand: eine abgelaufene Trial-Berechtigung; TEST_ONLY: 0 mit korrektem Empty State; Commercial-Audit: 0.
- Länder-Drawer für AT geöffnet: Recent Auth, Auswirkungsvorschau und exakter Text `PRO AT FREIGEBEN` sichtbar; Submit blieb ohne Eingaben deaktiviert; Abbruch schloss ohne Write.
- DE/EN/FR/IT/ES/ZH/KO physisch umgeschaltet; Route, Titel und AT-Sperrstatus blieben erhalten.
- Responsive CSS-Matrix 320/360/375/390/430/768/Desktop und Mindest-Touchziele durch fokussierten Vertragstest geprüft; Desktop-Staging zusätzlich physisch geprüft.
- Mutationen vor/nach QA: 0; Commercial-Audit blieb unverändert leer.

## Sicherheit und Risiken

Die bestehende serverseitige Platform-Admin-Rollenprüfung, RLS-/Grant-Matrix und Fail-closed-Regel wurden nicht verändert und durch Security Contracts erneut bestätigt. Owner, Staff, Customer und Anonymous bleiben an Route und RPC geblockt. Ein finaler Live-Mutator-Test war ausdrücklich nicht autorisiert; daher ist dies kein Final Lock für Mutator-Ausführung.

## Pflichtstatus

```text
PRO CONTROL CENTER ROUTE: PASS
PLATFORM ADMIN MENU: PASS
COUNTRY STATUS UI: PASS
AT STATUS: LOCKED
COUNTRY RELEASE DRAWER: PASS
REAL BUSINESS PILOT UI: PASS
TEST_ONLY EMPTY STATE: PASS
GRANT HISTORY: PASS
COMMERCIAL AUDIT: PASS
RECENT AUTH UI: PASS
CANCEL CAUSES WRITE: NO
DIRECT DML: NONE
OWNER/STAFF/CUSTOMER/ANONYMOUS: BLOCKED
DE/EN/FR/IT/ES/ZH/KO: PASS
RESPONSIVE MATRIX: PASS
TOUCH TARGETS >=44PX: PASS
STAGING MUTATIONS EXECUTED: 0
AT + PRO AFTER QA: LOCKED
DATABASE MIGRATION: NONE
STRIPE CHANGED: NO
PRODUCTION CHANGED: NO
STATUS: PHASE 7B.3C CONTROL CENTER UI COMPLETE / LIVE MUTATOR TEST NOT AUTHORIZED
```
