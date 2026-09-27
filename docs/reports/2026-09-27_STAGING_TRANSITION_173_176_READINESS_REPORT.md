# Staging Transition 173–176 – Readiness Report

Datum: 2026-09-27
Arbeitsbranch: `codex/platform-admin-totp-aal2`
Lokaler HEAD: `a510065adbe899d87b8929197af7ebf23d0cac65`

## Ursache und Ziel

Der weitere KYB-/PRO-Ausbau wurde angehalten, um den sicheren Uebergang des
bereits lokal geprueften Stands nach Staging vorzubereiten. In diesem Lauf
wurde Staging nur read-only geprueft. Es wurde keine Migration angewendet,
kein Faktor eingerichtet, kein Deployment ausgefuehrt und kein Datensatz
veraendert.

## Verifizierter Ist-Stand

- Verknuepftes Projekt: `bwhvfjuwixgwduoeqaya`,
  `wuxuai-bonus-staging`, `ACTIVE_HEALTHY`, Region `eu-west-1`.
- Production ist ein anderes, nicht verknuepftes Projekt.
- Staging-Migrationen: **172/172**.
- 173, 174, 175 und 176 sind lokal vorhanden und remote nicht angewendet.
- Aktueller Worktree ist nicht der kanonische Integrationsbranch und besitzt
  keine konfigurierte Git-Remote-URL. Ein Remote-/Push-Gate ist deshalb vor
  jeder Staging-Anwendung zwingend nachzuholen.
- `supabase/.temp/cli-latest` ist vorbestehend veraendert und wurde nicht
  angefasst, gestaged oder zurueckgesetzt.

## Migrationen und Hashes

| Nr. | Datei | SHA-256 | Lokal | Staging |
|---|---|---|---|---|
| 173 | `20260926001000_platform_admin_totp_aal2_gate.sql` | `fe76bbbc8b24fc069231bb0f56d4351e801d40216c6625df9d4655d0162913ce` | committed/local code lock | offen |
| 174 | `20260926002000_austrian_kyb_secure_documents.sql` | `f98a0e079dfb9d7dbae514ecafa7595a77eb36488bb7c9fa5ac81c8a43aa2bd5` | uncommitted/local geprüft | offen |
| 175 | `20260926003000_pro_notification_dispatch_authorization.sql` | `d81ade0a6bc1a7f8b2aca0fa10a8b834fbacab67a881c002e20e19d84864195a` | uncommitted/local geprüft | offen |
| 176 | `20260926004000_platform_admin_kyb_document_review.sql` | `257dfd6a5eee3c6700059cde1ea72effe814eaa6211c0e0da8da1d4ed602d865` | uncommitted/local geprüft | offen |

## Abhaengigkeiten

- 173 bindet die bestehende Platform-Rollenautoritaet an eine aktuelle
  Auth-Session, einen weiterhin verifizierten TOTP-Faktor und AAL2/TOTP-AMR.
- 174 folgt auf 173 und erstellt private KYB-Dokument-/Eventstrukturen,
  Storage-Policies und Owner-RPCs. Die Platform-Leseautoritaet erbt damit den
  durch 173 geschuetzten Rollenvertrag.
- 175 ersetzt Queue-Reservierung und ergaenzt die finale service-role-only
  Dispatch-Autorisierung. Der Edge Dispatcher muss erst nach 175 deployed
  werden.
- 176 setzt 173 und 174 voraus: jede Platform-KYB-Leseoperation und der
  private Storage-Zugriff pruefen den expliziten TOTP/AAL2-Reviewer-Vertrag.

## Deploy- und Commitumfang

### Bereits committed: 173

Die lineare Commitkette `2ac215c` → `9c91a30` → `a510065` enthaelt Migration
173, Platform-Admin-MFA-UI, Security-Tests, Recovery-Vertrag und die
Staging-Checkliste. Der Staff-Auth-Commit `8acb24c` ist ein Vorfahr.

### Noch eng zu committen

1. **KYB 174 + 176 gemeinsam als Implementierungsumfang:** Migrationen 174
   und 176, Owner-/Platform-Seiten, beide CSS-Dateien, der gemeinsam genutzte
   `businessVerificationService`, KYB-/Security-/Browsertests. Diese gemeinsame
   Abgrenzung vermeidet eine riskante kuenstliche Teilung der gemeinsamen
   Service-Datei. Die Migrationen bleiben trotzdem einzeln in der Reihenfolge
   174 und 176 anwendbar.
2. **PRO 175 separat:** Migration 175, geaenderter
   `transactional-mail-dispatcher`, drei fokussierte Testdateien.
3. **Evidenz separat:** vier vorhandene Phase-Berichte plus dieser
   Uebergangsbericht und die neue Checkliste. Pruef-ZIPs werden nicht
   committed.

