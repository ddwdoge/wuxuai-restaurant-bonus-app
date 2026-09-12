# WUXUAI Bonus PRO Phase 1 - Entitlement Lifecycle

Datum: 2026-09-10

Branch: `codex/pro-phase-1-entitlement-lifecycle`

Basis: `0458bfd961774d0f74d42dd375ee701c10bcf080`

Staging: `bwhvfjuwixgwduoeqaya`

Production: `fuqhljgesclipzduhykl` (unveraendert)

## Ausgangsstand

Der vorhandene Plan-Katalog und der zentrale Entitlement-Resolver konnten
BASIC, PRO und vorbereitete PREMIUM-Werte abbilden. Der Resolver behandelte
ein gespeichertes `PRO` jedoch ohne vollstaendige Pruefung von Subscription-,
Payment-, Trial-, Perioden-, Past-due- und Kuendigungsstatus als wirksam.

## Geaenderte Dateien

- `supabase/migrations/20260910001000_pro_entitlement_lifecycle.sql`
- `supabase/migrations/20260910002000_pro_lifecycle_null_guards.sql`
- `tests/pro-entitlement-lifecycle.test.mjs`
- `tests/pro-lifecycle-null-guards.sql`
- `docs/reports/2026-09-10_WUXUAI_BONUS_PRO_PHASE_1_ENTITLEMENT_LIFECYCLE.md`

## Umgesetzte Aenderungen

- Additive Migration `20260910001000_pro_entitlement_lifecycle.sql`.
- Zentraler, versionierter Lifecycle-Vertrag pro Restaurant/Standort.
- Sieben Tage Past-due-Kulanz mit explizitem Startzeitpunkt.
- PRO nach Kuendigung nur bis zum bezahlten Periodenende.
- Zeitlich begrenzter, auditierter Platform-Admin-Plan-Override.
- Globale oder restaurant-/featurebezogene Sicherheitssperre.
- Serverseitige Sperre fuer PREMIUM.
- Fail-closed BASIC bei fehlenden, unbekannten oder widerspruechlichen Daten.

## Prioritaetsvertrag

1. Aktive Sicherheitssperre.
2. Gueltiger, noch nicht abgelaufener Platform-Admin-Plan-Override.
3. Gueltiger bezahlter Plan innerhalb der Periode.
4. Gueltiges Trial.
5. BASIC-Fallback.

Clientwerte bestimmen keine Berechtigung. Der interne Resolver und die neuen
Lifecycle-Hilfsfunktionen bleiben fuer `anon` und `authenticated` gesperrt.

## Lifecycle-Matrix

| Gespeicherter Plan | Status | Zusatzbedingung | Wirksamer Plan |
| --- | --- | --- | --- |
| BASIC | beliebig | keine | BASIC |
| PRO | active | paid/manual und Periodenende in Zukunft | PRO |
| PRO | trialing | not_required, Beginn erreicht und Trial-Ende in Zukunft | PRO |
| PRO | trialing | Trial abgelaufen oder widerspruechlich | BASIC |
| PRO | past_due | pending/failed, maximal 7 Tage | PRO |
| PRO | past_due | mehr als 7 Tage oder Start unbekannt | BASIC |
| PRO | cancelled/canceled | paid/manual bis Periodenende | PRO |
| PRO | cancelled/canceled | Periodenende erreicht | BASIC |
| PRO | unbekannt/unpaid/paused | keine | BASIC |
| PREMIUM | beliebig | nicht freigegeben | BLOCKIERT/BASIC |

## Admin-Override

Der neue serverseitige Plan-Override akzeptiert nur BASIC oder PRO, verlangt
Platform-Admin-Rolle, Ablaufzeitpunkt, Grund, `CONFIRMED` und eine
Idempotenz-ID. Vorher-/Nachher-Zustand wird in der bestehenden unveraenderbaren
Platform-Operations-Auditstruktur gespeichert. Bezahlter Plan, Trial und
manueller Override bleiben in der Resolverantwort unterscheidbar.

## Rollback-Plan vor Staging-Migration

1. Vor Anwendung Staging-Migrationsstand und Funktionsdefinitionen sichern.
2. Bei einem Fehler keine Daten manuell zuruecksetzen und Production nicht
   beruehren.
3. Eine neue Forward-Korrekturmigration stellt bei Bedarf den vorherigen
   `resolve_restaurant_entitlements_internal`-Vertrag wieder her und entzieht
   weiterhin alle Browser-Schreibrechte.
4. Die neue Override-RPC und Safety-Tabelle koennen in dieser
   Forward-Korrekturmigration deaktiviert beziehungsweise entfernt werden,
   sofern die Vorpruefung bestaetigt, dass keine Staging-Zeilen entstanden
   sind.
5. `past_due_started_at` und die drei additiven Override-Spalten bleiben bei
   Zweifeln bestehen; sie sind nullable und aendern vorhandene Daten nicht.
6. Kein destruktiver Ad-hoc-Rollback, kein RLS-Abschalten, kein Production-
   Rollback.

## Nicht geaendert

- Keine bestehende Subscription oder Kundendaten mutiert.
- Keine Kundenobergrenze und keine Angebots-Downgrade-Automatik.
- Kein Catalog, Shared Points, Gift Cards, POS/Kassa oder Enterprise.
- Keine neue Notification-Funktion und kein Reward-Consent.
- Kein Stripe Checkout, kein Stripe Live und keine oeffentliche PRO-Freigabe.
- Keine Production-Migration und kein Production-Deployment.

## Verifikation und Staging-Evidenz

- Repository-Migrationsdatei: 26.833 Byte, SHA-256
  `026685370d476aabad0e7409cae4357062a7267c8c4fa268efa7759f92039577`.
- Die Migration wurde am 2026-09-10 ausschliesslich auf Staging
  `bwhvfjuwixgwduoeqaya` angewendet.
- Wegen der Groessenbegrenzung des Supabase SQL Editors wurde der Laufzeittext
  nur bei fuehrender Zeileneinrueckung normalisiert. Der normalisierte
  Laufzeittext und die ebenso normalisierte Repository-Datei sind mit
  SHA-256 `be6cb2726b26397b1b12ee840c8494f629e7ae4538990f95772e78ee1a53e0fd`
  identisch. SQL-Tokens, Kommentare, Reihenfolge und Semantik sind unveraendert.
- Migration-History: `20260910001000 / pro_entitlement_lifecycle` vorhanden.
- Neue Spalte `past_due_started_at` und alle drei Override-Spalten vorhanden.
- Safety-Tabelle: RLS aktiv; keine Tabellenrechte fuer `anon` oder
  `authenticated`.
- Interne Resolver: kein Execute-Recht fuer `anon` oder `authenticated`.
- Admin-Override-RPC: kein Execute-Recht fuer `anon`; `authenticated` wird
  zusaetzlich serverseitig gegen die Platform-Admin-Rolle geprueft.
- Staging-Lifecycle-Matrix: 8/8 PASS (`active`, `trialing`, Past-due-Grenze,
  Past-due-Ablauf, bezahlte Kuendigungsperiode, inaktives gespeichertes PRO,
  unbekannter Status und PREMIUM).
- Vorhandene Bestandsdaten nach Anwendung: 1 gespeicherte PRO-Subscription,
  0 wirksame PRO-Restaurants, 0 Plan-Overrides, 0 Safety-Blocks und
  0 PREMIUM-Subscriptions. Die Migration hat keine reale PRO-Aktivierung
  erzeugt.
- Fokussierte und kombinierte PRO-Tests: 26/26 PASS.
- Vollstaendige Tests: 1425/1425 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 9 bereits vorhandene Warnungen.
- Build mit ausschliesslich verifizierter Staging-Konfiguration: PASS.
- Secret Pattern Scan: PASS, 0 Treffer in allen fuenf Aenderungsdateien.
- Whitespace-Pruefung inklusive ungetrackter Dateien: PASS, 0 Befunde.
- `git diff --check`: PASS.
- Staging-Frontend-Deployment: nicht erforderlich, da diese Phase nur eine
  Datenbankmigration, Tests und Dokumentation enthaelt.
- Production-Projekt `fuqhljgesclipzduhykl`: nicht aufgerufen oder geaendert.

## Verbleibend fuer Phase 2

- Eine spaetere freigegebene Platform-Admin-Oberflaeche fuer den vollstaendigen
  Planwechsel auf Basis desselben Resolvers.
- Stripe-Testmode-Anbindung an denselben Lifecycle-Vertrag.
- Kundenlimit `3.000` bleibt eine unbeschlossene Produktidee und ist nicht Teil
  dieses Auftrags.

## Status

**NOT READY - authentifizierter Staging-Admin-Flow noch offen.**

## Fortsetzung und Sicherheitskorrektur

Die Abschlusspruefung fand drei konkrete Grenzfaelle in der ersten Migration:
Eine fehlende Plattformrolle liefert SQL NULL; `NOT IN` allein lehnt diese
nicht ab. Ebenso konnte eine NULL-Bestaetigung den Vergleich `<>` passieren.
Ein zukuenftiger Trial-Beginn wurde nicht geprueft. Die urspruenglichen
JS-Tests und der lokale Rollen-Stub deckten diese Faelle nicht ab.

Forward-Migration `20260910002000_pro_lifecycle_null_guards.sql` korrigiert
ausschliesslich diese Guards, ohne historische Migrationen umzuschreiben.
SHA-256: `d58f8cef2fedc06a8bc343f3442e2fb39e076e80216ebcd1da2315d54e5b3257`.
Sie wurde auf Staging in einer Transaktion angewendet; ihr vollstaendiger
SQL-Quelltext steht in der Migration-History. Signaturen, Grants und RLS
werden nicht erweitert. Erneute lokale Anwendung ist idempotent.

- Echter lokaler SQL-Test: 11/11 zusaetzliche Faelle PASS; Rollen NULL,
  Owner, Staff und Customer, vier ungueltige Bestaetigungen sowie drei
  Trial-Startfaelle. Identitaets-Stubs werden nur lokal in einer
  zurueckgerollten Transaktion gesetzt, niemals auf Staging.
