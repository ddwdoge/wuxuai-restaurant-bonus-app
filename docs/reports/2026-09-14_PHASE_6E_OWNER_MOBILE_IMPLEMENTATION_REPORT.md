# Phase 6E – Owner Mobile Compact UI

Stand: 2026-09-14. Status: **NOT READY – Staging-Nachher-Abnahme offen**.

## Ursache und Arbeitsgrundlage

Fortsetzung des autoritativen Worktrees auf `codex/v1-phase-6-compact-mobile-ui`,
Ausgangscommit `cded18222179bf0a41591412afb32bc7ee6738bc`.
Die vorhandenen Dashboard-, Standort- und Tabellen-Markup-Änderungen wurden
per Diff aufgenommen, nicht erneut implementiert oder zurückgesetzt.
Die frühere Capture-/Kapazitätsblockade ist kein Produktdefekt und blockiert
laut Founder nicht die Umsetzung. Die Vorher-Evidenz bei 390 CSS-px bleibt
ausdrücklich **CAPTURE BASELINE DEFERRED**. Keine skalierte Aufnahme als PASS.

Der ältere Inventurbericht bleibt historischer Beleg. Seine Aussagen
„kein Produktcode geändert“ und „Implementierungsfreigabe fehlt“ gelten nicht
für diesen fortgesetzten Stand. Keine weitere Founder-Freigabe erforderlich.

## Inventur und Umsetzung

16/16 Router-Einträge, 21 konkrete visuelle Ansichten, 19/19 AppDrawer-
Einbaustellen zugeordnet; 0 unklassifiziert. Vollständige Zuordnung im
`2026-09-14_PHASE_6E_OWNER_MOBILE_INVENTORY_REPORT.md`.

| Bereich | Implementierungsentscheidung | Physische Nachher-Prüfung |
| --- | --- | --- |
| Dashboard | Kompaktes mobiles KPI-/Schnellzugriffs-Raster; Gäste-KPI verwendet ausschließlich vorhandene Detailroute | Offen |
| Gäste / Team | Vorhandene responsive Karten/Zeilen erhalten; Drawer-Viewport angepasst | Offen |
| Punktebelohnungen / Geschenke / Angebote | Bestehende Karten, Status und Aktionen erhalten; kleine Beschriftungen mindestens 12 px; Angebotsmetadaten umbrechen | Offen |
| Berichte / Journal / Kassa-Tabelle | Ein Datensatz, dieselben Aktionen; mobil beschriftete Karten, Desktop/Druck weiterhin Tabelle | Offen |
| Standort | Bestehender Guard erhält Inline-Hinweis, ARIA-Zuordnung und Fokus auf Kartenaktion; sieben Sprachen | Offen |
| Settings-Übersicht / übrige Settings / Öffnungszeiten | Bestehende responsive Formulare und Links erhalten; keine unnötige Neuimplementierung | Offen |
| Setup / Onboarding | Kanonische Reihenfolge und Autosave unverändert; Hilfe-Drawer erhält Viewport-Anpassung | Offen; kein Autosave-Test mit echten Daten |
| QR-Center | Bestehende QR-/Druck-/Exportverträge erhalten | Offen; keine Codes in Evidenz |
| Owner Referral / Bonus Boost | Bestehende responsive Formulare unverändert, keine Regeländerung | Offen |
| Plan / Funktionen | Bestehende serverbasierte Effektivplan-/Limitanzeige in Angeboten erhalten; keine neue Upgrade- oder Stripe-Funktion | Offen |
| Legal / Programmende / Kassa-Gate | Vorhandene responsive Formulare, Pflichttexte und Bestätigungen erhalten | Offen; keine Akzeptanz, Veröffentlichung oder Abschaltung |

17 Inhalts-Drawer verwenden `owner-mobile-drawer` und die bereits vorhandene
Option `fitVisualViewport`. Mobile CSS hält Header/Footer im Layout und nur
den Body scrollbar; Höhe inhaltsabhängig, Safe-Area-Padding und 48-px-Aktionen.
Kein neuer Drawer, keine Änderungen an Fokusfalle, Escape, Overlay-, Save- oder
Dismiss-Handlern. D01 Restaurant-Menü und D17 Logo-Editor bleiben unverändert.
Single-Image-Editor, Bildspeicherung und Crop-/Zoom-Vertrag unverändert.

