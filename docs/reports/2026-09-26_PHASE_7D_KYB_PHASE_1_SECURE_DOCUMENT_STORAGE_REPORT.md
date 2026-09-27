# Phase 7D – KYB Phase 1: Datenmodell und sichere Dokumentenablage

Datum: 26.09.2026

Basis: `a510065adbe899d87b8929197af7ebf23d0cac65`

Arbeitszweig: `codex/platform-admin-totp-aal2`

Status: **LOCAL CODE LOCK / STAGING NOT APPLIED**

## Ursache und Scope

Der bestehende Vertrag hielt neue österreichische Betriebe bis zur manuellen
Verifikation in `PENDING_ACTIVATION`, besaß aber noch keine private,
tenantgebundene Ablage für die dafür benötigten Nachweise. Phase 1 ergänzt nur
das Datenmodell, die Storage-Sicherheitsgrenze, den unveränderbaren
Dokumentstatusverlauf und die bestehenden serverseitigen Aktivierungsgates.

Nicht Teil dieses Loops sind Owner-Upload-/Submit-UI, Platform-Admin-Prüf-UI,
die reale Freigabeentscheidung, externe Registerabfragen, Staging, Production
und Stripe.

## Geänderte Dateien

- `supabase/migrations/20260926002000_austrian_kyb_secure_documents.sql`
- `tests/phase-7d-kyb-secure-storage.test.mjs`
- `tests/phase-7d-kyb-secure-storage.local.sql`
- `tests/phase-7d-kyb-secure-storage-parallel.local.mjs`
- dieser Bericht

Migration 174 SHA-256:
`f98a0e079dfb9d7dbae514ecafa7595a77eb36488bb7c9fa5ac81c8a43aa2bd5`

Migrationen 001–173 sind gegenüber dem Basiscommit bytegleich. Migration 173
bleibt lokal vorhanden und ist die unmittelbare Vorgängermigration. Auf
Staging bleibt der bestätigte Stand 172/172; weder Migration 173 noch 174 wurde
auf Staging angewendet.

## Implementierter Vertrag

### Private Ablage

- privater Bucket `business-verification-documents`, niemals öffentlich;
- maximal 10 MiB;
- ausschließlich PDF, JPEG und PNG;
- Browser-Upload nur in einen zuvor serverseitig reservierten, owner- und
  tenantgebundenen Objektpfad;
- kein Browser-Update und kein Browser-Delete von Objekten;
- Objektpfade enthalten keine E-Mail-Adresse oder Dokumentinhalte.

### Zulässige Dokumenttypen

- GISA-Auszug;
- Firmenbuchauszug;
- Gewerbeberechtigung;
- Steuerregistrierung;
- Identitätsnachweis der vertretungsbefugten Person;
- Vollmacht.

Die Liste ist geschlossen. Ein unspezifischer Dokumenttyp oder beliebiger
Binärtyp ist nicht zulässig.

### Zugriff und Tenant-Isolation

- Der jeweilige Owner darf nur Dokumente seines eigenen Restaurants
  reservieren, vervollständigen, auflisten und zur Löschung vormerken.
- Platform Owner und Platform Admin dürfen Dokumente zur Prüfung nur über den
  aktuellen serverseitigen Platform-Rollenvertrag lesen. Migration 173 bindet
  diesen Vertrag an eine aktuelle TOTP-/AAL2-Sitzung.
- Fremde Owner, Staff, Customer, Anonymous und `service_role` besitzen keinen
  direkten Tabellen- oder Dokumentzugriff.
- Direkte DML auf Dokument- und Ereignistabellen ist entzogen; RLS bleibt
  aktiviert.

### Änderung, Löschung und Audit

- Ersatz erzeugt eine neue, fortlaufende Dokumentversion und markiert die
  vorherige hochgeladene Version als `SUPERSEDED`.
- Browser überschreiben keine bestehenden Storage-Objekte.
- Owner können ausschließlich eine `DELETION_REQUESTED`-Vormerkung erzeugen.
  Phase 1 löscht weder Metadaten noch Storage-Objekte.
- Physische Löschung benötigt später einen gesondert autorisierten,
  retention-aware Executor.