- Bestehende lokale SQL-Lifecycle-/Admin-/Audit-/Idempotenzmatrix erneut PASS.
- Staging read-only: NULL-Rollenguard und NULL-Bestaetigungsguard vorhanden;
  zukuenftiger sowie unbekannter Trial-Beginn fallen auf BASIC zurueck.
- Staging weiterhin 0 Plan-Override-Zeilen und 0 effektiv aktive PRO-Tenants.
- Migration-History: 141/141 Versionen durch lokale Dateien repraesentiert,
  einschliesslich 01000 und 02000; keine doppelte lokale Version.
- CLI `db push --include-all` und CLI Post-Dry-Run nicht ausgefuehrt;
  Anwendung ueber den verifizierten Staging-SQL-Editor und anschliessender
  lesender History-Abgleich.
- Vollstaendige Tests nach Korrektur: 1425/1425 PASS; fokussierte PRO-Tests
  26/26 PASS, zusaetzliche SQL-Faelle separat gezaehlt.
- Typecheck und Build PASS; Lint 0 Fehler / 9 bestehende Warnungen.
- Kein neues Frontend-Deployment, kein Commit, kein Push.

## Offene Nachweise und Risiken

- Ein echter authentifizierter Staging-Planwechsel auf einem ausschliesslich
  isolierten Testtenant samt Audit/Replay und anschliessender Wiederherstellung
  ist nicht nachgewiesen. Lokale SQL-Tests und Staging-Katalogpruefung ersetzen
  diesen Gate nicht. Der zuvor angefragte HTTP-Test der schreibenden
  Override-RPC wurde durch automatische Freigabepruefung abgelehnt; keine
  Umgehung ueber einen anderen Ausfuehrungsweg.
- Ein vollstaendiger DB-Linter-PASS liegt nicht vor: `plpgsql_check` ist auf
  Staging nicht installiert. Advisor zeigt vorhandene RLS-/Policy-/Function-
  Hinweise und deaktivierten Leaked-Password-Schutz. Keine globale
  Sicherheitsbereinigung wurde im Rahmen dieser Phase vorgenommen.
- Beim vorherigen Credential-Schritt wurde ein Staging-DB-Passwort in einer
  Tool-Ausgabe sichtbar. Der Wert wurde nicht in diese Dateien uebernommen.
  Rotation des betroffenen Staging-Zugangs bleibt erforderlich, sofern nach
  dieser Offenlegung noch nicht geschehen.
- `npm install` meldete 11 Dependency-Advisories (3 moderate, 8 high).
  Paketdateien wurden nicht geaendert; diese Meldung ist keine abgeschlossene
  Erreichbarkeits-/Releasebewertung und wurde nicht automatisch behoben.

Production, Stripe und reale Subscription-/Kundendaten bleiben unveraendert.
Der zuvor voreilige COMPLETE-Vermerk ist durch diesen Status ersetzt.

Pruef-ZIP: `exports/2026-09-10_PRO_PHASE_1_ENTITLEMENT_LIFECYCLE_CHECKPOINT.zip`.
Das ZIP enthaelt ausschliesslich die fuenf oben aufgefuehrten Dateien und
wird zusaetzlich im permanenten Workspace unter demselben Exportnamen gesichert.

## Final Staging Gate - Rotation vor Schreibtest (historischer Checkpoint)

Der anschliessende Founder-Auftrag erlaubt den authentifizierten Admin-Test,
setzt aber eine bestaetigte Rotation nach der Passwort-Offenlegung voraus.
Diese Bestaetigung liegt zum aktuellen Pruefzeitpunkt nicht vor.

- Status: **BLOCKED: STAGING CREDENTIAL ROTATION REQUIRED**.
- Staging-Passwort rotiert: NOT CONFIRMED.
- Altes Credential ungueltig: NOT VERIFIED; nicht erneut verwendet.
- Neue direkte DB-Verbindung / aktualisierte Secret-Referenzen: NOT VERIFIED.
- Authentifizierter Admin-Schreibtest und Cleanup: BLOCKED / nicht ausgefuehrt.
- Vollstaendiger DB-Linter und neuer Smoke-Test: NOT RUN.
- Keine neue Migration und keine Staging-/Production-Laufzeitaenderung in
  diesem Final-Gate-Versuch.
- Vorherige Testergebnisse bleiben historische Evidenz; keine neue
  Regression-Pruefung und kein FINAL PASS behauptet.

Erforderlicher naechster Nachweis: Founder/Operator bestaetigt die Rotation
des betroffenen Staging-DB-Passworts nach der Offenlegung und nennt den Stand
der benoetigten Secret-Referenzen, ohne Zugangsdaten zu uebermitteln.

## Aktueller Final-Gate-Stand nach Founder-Rotationsbestaetigung

Der Founder bestaetigte anschliessend ausdruecklich: "rotation fertig".
Der obige Rotations-Bestaetigungsblocker ist damit aufgehoben.

- STAGING PASSWORD ROTATED: CONFIRMED BY FOUNDER.
- OLD CREDENTIAL INVALID: NOT VERIFIED; altes Passwort nicht erneut benutzt.
- Neue direkte DB-Verbindung: NOT VERIFIED. Im Tool-Prozess sind weder
  PGPASSWORD noch DATABASE_URL, DIRECT_URL, SUPABASE_DB_URL oder
  SUPABASE_ACCESS_TOKEN verfuegbar. Es wurden nur Vorhandenseins-Booleans,
  keine Werte ausgegeben.
- SECRET REFERENCES UPDATED: NOT VERIFIED; separate Statusfrage an Operator
  gestellt. Keine Referenz auf die genannten direkten DB-Variablennamen in
  `src`, `scripts` oder `supabase` gefunden. Externe CI-/Provider-Secrets
  lassen sich daraus nicht ableiten.
- Staging-Smoke: bestehende authentifizierte Platform-Admin-Sitzung oeffnet
  `/admin/platform` und laedt Dashboard/Telemetrie sowie Restaurantdetails.
  Beim bestehenden `WUXUAI Bonus Testbetrieb` werden BASIC, Angebotslimit 5,
  deaktivierte Benachrichtigungen und keine manuelle Ausnahme angezeigt.
  Dieser Nachweis bestaetigt die App/API-Verbindung, nicht ein direktes
  PostgreSQL-Login mit dem neuen Passwort.

### CURRENT CODE/CONTRACT MISMATCH

Der verlangte physische befristete Override-Flow ist noch nicht in der
vorhandenen Oberflaeche verdrahtet:

- `PlatformPlanEntitlementsPanel.tsx` ruft
  `updatePlatformRestaurantEntitlements` auf.
- `platformAdminService.ts:605` verwendet weiterhin
  `update_platform_restaurant_entitlements` mit `PLAN_CHANGED`.
- Dieser alte RPC schreibt den gespeicherten Subscription-Plan; er erzeugt
  keinen befristeten `set_platform_restaurant_plan_override`-Vorgang.
- Kein Aufruf des neuen Override-RPC in `src`; kein Eingabefeld fuer Ablauf,
  keine Anzeige von Override-Quelle und wirksamem Zeitraum.
- Physische Staging-Pruefung bestaetigt die vorhandene Paketsteuerung ohne
  Ablauf-Feld. Kein Plan-Speichern oder anderer Schreibvorgang ausgefuehrt.

Status: **BLOCKED / NOT READY**. Eine UI-Anbindung waere eine Implementierung
und wurde im ausschliesslichen Verifikationsauftrag nicht vorgenommen.
Der authentifizierte Schreib-/Audit-/Replay-/Expiry-/Cleanup-Test bleibt
offen. Keine Testdaten veraendert, daher kein neuer Cleanup erforderlich.

DB-Linter: NOT RUN mangels verifizierter direkter Staging-Verbindung.
Vorherige 1425/1425 Tests, 26/26 fokussierte Tests und 11/11 SQL-Tests bleiben
die letzte Code-Evidenz; keine erneute volle Regression nach einem nicht
ausgefuehrten Admin-Flow behauptet. Nur dieser Bericht/Export wurde aktualisiert.
Keine neue Migration, kein Deployment, Production unveraendert.

## Finaler physischer Abschluss, 2026-09-11

Die spaeter freigegebenen Forward-Migrationen, die Platform-Admin-UI und der
isolierte physische TEST_ONLY-Flow schliessen die oben historisch dokumentierten
Blocker. Nach der Legal-/Country-Kompatibilitaetsmigration `20260911006000`
wurde das AT-Onboarding genau einmal abgeschlossen.

- Serverwirksamer Plan: BASIC.
- Angebotslimit: 5.
- Offer- und Reward-Notifications: aus.
- Kein aktiver oder zukuenftiger PRO-Override.
- `PLAN_OVERRIDE_ACTIVATED` und `PLAN_OVERRIDE_ENDED`: je ein Audit-Eintrag.
- Owner besitzt keine Browser-Schreibrechte auf Subscription oder Override.
- 1504/1504 Tests sowie alle aktuellen Qualitaetsgates: PASS.
- Production: unveraendert.

Aktueller Status: **PRO PHASE 1 FINAL LOCK**.

Vollstaendige Evidenz:
`docs/reports/2026-09-11_COUNTRY_PRO_COMBINED_PHYSICAL_GATE_REPORT.md`.

## Phase 1B: lokaler UI-Checkpoint, 2026-09-11

Status: **BLOCKED / NOT READY**, kein Staging Final Lock.
Dieser Abschnitt ersetzt die obige Aussage, dass noch keine UI-Implementierung
autorisiert sei. Der neue Phase-1B-Auftrag erlaubt die eng begrenzte UI-/Service-Arbeit.

### Ursache und aktueller Vertragsunterschied

Der vorhandene sechsteilige `set_platform_restaurant_plan_override`-RPC setzt
den Beginn immer auf `statement_timestamp()`. Ein frei waehlbarer Beginn ist
nicht vorhanden. Ein ausschliesslich den Plan beendender RPC fehlt ebenfalls.
Der alte `ENTITLEMENT_OVERRIDE_CLEARED`-Pfad entfernt den gesamten Override,
einschliesslich sonstiger Support-Ausnahmen. Dieser Pfad wurde nicht benutzt.

