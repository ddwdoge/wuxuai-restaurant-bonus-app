# V1 Bonus-Aktivitätsberichte - Implementierung

Datum: 28.07.2026
Branch: `codex/v13-legal-maps-hardening`

## Umsetzung

- neuer Owner-Navigationspunkt `Berichte`
- Monatsübersicht mit serverseitigen Vienna-Grenzen
- Jahresübersicht mit denselben Journalwerten
- chronologisches Einlösungsprotokoll
- Filter für Zeitraum, Filiale, Rewardtyp, Status und Testdaten
- sechs Kennzahlen plus Datenqualitätsanzeige
- CSV-Detailprotokoll mit Legal-Hinweis
- druckbare Browseransicht, die als PDF gespeichert werden kann
- kein XLSX, weil keine bestehende Exportbibliothek vorhanden ist
- begründetes Protokollstorno über geschützten RPC
- verpflichtende Kassenabgrenzung in Berichtsseite und Export

## Unveränderte Flows

- Kundenportal nicht geändert
- Staff-UI nicht geändert
- Plattformportal nicht geändert
- Tages-PIN nicht geändert
- Punktesammeln nicht geändert
- Start und Einmalverwendung des Redemption-Codes nicht geändert
- Referral-Boost nicht geändert

Der finale Consume-RPC behält Signatur und Sicherheitsprüfung. Ergänzt wurde
genau ein idempotenter Journal-Write in derselben Datenbanktransaktion.

## Exporte

CSV enthält Aktivitätsnummer, lokale Zeit, Filiale, Rewardtyp,
Rewardname-Snapshot, Punkte, Menge, Status, Storno, Rolle und Snapshotstatus.
Testkundendaten sind standardmäßig ausgeschlossen.

Die Druckansicht verwendet Browserdruck statt einer neuen schweren
PDF-Bibliothek. Eine XLSX-Funktion wurde bewusst nicht eingeführt.

## Qualitätsstand

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 231/231 erfolgreich
- Build: erfolgreich
- Migration-Dry-Run: erfolgreich
- echte Owner-/Staff-/Staging-Flows: noch offen
- physische Mobile-Tests: noch offen

Status: `READY_FOR_SECURITY_REVIEW`, nicht für Production freigegeben.
