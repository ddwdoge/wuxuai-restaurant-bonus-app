# Staging Transition 173–176 – Readiness Report

Datum: 2026-09-27
Arbeitsbranch: `codex/platform-admin-totp-aal2`
Ausgangs-HEAD: `a510065adbe899d87b8929197af7ebf23d0cac65`

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
| 174 | `20260926002000_austrian_kyb_secure_documents.sql` | `f98a0e079dfb9d7dbae514ecafa7595a77eb36488bb7c9fa5ac81c8a43aa2bd5` | committed/local geprüft (`5d2cb97`) | offen |
| 175 | `20260926003000_pro_notification_dispatch_authorization.sql` | `d81ade0a6bc1a7f8b2aca0fa10a8b834fbacab67a881c002e20e19d84864195a` | committed/local geprüft (`9cc0668`) | offen |
| 176 | `20260926004000_platform_admin_kyb_document_review.sql` | `257dfd6a5eee3c6700059cde1ea72effe814eaa6211c0e0da8da1d4ed602d865` | committed/local geprüft (`5d2cb97`) | offen |

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

### Eng abgegrenzte lokale Commits

1. **`5d2cb97` – KYB 174 + 176 gemeinsam als Implementierungsumfang:** Migrationen 174
   und 176, Owner-/Platform-Seiten, beide CSS-Dateien, der gemeinsam genutzte
   `businessVerificationService`, KYB-/Security-/Browsertests. Diese gemeinsame
   Abgrenzung vermeidet eine riskante kuenstliche Teilung der gemeinsamen
   Service-Datei. Die Migrationen bleiben trotzdem einzeln in der Reihenfolge
   174 und 176 anwendbar.
2. **`9cc0668` – PRO 175 separat:** Migration 175, geaenderter
   `transactional-mail-dispatcher`, drei fokussierte Testdateien.
3. **`2910484` – Evidenz separat:** vier vorhandene Phase-Berichte plus dieser
   Uebergangsbericht und die neue Checkliste. Pruef-ZIPs werden nicht
   committed.

Vor einem Commit sind Staged-Secret-Scan, `git diff --cached --check`, exakte
Dateiliste und Remote-/Integrationsbranch-Abgleich erforderlich.

## Kanonisches Repository und verlustfreie Uebernahme

- kanonisches lokales Repository:
  `/Users/dongdongwu/Documents/GitHub/wuxuai-restaurant-bonus-os`;
- kanonischer Remote-Branch: `origin/codex/v1-release-integration`;
- read-only bestaetigter Remote-Tip: `27d1174beb0ef9121643d83d51b73b87ac35ba5a`;
- der aktuelle Feature-Branch ist eine lineare Fortsetzung dieses Tips und
  besitzt selbst absichtlich keine Remote-Konfiguration.

Die sichere Uebernahme erfolgt spaeter ohne Checkout, Reset oder Ueberschreiben
fremder Arbeit: ein inkrementelles Bundle ab `27d1174...` erzeugen und
verifizieren, dieses im kanonischen Repository zunaechst in eine neue temporaere
Pruef-Ref fetchen, Commitliste und Ancestry vergleichen und erst nach frischem
Remote-Fetch einen normalen expliziten Fast-forward-Refspec auf
`origin/codex/v1-release-integration` freigeben. Bei abweichendem Remote-Tip wird
ohne Merge, Rebase, Cherry-pick oder Force-Push gestoppt.

## Recovery-Voraussetzungen Migration 173

**V1-Entscheidung vom 27.09.2026:** Die operative Absicherung erfolgt durch zwei
separat verifizierte TOTP-Faktoren desselben Platform-Admin-Kontos auf zwei
verschiedenen Geräten. Der lokale Personen-/Auth-Admin-Recovery-Runner, ein
Independent Approver und ein Recovery Executor sind V3 und keine V1-Staging-
Blocker. Gleichzeitiger Verlust beider Faktoren bleibt in V1 fail-closed.

| Gate | Status | Nachweis |
|---|---|---|
| Lokaler AAL2/TOTP-Code und Session-/Faktorbindung | PASS | Migration 173 und lokale Security-Nachweise; gespeicherter AAL2-Token wird nach Sessionwiderruf/Faktorentfernung serverseitig blockiert |
| V1 Zwei-Geräte-Verlustvertrag | PASS (lokal) | Faktorentfernung nur nach Challenge mit einem anderen verifizierten Faktor; letzter Faktor unentfernbar; Ersatzfaktor wird regulär neu verifiziert |
| Tatsaechliche maximale Staging-JWT-Laufzeit | OPEN | Eine legitime Staging-Testsitzung war vorhanden. Der Wert `exp - iat` konnte mit den verfuegbaren Browserwerkzeugen nicht sicher im Browserkontext berechnet werden, ohne den Token zu exportieren oder sichtbar zu machen. Der lokale Ein-Stunden-Wert wird nicht auf Staging uebertragen. |
| Geschuetzter Recovery-Runner | V3 / NOT DEPLOYED | Der vorhandene lokale Runner wird für V1 weder eingesetzt noch deployt und erhält keine Staging-Autorität. |
| Independent Recovery Approver / Executor | V3 / NOT A V1 GATE | Namentliche Besetzung blockiert die V1-Staging-Prüfung nicht. |
| Kontrollierter Zwei-Geräte-Ablauf | PASS (lokal), OPEN (Staging) | Zwei synthetische Faktoren, Einzel-Login, Verlustentfernung und Ersatz sind lokal bestanden; die physische Einrichtung auf zwei Nutzergeräten verlangt ausdrückliche Nutzeraktionen. |

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
- lokale Implementierung und synthetischer Test des geschuetzten Recovery-
  Runners einschließlich echtem TOTP-Faktor, `listFactors`, `deleteFactor`,
  Evidenz und blockiertem alten AAL2-Zugriff;
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

Founder/Organisation muessen fuer V1 festlegen beziehungsweise bereitstellen:

1. zwei getrennte physische Platform-Admin-Geräte;
2. verantwortliche Person und Wartungsfenster fuer die Einrichtung;
3. autorisierte bestehende Testkonten fuer Platform Admin, Owner, Staff,
   Customer und fremden Tenant;
4. ob/wann ein spaeterer positiver synthetischer E-Mail-E2E-Test ausdruecklich
   freigegeben wird. Im geplanten Rollout bleibt reale Zustellung 0.

Codex kann danach die technische Preflight-Matrix, Hashes, Fingerprints,
Migrationen einzeln, DB-/RLS-/RPC-Gates, kontrollierte Deployments,
Browserpruefung und Evidenz ausfuehren. Codex kann keine unabhaengigen
Organisationsrollen selbst benennen oder deren Supabase-Berechtigung erteilen.

## Status

**LOCAL TRANSITION COMMITS SECURED / MIGRATIONS 173–176 NOT APPLIED /**
**RECOVERY RUNNER LOCAL PASS / MIGRATION 173 BLOCKED BY OPEN HUMAN AND STAGING GATES /**
**PRODUCTION LOCKED**
