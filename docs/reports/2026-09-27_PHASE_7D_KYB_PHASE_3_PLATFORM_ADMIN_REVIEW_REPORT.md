# Phase 7D KYB Phase 3 – Platform-Admin-Prüfansicht

Datum: 27.09.2026
Branch: `codex/platform-admin-totp-aal2`
Basis: `a510065adbe899d87b8929197af7ebf23d0cac65`
Status: **LOCAL CODE LOCK / STAGING BLOCKED BY MIGRATION-173 RECOVERY GATES**

## Ursache und Ziel

Die lokale KYB-Grundlage aus Migration 174 stellte eine private, versionierte Dokumentenablage und den Owner-Upload bereit. Für die Platform-Prüfung fehlten jedoch dedizierte, unmittelbar mit TOTP/AAL2 geschützte Leseverträge für Queue, Detailansicht, Objektauflösung und den Storage-Download. Die frühere indirekte Platform-Rollenprüfung allein war für diesen Gate-Nachweis nicht ausreichend.

Phase 3 ergänzt deshalb ausschließlich eine read-only Platform-Admin-Prüfansicht. Uploads werden als vorhandene Nachweise dargestellt, aber weder als vollständig noch als freigabefähig bewertet. Es wurde keine Genehmigung, Ablehnung, Aktivierung, Trial-, Entitlement-, Grant- oder Stripe-Operation hinzugefügt.

## Geänderte Phase-3-Dateien

- `supabase/migrations/20260926004000_platform_admin_kyb_document_review.sql`
- `src/modules/verification/PlatformBusinessVerificationPage.tsx`
- `src/modules/verification/platform-business-verification.css`
- `src/modules/verification/businessVerificationService.ts`
- `tests/phase-7d-kyb-platform-review.test.mjs`
- `tests/phase-7d-kyb-platform-review.local.mjs`
- `tests/phase-7d-kyb-secure-storage.local.sql`
- `tests/phase-7d2-verification-ui.test.mjs`
- dieser Bericht

Die bereits uncommitteten KYB-Phase-1/2- und PRO-Queue-Änderungen wurden erhalten. `supabase/.temp/cli-latest` wurde weder zurückgesetzt noch inhaltlich bearbeitet. Migrationen 173, 174 und 175 blieben bytegleich zu den beim Start erfassten Hashes.

## Implementierter Sicherheitsvertrag

Migration 176 folgt additiv auf 173, 174 und 175. Sie führt keine Businessmutation ein.

Jede Platform-KYB-Leseoperation verlangt serverseitig gleichzeitig:

1. eine authentifizierte Supabase-Identität;
2. einen aktiven Eintrag als `platform_owner` oder `platform_admin`;
3. AAL2;
4. einen verifizierten TOTP-Faktor in der aktuellen AMR-Kette.

Dieser Vertrag gilt direkt für:

- `list_platform_kyb_review_queue()`;
- `get_platform_kyb_review_detail(case_id)`;
- `get_platform_kyb_document_object(document_id)`;
- die private Storage-SELECT-Policy des Buckets `business-verification-documents`.

Owner, Staff, Customer, Anonymous, Service Role, AAL1, ein fehlender Faktor und ein fremder Faktor erhalten keinen Platform-Review-Zugriff. Die UI ist nur Darstellung; RPC und Storage erzwingen die Grenze unabhängig.

Private Dokumente werden erst nach erfolgreicher Objektauflösung aus dem privaten Bucket geladen und als browserlokale Blob-URL geöffnet. Es werden keine signierten URLs, Objektpfade, Dokumentinhalte, Hashes, Tokens oder personenbezogenen Testdaten protokolliert.

## Darstellung

- Queue nur für Fälle mit vorhandenen KYB-Dokumenten;
- Restaurant, belegter Fallstatus, Dokumentanzahl und letzter Dokumentzeitpunkt;
- Dokumenttyp, Version, gespeicherter Status und Zeitpunkt;
- append-only Dokumentereignisse ohne Actor-, Request-, Correlation- oder Hashanzeige;
- sachliche Platzhalter für fehlende Angaben;
- ausdrücklicher Hinweis, dass Uploads weder Vollständigkeit noch Freigabefähigkeit belegen;
- sieben Sprachen: DE, EN, FR, IT, ES, ZH, KO.

## Lokale Prüfungen

### Migrationen

- Fresh Replay: **176/176 PASS**
- Upgrade: **175 → 176 PASS**
- Repeat-Dry-Run 1: **leer / PASS**
- Repeat-Dry-Run 2: **leer / PASS**
- DB-Lint: **PASS**; 38 bestehende Hinweise in 21 Legacy-Funktionen, keine Warnung für eine durch Migration 176 eingeführte oder ersetzte Funktion
- Migration 173 SHA-256: `fe76bbbc8b24fc069231bb0f56d4351e801d40216c6625df9d4655d0162913ce`
- Migration 174 SHA-256: `f98a0e079dfb9d7dbae514ecafa7595a77eb36488bb7c9fa5ac81c8a43aa2bd5`
- Migration 175 SHA-256: `d81ade0a6bc1a7f8b2aca0fa10a8b834fbacab67a881c002e20e19d84864195a`
- Migration 176 SHA-256: `257dfd6a5eee3c6700059cde1ea72effe814eaa6211c0e0da8da1d4ed602d865`

### Rollen, RPC und Storage

