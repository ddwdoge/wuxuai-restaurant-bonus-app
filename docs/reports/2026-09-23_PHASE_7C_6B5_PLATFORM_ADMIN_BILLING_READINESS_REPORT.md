# Phase 7C.6B5 – Platform-Admin Billing Readiness: lokaler Code Lock

Stand: 2026-09-23. Branch `codex/v1-release-integration`, Basis-HEAD `4faac97ace70b4ea88b0f13d7ecec4a789e76ac7`. Kein Commit oder Push. Keine Verbindung zu Staging, Production oder Stripe.

## Ursache und Korrektur

Der neue Subscription-BEFORE-INSERT-Guard lief vor `ON CONFLICT DO NOTHING`; dadurch schlug `ensure_restaurant_branch()` auch bei vorhandener Subscription fehl. Ausschließlich der noch nicht angewendete lokale Entwurf der additiven Migration 165 wurde korrigiert: kanonischer transaktionsgebundener Restaurant-Lock, serverseitige Prüfung der Tenant-/Branch-/Subscription-Bindung vor jedem Insert, unveränderte Rückgabe bei Bestandsdaten. Nur die vorhandene private Pending-Registrierungsautorität darf bei fehlender Subscription einen PENDING_ACTIVATION-Datensatz ohne Trial anlegen. Der Guard bleibt fail-closed. Migrationen 001–164 blieben bytegleich zu HEAD; keine Bestandsdaten wurden umgeschrieben.

Geänderter lokaler Produktumfang: Migration `20260923001000_platform_admin_billing_readiness_reads.sql`; `PlatformBillingReadiness.tsx`, `useBillingReadiness.ts`, `billingReadinessMessages.mjs/.d.mts`, `billing-readiness.css`; enge Bindungen in `PlatformProControlCenter.tsx`, `PlatformRestaurantControlCenter.tsx` und `PlatformPlanEntitlementsPanel.tsx`. Tests: `phase-7c6b5-billing-readiness.test.mjs`, `phase-7c6b5-runtime.local.mjs`, `phase-7c6b5-parallel.local.mjs`, `phase-7c6b5-browser.local.mjs` sowie gezielte Control-Center-Assertions. Der Canonical Product Contract dokumentiert ausschließlich den lokalen Code Lock. Die vorbestehende fremde Datei `supabase/.temp/cli-latest` blieb unangetastet.

## Lokale Testzugangs-Rotation

Der frühere diagnostische Tool-Output enthielt ausschließlich lokale Supabase-Testzugangswerte. Eine gezielte Suche über Worktree, Reports, ZIP-Quellen, Git-Index, erreichbare neue Commits und task-eigene Logs fand die exponierten hochentropischen Werte nur in zwei task-lokalen Startup-Logs; keine Repository- oder Evidenzdatei enthielt sie. Die beiden Logs und alte lokale Runtime-Metadaten wurden entfernt. Exakt projektgebundene alte DB-/Storage-Volumes und das leere task-eigene Netzwerk wurden nach Label-/Namensprüfung entfernt; fremde Ressourcen blieben erhalten.

Eine frische isolierte Runtime `wuxuai-phase7c6b5-rotated` erhielt kryptografisch neue lokale JWT-, Anon- und Service-Role-Werte. Alt/Neu-Vergleich erfolgte ohne Ausgabe; alte Anon-Tokens wurden abgewiesen, neue lokal akzeptiert. API und DB sind ausschließlich an `127.0.0.1` auf den autorisierten Ports 56121/56122 gebunden; Port 55439 wurde nicht verwendet. Remote-URLs sind im Rotations- und Browsertest gesperrt. Auth, Storage, PostgREST und PostgreSQL waren gesund. Die verwendete Supabase CLI 2.116.0 übernahm den lokalen DB-Passwort-Override nicht; eine DB-Passwort-Rotation wird daher **nicht** behauptet. Die alte projektgebundene DB-Runtime und ihr Volume wurden verworfen. Neue Testwerte liegen nur in einer zugriffsbeschränkten task-lokalen Datei außerhalb des Repositorys und sind weder im Bericht noch im ZIP.

## Abschließende Gates auf neuer Runtime

| Gate | Ergebnis |
| --- | --- |
| Fresh Replay / Historie | 165/165 PASS; DB-Lint ohne Findings |
| Upgrade / Repeat | historischer Replay 164/164; Upgrade 164→165; Repeat 1 und 2 PASS |
| Migrationen 001–164 | bytegleich zu HEAD |
| Bestandshelper | 24 parallele Aufrufe; ein Datensatz, keine Inserts/Audits/Änderungen |
| Pending / Guard | 24 parallele Pending-Registrierungen idempotent; 24 unzulässige Aktivierungen blockiert |
| Security | Rollen, RLS, direkte DML, RPC/Service-Role, tenantgebundene Rückgabe, Legacy-Trial und Rollback PASS |
| Browser | Chromium und WebKit; DE/EN/FR/IT/ES/ZH/KO; 320/375/390/430/767/768/1024/1440 px; 118 Checks PASS |
| UI | Touchziele mindestens 44 CSS-px; kein horizontaler Overflow; Seitenaufruf und Cancel/X/Escape ohne Writes |
| Fokussiert / Full | 53/53 und 1.960/1.960 PASS |
| Typecheck / Lint / Build | PASS / 0 Fehler, 8 bekannte Warnungen / PASS |
| Source-Parität | 38 relevante Produkt-, Migrations- und Testdateien vor/nach Runtime-Recovery SHA-256-identisch (`7a9a027400059df9bb48b392ceafd5b2699040216f8827884dfa212c39e66f70`) |

Die Full Suite wurde nach dem früheren Zwischenstand erneut ausgeführt, da Testdateien ergänzt worden waren. Keine Produkt-, Migrations- oder Testdatei wurde während der abschließenden Credential-Rotation verändert.

## Grenzen und Status

Migration 165 wurde nur lokal angewendet, nicht auf Staging. Seller bleibt PLANNED; TEST/LIVE-Providerpreise bleiben UNBOUND. Keine Zahlung, Entitlement-Aktivierung, Trial-Neuanlage außerhalb Pending, E-Mail, reale Datenänderung oder externe Bereitstellung. Die lokale Browsermatrix ist keine physische Staging-Abnahme. Secret Scan der 16 Evidenzquellen und des entpackten ZIP: PASS; ZIP-Integrität und Bytegleichheit aller 16 Mitglieder: PASS; `git diff --check` und `git diff --cached --check`: PASS. Acht task-eigene Testcontainer und der Proxy wurden kontrolliert gestoppt; das synthetische Upgrade-Volume wurde entfernt. Der fremde `welcome-to-docker`-Container blieb unverändert. Ein FINAL LOCK wird nicht behauptet.

**Status: PHASE 7C.6B5 PLATFORM-ADMIN BILLING READINESS UI LOCAL CODE LOCK.**
