# V1 Redemption Simplification + Automatic Redemption Reports

## Ursache

Der aktuelle Produktstand besaß bereits sichere, serverzeitgesteuerte
15-Minuten-Präsentationen für Punkte-, Willkommens- und Geburtstagsbelohnungen.
Die normale Staff-Oberfläche bot parallel weiterhin die historische
sechsstellige Codeprüfung an. Der bestehende Bonus-Aktivitätsbericht arbeitete
zwar tenantgesichert auf einem unveränderlichen Journal, besaß jedoch keine
expliziten Start-/Finalzeit- oder Referenzwert-Snapshots und nur Monats- und
Jahresfilter.

## Umsetzung

- Die Staff-Hauptnavigation wurde auf Start, Tages-PIN und Mehr reduziert.
- Codeeingabe, Preview und Consume wurden aus `StaffTablet` entfernt.
- Historische Code-Tabellen, Fehlerklassifikation und RPCs wurden nicht
  gelöscht und bleiben ausschließlich als Legacy-Kompatibilität erhalten.
- Die Customer-UX startet für neue Einlösungen ausschließlich Punkte- oder
  Geschenk-Präsentationen. Historische aktive Codes bleiben lesbar.
- Das Aktivitätsjournal erhält `redemption_started_at`, `finalized_at`,
  `reference_value_cents` und `reference_currency` additiv.
- Neue Referenzwerte werden beim Journaleintrag aus dem zu diesem Zeitpunkt
  konfigurierten Produktwert gesichert. Fehlende Altdaten bleiben leer.
- Punkte-Präsentationen werden erst nach serverseitiger Finalisierung in neuen
  Berichten berücksichtigt. Geschenk-Präsentationen werden weiterhin bei der
  automatischen Finalisierung journalisiert.
- `get_v1_redemption_report` aggregiert tenantgebunden, in Restaurant-Zeitzone,
  mit halboffenen Periodengrenzen und ohne Testevents.
- Detailzeilen sind serverseitig auf 500 begrenzt; die UI fordert 250 an.
- Der Owner-Bericht bietet die acht freigegebenen Zeiträume, Quellenfilter,
  Stornofilter, KPI-Aufteilung, Tagesverlauf, Top-5 und Jahresmonate.
- CSV und Druck/PDF enthalten keine Namen, E-Mails, Telefonnummern,
  Geburtsdaten oder Kundentokens.

## Sicherheit

- Der neue Report-RPC ist `SECURITY DEFINER` mit festem `search_path`.
- Zugriff besteht nur für `authenticated`; die bestehende
  `is_bonus_report_admin`-Prüfung erlaubt Owner und Admin des angefragten
  Restaurants.
- Filialfilter werden gegen dasselbe Restaurant validiert.
- RLS bleibt aktiv; direkte Tabellenrechte wurden nicht erweitert.
- Testevents sind auch bei gesetzten Filtern immer ausgeschlossen.
- Journal-Snapshots bleiben unveränderlich. Nur die einmalige serverseitige
  Finalzeit und der bestehende kontrollierte Storno dürfen geändert werden.

## Migration

`20260823001500_v1_redemption_reporting_simplification.sql`

Die Migration ist additiv. Sie wurde in diesem Auftrag nicht auf Staging oder
Production angewendet. Ein lokaler DB-Linter war nicht verfügbar, weil im
Arbeitsstand keine ausführbare Supabase-CLI installiert war.

## Verifikation

- Gezielte Redemption- und Reporting-Tests: PASS
- Vollständige Tests: 748/748 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 8 bereits bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Staging-Flow: nicht ausgeführt
- Production: gesperrt
- Stripe: zurückgestellt

## Offene Risiken

- Die neue Migration benötigt vor einem Final Lock Dry-Run, DB-Lint,
  Staging-Anwendung sowie echte Tenant-, Zeitgrenzen- und Auto-Finalisierungs-
  Smoke-Tests.
- XLSX wurde mangels vorhandener Exportabhängigkeit nicht eingeführt.
- PDF wird über die vorhandene Druckansicht angeboten, nicht über einen neuen
  serverseitigen PDF-Generator.

## Status

CODE LOCK nach erfolgreichem Abschlusslauf; kein FINAL LOCK ohne Staging.
