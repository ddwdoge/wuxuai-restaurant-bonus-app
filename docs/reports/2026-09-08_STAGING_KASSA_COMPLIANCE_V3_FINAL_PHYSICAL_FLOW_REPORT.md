# WUXUAI Bonus - Kassa Compliance V3 finaler physischer Staging-Flow

Datum: 2026-09-08
Umgebung: Staging `bwhvfjuwixgwduoeqaya`
Branch: `codex/master-completion-loop`
Ausgangs-HEAD: `8960343c9b929431601e99cdf6d30f266bc76512`
Production: unveraendert und gesperrt

## Ursache

Nach dem bereits abgeschlossenen Fix der im Staff-Scanner gekuerzten
Kundenbezeichnung war der reale Kassa-Compliance-V3-Ablauf noch physisch mit
dem isolierten Staging-Tenant abzuschliessen. Der Test musste die kanonische
Kundenidentitaet, eine echte Punktebuchung, eine echte Geschenk-Einloesung und
die geordnete Kassa-Nachbearbeitung bis `OWNER_REVIEWED` nachweisen.

## Testidentitaet und Bindung

- Isolierter Tenant: `WUXUAI KASSA CLEANUP TEST 2026-09-08`
- Restaurant-ID: `406bd92e-c5ac-4684-9cb5-0cfcda990e26`
- Scanner-Kunde: `WUXUAI Testkunde`
- Customer-ID: `dea9fab2-6fde-42ce-a0bd-d96e8c17845f`
- Customer-Account-ID: `a062bc02-4ea9-4f70-9fd5-13b4a08287e2`
- Membership-ID: `faa94f05-bc6e-48e4-bc9f-b2ddb05e0702`
- Auth-User-ID: `ab7b1795-829e-4fbe-8ab2-8ed087e15624`
- Die Bindung erfolgte ueber die serverseitig aufgeloeste Tenant-Membership,
  nicht ueber Namensvergleich oder Auth-Metadaten.

## Physischer Ablauf

1. Der persoenliche, zeitlich begrenzte Customer-QR wurde im Staff-Portal
   erkannt.
2. Die serverseitige Vorschau zeigte vor der finalen Bestaetigung exakt
   `WUXUAI Testkunde` und blieb nicht buchend.
3. Fuer einen Testbetrag von `1,00 EUR` zeigte die Vorschau 32 Punkte vorher
   und `+1` Punkt.
4. Die aktuelle Staging-Tages-PIN wurde einmal bestaetigt. Die UI meldete
   `Punkte erfolgreich gutgeschrieben` und genau einen gutgeschriebenen Punkt.
5. Das Customer-Portal zeigte danach 33 Punkte. Arithmetik: `32 + 1 = 33`.
6. Das Willkommensgeschenk `Gratis Kaffee` wurde ueber das kanonische
   15-Minuten-Praesentationsfenster und die Wischbestaetigung eingeloest.
7. Die Einloesung wurde am 08.09.2026 um 17:40:41 serverseitig bestaetigt;
   die sichtbare Referenz endete auf `01F033`.
8. Der Owner-Bericht zeigte zunaechst `Kassenerfassung offen` (`OPEN`).
9. `In Kassa erfasst` erzeugte `Kassenerfassung bestaetigt` (`RECORDED`).
10. `Als geprueft markieren` erzeugte `Vom Owner geprueft`
    (`OWNER_REVIEWED`). Danach wurde keine weitere Uebergangsaktion angeboten.

Die konkrete UUID der Punktebuchung wird von der getesteten UI nicht
offengelegt und wurde deshalb nicht erfunden oder aus einem Secret-/Service-
Role-Zugang ausgelesen. Die eindeutige Bindung und die Anzahl werden durch den
serverseitigen Flow, den Kontostand und die Tenant-Diagnose belegt.

## Platform-Admin-Evidenz

Der autorisierte Platform Admin zeigte fuer denselben Tenant:

- Aktuelle Bestaetigungen: 1
- Kassenerfassung offen: 0
- Bestaetigt: 0
- Vom Owner geprueft: 1
- Letzter Uebergang: 08.09.2026, 17:43:11
- Auditfolge: `KASSA_RECORDING_CONFIRMED` um 17:42 vor
  `KASSA_OWNER_REVIEWED` um 17:43

Der Platform-Admin-Bereich bot fuer diesen Vertrag nur
`Kassa-Diagnose aktualisieren`, keine generische Kassa-Statusmutation. Die
separate, stark bestaetigte Test-Tenant-Bereinigung blieb deaktiviert und wurde
nicht ausgefuehrt.

## Rollen und Sicherheit

