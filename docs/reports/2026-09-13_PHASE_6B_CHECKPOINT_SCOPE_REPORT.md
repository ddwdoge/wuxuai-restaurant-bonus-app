# Phase 6B – Checkpoint-Umfang / Staging-QA offen

Datum: 2026-09-13. Basis: `41a819e4f54e7da9a95c23c3ea10dc21e9ad17cb`.
Branch: `codex/v1-phase-6-compact-mobile-ui`.
Status: **NOT READY für PHASE 6B STAGING FINAL LOCK**.
UI-Checkpoint für ausdrücklich genehmigte Staging-Prüfung, keine finale Abnahme.

## Übernahme und Grenzen

AGENTS, Austria Launch Master und alle sechs explizit angeforderten Berichte
gelesen. Übergabebericht vom 12.09. mit pro-phase-1/0458bfd ist historisch;
reale Git-Evidenz bestätigt obigen Branch/SHA. 61 offene Pfade vor diesem
Bericht. Runtime-/Tests seit letztem Preflight unverändert.
Nichts zurückgesetzt, gelöscht, gestasht oder überschrieben.

Nur Customer Home als neue Referenzoberfläche. Große horizontale Bildkarten,
bestehende Arrays/Detailhandler, Home-CSS-Scope, gespeicherter Bildzuschnitt,
optionales Lazy Loading und Carousel-Koordinaten/Reduced Motion.
Keine neuen Business-/Auth-/RLS-/QR-/PIN-/Plan-/Country-/Health-Verträge,
keine Migration, keine Betriebsdatenänderung, keine Phase 7.

## Exakte Aufnahme

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/components/PremiumCustomerUi.tsx`
- `src/modules/customer/components/PremiumHorizontalCarousel.tsx`
- `src/modules/customer/components/RestaurantOfferCard.tsx`
- `src/shared/components/RewardImageFrame.tsx`
- `src/shared/components/SmartMediaFrame.tsx`
- `src/modules/customer/customer-compact.css`
- `tests/customer-home-full-offer-carousel.test.mjs`
- `tests/phase6-mobile-reference.test.mjs`
- `scripts/scan-phase6-evidence.mjs`
- `docs/reports/2026-09-12_PHASE_6_MOBILE_COMPACT_UI_REPORT.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`
- `docs/reports/2026-09-13_PHASE_6B_CUSTOMER_HOME_IMAGE_FIRST_REPORT.md`
- `docs/reports/2026-09-13_PHASE_6B_CHECKPOINT_SCOPE_REPORT.md`

16 Pfade: sieben Anwendungs-/CSS-Dateien, zwei Tests, ein Prüfwerkzeug,
sechs Dokumente. Master Contract enthält bereits Founder-genehmigte Roadmap;
dessen Aufnahme aktiviert/implementiert keine spätere Phase. Customer-/Design-
Nachträge benötigen dessen Phase-6-Abschnitt 5.4. Inventartest benötigt den
Phase-6-Hauptbericht; Image-first-Bericht ist historische Provenienz.

Ausgeschlossen und erhalten: lokale Bilder/Network-Metadaten, historische
Diagnoseberichte/ZIPs, design-qa und separate breitere Roadmap-/Changelog-/
AGENTS-Dokumentationsänderungen. Keine Env-Dateien, Credentials, Profile,
Logs, Caches, Dependencies oder Build-Ausgaben neu im Commit.
Keine pauschale Aufnahme des Dirty Worktree.

## Read-only Serverlogbefund

Vorhandener In-app-Tab ist für `bwhvfjuwixgwduoeqaya` / wuxuai-bonus-staging
berechtigt. Der frühere Chrome-Zugangsblocker gilt nicht für diesen Tab.
Das Dashboardlabel main Production bezeichnet den Primärbranch des
Staging-Projekts, nicht das separate Produktivprojekt.

Logs Explorer: edge_logs, Last hour am 10:02 UTC, gefiltert auf
`/rest/v1/rpc/get_current_portal_access`; nur explizite Metadaten.
Kein HAR oder Body-/Token-/Cookie-/User-Dump.

| Serverzeit UTC | Methode | Status |
| --- | --- | --- |
| 2026-09-13T09:39:00.879000 | POST | 504 |
| 2026-09-13T09:35:07.360000 | POST | 200 |
| 2026-09-13T09:35:06.858000 | POST | 200 |
| 2026-09-13T09:35:06.794000 | OPTIONS | 200 |

504 passt zu 11:39 Uhr Wien und lokalem Browserfehler.
response.origin_time: 5085 (Rohwert, Einheit nicht unabhängig geprüft).
Angezeigtes error_code-Feld leer. HTTP-504/Gateway-Timeout belegt;
historischer HTTP-400 weiter unzugeordnet. Kein falsches Passwort oder
RLS-Verstoß nachgewiesen. Lokale CORS-Blockierung kein Beweis eines
dauerhaften Origin-Konfigurationsfehlers oder Fehlers der echten Staging-Origin.

Erster Editor-Fill hatte Defaulttext angehängt; fehlerhafter SELECT nicht
als Evidenz gewertet. Nach vollständigem Ersatz/Textkontrolle funktionierte
die vereinfachte Metadatenabfrage. Datumsfilterversuch lieferte generischen
Logs-Backendfehler; funktionierender Last-hour-Filter umfasst das Ereignis.
Keine Query gespeichert, kein Datenbank-SQL oder DML ausgeführt.

## Automatische Evidenz vor isolierter Prüfung

Unveränderter Runtime-Stand frisch unter Node 24.19.0:
Focused 33/33, Security-Verträge 113/113, Full 1529/1529,
Typecheck/Lint/Build PASS. Lint 0 Fehler, neun bestehende Warnungen;
Build bekannte >500-kB-Chunkwarnung. Kandidaten-Secret-Scan und Diff Check PASS.

Vorgemerkten Git-Baum vor Commit/Deployment isoliert exportieren und dieselben
Gates prüfen. Folgebericht dokumentiert Baum, SHA, Ergebnisse und Version.
Keine spätere Prüfung hier vorweggenommen. Keine Migration.

## Staging-Abnahme und Stopps

Ziel nur `https://staging-app.bonus.wuxuaisbi.com`,
Worker `wuxuai-restaurant-bonus-app-staging`.
Root-Wranglername nicht ungeprüft als Ziel übernehmen. Exakt geprüften
Commit deployen, Version/Asset-/Commit-Parität dokumentieren.
Kein GitHub-Push oder Production-Zugriff.

Danach vorhandenes TEST_ONLY-Konto/Testbetrieb manuell anmelden.
Customer Home/Lokalwechsel auf echter Staging-Origin prüfen.
Bei erneuter Staging-Störung read-only Session-/RLS-/Headerdiagnose und
BLOCKED, keine Umgehung. Lokale Vorprüfung ersetzt keine Staging-QA.
Offen: Swipe/Pfeile/Tastatur/Position/Klickziel/Crop/Laden, sieben Sprachen,
320/360/375/390/393/430/768/Desktop, Navigation/Safe Area/Overflow/Accessibility/
Layout Shift und echter iPhone-Gate. Keine Screenausweitung vor Final Lock.

## Prozesse

Kein Preview, Watcher oder eigener Testbrowser gestartet. Bekannte alte PIDs
beendet, Port 5176 frei. Kurzlebige Prüf-/CLI-Prozesse enden regulär.
User-Browser erhalten; nicht benötigte task-eigene Hintergrunddienste: 0.
