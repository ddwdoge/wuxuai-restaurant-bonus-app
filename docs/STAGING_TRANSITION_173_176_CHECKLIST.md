# Staging-Uebergang Migrationen 173–176

Stand: 2026-09-27
Zielprojekt: `bwhvfjuwixgwduoeqaya` / `wuxuai-bonus-staging`
Production: gesperrt

Diese Checkliste ist ein Ausfuehrungsplan. Sie autorisiert weder Migrationen,
Deployments, Faktorwechsel noch Datenwrites. Die Migrationen werden zwingend
einzeln und in der Reihenfolge **173 → 174 → 175 → 176** angewendet.

## 1. Verbindliche Ausgangslage

- Staging ist read-only als `ACTIVE_HEALTHY`, Region `eu-west-1`, verifiziert.
- Staging-Migrationsstand: **172/172**.
- Lokal offen:
  - 173 `20260926001000_platform_admin_totp_aal2_gate.sql`
  - 174 `20260926002000_austrian_kyb_secure_documents.sql`
  - 175 `20260926003000_pro_notification_dispatch_authorization.sql`
  - 176 `20260926004000_platform_admin_kyb_document_review.sql`
- Production-Projekt ist nicht verknuepft und bleibt unberuehrt.
- Customer-Mail-Scheduler und reale Kundenzustellung bleiben deaktiviert.

## 2. Harte Freigabegates vor jedem Staging-Write

- [ ] Kanonischer Integrationsbranch, Remote-HEAD und Fast-forward-Paritaet sind
  frisch bestaetigt.
- [ ] Migrationen 001–172 sind bytegleich; Hashes 173–176 stimmen mit dem
  freigegebenen Bericht ueberein.
- [ ] Alle lokalen KYB-/PRO-Aenderungen sind eng committed; keine fremde Datei,
  kein ZIP, kein Secret und `supabase/.temp/cli-latest` ist enthalten.
- [ ] Exakte Staging-Projekt-ID und Projektname sind erneut bestaetigt.
- [ ] Vollstaendige pseudonymisierte Vorher-Fingerprints liegen vor.
- [ ] Wartungsfenster fuer Platform-Admin-Aktionen ist aktiv.
- [ ] Unabhaengiger Recovery Approver und Recovery Executor sind namentlich
  benannt und haben den Recovery-Vertrag freigegeben.
- [ ] Executor besitzt einen eigenen MFA-geschuetzten Supabase-
  Organisationszugang mit minimal erforderlicher Auth-Admin-Berechtigung.
- [ ] Geschuetzter Recovery-Runner fuer `listFactors`/`deleteFactor` ist in
  Staging ohne Nutzung des einzigen echten Platform-Admin-Kontos getestet.
- [ ] Tatsaechliche maximale Staging-JWT-Laufzeit und Uhrtoleranz sind
  read-only ermittelt und als Quarantaenefenster dokumentiert.
- [ ] Kontrollierter TOTP-Ersteinrichtungsablauf fuer den einzigen Platform
  Admin ist terminiert; Wiederherstellungsrollen sind gleichzeitig verfuegbar.

Bei einem offenen Punkt: **STOPP vor Migration 173**.

## 3. Testkonten und Testdaten

Nur bestehende, autorisierte Staging-Testkonten verwenden:

- Platform Admin: TOTP-Einrichtung und AAL1-/AAL2-Nachweise;
- separater synthetischer Recovery-Testbenutzer: Faktorentfernung und
  Recovery-Runner-Negativtest, niemals der einzige echte Platform Admin;
- Owner eines eindeutig markierten TEST_ONLY-Restaurants;
- Staff und Customer desselben TEST_ONLY-Restaurants;
- fremder Owner/Staff/Customer fuer Tenant-Negativtests.

KYB-Dokumente muessen synthetisch und inhaltsfrei sein. Keine echten
Geschaeftsdokumente, keine echten Kundenmails und keine realen Kundendaten.

