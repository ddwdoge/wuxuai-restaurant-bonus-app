# WUXUAI® Bonus Kassa-Compliance V3 – Staging-Bericht

## Ursache

Das Bonusprogramm benötigt eine klare Trennung vom externen Kassensystem und
einen auditierten Restaurant-Arbeitsschritt nach einer bereits finalen
Einlösung. WUXUAI® Bonus bleibt ausdrücklich keine Registrierkasse, kein POS,
kein RKSV-, Steuer-, Beleg- oder Umsatzsystem.

## Geänderte Dateien

- `supabase/migrations/20260906002000_kassa_compliance_v3.sql`
- `src/modules/kassa/KassaAcknowledgementGate.tsx`
- `src/modules/kassa/kassaComplianceService.ts`
- `src/modules/admin/AdminLayout.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/reports/BonusActivityReportsPage.tsx`
- `src/modules/staff/StaffTablet.tsx`
- `src/modules/platform/PlatformKassaCompliancePanel.tsx`
- `src/modules/platform/PlatformRestaurantControlCenter.tsx`
- `src/modules/platform/platformAdminService.ts`
- `tests/kassa-compliance-v3.test.mjs`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Versionierte, unveränderliche Bestätigung `kassa-separation-de-v1` mit
  Serverzeit, Akteur, UI-Sprache, Jurisdiktion und Audit eingeführt.
- Getrennten Status `OPEN -> RECORDED -> OWNER_REVIEWED` an das unveränderliche
  Redemption-Journal angebunden.
- Tenantgebundene, idempotente RPCs mit Staff-/Owner-Rollentrennung ergänzt.
- Owner-Tagesabgleich, Staff-Erinnerung, kanonischen Begriff
  `Bonusberechnungsbetrag` und Platform-Admin-Diagnose ergänzt.

## Was wurde nicht geändert

- Keine Redemption-, Punkte-, Welcome-Gift-, Birthday-, QR- oder Tages-PIN-Logik.
- Keine POS-, Kassa-, RKSV-, Steuer-, Beleg-, Delivery- oder Umsatzintegration.
- Keine Production-Konfiguration, -Datenbank, -Domain oder -Bereitstellung.

## Ergebnisse

- Staging-Link: `bwhvfjuwixgwduoeqaya` verifiziert.
- Pre-Dry-Run: exakt eine Migration (`20260906002000`).
- Migration auf Staging angewendet: Ja.
- Post-Dry-Run: 0 pending / PASS.
- Migration History: lokal/remote synchron bis `20260906002000`.
- 39 neue Kassa-UI-Vorkommen mit 31 eindeutigen Texten katalogisiert.
- Alle 39 Vorkommen verwenden den bestehenden sieben-sprachigen Katalog;
  Hardcoded-Audit: 1821/1821 verwaltet, 0 unverwaltet.
- Der Kassa-Rechtstext bleibt in allen Sprachansichten ausdrücklich als
  kanonischer deutscher Dokumentkörper mit `lang="de"` erhalten. Er wurde
  weder extern übertragen noch stillschweigend übersetzt.
- Fokustests Kassa/i18n/Journal: 55/55 PASS.
- Platform-Admin-Tests: 53/53 PASS.
- Volltests: 1338/1338 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 9 bestehende Warnungen.
- Build: PASS mit Staging-URL und nicht geheimem lokalen Build-Platzhalter.
- Secret Scan: PASS; keine geprüften Secret-Muster gefunden.
- `git diff --check`: PASS.
- Authentifizierter Staging-DB-Linter: PASS, 0 Fehler.
- Authentifizierter Post-Dry-Run: PASS, 0 pending.
- Staging-Frontend: ausgelieferter JavaScript-Hash stimmt bytegenau mit dem
  lokal geprüften Kassa-i18n-Build überein.
- Physischer Multi-Role-Test: dieselbe Auth-Identität wurde korrekt als Owner
  und Customer aufgelöst.
- Physische Gift-Redemption: 15-Minuten-Fenster und serverseitige
  Wischbestätigung PASS; Customer sah keine internen Kassa-Aktionen.
- Owner-Tagesabgleich: `OPEN`, anschließend genau einmal `RECORDED`, danach
  genau einmal `OWNER_REVIEWED` sichtbar; danach keine weitere Aktion.
- Owner-only Zugriff auf `/admin/platform`: physisch BLOCKED wie vorgesehen.
- Customer-Ansicht bei ca. 390 px: PASS, kein sichtbarer horizontaler
  Überlauf; vollständige Responsive-Matrix bleibt offen.

## Offene Risiken

- Die autorisierte Platform-Admin-Diagnose ist noch nicht physisch geprüft,
  weil die aktive Sitzung absichtlich nur Restaurant-Owner-Rechte besitzt.
- Staff-Owner-Review, Cross-Tenant und unauthenticated sind durch Migration und
  Tests blockiert, aber noch nicht mit getrennten physischen Sitzungen belegt.
- Responsive QA für 320/375/414/430/768/1024/1280+ ist noch offen.
- Der erzeugte Redemption-, Kassa-Workflow- und Auditbeleg ist absichtlich
  unveränderlich. Ein physisches Löschen würde dem Audit-/Immutable-Vertrag
  widersprechen; es gibt aktuell keinen kanonischen Cleanup-RPC für diesen
  Beleg. Deshalb wurde keine unsichere Direktlöschung vorgenommen.

## Status

`NOT READY` – Hauptworkflow, i18n, DB-Linter und Staging-Build sind geprüft.
Platform-Admin-Sitzung, vollständige Rollen-/Responsive-Matrix und eine mit
dem Immutable-Vertrag vereinbare Cleanup-Entscheidung fehlen noch für FINAL
LOCK.