Vor einem Commit sind Staged-Secret-Scan, `git diff --cached --check`, exakte
Dateiliste und Remote-/Integrationsbranch-Abgleich erforderlich.

## Recovery-Voraussetzungen Migration 173

| Gate | Status | Nachweis |
|---|---|---|
| Lokaler AAL2/TOTP-Code und Session-/Faktorbindung | PASS | Migration 173 und lokale Security-Nachweise; gespeicherter AAL2-Token wird nach Sessionwiderruf/Faktorentfernung serverseitig blockiert |
| Offizieller Faktor-Recoveryvertrag | PASS (Architektur) | `auth.admin.mfa.listFactors` + `deleteFactor`, keine AAL1-Ausnahme und kein Browser-/JWT-Bypass |
| Tatsaechliche maximale Staging-JWT-Laufzeit | OPEN | CLI 2.116 bietet keinen read-only Config-Get; der authentifizierte Dashboard-Sessions-Bereich war erreichbar, der konkrete Projektwert in der verfuegbaren read-only Oberflaeche jedoch nicht belastbar auslesbar. Der lokale Ein-Stunden-Wert wird nicht auf Staging uebertragen. |
| Geschuetzter Recovery-Runner | OPEN | Repository-Suche findet nur Browser-`listFactors`; kein serverseitiger Runner mit Auth-Admin-`listFactors/deleteFactor` ist implementiert oder auf Staging nachgewiesen. |
| Independent Recovery Approver | OPEN | Vertrag definiert die Rolle, nennt aber keine Person. |
| Recovery Executor | OPEN | Vertrag definiert Rolle/Berechtigung, nennt aber keine Person und weist keinen separaten MFA-geschuetzten Supabase-Zugang nach. |
| Kontrollierter TOTP-Einrichtungsablauf | PASS (Plan), OPEN (Staging) | UI, lokale Tests und Reihenfolge sind vorhanden; physische Einrichtung ist ohne die drei offenen Recovery-Gates nicht freigegeben. |

Damit ist Migration 173 **nicht zur Anwendung bereit**.

## Bereits bestandene lokale Nachweise

Die letzte gemeinsame Integrationsevidenz belegt Fresh 176/176, Upgrade
175→176, Repeat 1/2, DB-Lint, Rollen/RLS/Storage, 42/42 lokale Browserchecks,
Full Suite 2.038/2.038, Typecheck, Lint und Build. Diese Suite wurde in diesem
reinen Uebergangsloop nicht ohne konkreten Grund wiederholt.

## In diesem Lauf ausgefuehrte fehlende Pruefungen

- vollstaendige Worktree-/Diff-Inventur;
- Hashpruefung 173–176;
- read-only Staging-Projektidentitaet;
- read-only Remote-Migrationshistorie;
- Recovery-Runner-Suche in Produktcode, Funktionen, Skripten und Tests;
- Rollenbesetzung im Recovery-Vertrag;
- Deploy-Abhaengigkeiten und kontrollierte Rollout-Reihenfolge.

## Nicht veraendert

- keine Migration, kein Staging-Datensatz, kein Faktor, kein Secret;
- kein Edge-/App-Deployment;
- kein Stripe- oder Production-Zugriff;
- keine neue KYB- oder PRO-Funktion;
- keine Customer-Mail und kein Scheduler;
- keine fremde oder vorbestehende Arbeitsbaumdatei.

## Entscheidungen vor der Staging-Anwendung

Founder/Organisation muessen namentlich festlegen:

1. Independent Recovery Approver (nicht Requestor);
2. Recovery Executor mit separatem MFA-geschuetztem Supabase-Zugang;
3. verantwortliche Person und Wartungsfenster fuer TOTP-Ersteinrichtung;
4. autorisierte bestehende Testkonten fuer Platform Admin, Owner, Staff,
   Customer und fremden Tenant;
5. ob/wann ein spaeterer positiver synthetischer E-Mail-E2E-Test ausdruecklich
   freigegeben wird. Im geplanten Rollout bleibt reale Zustellung 0.

Codex kann danach die technische Preflight-Matrix, Hashes, Fingerprints,
Migrationen einzeln, DB-/RLS-/RPC-Gates, kontrollierte Deployments,
Browserpruefung und Evidenz ausfuehren. Codex kann keine unabhaengigen
Organisationsrollen selbst benennen oder deren Supabase-Berechtigung erteilen.

## Status

**STAGING TRANSITION PLAN COMPLETE / MIGRATIONS 173–176 NOT APPLIED /**
**MIGRATION 173 BLOCKED BY OPEN RECOVERY GATES / PRODUCTION LOCKED**
