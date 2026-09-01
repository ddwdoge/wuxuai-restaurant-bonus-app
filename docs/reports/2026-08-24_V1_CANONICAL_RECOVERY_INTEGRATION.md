# WUXUAI Bonus V1 - Canonical Recovery Integration

Datum: 2026-08-24

## Ursache

Der alte lokale Workspace enthielt einen großen, nicht autoritativen WIP-Stand
mit überholten und neueren Änderungen nebeneinander. Eine direkte Übernahme
hätte insbesondere Customer Auth, Legal-RPC, Live-Einlösung, Staff-Navigation,
Geocodierung und Mobile-Fixes zurückbauen können. Die Integration wurde deshalb
auf Commit `919141181223aa414ef004a09aa3f02637f2b7fd` isoliert aufgebaut.

## WIP-Klassifizierung

| Block | Einstufung | Behandlung |
| --- | --- | --- |
| Sichtbare Branding-Literale | SAFE TO PORT | gezielt auf WUXUAI Bonus / Meine Vorteile übertragen |
| Referral-Dauer und Copy | NEEDS MANUAL MERGE | auf aktuelle Owner-, Customer- und Referral-Komponenten übertragen |
| Alter CustomerPortal-Gesamtstand | CONFLICTS WITH AUTHORITATIVE FIX | nicht kopiert; nur kleine Branding-/Referral-Diffs integriert |
| Alter StaffTablet-Gesamtstand | OBSOLETE | nicht kopiert; QR-Primary und aktuelle 5er-Navigation geschützt |
| Alte Referral-SQL-Datei | NEEDS MANUAL MERGE | als neue Forward-Migration gegen aktuelle Tabellen und Helper neu erstellt |
| Package-, Export- und historische Report-Masse | OBSOLETE | nicht übernommen |

Der ursprüngliche WIP-Workspace wurde weder bereinigt noch zurückgesetzt oder
überschrieben.

## Geänderte Bereiche

- Produktmetadaten und sichtbare aktive UI-Texte auf **WUXUAI Bonus** und
  **Meine Vorteile** vereinheitlicht.
- Owner-Dauer auf 7/14/28/Custom mit Default 14 konsolidiert.
- Referrer erhält 100 Prozent, eingeladener Freund exakt 50 Prozent der bei
  Qualifikation gespeicherten Dauer; 2x bleibt die Obergrenze.
- Rollenbezogene, atomare und idempotente Referral-Grants ergänzt.
- Optionaler Customer-Kontext zeigt die Begünstigtenrolle, blockiert bei einem
  temporären Zusatz-RPC-Fehler aber nicht den bestehenden Portal-Load.
- Canonical Contract, Legacy Index, Fachdateien und Changelog synchronisiert.

## Nicht geändert

- Auth-, E-Mail-Bestätigungs- und Legal-Registrierungsarchitektur.
- Routes und technische Datenbanknamen.
- 15-Minuten-Punkte-/Geschenkpräsentation und Reporting.
- QR-, Tages-PIN-, Geocoding-, Map-/Drawer-, Staff-KPI- und Mobile-Logik.
- Historische Migrationen und bestehende historische Booster.
- Production, Stripe und Cloudflare.

## Migration und Sicherheit

Neue additive Migration:
`20260824001000_v1_referral_owner_duration_split.sql`.

- Neue Grant-Tabelle mit RLS; direkte Browser-Schreibrechte entzogen.
- Interne `SECURITY DEFINER`-Funktionen besitzen festen `search_path`.
- Tenant, Referralstatus, Membership, Kunde und Rolle werden serverseitig
  geprüft.
- Advisory Lock, Row Lock und Unique Constraint sichern Parallelität und
  Idempotenz pro Referral, Kunde und Rolle.
- Historische Booster werden nicht rückwirkend geändert.
- Public Context RPC liefert nur Rolle und Grant-Dauer nach Prüfung des
  geheimen restaurantgebundenen Kundentokens.

## Staging

- Verknüpftes Projekt: `wuxuai-bonus-staging` (`bwhv...qaya`).
- Migration History: alle Versionen bis `20260823002000` lokal/remote synchron.
- Erwartet lokal offen: ausschließlich `20260824001000`.
- `db push --linked --dry-run --include-all`: PASS, genau eine Migration.
- Staging DB Linter vor Anwendung: 0 Fehler.
- Migration angewendet: Nein, gemäß Sprint-Scope.

## Qualitätsnachweise

- Tests: 797/797 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 8 bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.
- Secret-/Artefakt-Scan des Diffs: PASS.
- Aktive alte sichtbare Produktnamen in `src`, `public`, `index.html`: 0.
- Aktive Legacy-Registration-RPC-Aufrufe: 0.

## Clean DB und Upgrade

Der vollständige lokale Clean-DB-Test konnte nicht ausgeführt werden, weil in
der Umgebung kein Docker-/Supabase-Runtime-Daemon vorhanden ist. Der Versuch
eines read-only Schema-Dumps über die Supabase CLI wurde aus demselben Grund
vor dem Export abgebrochen. Ein direkter Apply oder ein transaktionaler DDL-Test
gegen Staging wurde bewusst nicht als Ersatz missbraucht.

Damit sind Clean DB und ausgeführter Upgrade-Test **nicht verifiziert**. Der
Staging-Dry-Run beweist Reihenfolge und Umfang, aber nicht die tatsächliche
Ausführung der neuen SQL-Datei.

## Risiken

1. Die neue Migration muss im Staging Final Gate tatsächlich angewendet und mit
   Referral-Qualifikation, halber 7-Tage-Dauer (84 Stunden), Retry und
   Parallelaufrufen getestet werden.
2. Clean-DB- und bestehender-Datenbank-Upgrade-Test müssen in einer Umgebung mit
   funktionierender Supabase-Docker-Runtime nachgeholt werden.
3. Production bleibt bis zu diesen Nachweisen gesperrt.

## Ergebnis

Der Code ist integriert und lokal regressionsfrei. Wegen der nicht ausgeführten
Clean-/Upgrade-DB-Tests und der noch nicht auf Staging angewendeten Migration ist
der Stand kein Final Lock.

Status: **NOT READY**