Die lokale UI-/Service-Vorbereitung verwendet fuer geplanten Beginn den
zusaetzlichen Parameter `input_starts_at` und fuer das gezielte Ende
`end_platform_restaurant_plan_override`. Beide Vertraege sind erst mit einer
separat freizugebenden Forward-Migration verfuegbar. Die enge Freigabe wurde
angefragt; zum Zeitpunkt dieses Checkpoints liegt keine Antwort vor.
**CURRENT CODE/CONTRACT MISMATCH: nicht deployen, bis Backend und UI passen.**

Bestehende einzelne Feature-Ausnahmen und Safety-Sperren bleiben im Resolver
vorrangig. Die UI erfindet keine Rechte und loescht solche Ausnahmen nicht,
um einen vollstaendigen PRO-Status kuenstlich herzustellen.

### Geaenderte Dateien in Phase 1B

- `src/modules/platform/PlatformPlanEntitlementsPanel.tsx`: getrennte Anzeige
  von effektivem Paket, gespeichertem Abonnement, Quelle, Zeitraum und
  manueller Freischaltung; Pflichtablauf/Grund/CONFIRMED; Beginn sofort oder
  geplant; End-Aktion; Lade-/Fehlerzustaende; kein direkter Planwechsel und
  keine einzelnen Feature-Schalter im Standardablauf.
- `src/modules/platform/platformAdminService.ts`: Server-Lifecycle-Felder und
  neuer Aufruf; ungenutzten alten Browser-Service fuer PLAN_CHANGED entfernt.
  Der alte DB-RPC selbst bleibt unveraendert, nicht als serverseitig entfernt
  oder fuer Billing reserviert behauptet.
- `src/modules/platform/planOverrideRequest.mjs` und `.d.mts`: Eingabepruefung,
  identische Wiederholung mit derselben Vorgangskennung; neue Intention oder
  neuer Tenant erzeugt eine neue Kennung; keine Speicherung von Credentials.
- `src/shared/i18n/planOverrideMessages.mjs` und `.d.mts`: statische Texte in
  DE/EN/FR/IT/ES/ZH/KO; keine externe Uebertragung.
- `src/shared/i18n/catalog.mjs`: Einbindung der neuen Schluessel.
- `src/styles.css`: schmale, auf den neuen Bereich begrenzte Responsive-Regeln.
- `tests/pro-admin-override-ui.test.mjs`: 12 neue Request-, Service-, lokalisierte
  Render- und Read-only-Tests; Service-Pruefung mit Mock, kein Live-RPC-Beweis.
- `tests/pro-package-entitlements.test.mjs`: alte UI-String-Assertions auf den
  neuen Lifecycle-/i18n-Vertrag umgestellt.
- Dieser bestehende Bericht: aktueller Status und offene Gates.

Die beiden bereits vorhandenen Phase-1-Migrationen wurden NICHT editiert,
nicht erneut angewendet. Keine neue Migration erstellt. Kein Git-Push/Commit.

### Verifikation

- Focused UI/Service plus bisherige Pakettests: **21/21 PASS**.
- Full: `node --test tests/*.test.mjs`, **1437/1437 PASS**; nach Entfernen
  des alten Services erneut mit Dot-Reporter, Exit 0.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 Fehler, 9 bestehende Warnungen ausserhalb des Fixes.
- `npm run build`: PASS mit gepruefter Staging-Supabase-URL; bekannte
  Bundle-Groessenwarnung. Kein Deployment.
- Secret-Pattern-Scan: 15 geaenderte/ungetrackte Quelldateien, 0 Treffer
  fuer private Keys, Credential-URLs, Token-/API-Key-Muster. Kein umfassender
  Scan fremder Terminal-/Provider-Logs behauptet; keine Secretwerte ausgegeben.
- `git diff --check`: PASS.
- SQL: `/opt/homebrew/opt/postgresql@17/bin/psql -X -h 127.0.0.1 -p 55432 -d postgres -v ON_ERROR_STOP=1 -f tests/pro-lifecycle-null-guards.sql`
  ergibt `NULL_GUARD_SQL_11_CASES_PASS`, **11/11**, abschliessend ROLLBACK.
  Ausschliesslich lokale synthetische Daten und lokale Identity-Helper;
  kein Ersatz fuer authentifizierte Staging-Nachweise. Testserver gestoppt.
- Sieben Sprachkataloge: Key-Parity und CONFIRMED/PRO-Erhalt PASS;
  serverseitiges React-Test-Rendering PASS, kein physischer Browserbeweis.
- Desktop/Tablet/Mobile des neuen UI: **NOT TESTED**. Nicht als Responsive-PASS
  aus statischen Styles oder SSR abgeleitet.

### Aktuelle physische Staging-Evidenz und Testdaten-Gate

Bestehende authentifizierte Platform-Admin-Seite oeffnet weiter auf
`staging-app.bonus.wuxuaisbi.com`. Restaurantdetail
`a7afbbef-e835-4e4e-bf5e-91406d31b596` zeigt im alten deployten UI BASIC,
Limit 5, Benachrichtigungen aus und keine manuelle Ausnahme.

Der serverseitige Testtenant-Preflight meldet **TEST_ONLY_MARKER_MISSING**;
zusaetzlich gemeinsame Kundenbeziehungen, Nicht-Testkunde, Storage und
historische Audit-Evidence. Der Name `WUXUAI Bonus Testbetrieb` ist kein
hinreichender Isolationsnachweis. Diesen Tenant NICHT fuer den auf markierte
Testdaten begrenzten Schreibauftrag verwendet, nicht markiert oder bereinigt.
Keine neue Freischaltung, kein Audit-Replay, keine Testdatenmutation.
Cleanup to BASIC: NOT TESTED / keine neue Freischaltung zurueckzunehmen.

### Credentials, DB-Linter und offene Gates

- Rotation: FOUNDER-CONFIRMED.
- Neue direkte Verbindung: NOT VERIFIED. Verfuegbarkeit von PGPASSWORD,
  DATABASE_URL, DIRECT_URL und SUPABASE_DB_URL im Ausfuehrungsprozess jeweils
  false; nur Booleans geprueft, keine Werte gelesen/ausgegeben.
- Altes Credential ungueltig: NOT VERIFIED, nicht verwendet.
- Externe Secret-Referenzen aktualisiert: NOT VERIFIED.
- Vollstaendiger Staging-DB-Linter: **NOT RUN / BLOCKED**. Kein Linter-Befehl
  gegen Staging ausgefuehrt, daher keine erfundenen Fehler-/Warnungszahlen.
  Vorgesehener CLI-Gate: `supabase db lint --linked --schema public --level warning`
  erst nach bestaetigtem Link auf `bwhvfjuwixgwduoeqaya` und sicher
  verfuegbarer direkter Verbindung. Lokal-SQL ersetzt diesen Linter nicht.
- RLS/Grants/SQL-Sicherheitsvertraege wurden nicht geaendert. Reale Rollenmatrix,
  aktueller kompletter Linter und physischer Owner-/Admin-Schreibtest bleiben offen.
- Keine Staging-DB-Mutation oder Staging-Deployment in Phase 1B.
- Production: unveraendert; keine Production-Verbindung/Deployment/Migration.

Naechster sicherer Schritt: enge Backend-Erweiterung freigeben und einen
kanonisch markierten isolierten Testtenant sowie sicheren Staging-DB-Zugang
bereitstellen/verifizieren; danach denselben Phase-1B-Gate fortsetzen.
Kein Start eines Kundenlimits, von Stripe oder anderer Folgefeatures.

Pruef-ZIP: `exports/2026-09-11_PRO_PHASE_1B_UI_CHECKPOINT.zip`.

## Phase 1C: freigegebene Forward-Migration, lokaler Gate 2026-09-11

**Aktueller Status: BLOCKED / NOT READY. Kein FINAL PASS oder FINAL LOCK.**
Die Founder-Freigabe fuer die enge Forward-Migration liegt jetzt vor und ersetzt
den oben dokumentierten Freigabeblocker. Es ist keine erneute Migrationsfreigabe
noetig. Der direkte Staging-DB-Zugang und die physischen Gates fehlen weiterhin.

### Umsetzung und genaue Abgrenzung

Neue Migration:
`20260911001000_pro_override_window_and_termination.sql`

SHA-256:
`5a0d40ae237e633fb2ff6febe92e52db509de7249623a876929321766616a93f`

- Drei additive Metadatenfelder: `plan_override_id`, `plan_effective_from`,
  `plan_effective_until`. Keine neue Geschaeftstabelle, keine RLS-Aufweichung.
- Planlaufzeit und vorhandene Feature-Ausnahmen besitzen getrennte Fenster.
  Aktivierung/Ende veraendern weder deren Werte, Laufzeit oder Provenienz noch
  den zugrundeliegenden Subscription-Datensatz.
- Begrenzte gueltige Legacy-Fenster werden unverlaengert kopiert und erhalten
  eine ID. Keine neue Freischaltung, kein BASIC-zu-PRO-Backfill. Unvollstaendige
  oder unendliche Legacy-Fenster bleiben fail-closed. Historische Auditzeilen
  bleiben unveraendert. Der Backfill ist auf erneutem Lauf wirkungslos.
- Siebenargumentiger Aktivierungs-RPC: alle Parameter explizit; NULL-Beginn
  bedeutet bewusst "sofort" nach Serverzeit. Nur PRO; PREMIUM und BASIC als
  manuelles Aktivierungsziel abgelehnt. Endzeit endlich, zukuenftig und strikt
  nach Beginn. Vergangene explizite Beginnzeit wird abgelehnt.
- End-RPC verlangt konkreten Override, Tenant, Grund, CONFIRMED und
  Idempotenzschluessel. Ein veralteter Override kann keinen Ersatz beenden.
- Gleiche Lock-Reihenfolge: Restaurant, Subscription, gegebenenfalls Override.
  Wiederholungen werden nach dem Lock und vor erneutem Schreiben erkannt;
  geaenderte Payloads unter demselben Schluessel abgelehnt.
