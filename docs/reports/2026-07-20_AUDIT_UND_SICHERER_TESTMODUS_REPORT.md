# Audit-Protokoll und sicherer Testmodus - Arbeitsbericht

Datum: 2026-07-20
Status: NOT READY

## Ursache

Das Repository besaß bereits ein zentrales `audit_log`, aber ohne normalisierte Ereignistypen, sicheren Testkundenbezug, Plattformfilter und vollständige Datenschutzbereinigung. Fehlgeschlagene Tages-PIN-Versuche wurden in älteren RPCs vor einer Exception geschrieben und dadurch zusammen mit der Transaktion zurückgerollt.

## Geänderte Dateien

- `supabase/migrations/20260720001000_audit_and_safe_test_mode.sql`
- `supabase/migrations/20260720002000_persist_pin_and_points_failures.sql`
- `src/app/App.tsx`
- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/PlatformAuditPage.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/rewards/rewardService.ts`
- `src/modules/loyalty/loyaltyService.ts`
- `src/shared/types/domain.ts`
- `src/styles.css`
- `tests/audit-test-mode.test.mjs`
- `docs/AUDIT-AND-TEST-MODE.md`
- `docs/19_CHANGELOG.md`

Bereits vorhandene, nicht zu dieser Aufgabe gehörende Änderungen wurden nicht zurückgesetzt.

## Was wurde geändert

- bestehendes `audit_log` additiv erweitert, kein doppeltes Audit-System
- serverseitige Normalisierung und rekursive Entfernung sensibler Metadaten
- Kerntabellen erzeugen Ereignisse für Registrierung, Restaurantbeitritt, Punkte, Geschenke, Einlösecodes, Gutscheine und Referral
- falsche PIN und Punktefehler bleiben trotz sicherer Fehlerantwort persistent
- Testkunden und Test-Sitzungs-ID nur über rollenprüfende Plattform-RPC steuerbar
- Plattform-Auditseite mit allen geforderten Filtern und `AppDrawer`
- produktive Restaurant-Dashboard-KPIs schließen Testkunden aus
- direkte Audit-RLS für Kunden entfernt; Plattformzugriff erfolgt über sichere RPC

## Was wurde nicht geändert

- keine Demo-Daten oder separaten Testflows
- keine Service-Role im Frontend
- keine Punkte-, Geschenk-, Referral- oder Einlöse-Businessregel
- keine Tabellen gelöscht
- keine bestehenden historischen Migrationen verändert

## Migration und Staging

- `20260720001000_audit_and_safe_test_mode.sql`: auf Staging angewendet
- `20260720002000_persist_pin_and_points_failures.sql`: auf Staging angewendet
- PostgREST Schema Reload: in beiden Migrationen enthalten
- Remote-Migrationsliste bestätigt `20260720001000`; zweite Migration wurde anschließend ohne SQL-Fehler angewendet

## RLS und Sicherheit

- Plattform-Audit-RPC als `anon`: HTTP 401, `permission denied`
- direkter `anon`-Read auf `audit_log`: HTTP 200 mit leerem Ergebnis durch RLS, keine Daten offengelegt
- Audit-Hilfsfunktionen für `public`, `anon` und `authenticated` entzogen
- Plattform-RPC prüft Plattformrolle
- Metadatenbereinigung entfernt Token, PIN, Passwort, Autorisierung, Sitzung, Secret und Codes
- Tenant-Filter im Plattform-RPC vorhanden; Restaurantzugriff bleibt auf eigene Daten begrenzt

## UI-Prüfung

- Route ohne Plattform-Sitzung leitet auf Restaurant-Login weiter
- Drawer verwendet bestehenden Fokus-Trap, Escape-, X- und Overlay-Schließweg
- Desktop: Tabellenansicht mit horizontal begrenztem eigenem Scrollbereich
- Tablet: zweispaltige Filter
- Mobile 390 px: einspaltige Filter und Fullscreen-Drawer über vorhandene Komponente

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, vorhandene Warnungen im Repository
- Tests: 35/35 erfolgreich
- Build: erfolgreich
- Migration Dry Run: erfolgreich
- Staging Deploy: erfolgreich

## Offene Risiken

1. Der geforderte vollständige Staging-Testkundenlauf wurde nicht ausgeführt, weil in dieser Sitzung kein angemeldeter Plattform-Testnutzer und kein freigegebener Testgast vorlag.
2. Die Plattform-Auditseite wurde hinter dem Route Guard geprüft, aber nicht mit einer echten Plattformrolle und realen Audit-Zeilen visuell abgenommen.
3. `RLS_DENIED` kann bei einer von PostgreSQL selbst abgebrochenen Transaktion nicht zuverlässig in derselben Transaktion persistiert werden.
4. Eine Aufbewahrungs- und Löschfrist für Audit-Daten ist noch nicht definiert.

## Statusentscheidung

Code, Migration, Build und grundlegende Live-Sicherheitsgrenzen sind geprüft. Wegen des fehlenden vollständigen markierten Testkunden-E2E-Flows ist nach Selbstkontroll-Loop kein READY zulässig.

Status: NOT READY