- `UPLOAD_RESERVED`, `UPLOAD_COMPLETED`, `SUPERSEDED` und
  `DELETION_REQUESTED` werden append-only mit Request- und Correlation-ID
  protokolliert.
- Rohdokumente, temporäre URLs und Zugangsdaten werden nicht im Audit
  gespeichert.

### Aktivierungsgate

- Reservierung und Abschluss setzen ein österreichisches manuelles
  Verifikationsverfahren und `PENDING_ACTIVATION` voraus.
- Die Migration enthält keinen Aktivierungs-, Trial-, Entitlement-, Grant-
  oder Stripe-Write.
- `confirm_real_business_verification()` bleibt fail-closed.
- Direkte Statusmutation und produktive Funktionen bleiben durch die
  bestehenden serverseitigen Pending-/Operational-Gates blockiert.

## Prüfergebnisse

| Gate | Ergebnis |
| --- | --- |
| Fresh Replay | PASS – 174/174 |
| Upgrade | PASS – 173 → 174, nur Migration 174 |
| Repeat 1 / 2 | PASS – jeweils keine ausstehende Migration |
| Migrationen 001–173 | PASS – bytegleich |
| DB-Lint | PASS mit bekannten Legacy-Warnungen; kein neuer Befund aus Migration 174 |
| KYB-Strukturtests | PASS – 5/5 |
| Rollen/RLS/Direct-DML | PASS |
| Owner A / Owner B / Staff / anon / service_role | PASS – fail-closed und tenantisoliert |
| Platform-Reviewer | PASS – nur mit aktuellem TOTP/AAL2-Vertrag |
| Pending-/Aktivierungsgate | PASS |
| 24-fache Reservierung | PASS – ein Dokument, ein Audit, 23 idempotente Replays |
| Full Suite | PASS – 2.018/2.018 |
| Typecheck | PASS |
| Lint | PASS – 0 Fehler, 8 vorbestehende Warnungen |
| Build | PASS – nicht geheime lokale Build-Bindung, keine persistente Env-Datei |

Die ältere lokale Business-Verification-Testfixture ohne AAL2 wird durch den
bereits gesicherten Migration-173-Vertrag erwartungsgemäß abgewiesen. Die
aktuelle KYB-Matrix prüft den Reviewerzugriff mit gültigem TOTP/AAL2. Es wurde
keine AAL1-Ausnahme ergänzt.

## Offene Entscheidungen und Folgephasen

1. Verbindliches Pflichtdokument-Set je Rechtsform und Sonderfall.
2. Aufbewahrungs- und Löschfristen einschließlich gesetzlicher Sperrgründe.
3. Autorisierung und Betriebsvertrag des physischen Lösch-Executors.
4. Owner-Upload-/Submit-Oberfläche mit einmaliger Upload-URL-Ausgabe.
5. Platform-Admin-Prüfoberfläche und reale manuelle Freigabetransition.
6. Staging-Reihenfolge: zuerst Migration 173 und deren AAL2-Gate, danach
   Migration 174 und erst anschließend physische Storage-/Tenant-Prüfung.

Automatische GISA-, Firmenbuch- oder sonstige externe Registerabfragen bleiben
ausdrücklich außerhalb von V1.

## Nicht geändert

- keine historische Migration;
- keine Produkt- oder Browseroberfläche;
- keine bestehende Subscription, Trial, Rolle, Membership oder Geschäftsdaten;
- keine Staging-, Production-, Stripe-, E-Mail- oder Providerkonfiguration;
- kein Commit und kein Push.

## Risiken

Der technische Ablagevertrag ist lokal geprüft, aber noch nicht auf Staging
angewendet. Ohne die später festzulegenden Pflichtdokument-, Retention- und
Freigaberegeln bleibt die reale manuelle Betriebsaktivierung absichtlich
blockiert. Daher besteht kein Staging- oder Final Lock.

## Status

**PHASE 7D KYB PHASE 1 DATA MODEL AND SECURE DOCUMENT STORAGE LOCAL CODE LOCK /**

**OWNER UPLOAD, MANUAL REVIEW, STAGING MIGRATIONS 173–174 AND PHYSICAL GATES OPEN**