- Unveraenderliche `PLAN_OVERRIDE_ACTIVATED`-/`PLAN_OVERRIDE_ENDED`-Auditzeilen
  enthalten Actor, Tenant, Ziel-ID, Vorher/Nachher, Grund und Zeitpunkt.
- Browser-Ausfuehrung des alten direkten Plan-/Clear-RPC und des alten
  sechsargumentigen Override-RPC wird entzogen. Alte Funktionen werden nicht
  geloescht; der Browser nutzt ausschliesslich die neuen Signaturen.
- Neue Funktionen behalten auth.uid(), kanonische Plattformrollen und festen
  search_path. Owner/Staff/Customer/fehlende Rolle sind nicht autorisiert.
- Kein Safety-Block oder bestehender Feature-Override wird entfernt, um einen
  kuenstlichen vollstaendigen PRO-Status zu erzeugen. Reiner Testtenant ohne
  solche Ausnahmen erhaelt den ganzen PRO-Katalog mit einer Aktion.

UI-Anbindung erweitert `PlatformPlanEntitlementsPanel.tsx`,
`platformAdminService.ts`, `planOverrideRequest.mjs`/`.d.mts` und
`planOverrideMessages.mjs`: Ziel-ID fuer das Ende, separater empfindlicher
Bestaetigungsdialog, eigene Begruendung/CONFIRMED, lokalisierter Konflikthinweis,
Reload an Zeitgrenzen und bei Fensterfokus. Ungeklaerte Antworten koennen mit
derselben Kennung auch nach Ablauf erneut angefragt werden, ohne neue Grants.

`RestaurantOffersPage.tsx` und `restaurantOfferService.ts` zeigen dem Owner
zusaetzlich nur die serverseitige gueltige Laufzeit, lokalisiert. Kein
Owner-Schreibrecht, keine Aenderung an Angebotserstellung oder Limitlogik.

Tests erweitert/neu: `pro-admin-override-ui.test.mjs`,
`pro-override-forward.test.mjs`, `pro-override-window.sql` und
`pro-override-concurrency.mjs`. Vorhandene Phase-1B-Dateien bleiben Bestandteil
des Checkpoints. Keine Paket-, Auth-, QR-, Points-, Gift-, Kassa-, Stripe-,
Kundenlimit- oder Production-Aenderung.

### Lokale Ergebnisse

- Migration atomar in der bestehenden synthetischen lokalen PostgreSQL-17-DB
  auf 127.0.0.1:55432 angewendet: PASS. Erster Backfill 2 lokale historische
  Fixture-Zeilen, Wiederholung 0; beide Durchlaeufe erfolgreich.
- Fokussiert: **47/47 PASS** (UI/Service, Paket, Lifecycle, Forward-Vertrag).
- Vollstaendig: **1446/1446 PASS**.
- SQL: `psql -X -h 127.0.0.1 -p 55432 -d postgres -v ON_ERROR_STOP=1 -f tests/pro-override-window.sql`
  **45/45 PASS**, vollstaendiger ROLLBACK. Identity-Helper ausschliesslich lokal.
  Geprueft: Rollen, anon-Grants, Pflichtfelder, Zeitfenster, Future/Immediate,
  Audit, Replay, Payload-Kollision, stale/foreign Target, BASIC/paid-PRO-Fallback,
  Legacy-Fail-Closed, Ablauf, erhaltene Supportwerte und entzogenes Browser-DML.
- Echte parallele Verbindungen: `node tests/pro-override-concurrency.mjs`,
  **3/3 PASS**. Eine wegwerfbare Kopie der lokalen synthetischen DB wurde
  erzeugt und danach entfernt. Zwei Aktivierungen: eine Operation. Veraltetes
  Ende nach Ersatz: blockiert. Zwei identische Enden: eine Operation, BASIC.
- Typecheck: PASS. Lint: 0 Fehler, 9 bestehende Warnungen.
- Build: PASS, ausschliesslich mit gepruefter Staging-Supabase-URL; bekannte
  Bundle-Groessenwarnung. Build ist kein Staging-Deployment.
- Sieben Sprachen: Key-Parity, Pflichtbestaetigung und SSR-Rendering PASS.
  Responsive, Dialoginteraktion und Owner-/Admin-Ansicht im echten Staging-
  Browser sind NICHT durch diese lokalen Tests ersetzt.
- Die beiden bestehenden Migrationen 20260910001000 und 20260910002000
  behalten ihre oben dokumentierten SHA-256-Werte. Nicht erneut angewendet.

### Exakte externe Blocker und noch nicht ausgefuehrte Schritte

1. **NEW STAGING DB CONNECTION: NOT VERIFIED.** In der Ausfuehrungsumgebung
   sind PGPASSWORD, DATABASE_URL, DIRECT_URL und SUPABASE_DB_URL weiterhin
   nicht gesetzt. Es wurden nur Vorhandenseins-Booleans ausgegeben. Die
   Founder-bestaetigte Rotation ist kein technischer Verbindungsnachweis.
2. **SECRET REFERENCES: NOT VERIFIED.** Keine Aussage ueber externe CI- oder
   Provider-Referenzen aus lokalen Tests abgeleitet. Altes Credential nicht
   verwendet; Ungueltigkeit daher nicht technisch verifiziert.
3. **STAGING MIGRATION: NOT APPLIED.** Kein SQL-Editor-Workaround, kein db push,
   keine neue Staging-Migrationshistorie. Letzte belegte History: 141 lokale/
   Staging-Versionen vor dieser neuen Datei; aktuellen Remote-Stand nicht
   erneut abgerufen. Neue Datei ist ein lokaler, unangewendeter Kandidat.
4. **DB LINTER: NOT RUN.** Keine gemessenen Staging-Fehler-/Warnungszahlen.
   Nach sicherem Zugang den oben genannten Linked-Linter nur nach expliziter
   Projektpruefung auf `bwhvfjuwixgwduoeqaya` ausfuehren, inklusive Bewertung
   von RLS, Grants, Definer/Search-Path und Function Exposure.
5. **TEST_ONLY TENANT: NOT VERIFIED/NOT CREATED.** Den vorher belegten
   `TEST_ONLY_MARKER_MISSING`-Betrieb nicht veraendert. Keine echte Zeile als
   Testbetrieb ummarkiert. Erst nach DB-Gate einen vorhandenen kanonisch
   markierten Tenant verwenden oder den freigegebenen sicheren Onboarding-
   und Testmarkierungsvertrag verwenden. Kein Schutz wurde abgeschwaecht.
6. **STAGING DEPLOYMENT: NO.** Keine Worker-Version erstellt. Aktuelle
   Staging-UI und alte Remote-Grants bleiben somit unveraendert.
7. **PHYSICAL ADMIN/OWNER/ROLE MATRIX: NOT TESTED.** Keine neue Live-Aktivierung,
   kein Live-Audit-/Replay-Nachweis, kein Live-Future/Expiry-Nachweis.
   Kein lokaler Identity-Stub auf Staging, keine Service-Role-Substitution.
8. **CLEAN TEST STATE:** Keine externen Testdaten angelegt oder veraendert;
   keine neue PRO-Freischaltung. Rueckkehr zu BASIC ist nur lokal bewiesen,
   nicht als physischer Staging-PASS behauptet.

### Weiterfuehrung und Forward-Fix-Plan

Operator muss den rotierten Staging-DB-Zugang ueber einen sicheren lokalen
Credential-Kanal fuer den ausfuehrenden Prozess verfuegbar machen und den
Stand der betroffenen Secret-Referenzen bestaetigen. Kein Passwort in Chat,
Shell-Befehlsargumenten, Dateien, Reports oder Git. Dann Verbindung pruefen,
exakten Staging-Migrationsstand/dry-run pruefen und nur den freigegebenen
Kandidaten anwenden. Danach Linter, TEST_ONLY-Flow, Staging-Deployment,
physische Tests und auditiertes Ende; keine Folgephase starten.

Bei Regression: EXECUTE der neuen Browser-RPCs gezielt entziehen, Daten und
Audit bewahren und einen geprueften Forward-Fix erstellen. Niemals auf den
alten direkten Planwechsel zurueckschalten oder Migrationhistorie umschreiben.
Diese Rueckfallmassnahme wurde nur dokumentiert, nicht extern ausgefuehrt.

Production/Secrets/DB/Worker: **UNCHANGED**. Kein Commit, Push oder Merge.
Pruef-ZIP: `exports/2026-09-11_PRO_PHASE_1C_CHECKPOINT.zip`.

Abschliessende Checkpoint-Pruefung: 21 Quelldateien im gesamten Phase-1-Scope,
0 Secret-Pattern-Treffer, Whitespace-Check einschliesslich ungetrackter Dateien
PASS. Lokal 142 Migrationsdateien, 0 doppelte Zeitstempel. Vollsuite nach den
letzten UI-Aenderungen nochmals 1446/1446 PASS. Lokalen Testserver gestoppt.

## Phase 1C: Linked-Staging-Anwendung und Sicherheitsstopp 2026-09-11

**Aktueller Status: BLOCKED / NOT READY. CURRENT CODE/CONTRACT MISMATCH.**
Dieser Abschnitt ersetzt die obigen offenen Verbindungs-/Migrationsangaben,
nicht die weiterhin fehlenden physischen Tests. Kein FINAL LOCK.

### Verbindung, Migration und Historie

- Beide lokalen `supabase/.temp/project-ref` zeigen ausschliesslich
  `bwhvfjuwixgwduoeqaya`; Hauptrepository und Phase-1-Worktree geprueft.
- Supabase CLI 2.116.0 aus dem vorhandenen npm-Cache verwendet. Kein Update.
- Linked-CLI stellt erfolgreich eine DB-Verbindung her; keine Credentialwerte
  ausgegeben. CLI meldet `Initialising login role`. Das beweist die CLI-
  Verbindung, nicht separat die Verwendung des vom Founder rotierten
  postgres-Passworts oder saemtlicher externen Secret-Referenzen.