## 4. Rollout 173 – Platform Admin TOTP/AAL2

### 4.1 Vorbereitendes UI-Deployment

1. Exakten, bereits committed TOTP-UI-Stand aus der 173-Commitkette bauen.
2. Nur die Staging-App deployen; Production bleibt unberuehrt.
3. Bis Migration 173 gilt serverseitig noch die alte Platform-Regel. Deshalb:
   - keine Platform-Mutation waehrend dieses Fensters;
   - keine Support-, Billing-, Country-, Grant-, KYB- oder sonstige
     Platform-Admin-Aktion;
   - Fenster ausschliesslich fuer Enrollment und AAL2-Nachweis nutzen;
   - Audit/Fingerprints vor und nach dem Fenster vergleichen.
4. TOTP auf dem legitimen Platform-Admin-Konto einrichten und AAL2 physisch
   nachweisen. Faktorwerte und Tokens niemals protokollieren.

### 4.2 Migration und Gate

1. Ausschliesslich Migration 173 anwenden.
2. Historie muss **173/173** zeigen; Repeat-Dry-Run leer; DB-Lint ausfuehren.
3. Direkte RPC-Matrix:
   - Anonymous, Owner, Staff, Customer: blockiert;
   - Platform Admin AAL1: Rolle und geschuetzte RPCs blockiert;
   - AAL2 ohne TOTP-AMR: blockiert;
   - aktuelle TOTP-AAL2-Sitzung: read-only Platform-RPC erlaubt;
   - widerrufene/abgelaufene Sitzung: sofort serverseitig blockiert;
   - entfernter Faktor: gespeicherter, noch nicht abgelaufener AAL2-Token
     blockiert, sofern dieser bedingte Nachweis sicher verfuegbar ist.
4. Ohne alten Token: Recovery-Abschluss erst nach vollstaendigem Ablauf des
   verifizierten JWT-Quarantaenefensters und nach neuem TOTP-AAL2-Nachweis.
5. AAL2 nach regularem Token-Refresh erneut serverseitig nachweisen.

Abbruch: kein AAL2, Recovery-Runner nicht funktionsfaehig, Session-/Faktor-
Bindung fehlerhaft oder unerwarteter Platform-Write. Die AAL2-Grenze wird nicht
als kurzfristiger Workaround gelockert.

## 5. Rollout 174 – KYB-Datenmodell und Owner-Dokumente

1. Neue Vorher-Fingerprints fuer Business-Verification, Storage, Restaurants,
   Aktivierung, Trial, Entitlements, Grants und Audit erfassen.
2. Ausschliesslich Migration 174 anwenden; Historie **174/174**, Repeat leer,
   DB-Lint, Grants, RLS und Storage-Policies pruefen.
3. Mit synthetischem TEST_ONLY-Dokument pruefen:
   - Owner des Tenants kann reservieren, hochladen, abschliessen und lesen;
   - Fremd-Owner, Staff, Customer und Anonymous sind blockiert;
   - private Ablage, kein Public-/Signed-URL-Leak;
   - Versionierung und append-only Audit;
   - Restaurant bleibt `PENDING_ACTIVATION`;
   - keine Trial-, Entitlement-, Grant-, Stripe- oder Aktivierungswrites.
4. Owner-App noch nicht physisch als PASS werten, bevor der finale App-Tip
   nach Migration 176 deployed ist.

Abbruch: Cross-Tenant-Zugriff, oeffentliches Storage-Objekt, unerwartete
Aktivierung oder Veraenderung historischer Evidenz.

## 6. Rollout 175 – PRO-Mail-Dispatch-Autorisierung

1. Customer-Mail-Scheduler vor und nach dem Schritt als **deaktiviert**
   nachweisen; keine echte Kundenzustellung konfigurieren.
2. Ausschliesslich Migration 175 anwenden; Historie **175/175**, Repeat leer,
   DB-Lint und service-role-only Grants pruefen.