## Standort-Vertrag

Die bestehende Adressänderung invalidiert weiterhin Koordinaten und
Bestätigungs-Key. Derselbe bestehende Save-Guard verhindert ungeprüfte
Speicherung. Neu ist ausschließlich die lokalisierte Inline-Meldung mit
`role=alert`, Fokus und `aria-describedby`. Nach bestätigter Kartensuche bleibt
der ursprüngliche Save-Payload identisch; erneute Änderung verlangt erneut
Bestätigung. Elf fokussierte Tests prüfen dies ohne Backend-Schreibzugriff.

## Geänderte Dateien

- `src/modules/admin/admin-premium.css`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/admin/pages/CustomersPage.tsx`
- `src/modules/admin/pages/StaffPage.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/admin/pages/RestaurantOffersPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/admin/pages/restaurant-offers.css`
- `src/modules/reports/BonusActivityReportsPage.tsx`
- `src/modules/reports/bonus-activity-reports.css`
- `src/shared/i18n/catalog.mjs`
- Vier neue Tests: owner-mobile-dashboard, owner-location-inline-guidance,
  owner-mobile-report-rows, owner-mobile-drawers.
- Dieser Bericht; separater secret-freier Prüfexport.

## Nicht geändert / Schutzprüfung

Keine Business-, Punkte-, Geschenk-, Einlöse-, Auth-, RLS-, Country-, API-,
QR-, Tages-PIN-, Geocoding- oder Datenbankänderung. Keine Migration. Keine
neue Bibliothek. Keine reale Datenänderung, Punktebuchung oder Einlösung.
Keine Production-Aktion und kein Phase-7-Start.

Bytevergleich: gemeinsamer AppDrawer, AdminLayout, OwnerRewardImageEditor
und Geocoding-Service unverändert. Bei Customers, Staff, Rewards, Gifts,
Offers und Onboarding sind nach Entfernen der zwei neuen Darstellungsprops
die vollständigen TSX-Dateien bytegleich mit der Ausgangsbasis. Damit bleiben
Handler, Bedingungen, Datenzugriff und gespeicherte Werte dort unverändert.
Andere vorhandene Projektverträge, historische Reports, Assets und die
Supabase-CLI-Metadatei werden nicht in den engen Commit aufgenommen.

## Automatische Gates

- Focused: **152/152 PASS**; nach letzter CSS-Ergänzung neue Fokusdateien
  nochmals **36/36 PASS**, vollständige Suite ebenfalls erneut grün.
- Security Contracts: **55/55 PASS**; lokale Vertragsprüfung, keine neue Live-RLS-Abnahme.
- Full Tests: **1780/1780 PASS**, 0 Skips, 0 Fehler.
- Typecheck: **PASS**.
- Lint: **PASS**, 0 Fehler, 8 vorbestehende Warnungen.
- Build: **PASS**, 2124 Module; bestehende Chunkgrößenwarnung.
- Secret Scan: **PASS**, 17 Produkt-/Testdateien, keine Treffer.
- Git Diff Check: **PASS**.
- Technische Tests ersetzen keine reale Keyboard-, Safari-/Safe-Area- oder responsive Abnahme.

Build verwendete ausschließlich die vorhandene öffentliche Staging-/Anon-
Konfiguration, ohne Werte auszugeben oder neue Env-Dateien zu erzeugen.
Wrangler benötigte den vorhandenen Node-24-Runtime statt Shell-Node-20;
die bestehende OAuth-Anmeldung wurde regulär erneuert, nicht erweitert.
Read-only Deploymentprüfung bestätigte vor Veröffentlichung weiterhin
`6d81cdac-ad3f-43a4-bea2-821f9a25958d` zu 100 Prozent auf dem Staging-Worker.

## Staging / Risiken / Abschluss

Commit und Staging-Veröffentlichung folgen erst nach dem engen Dateiscan.
Die Nachher-Matrix für Mobile 320/360/375/390/430/768, Desktop und sieben
Sprachen ist offen. Keine erfundenen Screenshot-, Zoom- oder DPR-Nachweise.
Bestehende Locks werden nicht durch diesen Bericht als neu physisch geprüft
ausgegeben. Kein FINAL LOCK vor echter Staging-Abnahme.

Status: **NOT READY**.