- Rotiertes Passwort: Founder-Verbindung bestaetigt; altes Credential und
  externe CI-/Deployment-Secret-Referenzen weiterhin NOT VERIFIED.
- `supabase db push --linked --dry-run --skip-vault`: exakt eine Migration,
  `20260911001000_pro_override_window_and_termination.sql`, keine Seeds/Rollen.
- SHA-256 vor Anwendung unveraendert:
  `5a0d40ae237e633fb2ff6febe92e52db509de7249623a876929321766616a93f`.
- `supabase db push --linked --skip-vault --yes`: erfolgreich angewendet.
  Keine weitere Migration, kein Vault-Update, kein Seed, keine Production.
- `supabase migration list --linked`: 142/142 Local/Remote-Versionen passend,
  neuester Stand `20260911001000`; keine Remote-only-Version.
- Post-Dry-Run mit identischem Befehl: `upToDate=true`, `migrations=[]`.

### DB-Linter und Security Advisors

`supabase db lint --linked --level warning --fail-on error`
lief vollstaendig fuer die von der CLI ausgewaehlten Schemas `extensions` und
`public`: Exit 0, **0 Fehler, 30 Warnungen in 16 Funktionen**. Dies ist kein
Null-Warnungen-PASS und kein Ersatz fuer RLS-/Grant-Pruefung. Providerinterne
Schemas wurden nicht als separat gelintet behauptet.

- Unbenutzte Parameter/Variablen: bestehende Loyalty-/Registration-/Referral-
  und Legal-Routinen; keine Warnung in den drei Funktionen der neuen Migration.
- `cleanup_platform_test_tenant`: Loopvariable ueberschattet lokale Variable;
  keine Cleanup-Aktion ausgefuehrt und kein globaler Immutability-Fix abgeleitet.
- `get_customer_referral_invite_status`, `get_restaurant_kassa_reconciliation`,
  `get_public_legal_center`: STABLE/VOLATILE-Mismatch. Bestehende Funktionen,
  separat zu bewerten; keine Aenderung innerhalb dieses engen Overridescopes.
- `audit_safe_metadata`: drei IMMUTABLE/STABLE-Warnungen. Bestehende
  Auditfunktion, nicht als geloest behauptet und nicht veraendert.
- `ensure_today_restaurant_pin`: moegliches Funktionsende ohne RETURN.
  Bestehender PIN-Vertrag, keine PIN-Aktion ausgefuehrt oder Logik veraendert.

`supabase db advisors --linked --type security --level warn --fail-on error`:
Exit 0, **193 WARN, 0 ERROR**: 55 anon-Definer-Exposures, 137 authenticated-
Definer-Exposures und 1 deaktivierter Leaked-Password-Schutz. Keine pauschale
Entwarnung fuer alle Alt-RPCs. Die Phase-1-relevanten authenticated-Warnungen
betreffen `get_restaurant_entitlements`, die neue Aktivierung und Beendigung:
beabsichtigte Browser-Einstiegspunkte mit expliziter Rollenpruefung. Der reale
Owner-/Staff-/Customer-Negativtest bleibt trotzdem offen. Auth-Einstellung
nicht veraendert.

### Tatsaechliche Grants und neuer P0-Befund

Lesende `supabase db query --linked`-Katalogabfragen bestaetigen:

- Neue Aktivierung (7 Parameter) und Beendigung: SECURITY DEFINER,
  `search_path=public, pg_temp`, authenticated EXECUTE, kein anon EXECUTE.
- Alter 6-Parameter-Override, alter direkter Entitlements-RPC und interner
  Resolver: weder anon noch authenticated EXECUTE.
- RLS aktiv auf allen sechs geprueften Phase-1-Tabellen. Keine Browser-DML auf
  Overrides, Plan-Katalog, Safety Blocks, Operations-Audit oder Testregistry.
- **Ausnahme / P0: `public.branch_subscriptions`.** anon/authenticated besitzen
  Tabellen-DML; die bestehende Policy `branch subscriptions admin write`
  erlaubt ALL fuer `is_restaurant_admin` des zugehoerigen Restaurants.
  Authenticated INSERT/UPDATE ist insbesondere fuer `plan_key`,
  `subscription_status`, `payment_status`, `current_period_end` und
  `trial_ends_at` nachgewiesen. RLS ist eingeschaltet, verhindert aber den
  eigenen Owner-Schreibpfad nicht.
- Live sind nur zwei User-Trigger vorhanden: Past-Due-Zeitpflege und Sperre
  des Werts PREMIUM. Kein Trigger sperrt eine direkte PRO-/Laufzeitaenderung
  durch einen berechtigten Restaurant-Admin.
- Ursprung der Policy: `20260704243000_multi_branch_architecture_prep.sql`.
  Die neu angewendete Migration hat sie weder erzeugt noch veraendert.
- Der Befund widerspricht `Owner read-only / plan changes platform-admin-only`.
  **RLS/GRANTS Gesamtgate: FAIL**, obwohl die neuen RPC-Grants passen.
  Kein Exploit gegen echte Restaurantdaten ausgefuehrt; Evidenz ist die
  tatsaechliche Remote-Policy-/Grant-/Triggerkonfiguration plus Resolver-Code.
  Lokale synthetische SQL-Tests prueften diesen Alt-Policy-Pfad nicht.

Keine eigenmaechtige weitere Migration. Naechste Freigabe muss eine gezielte
Subscription-DML-Haertung auf Staging abdecken, inklusive kanonischer
Onboarding-/Subscription-Schreibwege, Owner-/Staff-/Customer-Negativtests und
Regression. Keine historischen Policies unbesehen global entfernen.

### Physische Gates, Testzustand und Regression

- Aktive `platform_test_tenant_registry`-Zeilen: **0** (direkte SELECT-Abfrage).
  Kein vorhandener Tenant willkuerlich markiert, kein Businessdatum geaendert.
- Platform-Admin-Dashboard physisch mit bestehender authentifizierter Sitzung
  auf Staging geoeffnet. Alte deployte UI vorhanden, kein neuer Schreibflow.
  Temporaeren eigenen Prueftab geschlossen; bestehende Sitzungen erhalten.
- Kein isolierter neuer Owner angemeldet/angelegt; vorherige Login-Anfrage
  allein autorisiert keine Aufweichung dieses Sicherheitsstopps.
- Kein Future-/Immediate-Override, kein Replay und keine Beendigung auf
  Staging ausgefuehrt. Daher keine PRO-Testaktivierung zurueckzustellen.
- Staging-Deployment bewusst NICHT ausgefuehrt. Worker-Version lesend
  bestaetigt: `e7373fe5-44fc-46f4-9b09-91f951d63698`.
- Vollsuite erneut **1446/1446 PASS**. Typecheck PASS. Lint 0 Fehler,
  9 bestehende Warnungen. Build PASS mit gepruefter Staging-Supabase-URL;
  bekannte Bundle-Groessenwarnung. Kein Production-Build/-Deployment.
- Lokale SQL-45-/Concurrency-3-Faelle sind fruehere Checkpoint-Evidenz,
  nicht in diesem Fortsetzungslauf wiederholt und kein Staging-Rollenbeweis.

Offener bestaetigter P0: **1 (Owner Subscription-DML)**. Weitere offene Gates:
TEST_ONLY-Onboarding, neue Staging-UI, physische Rollen-/Owner-/Admin-Matrix,
auditierte Rueckkehr zu BASIC sowie externe Credential-Referenzen.
Production DB/Auth/RLS/Worker/Secrets: **UNCHANGED**. Kein Commit/Push/Merge.
Pruef-ZIP dieses Nachweises: `exports/2026-09-11_PRO_PHASE_1C_STAGING_GATE.zip`.

Abschlusspruefung dieses Fortsetzungslaufs: fokussierte Tests **47/47 PASS**;
Scoped Secret-Pattern-Scan ueber alle 21 geaenderten/neuen Quelldateien
**0 Treffer**, keine Vollpruefung fremder Logs oder alter Git-Historie
behauptet. `git diff --check` PASS. Migration seit Anwendung nicht editiert.

## Phase 1D: Schreibpfad-Audit vor Forward-Fix (2026-09-11)

Status: IN PROGRESS / NOT READY. Keine Phase-1D-Migration angewendet.

Live-Katalog auf Staging bestaetigt die Policy `branch subscriptions admin
write` (ALL, Restaurant-Admin-Pruefung) und INSERT/UPDATE/DELETE fuer
`authenticated`. Anon besitzt ebenfalls Tabellenrechte, aber keine passende
Owner-Policy. Die SELECT-Member-Policy bleibt der bisherige Lesevertrag.

Tatsaechliche Schreibpfade:

- `SettingsPage.loadPrimarySubscription`: Browser-Insert bei fehlendem Abo,
  Legacy-Plan `pilot`, Trial-Ende aus Browserzeit. Wird entfernt; fehlende
  Daten bleiben fehlend, Settings erzeugt keine Subscription.
- `ensure_restaurant_branch(uuid)`: interner SECURITY-DEFINER, fuer Browser
  gesperrt, INSERT BASIC ON CONFLICT DO NOTHING. Initialer Restaurant-Trigger
  und kanonische Onboarding-/Admin-Funktionen verwenden ihn.
- `start_restaurant_owner_trial(text,text,text)`: authentifizierter
  Registrierungs-RPC, keine Plan-/Zahlungsparameter. BASIC und drei
  Kalendermonate serverseitig. Profile-Upsert serialisiert denselben User;
  der bestehende Subscription-Upsert fuellt aber NULL-Werte auch bei
  vorhandenen Subscriptions. Erhaltung bezahlter Abos muss getestet werden.
- `update_platform_restaurant_subscription(...)`: oeffentlich fuer
  authenticated ausfuehrbarer Legacy-Wrapper. Er sperrt Payment- und
  Restaurantstatus-Parameter, hat aber keine eigene Rollenpruefung.
  Der interne Writer verwendet `role NOT IN (...)`, ohne NULL explizit
  abzulehnen. Das ist ein weiterer Fail-open-Pfad, nicht durch die
  Tabellen-Grant-Sperre behoben. Die echte Admin-UI verwendet diesen Wrapper.