- fokussierte statische KYB-Prüfungen: **15/15 PASS**
- direkte SQL-/Rollen-/Storage-Matrix: **PASS**
- Platform Admin AAL1: **BLOCKED**
- Platform Admin ohne Faktor: **BLOCKED**
- Platform Admin mit fremdem Faktor: **BLOCKED**
- Owner / Staff / Customer / Anonymous / Service Role: **BLOCKED**
- Platform Admin mit eigener TOTP-AAL2-Sitzung: Queue, Detail, Objektauflösung und privater Download **PASS**
- synthetischer Dokumentinhalt: ausschließlich lokal; nach dem Test entfernt

### Echter lokaler Browserflow

- Chromium und WebKit: **PASS**
- 7 Sprachen × 3 repräsentative Breiten × 2 Engines: **42/42 PASS**
- Breiten: 320, 768 und 1440 CSS-px
- kein horizontaler Overflow
- aktive Buttons mindestens 44 × 44 CSS-px
- Detail-Drawer und tatsächlicher sicherer Dokument-Open-Klick: **PASS**
- genau eine nichtleere browserlokale Blob-URL erzeugt
- Browserflow-Writes: **0**
- keine Genehmigungs-, Aktivierungs- oder Entitlement-Aktion ausgeführt

### Projektgates

- Full Suite: **2.038/2.038 PASS**
- Typecheck: **PASS**
- Lint: **PASS**, 0 Fehler, 8 vorbestehende Warnungen
- Build: **PASS**
- Diff Checks: **PASS**
- Secret Scan: **PASS**

## Staging-Übergangsplan

Staging bleibt unverändert bei **172/172**. Die lokale Weiterentwicklung ändert die aktuell offene Sicherheitsabhängigkeit nicht.

Verbindliche Reihenfolge:

1. Recovery-Vertrag für Platform-Admin-TOTP/AAL2 organisatorisch freigeben.
2. Independent Approver und Recovery Executor namentlich besetzen.
3. tatsächliche Staging-JWT-Laufzeit und den geschützten Recovery-Runner nachweisen.
4. Migration 173 einzeln anwenden und AAL1/AAL2, direkte RPCs, Sitzungswiderruf/Faktorverlust und Recovery physisch prüfen.
5. Erst nach bestandenem 173-Gate Migration 174 einzeln anwenden; private Storage-RLS, Owner-Isolation und synthetischen Upload prüfen.
6. Migration 175 einzeln anwenden; PRO-Mail-Queue bleibt ohne freigegebenen Dispatcher/Kundenversand fail-closed.
7. Migration 176 einzeln anwenden; Repeat-Dry-Run, DB-Lint, Grants, RPC- und Storage-AAL2-Matrix prüfen.
8. App aus dem dann freigegebenen exakten Commit ausschließlich auf Staging deployen.
9. Mit autorisierten Testkonten und ausschließlich synthetischen Dokumenten Platform-Admin-Queue, Detail und sicheren privaten Open-Flow physisch prüfen.
10. Vorher-/Nachher-Fingerprints bestätigen; Production, Stripe und reale KYB-Dokumente bleiben unberührt.

Kein Schritt darf 173 überspringen oder dessen Recovery-Gate durch eine UI-Prüfung ersetzen.

## Vor manueller KYB-Freigabe noch zu entscheiden

1. Pflichtdokumente je österreichischer Rechtsform und Sonderfall.
2. zulässiges Alter, Ablauf und Aktualisierungspflicht jedes Nachweistyps.
3. fachliche Prüfkriterien für Echtheit, Vertretungsbefugnis, Register- und Adressabgleich.
4. Bedeutungen und zulässige Übergänge für vollständig, unklar, nachzufordern, abgelehnt und freigegeben.
5. Aufbewahrungsfristen, Löschfristen, Legal Hold und zuständige Löschrolle.
6. Vier-Augen-Prinzip beziehungsweise Trennung von Prüfer, Approver und Recovery Executor.
7. Begründungs-, Korrektur- und Nachforderungsvertrag einschließlich Datenminimierung.
8. exakte Aktivierungskette nach Freigabe; insbesondere Country-, Seller-, Tax-, Provider- und Payment-Gates sowie Trial-Start.
9. Widerruf/Suspendierung einer früheren Verifikation und Folgen für laufende Nutzung.
10. physischer Staging-Positivtest für die manuelle Freigabe als eigenständige Founder-Autorisierung.

Automatische Registerabfragen bleiben V2 und wurden nicht implementiert.

## Nicht geändert

- kein Staging-, Production- oder Stripe-Zugriff;
- keine Migration angewendet außerhalb des task-lokalen Teststacks;
- keine echten KYB-Dokumente oder Geschäftsdaten;
- keine Genehmigung, Ablehnung oder Aktivierung;
- keine Trial-, Subscription-, Entitlement-, Grant- oder Payment-Writes;
- kein Commit, Push oder Deployment.

## Offene Risiken und Status

Die lokale Implementierung ist technisch geprüft. Eine Staging-Prüfung ist konkret durch die noch offenen Recovery-Voraussetzungen von Migration 173 blockiert. Deshalb besteht kein Staging- oder Final-Lock.

**Status: PHASE 7D KYB PHASE 3 PLATFORM-ADMIN REVIEW LOCAL CODE LOCK / STAGING PHYSICAL GATE BLOCKED BY MIGRATION-173 RECOVERY PREREQUISITES**