- Owner ohne Platform-Admin-Recht: physisch am Platform-Admin-Gate blockiert.
- Customer: physisch am Platform-Admin-Gate blockiert.
- Customer-Mutation, Staff-Owner-Review, Cross-Tenant, unauthentifizierter
  Zugriff, Platform-Admin-Mutation und direkte Browser-DML: durch die fokussierten
  Kassa-, Cleanup-, Punkte-, Multi-Role- und Platform-Admin-Vertragstests
  blockiert.
- RLS, Tenant-Bindung, QR-Einmaligkeit und Tages-PIN-Vertrag blieben erhalten.

## Responsive-Pruefung

Physisch im verbundenen Chrome-Staging-Tab geprueft:

- 320 px: PASS
- 375 px: PASS
- 390 px: PASS
- 414 px: PASS
- 430 px: PASS
- 768 px: PASS
- 1024 px: PASS
- 1280 px: PASS

Ergebnis: kein sichtbarer horizontaler Seitenueberlauf, keine abgeschnittenen
Dialoge, lesbare Labels und bedienbare Aktionen. Die betroffenen Aktionen
verwenden den getesteten Mindest-Touch-Target-Vertrag von 44 px.

In DevTools sichtbare Fehlermeldungen stammten aus installierten
Chrome-Erweiterungen (`chrome-extension://...`) beziehungsweise deren
Messaging-Verbindung. Es trat kein fataler Fehler des WUXUAI-Anwendungsbundles
auf; die Anwendung blieb gerendert und der komplette physische Flow war
bedienbar.

## Qualitaetsgates

- Fokussierte Tests: 122/122 PASS
- Vollstaendige Tests: 1361/1361 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 9 bereits bestehende Warnungen
- Build: PASS mit Staging-Supabase und kanonischer Staging-App-URL
- Secret Scan: PASS; erwartete `service_role`-Vertragsbezeichnungen geprueft,
  keine Schluessel oder Tokens gefunden
- `git diff --check`: PASS
- DB Linter: PASS, Exit 0; nur bekannte bestehende Hinweise
- Staging-Migrationsliste: lokal/remote bis `20260908007000` identisch,
  Pending 0
- Erneuter `db push --dry-run`: lokal nicht ausfuehrbar, da das aktuelle
  DB-Passwort nicht im sicheren Prozesskontext vorhanden war. Die unabhaengige
  Migrationslisten-Paritaet belegt Pending 0.

## Git-Paritaet fuer spaetere Konsolidierung

Staging-only beziehungsweise lokal noch nicht in `main` konsolidiert:

- `20260908001000_owner_trial_basic_plan_compatibility.sql`
- `20260908002000_owner_branch_basic_plan_compatibility.sql`
- `20260908003000_owner_trial_legal_package_compatibility.sql`
- `20260908004000_kassa_test_tenant_legal_cleanup_fix.sql`
- `20260908005000_kassa_foreign_test_customer_cleanup.sql`
- `20260908006000_kassa_foreign_cleanup_preflight_lock_fix.sql`
- `20260908007000_staff_scanner_customer_label_consistency.sql`
- zugehoerige Platform-Admin-, Auth-, Cleanup- und Scanner-Laufzeitdateien,
  direkte Tests und Berichte gemaess aktuellem Worktree-Inventar

Es wurde nichts gepusht. Die vorhandenen, nicht zu diesem einzelnen Flow-
Report gehoerenden lokalen Aenderungen wurden nicht veraendert oder verworfen.

## Was wurde geaendert

- Nur dieser Evidenzbericht und das zugehoerige Pruef-ZIP wurden erstellt.

## Was wurde nicht geaendert

- Kein Anwendungscode
- Keine Migration
- Keine Staging-Datenbereinigung
- Keine Production-Daten, -Konfiguration oder -Bereitstellung
- Keine RLS-, Auth-, DNS-, Cloudflare- oder E-Mail-Aenderung
- Kein Git-Push

## Risiken

- Der isolierte Staging-Test-Tenant und seine Testdaten bestehen absichtlich
  weiter, bis der Founder die getrennte kontrollierte Bereinigung freigibt.
- Die Punkte-Transaktions-UUID ist kein sichtbarer Teil des geprueften
  Operator-Flows; fuer eine spaetere Datenbank-Evidenz muss ein autorisierter,
  rein lesender Server-/DB-Kanal verwendet werden.

## Status

`KASSA COMPLIANCE V3 PHYSICAL FLOW PASS`

Der physische Kassa-Ablauf ist bestanden. Die Test-Tenant-Bereinigung und die
Git-Konsolidierung bleiben getrennte, Founder-freizugebende Folgeaktionen.