- `update_platform_restaurant_subscription_internal_v1`: keine Browser-
  EXECUTE-Rechte; Legacy-pilot-/30-Tage-Fallback und Audit in `audit_log`.
- Aktuelle PRO-Aktivierung/Beendigung: die bereits angewendeten geschuetzten,
  auditierten Phase-1C-RPCs. Sie aendern Override-Metadaten, nicht das Basisabo.
- Alter Entitlements-Writer, alter 6-Parameter-Override und interner Resolver:
  Browser-EXECUTE auf Staging bereits gesperrt.
- Kein direkter Subscription-Writer in `supabase/functions` gefunden;
  service_role bleibt der serverseitige Zugriff. Stripe wird nicht gebaut.

Zusaetzlicher indirekter Pfad: `branches` besitzt authenticated DELETE und
eine Owner-ALL-Policy; der Subscription-FK war mit ON DELETE CASCADE angelegt.
Organisation-/Branch-Loeschung und Identitaetswechsel muessen vor P0 CLOSED
gesondert gegen die echten Constraints/Trigger geprueft werden. Es wurde
kein Loesch-/Manipulationsversuch an realen Staging-Restaurants ausgefuehrt.

Production unveraendert. Alte Migrationen unveraendert. Kein Deployment.

### Phase 1D: aktueller Staging-Checkpoint

**STATUS: BLOCKED / NOT READY, kein Phase-1 FINAL LOCK.**

Angewendet ausschliesslich auf `bwhvfjuwixgwduoeqaya`:
`20260911002000_subscription_browser_write_lock.sql`.
SHA-256: `851fa0e34090612ca68121409e3c760fc5842de97fa6fd43f7c2f083021d0824`.
Die drei zuvor angewendeten Phase-1-Migrationen sind weiterhin byte-identisch
zu den oben dokumentierten Hashes. Keine Migration auf Production.

Vorher/Nachher fuer `branch_subscriptions`:

| Rolle | Vorher INSERT/UPDATE/DELETE | Nachher INSERT/UPDATE/DELETE | Spalten-Schreibrechte nachher |
|---|---|---|---|
| anon | Tabellenrechte vorhanden, RLS galt | alle gesperrt | 0 |
| authenticated (Owner/Staff/Customer/Platform Admin im Browser) | Tabellenrechte vorhanden; Owner-ALL-Policy | alle gesperrt | 0 |
| service_role (Server) | vorhanden | erhalten | erhalten |

RLS bleibt aktiv. Die einzige verbleibende Policy ist die bisherige
`branch subscriptions member select` (SELECT). Drei neue SECURITY-INVOKER-
Trigger sperren fuer Browserrollen Parent-Loeschungen und Aenderungen an
ID/Owner/Restaurant/Organisation/Primaerbranch. Normale Profilfelder und
vertrauenswuerdige SECURITY-DEFINER-/Serverpfade bleiben erhalten. Die
Live-FKs bestaetigten vorher ON DELETE CASCADE sowohl fuer Branch als auch
Organisation; deshalb gehoert dieser Umweg zum Subscription-Write-Lock.

Die Migration fuehrt keine Subscription-DML an vorhandenen Datensaetzen aus.
Neue Subscriptions erhalten ausschliesslich serverseitig BASIC, trialing,
not_required und drei Kalendermonate. Onboarding nimmt nur Name,
Restaurantname und optional Telefon an, serialisiert je Auth-ID und liest
bestehende Subscriptions unveraendert. Bezahlte Subscriptions mit NULL-Trial-
Feldern bleiben auch beim wiederholten Onboarding unveraendert.

Interne Branch- und Legacy-Writer bleiben fuer Browser gesperrt. Der
Legacy-Status-Wrapper prueft jetzt Auth-ID, nicht-NULL-Plattformrolle,
zulassige Plattformrolle und Pflichtgrund, bevor der vorhandene Writer
aufgerufen wird. Manuelle Payment-/Tenantstatus-Eingaben bleiben gesperrt.
Die aktuelle PRO-Aktivierungs-/Beendigungslogik von Phase 1C bleibt unberuehrt.

**Verbleibender Vertragsabgleich:** Der alte sechsparametrige Status-/Trial-
Wrapper besitzt weiterhin keine serverseitigen Confirmation-/Idempotency-
Parameter. Sein interner Writer enthaelt zudem noch einen historischen
pilot-/30-Tage-Fallback fuer eine fehlende Subscription. Der neue Owner-
Schreibschutz darf deshalb nicht als vollstaendiger FINAL-PASS aller
Admin-/Billing-Schreibvertraege ausgegeben werden. Der positive lokale Test
dieses Wrappers prueft autorisierte Delegation an einen Stub, nicht den
vollstaendigen alten Writer. Dieser Restpfad muss vor Gesamtabschluss
abgeglichen/gehaertet und real getestet werden; die bereits angewendete
02000-Migration darf dafuer nicht nachtraeglich editiert werden.

Verifikation:

- Vor-Dry-Run exakt eine Migration: 20260911002000; `--skip-vault`, keine
  Seeds/Role-Aenderungen durch CLI. Anwendung erfolgreich.
- History **143/143**, **0 Abweichungen**, neueste Version 20260911002000.
- Post-Dry-Run **0 pending**, Vault unveraendert.
- Neue fokussierte Source-Tests **7/7 PASS**.
- Gesamte PRO-/Platform-Testauswahl **107/107 PASS**.
- Lokale SQL-Angriffsmatrix **40/40 PASS** in einer eigenen PostgreSQL-
  Datenbank mit synthetischen Identitaeten und nachgebildeten echten Policies.
  Dies ist keine vollstaendige Kopie der Staging-Datenbank.
- Parallel-Onboarding **2/2 Assertions PASS**: drei parallele Requests,
  genau ein Restaurant, eine Branch und eine Subscription.
- Live-Staging-SQL-Rollenmatrix **8/8 PASS** unter `authenticated` und `anon`:
  INSERT/UPDATE/DELETE abgewiesen, interner Branch-RPC abgewiesen,
  Legacy-Status-RPC ohne Auth abgewiesen. Alle DML-Probes verwendeten
  `WHERE false`: keine Geschaeftszeile wurde angelegt, geaendert oder geloescht.
  Dies belegt DB-Rollenrechte, nicht eine physische Anmeldung jeder Persona.
- Volle Tests **1453/1453 PASS**, Typecheck PASS, Lint 0 Fehler / 9
  bestehende Warnungen, Build PASS mit gepruefter Staging-Bindung und der
  bestehenden Bundle-Groessenwarnung.
- Begrenzter Secret-Pattern-Scan der geaenderten/neuen Dateien: 0 Treffer.
  Keine Aussage ueber fremde alte Logs oder die gesamte Git-Historie.
- DB-Linter: public/extensions vollstaendig durch CLI geprueft, **0 Fehler,
  30 unveraenderte Warnungen**; keine Warnung aus den Phase-1D-Funktionen.
- Security Advisor unveraendert: 193 Hinweise (55 anon-SECURITY-DEFINER,
  137 authenticated-SECURITY-DEFINER, 1 leaked-password-protection).
  Kein pauschaler Security-FINAL-PASS fuer alle historischen Hinweise.

### Einzelklassifikation der 30 DB-Linter-Warnungen

Alle folgenden Warnungen bestanden bereits vor Phase 1D. Keine ist durch
Phase 1D neu entstanden. `Technische Schuld` ist eine technische Einordnung,
keine erfundene externe Risikoabnahme.

| Nr. | Funktion / einzelne Warnung | Einordnung |
|---|---|---|
| 1 | apply_loyalty_staff_session_action / input_restaurant_id unbenutzt | Absichtlich gesperrter Legacy-Stub; technische Schuld |
| 2 | gleiche Funktion / input_customer_id | Gesperrter Stub; technische Schuld |
| 3 | gleiche Funktion / input_staff_session_token | Gesperrter Stub; technische Schuld |
| 4 | gleiche Funktion / input_loyalty_mode | Gesperrter Stub; technische Schuld |
| 5 | gleiche Funktion / input_points | Gesperrter Stub; technische Schuld |
| 6 | gleiche Funktion / input_stamps | Gesperrter Stub; technische Schuld |
| 7 | gleiche Funktion / input_reason | Gesperrter Stub; technische Schuld |
| 8 | gleiche Funktion / input_rule_id | Gesperrter Stub; technische Schuld |
| 9 | gleiche Funktion / input_bill_amount | Gesperrter Stub; technische Schuld |
| 10 | get_customer_referral_invite_status / STABLE benutzt VOLATILE | Funktionale Volatilitaetsdeklaration; separater Review, kein neuer Subscription-Befund |
| 11 | apply_loyalty_staff_action / input_reason | Unbenutzter Kompatibilitaetsparameter; Audit-Semantik separat pruefen |
| 12 | get_restaurant_kassa_reconciliation / STABLE, day_value | Funktionale Volatilitaetsdeklaration; Kassa unveraendert |
| 13 | register_campaign_customer / token_id ungelesen | Legacy-/Datenfluss-Schuld; keine neue Berechtigung |
| 14 | collect_bonus_points / input_restaurant_slug | Gesperrte alte Ueberladung; technische Schuld |
| 15 | collect_bonus_points / input_customer_token | Gesperrte alte Ueberladung; technische Schuld |
| 16 | collect_bonus_points / input_amount_tier_key | Gesperrte alte Ueberladung; technische Schuld |
| 17 | cleanup_platform_test_tenant / Schleifenvariable verdeckt pass_number | Lokale Namensueberschattung; technische Schuld |
| 18 | cleanup_platform_test_tenant / pass_number unbenutzt | Deklaration aus vorheriger Zeile; technische Schuld |
| 19 | register_restaurant_customer / token_id ungelesen | Datenfluss-/Kompatibilitaets-Schuld |
| 20 | ensure_today_restaurant_pin / Ende ohne RETURN | Live-Source: Rueckgabe oder Exception in begrenztem Retry-Loop; statische Analysegrenze, kein nachgewiesener neuer Fehler |
| 21 | apply_staff_daily_pin_loyalty_action / input_reason | Unbenutzter Parameter; Audit-Semantik separat pruefen |
| 22 | audit_safe_metadata / IMMUTABLE nutzt STABLE, Zeile 6 | Sicherheitsnaher Redactor; Deklarations-Schuld, keine neue Exposure-Evidenz |
| 23 | audit_safe_metadata / IMMUTABLE nutzt STABLE, Zeile 14 | Gleiche Deklarations-Schuld im Array-Zweig |
| 24 | audit_safe_metadata / IMMUTABLE nutzt STABLE, Zeile 19 | Gleiche Deklarations-Schuld beim Rueckgabewert |
| 25 | upsert_referral_boost / input_multiplier | Legacy-Parameter; bestehender fester Referral-Vertrag, unveraendert |
| 26 | upsert_referral_boost / input_duration_days | Legacy-Parameter; bestehender fester Referral-Vertrag, unveraendert |
| 27 | get_public_legal_center / STABLE nutzt VOLATILE | Funktionale Volatilitaetsdeklaration; separater Review, keine Legal-Aenderung |
| 28 | register_restaurant_customer_legal / input_marketing_sms | SMS ist nicht aktiver V1-Vertrag; Kompatibilitaets-Schuld |
| 29 | register_referral_customer_legal / input_marketing_sms | SMS ist nicht aktiver V1-Vertrag; Kompatibilitaets-Schuld |
| 30 | generate_restaurant_legal_package / version_id_value ungelesen | Unbenutzte lokale Variable; technische Schuld |