3. Geaenderte Funktion `transactional-mail-dispatcher` erst nach Migration 175
   deployen. Keine anderen Edge Functions deployen.
4. Nur fail-closed/negative synthetische Nachweise:
   - PRO beim Enqueue, BASIC vor Reservierung/Versand: blockiert;
   - Consent beim Enqueue, widerrufen vor Reservierung/Versand: blockiert;
   - beide Ereignistypen;
   - Reward-E-Mail ohne eigenen Consent-Vertrag: blockiert;
   - Provideraufruf und reale Zustellung: 0;
   - blockierte Queuezeilen bleiben klassifiziert erhalten, nicht geloescht.
5. Ein positiver echter Versand ist in diesem Rollout nicht erlaubt und bleibt
   ein separates, ausdruecklich freizugebendes Gate.

Abbruch: Scheduler aktiv, Provideraufruf, echte Adresse, Versand oder
Wiederbelebung einer nach Downgrade/Widerruf gesperrten Queuezeile.

## 7. Rollout 176 – Platform-KYB-Read-Gate

1. Ausschliesslich Migration 176 anwenden; Historie **176/176**, Repeat leer,
   DB-Lint, Grants, RLS und Storage-Policy pruefen.
2. Direkte Matrix fuer Queue, Detail, Objektaufloesung und Storage:
   - AAL1, fehlender/fremder Faktor, Owner, Staff, Customer, Anonymous und
     Service Role: blockiert;
   - aktuelle TOTP-AAL2-Platform-Sitzung: read-only erlaubt;
   - keine Approval-, Reject-, Aktivierungs- oder Datenkorrektur-RPC vorhanden.
3. Finalen KYB-App-Tip auf Staging deployen; ausgelieferten Commit und Asset-
   Paritaet nachweisen.
4. Physischer Test mit synthetischer Evidenz:
   - Owner: Upload, Status, neue Version, privater Download;
   - Platform Admin AAL2: Queue, Detail, Audit und privater Download;
   - AAL1 und fremde Rollen bleiben blockiert;
   - vorhandene Uploads werden nicht als Vollstaendigkeit/Freigabe interpretiert.

Abbruch: Storage-Bypass, AAL1-Zugriff, Cross-Tenant-Sichtbarkeit oder
unerwartete KYB-/Aktivierungswrites.

## 8. Gemeinsamer Abschluss

- [ ] Migrationshistorie exakt 176/176 und Repeat-Dry-Run leer.
- [ ] Vorher-/Nachher-Fingerprints: nur freigegebene synthetische KYB-
  Testdeltas und klassifizierte technische Audits.
- [ ] Keine Trial-, Subscription-, Entitlement-, Grant-, Punkte-, Gift-,
  Redemption-, Stripe- oder Production-Aenderung.
- [ ] Scheduler weiterhin deaktiviert; reale Customer-Mail-Zustellung 0.
- [ ] Platform Admin bleibt mit TOTP-AAL2 erreichbar; Recovery-Nachweis
  vollstaendig.
- [ ] Bericht und secret-freies Pruef-ZIP erstellt.

## 9. Zuständigkeiten

Codex kann nach Freigabe technische Preflights, Hash-/Migrationspruefung,
Migrationen einzeln, DB-/RLS-/RPC-Gates, enges Deployment, Browsermatrix,
Fingerprints und Evidenz ausfuehren.

Vorher muessen organisatorisch benannt/freigegeben werden:

1. Independent Recovery Approver;
2. Recovery Executor mit geeignetem MFA-geschuetztem Supabase-Zugang;
3. Wartungsfenster und verantwortliche Person fuer die TOTP-Ersteinrichtung;
4. freigegebene bestehende Staging-Testkonten;
5. separate spaetere Freigabe fuer einen synthetischen positiven Mailversand,
   falls dieser ueberhaupt Teil eines spaeteren Gates werden soll.
