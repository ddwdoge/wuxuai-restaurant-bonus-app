# Phase 7D – KYB Phase 2: Owner-Dokumentablauf

Datum: 26.09.2026

Basiscommit: `a510065adbe899d87b8929197af7ebf23d0cac65`

Arbeitszweig: `codex/platform-admin-totp-aal2`

Status: **LOCAL CODE LOCK / STAGING NOT APPLIED**

## Ursache und Umfang

Migration 174 stellte bereits den privaten, tenantgebundenen und auditierten
Serververtrag für österreichische KYB-Dokumente bereit. Es fehlte die
Owner-Oberfläche zum Auswählen, Hochladen, Anzeigen, privaten Herunterladen und
versionierten Ersetzen dieser Dokumente.

Phase 2 ergänzt ausschließlich diesen Owner-Ablauf und zugehörige lokale
Nachweise. Die Platform-Admin-Prüfoberfläche, eine reale Freigabetransition,
rechtlich verbindliche Pflichtdokumente je Rechtsform sowie
Aufbewahrungsfristen bleiben außerhalb dieses Arbeitsumfangs.

## Geänderte Dateien

Phase 2:

- `src/modules/verification/OwnerBusinessVerificationPage.tsx`
- `src/modules/verification/businessVerificationService.ts`
- `src/modules/verification/owner-business-verification.css`
- `tests/phase-7d-kyb-owner-documents.test.mjs`
- `tests/phase-7d-kyb-owner-documents.local.mjs`
- dieser Bericht

Zusätzlich wurde die noch uncommittete, task-eigene Phase-1-Rollenmatrix in
`tests/phase-7d-kyb-secure-storage.local.sql` um einen ausdrücklich an ein
Customer-Konto gebundenen Negativfall ergänzt. Die übrigen Phase-1-Dateien
bleiben erhalten.

## Implementierter Owner-Vertrag

- Der Owner kann ausschließlich die sechs von Migration 174 erlaubten Typen
  auswählen: GISA-Auszug, Firmenbuchauszug, Gewerbeberechtigung,
  Steuerregistrierung, Identitätsnachweis der vertretungsbefugten Person und
  Vollmacht.
- Erlaubt sind PDF, JPEG und PNG mit 1 Byte bis einschließlich 10 MiB.
- Der Client reserviert zuerst serverseitig einen owner- und tenantgebundenen
  Objektpfad, lädt mit `upsert: false` in den privaten Bucket und schließt den
  Upload mit SHA-256, Request-ID und Correlation-ID ab.
- Eine neue Fassung erzeugt eine neue Version. Die vorherige hochgeladene
  Fassung wird serverseitig als `SUPERSEDED` erhalten; sie wird weder
  überschrieben noch gelöscht.
- Listing und Download verwenden ausschließlich die geschützten RPCs und den
  privaten Storage-Download. Es werden keine öffentlichen oder signierten URLs
  erzeugt oder protokolliert.
- Die Oberfläche zeigt ausschließlich den serverseitig gelieferten
  Dokumentstatus. Sie weist in allen sieben Sprachen ausdrücklich darauf hin,
  dass ein Upload keine Freigabe ist.
- Der Uploadbereich wird erst nach einer vorhandenen Owner-Einreichung gezeigt.
  Ein Upload verändert weder KYB-Freigabe noch Restaurantaktivierung.

## Konkret behobener Bestandsfehler

Die bestehende KYB-Seite lud zusätzlich den alten Legal-Setup-RPC. Dieser
Legacy-Lesepfad kann Rechtstemplates erzeugen und scheiterte im lokalen
Pending-Kontext. Die KYB-Seite benötigt ihn nicht: Unternehmenssnapshot,
Prüfstatus und Tenant-Anzeige stammen bereits aus den dafür vorgesehenen
serverseitigen Read-Modellen. Die unnötige Abhängigkeit wurde entfernt. Damit
bleibt das Öffnen der KYB-Seite außerhalb ausdrücklich ausgelöster
Dokumentaktionen write-frei.

## Fehlerdarstellung

Die Oberfläche unterscheidet verständlich:

- unzulässigen Dateityp;
- leere oder zu große Datei;
- fehlende Owner-Berechtigung;
- fehlgeschlagenen Upload beziehungsweise Abschluss.

Rohdokumente, Dokumentinhalte, Hashes, Objektpfade und Downloadzugänge werden
nicht in UI-Logs, Bericht oder Evidenz ausgegeben.

## Sicherheits- und Rollennachweise