### Physischer Gate und verbleibende Arbeit

- Platform-Admin-Dashboard nach Migration physisch geoeffnet, bestehende
  autorisierte Sitzung funktioniert. Keine Vertragsaktion ausgefuehrt.
- Chrome-Zugriff zweimal mit Timeout; Codex-In-App-Browser funktioniert.
- Live-Testregistry: **0 aktive TEST_ONLY-Mandanten**. Kein echter Betrieb
  ummarkiert oder angegriffen; keine neuen Auth-Identitaeten angelegt.
- Founder um bestehende isolierte Owner-Anmeldung im Chrome gebeten, nur
  E-Mail als Rueckmeldung, kein Passwort/Token im Chat.
- Physischer Owner-/Staff-/Customer-Gate, neue UI, PRO-Override/Replay,
  Audit/Beendigung/BASIC-Rueckkehr: **NICHT AUSGEFUEHRT**.
- Deshalb **kein App-Deployment**, kein Physical FINAL LOCK. Der direkte
  Subscription-DML-P0 ist auf Tabellen-/Spalten-/DB-Rollenebene gesperrt;
  Gesamtphase bleibt bis zu allen oben genannten Restgates NOT READY.
- Production DB/Auth/RLS/Worker/DNS unveraendert. Kein Stripe, kein oeffentlicher
  PRO-Release, kein Kundenlimit, kein Folgefeature, kein Git-Push/Commit.

Pruef-ZIP: `exports/2026-09-11_PRO_PHASE_1D_STAGING_CHECKPOINT.zip`.

## 2026-09-11 - Confirmed Admin subscription request: Staging checkpoint

Status: **NOT READY / physical TEST_ONLY gate open**. This section supersedes
the previous checkpoint only for the legacy subscription confirmation gap.
Production remains unchanged. No public PRO release, deployment, commit or push.

### Cause and exact change

The browser-callable legacy status/trial support RPC accepted a reason but
did not require explicit confirmation or idempotency. A retry could extend
the trial again. The new additive migration is:

`20260911003000_subscription_admin_request_contract.sql`

SHA-256: `728433bf8af8cf3f5ba45ea929b9befa94b1317a8442acd4a1e60bb5f7f2caea`.

- New confirmed RPC requires auth UID, an existing permitted platform role,
  exact `CONFIRMED`, reason >=10 characters, tenant and request UUID.
- Tenant then subscription locks serialize concurrent attempts. The retained
  operation stores the request fingerprint and response. Same request replays
  without another write; a changed payload with the same key is rejected.
- Branch, tenant and organization binding are checked. Canonical branch/trial
  initialization prevents the old pilot/30-day missing-subscription fallback.
- Existing server-only writer preserves support status and extension behavior.
  Payment and restaurant lifecycle arguments are rejected. No plan parameter.
- New RPC and internal writer use `pg_catalog, public, pg_temp`. Browser execute
  on the old six-argument entry point and internal writer is revoked.
- Full immutable platform operation includes actor, role, target, reason,
  before/after, request, response and key; legacy audit remains intact.
- Existing UI now sends explicit confirmation and stable request UUID, binds
  the selected tenant, and freezes a submitted payload for retries. Labels reuse
  existing seven-language plan-override keys. No direct browser subscription DML.

Additional/updated files in this follow-up:

- The migration above.
- `src/modules/platform/platformAdminService.ts`
- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/PlatformRestaurantControlCenter.tsx`
- `tests/platform-admin-foundation-security.test.mjs`
- `tests/pro-subscription-admin-request.test.mjs`
- `tests/pro-subscription-admin-request.sql`
- `tests/pro-subscription-admin-concurrency.mjs`
- This report.

All four previously applied Phase 1 migrations retain their recorded SHA-256.
No RLS, onboarding contract, role classification, gift, QR, PIN, points,
production configuration or billing integration changes.

### Verification

- Linked project checked: `bwhvfjuwixgwduoeqaya`.
- Pre-dry-run: exactly the new 03000 migration; no seeds/roles/Vault apply.
- Staging apply: exactly 03000. History **144/144**, mismatches **0**.
- Post-dry-run: **0 pending**.
- Live grants: new RPC authenticated-only; old and internal RPCs not executable
  by anon/authenticated. New/internal fixed search paths verified in pg_proc.
- RLS true on branch_subscriptions, platform_admin_operations and test registry;
  authenticated INSERT/UPDATE/DELETE false on all three tables.
- Staging negative checks **3/3 PASS**: actual Owner/Staff auth subjects evaluated
  under the authenticated DB role, plus anon, in an enforced READ ONLY
  transaction. These are DB authorization tests, not physical browser actions.
- Local SQL: **69/69 PASS** (40 previous write-lock checks +29 new checks).
  The historical real writer, not its test stub, was loaded from migration
  20260713002000 under its canonical internal name before the new suite.
  Verified confirmations, role blocks, invalid target, payment/lifecycle denial,
  exact-once extension, complete audit, foreign-state preservation and no DML.
- Concurrent local requests: **3/3 PASS**, three simultaneous requests produce
  one extension, one operation, identical replies.
- Focused new source tests **6/6 PASS**; PRO + Platform suites **113/113 PASS**.
- Full tests **1459/1459 PASS**. One historical assertion was updated to expect
  the new confirmed RPC instead of the intentionally revoked old entry point.
- Typecheck PASS; lint **0 errors /9 existing warnings**; build PASS with the
  verified Staging Supabase URL (existing bundle-size warning).
- Scoped secret-pattern scan: **33 changed/new source files, 0 matches**.
  This is not a claim about all historical logs or Git history.
- Diff whitespace check PASS, including added source files.
- DB linter: **0 errors /31 warnings in17 functions**. The30 previous warnings
  above remain. New P2: `restaurant_record` in the confirmed RPC is assigned
  solely by the locking SELECT and never read. Existence uses FOUND; target
  validation uses explicit joins. No runtime failure observed. The applied
  migration is not rewritten to hide the warning; any cleanup needs a separate
  forward change. No claim of a warning-free DB-linter gate.

### Physical gate and test-tenant safety

The Founder-provided signed-in identity is Staff, not Owner. The subsequently
queried Owner identity does own the same existing shared restaurant,
`Kaffee Konditorei baeckerei`. Neither identifies an isolated test tenant.
Canonical registry: **0 active TEST_ONLY tenants**, shared restaurant marker **0**.

No role changed, no shared restaurant marked TEST_ONLY, no Auth identity created,
no override/status/trial business write, no cleanup of existing data. No attempt
to bypass the test guard. No app deployment was performed because the requested
TEST_ONLY verification gate preceding deployment has not passed.

The old deployed Admin UI still calls the revoked legacy status/trial RPC;
those support buttons now fail closed until the new UI is deployed. The updated
UI is build-tested but not physically verified. New PRO override activation,
Owner display, audited termination, BASIC return and responsive checks remain
unperformed in the current physical loop.

Known scoped P0 exploit routes: blocked by DB evidence; not a global security
certification. Open P1: **1 physical deployment/Admin/Owner lifecycle gate**.
New P2: **1 nonfunctional linter warning**. No FINAL LOCK.

Next: identify or canonically provision an authorized isolated TEST_ONLY Owner
tenant, then deploy Staging and perform the bounded Admin/Owner lifecycle.
Do not use the shared restaurant. Do not request a password or session token.

Checkpoint archive: `exports/2026-09-11_PRO_PHASE_1D_ADMIN_REQUEST_CHECKPOINT.zip`.

## 2026-09-11 - New isolated Owner verified; Platform Admin sign-in required

The newly registered Founder-provided test Owner is confirmed and owns exactly
`WUXUAI TEST ONLY - PRO PHASE 1` (live display uses an en dash).
Tenant: `f03f7d57-f225-4f23-a732-3adc15525bbd`.

Read-only Staging checks:

- Owner membership: owner; confirmed Auth account: yes.
- Base plan BASIC, subscription trialing, payment not_required.
- Trial ends 2026-12-11 08:31:22.950952+00.
- Organization tenants 1; foreign owned tenants 0; foreign memberships 0.
- Customers 0; Staff 0; Owner platform roles 0.
- TEST_ONLY registry marker: absent. No marker has been inserted directly.

The canonical marking path is the existing Platform Admin Kassa panel button
`Als TEST-ONLY markieren`, calling `mark_platform_test_tenant` with mandatory
reason, test session and exact entity-bound confirmation. This RPC performs its
own isolation preflight atomically. The read-only counts above are preliminary
evidence, not a substitute for that full preflight.

Browser observations:

- Codex in-app tab21 is the correct test Owner and remains at onboarding step1.
  No onboarding values, legal acceptance or account data were changed.
- Chrome extension tab selection timed out. Native Chrome access works, but the
  normal Chrome Staging platform route redirects to restaurant/login.
- No active Platform Admin session is available in the inspected surfaces.
  Founder asked to sign in as the existing Platform Admin in normal Chrome,
  preserving the isolated Owner session in the Codex browser. No credentials
  requested, copied or displayed.
- Native address entry initially became an unintended Google search containing
  a truncated testtenant UUID. Navigation was corrected using verified paste
  before submission. No auth secret/password/token was transmitted. Founder
  was informed; no repeat search was made.

No marking, override, deployment, migration, cleanup or business mutation in
this continuation. Shared restaurant and Production remain untouched.
Previous build/test/security results above remain the latest completed results;
no source implementation changed in this read-only continuation.

Status: **NOT READY / Platform Admin sign-in required**. Resume with canonical
TEST_ONLY marking, then Staging deployment and bounded physical PRO lifecycle.
Updated evidence archive: `exports/2026-09-11_PRO_PHASE_1D_TEST_OWNER_CHECKPOINT.zip`.

### Subsequent browser handoff

Founder opened Platform Admin in Chrome. Browser inventory now shows tab
488263999 on the correct Staging `/admin/platform` route. Selecting that tab
returns `Debugger unattached`; native Chrome observations return only a window
title, with no actionable controls. Authentication inside the new tab has not
yet been independently inspected. Founder asked to connect this exact tab via
the browser extension, not to repeat login or provide credentials.
TEST_ONLY marking and all subsequent writes remain unperformed.

## 2026-09-11 - Physical Admin lifecycle passed; Owner acknowledgement pending

Supersedes the preceding connection/marking checkpoint, not historical evidence.

The reconnected Chrome Platform Admin successfully loaded the isolated tenant.
Its marking preflight initially reported only TEST_ONLY_MARKER_MISSING. The
first marking request was safely rejected: the UI reused the fixed test session
`kassa-v3-20260908`, already reserved by a previously deleted test tenant in the
retained registry. No registry row was inserted for the new tenant by that request.

Narrow source correction:

- PlatformKassaCompliancePanel now uses `test-tenant-${restaurantId}` instead
  of the historical shared session literal.
- Direct regression covers stable, distinct, valid tenant-scoped session IDs
  and retains the server uniqueness/preflight/strong-confirmation requirements.
- No migration, RPC, grant, RLS, cleanup authorization or historical evidence
  was modified. No direct registry DML was used.

Quality checks for the resulting 35-file Phase 1 worktree:

- Focused PRO/Platform/Kassa tests: 130/130 PASS.
- Full tests: 1460/1460 PASS.
- Typecheck PASS; ESLint 0 errors, 9 existing warnings.
- Build PASS; existing large-chunk warning remains.
- Scoped secret-pattern scan: 35 files, 0 matches. This is a pattern scan,
  not a claim of exhaustive secret detection.
- git diff --check PASS.
- Initial build guard rejected the inherited app-base value without building;
  the build/deploy process explicitly set the canonical Staging app origin.
  Supabase URL was guarded against the exact Staging project before build.

Staging deployment only:

- Worker: wuxuai-restaurant-bonus-app-staging.
- Previous version: e7373fe5-44fc-46f4-9b09-91f951d63698.
- New version: 46f711d1-5c0f-4e8d-8b04-e4f48bfeeef5.
- Canonical Staging domain physically serves the new override UI.
- No Production Worker/configuration, DB, Auth, migration, DNS or Stripe action.

Physical authenticated Platform Admin results:

- Canonical TEST_ONLY marking succeeded after deployment: full preflight PASS,
  one active marker and exactly one retained MARKED audit.
- PRO activated through the UI for the isolated tenant with mandatory reason,
  confirmation and finite expiry 2026-09-12 12:00 Europe/Vienna.
- UI showed effective PRO, stored BASIC, source platform override, unlimited
  offers, offer/reward notifications active.
- Exactly one PLAN_OVERRIDE_ACTIVATED / SUCCESS / SENSITIVE event; platform_admin
  actor role, request key and before/after evidence present.
- Termination used the separate confirmed UI dialog with its own reason.
- UI and read-only DB resolver confirmed effective/stored BASIC, limit 5,
  unlimited false, offer/reward notifications false, gift_cards false,
  pos_integration false, no active plan override ID/window.
- Exactly one PLAN_OVERRIDE_ENDED event, complete request/before/after evidence.
- No duplicate writes observed. Deliberate replay/concurrency remains supported
  by the earlier local SQL tests, not claimed as a browser replay test here.
- Test customers 0, points transactions 0. Tenant retained for the remaining
  Owner test; no tenant destruction or cleanup of retained audit performed.
- Shared protected restaurant still has 13 guests; no write targeted it.

The Owner session was navigated to the allowed account/test-period settings
route without completing or bypassing onboarding. The versioned personal
Kassa notice blocks the settings page until the Owner reads and acknowledges
it. Founder was asked to complete that personal acknowledgement in the Codex
Staging tab. No legal acknowledgement was accepted on the Founder's behalf.
The PRO override was ended instead of being left active while waiting.

Chrome occasionally returned deadline errors even when actions completed.
Read-only UI/DB state was checked before any retry; no credential/session was
read or exposed. Native app-wide access was not used after its privacy refusal.

Current status: **NOT READY**, one remaining physical Owner-display gate.
Known scoped P0: 0; open P1: 1. Previous DB lint/security/history evidence is
unchanged; no new migration was required in this continuation.
Next: after personal Owner acknowledgement, repeat only the bounded override
needed to observe Owner PRO/BASIC display, terminate it with an audit, and finish the
remaining physical security/responsive evidence. Do not restart passed tests
without a source change or concrete regression. Production unchanged.

Checkpoint archive: `exports/2026-09-11_PRO_PHASE_1D_ADMIN_PHYSICAL_CHECKPOINT.zip`.

## 2026-09-11 - Owner acknowledgement cleared; BASIC confirmed

Founder confirmed completing the personal Kassa acknowledgement. The existing
authenticated Owner tab now physically renders Abo & Testphase for
WUXUAI TEST ONLY - PRO PHASE 1: active trial, 91 days remaining, commercial
V1 label at EUR 59/month excluding VAT, automatic billing inactive.

This settings label is static commercial copy, not proof of effective PRO
entitlements. The effective Owner plan/source/expiry display is implemented on
RestaurantOffersPage. Navigating the Owner session to /admin/offers physically
redirected to /admin/onboarding, step 1 of 7, 14 percent complete. The existing
onboarding access guard was not bypassed, and no business/legal values were
invented or submitted.

A fresh read-only linked Staging resolver query confirmed:

- effective_plan BASIC; stored_plan_key BASIC.
- offer_limit 5; offer_limit_unlimited false.
- offer_notifications and reward_notifications false.
- gift_cards and pos_integration false.
- no active plan override ID, plan key, start or expiry.

No new override was activated while the effective Owner display is inaccessible.
No application code, migration, DB row, authentication setting or Production
resource was changed. Prior test/build/security evidence above remains historical
evidence for unchanged source, not a newly executed suite in this continuation.

Status: **NOT READY**. Known scoped P0: 0; open physical P1 gate: 1.
The remaining gate requires an accessible effective Owner plan view during the
bounded PRO/BASIC lifecycle, plus the outstanding physical security/responsive
checks. The test tenant remains safely BASIC. Next prerequisite: complete the
isolated Owner onboarding through its intended flow; do not weaken the guard.

Supplemental report archive:
`exports/2026-09-11_PRO_PHASE_1D_OWNER_BASIC_CHECKPOINT.zip`.

## 2026-09-11 - Finaler kombinierter Country-/PRO-Abschluss

**Dieser Abschnitt ersetzt ausschliesslich die vorstehenden offenen
Checkpoint-Statusangaben. Die historische Evidenz und die damaligen
Sicherheitsstopps bleiben erhalten.**

Die additive Staging-Migration
`20260911006000_legal_template_country_guard_compatibility.sql` hat den
veralteten landlosen Legal-Profil-Placeholder in
`ensure_restaurant_legal_templates()` durch eine fail-closed Validierung des
bereits vorhandenen vollstaendigen Profils ersetzt. Signatur,
`SECURITY DEFINER`, fester `search_path`, Owner, Grants, RLS, Country Guard,
Legal-Inhalte, Dokumentversionen, Zustimmungen und der Legal-/Retention-
Backfill blieben unveraendert.

Nach Migration und leerem Post-Dry-Run wurde das regulaere AT-Onboarding fuer
den isolierten Betrieb genau einmal abgeschlossen. Betriebs- und
Geschaeftsland sind `AT`; DE, CH, FR, IT und ES bleiben gesperrt. Der
physische Owner-Nachweis und der serverseitige Resolver bestaetigen BASIC,
Angebotslimit 5, Offer-/Reward-Notifications aus sowie keinen aktiven oder
zukuenftigen PRO-Override. Die fruehere Aktivierung und Beendigung sind je
einmal auditiert; Browserrollen besitzen keine direkten Subscription- oder
Override-Schreibrechte.

Abschliessende Evidenz:

- 88/88 fokussierte Tests PASS.
- 1504/1504 Gesamttests PASS.
- Typecheck, Lint, Build, Secret Scan und `git diff --check` PASS.
- Staging-Migration-History 147/147; Post-Dry-Run ohne offene Migration.
- DB-Linter ohne neue Meldung fuer die geaenderte Funktion.
- Vergleichsbetrieb und Production unveraendert.

Der vollstaendige Abschlussnachweis steht in
`docs/reports/2026-09-11_COUNTRY_PRO_COMBINED_PHYSICAL_GATE_REPORT.md`.

Aktueller Status: **PRO PHASE 1 FINAL LOCK**. Country Launch Gate:
**FINAL LOCK**. Offene P0: 0. Offene P1 im genehmigten Scope: 0. Production:
**UNCHANGED**.