| Rolle | Ergebnis |
| --- | --- |
| Owner des Restaurants | Reservieren, Upload, Abschluss, Listing und privater Download PASS |
| Fremder Owner | Read und Upload fail-closed |
| Staff | Read und Upload fail-closed |
| Customer mit Restaurant-Membership | Read, Upload und Objektauflösung fail-closed |
| Anonymous | Objektauflösung fail-closed |
| `service_role` | Kein direkter Dokumentzugriff über Browservertrag |
| Platform Reviewer | Bestehender TOTP-/AAL2-gebundener Read-Vertrag aus Migration 173/174 bleibt erhalten |

Direkte Tabellenmutation bleibt entzogen; RLS, Security-Definer-Prüfungen,
Tenantbindung und append-only Audit wurden nicht gelockert.

## Echter lokaler Owner-Flow

Mit einem ausschließlich lokalen synthetischen Owner und Restaurant wurde der
Browserflow gegen den task-eigenen Supabase-Stack geprüft:

1. bestehende Pending-Verifikation lesen;
2. unzulässige Textdatei verständlich abweisen, 0 Dokumentwrites;
3. leere PDF verständlich abweisen, 0 Dokumentwrites;
4. PDF als Version 1 sicher hochladen und privat herunterladen;
5. neue Fassung hochladen;
6. Version 2 `UPLOADED`, Version 1 `SUPERSEDED`;
7. Restaurant und Subscription bleiben `PENDING_ACTIVATION`;
8. Entitlements bleiben 0.

Erwartete Writes waren ausschließlich zwei Dokumentversionen, deren private
Storage-Objekte, Evidenzmetadaten und fünf klassifizierte append-only
Dokumentevents. Unerwartete Aktivierungs-, Trial-, Entitlement-, Stripe- oder
Grant-Writes: **0**.

## Prüfergebnisse

| Gate | Ergebnis |
| --- | --- |
| Focused KYB Struktur/UI | PASS – 10/10 |
| Lokale Rollen/RLS/Direct-DML | PASS einschließlich Customer |
| 24-fache Reservierung | PASS – ein Dokument, ein Audit, 23 idempotente Replays |
| Echter lokaler Owner-Browserflow | PASS – Mobile 320 px, Tablet 768 px, Desktop 1440 px |
| Fresh Replay | PASS – 174/174 |
| Upgrade | PASS – 173 → 174, ausschließlich Migration 174 |
| Repeat 1 / 2 | PASS – jeweils leer |
| Migrationen 001–173 | PASS – bytegleich zum Basiscommit |
| Migration 174 SHA-256 | `f98a0e079dfb9d7dbae514ecafa7595a77eb36488bb7c9fa5ac81c8a43aa2bd5` |
| DB-Lint | PASS; vorhandene Legacy-Warnungen, kein neuer Migration-174-Befund |
| Full Suite | PASS – 2.023/2.023 |
| Typecheck | PASS |
| Lint | PASS – 0 Fehler, 8 vorbestehende Warnungen |
| Build | PASS |
| Secret Scan | PASS |
| Diff Checks | PASS |

Der erste Full-Suite-Aufruf innerhalb der Sandbox konnte drei bestehende
localhost-HTTP-Testserver nicht binden (`EPERM`). Der unveränderte vollständige
Lauf mit erlaubter lokaler Portbindung bestand 2.023/2.023 Tests.

## Nicht geändert

- keine neue Migration; Migration 174 bleibt bytegleich;
- keine Platform-Admin-Prüfoberfläche und keine Freigabetransition;
- keine Aktivierungs-, Trial-, Entitlement-, Stripe- oder Grant-Logik;
- keine Staging-, Production-, Stripe-, E-Mail- oder Providerkonfiguration;
- keine realen Daten;
- kein Commit und kein Push.

## Offene Entscheidungen und Gates

1. Pflichtdokumente je Rechtsform und Sonderfall sind rechtlich festzulegen.
2. Aufbewahrungs-, Lösch- und gesetzliche Sperrfristen sind festzulegen.
3. Platform-Admin-Prüfoberfläche und reale manuelle Freigabetransition folgen
   separat.
4. Staging benötigt zuerst Migration 173 mit geprüftem AAL2-Recovery-Vertrag,
   danach Migration 174 und anschließend einen gesondert freigegebenen
   physischen Storage-/Tenant-Test.

## Status

**PHASE 7D KYB PHASE 2 OWNER DOCUMENT FLOW LOCAL CODE LOCK /**

**MIGRATION 174 UNCHANGED /**

**PLATFORM ADMIN REVIEW, STAGING MIGRATIONS 173–174 AND PHYSICAL GATES OPEN**
