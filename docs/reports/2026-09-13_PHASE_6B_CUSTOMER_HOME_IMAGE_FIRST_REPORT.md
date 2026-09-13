# Phase 6B – Customer Home Image-first Horizontal Carousel

Datum: 2026-09-13 (Europe/Vienna). Status: **NOT READY / BLOCKED**.

Spätere rein physische Wiederaufnahme desselben Tages:
`2026-09-13_PHASE_6B_PHYSICAL_RECHECK_REPORT.md`. Quellcode unverändert;
320px-Pfeil-/Tastaturwechsel teilweise geprüft. 360px-Ganzseiten-Capture mit
duplizierten Blöcken und Leerflächen verworfen; sofortiger Stopp, kein Final
Lock. Neue Vorschaugruppe 26159 vollständig beendet. Nachfolgende Angaben
beschreiben den vorherigen Implementierungslauf.
Arbeitsordner: `/private/tmp/wuxuai-pro-phase1-authoritative`.
Branch: `codex/v1-phase-6-compact-mobile-ui`.
HEAD/Basis: `41a819e4f54e7da9a95c23c3ea10dc21e9ad17cb`.
Kein Commit, Push, Reset, Checkout oder Überschreiben fremder Änderungen.

## Ursache und Umfang

Founder-Folgeauftrag: zuerst ausschließlich Customer Home als Referenzscreen
mit großen horizontalen Bildkarten umsetzen und physisch abnehmen. Die
hochgeladene Fremdmarken-Abbildung ist nur Referenz für Bild-über-Text-Aufbau;
keine ihrer Bilder, Farben oder Navigation wurden übernommen.
Bestehende Phase-6-Dokumentation und UI-Entwürfe waren bereits uncommitted.
Der neue Zielvertrag ist noch nicht vollständig abgenommen und kein Final Lock.

## Geänderte Dateien und Darstellung

- `src/modules/customer/CustomerPortal.tsx`: Home-spezifischer CSS-Scope,
  Home-Angebotsklasse, Image-first-Opt-in für vorhandene Offer-/Reward-/Gift-Karten.
  Alle Arrays, Filter, Berechtigungen und Detailhandler bleiben unverändert.
- `src/modules/customer/customer-compact.css`: Home-Mobile-Referenz unter 768px,
  große 3:2-Bilder, 90%-Carousel-Karten mit Vorschau der nächsten Karte,
  kompakter Bildfooter, vollständige Karten-Hitfläche, sichtbarer Fokus.
  Einzelangebot bleibt vollbreit ohne sinnlose Pfeile. Keine vertikale Stapelung
  innerhalb des Carousels. Mobile Einleitungsprosa bleibt zugänglich, ist aber
  visuell zurückgenommen; Kurzbeschreibung steht im bestehenden Detail.
  Titel werden nicht abgeschnitten, können bei langen Inhalten höher wachsen.
- `src/modules/customer/components/PremiumCustomerUi.tsx`: Image-first-Opt-in,
  derselbe bestehende Detailbutton mit zugänglichem Namen und Chevron.
- `src/modules/customer/components/RestaurantOfferCard.tsx`: entsprechende
  optionale Darstellung; Preis, Zeitraum, Tagesplan und Gültigkeit erhalten.
- `src/modules/customer/components/PremiumHorizontalCarousel.tsx`: Scrollziel
  und Positionsbestimmung aus relativen Rechteckkoordinaten statt offsetLeft;
  reduzierte Bewegung verwendet sofortiges Scrollen. Dieser reine UI-Fix
  betrifft den gemeinsamen Carousel-Baustein; fremde Screens sind nicht neu
  freigegeben. Native Scroll-Snap-, Pfeil-, Positions- und Tastaturstruktur bleibt.
- `src/shared/components/SmartMediaFrame.tsx` und `RewardImageFrame.tsx`:
  optionales Lazy Loading/async Decoding; vorhandener Bildfokus und Crop-Zoom
  weitergereicht. Defaults anderer Aufrufer bleiben erhalten. Transform nur am
  Bild für gespeicherten Zuschnitt, niemals Seite/Bereich/Karte skaliert.
- `tests/phase6-mobile-reference.test.mjs`: alte Kleinkarten-/Reihenfolgeannahmen
  an den freigegebenen Image-first-Vertrag angepasst; Scope-/Touch-/Flowguards
  bleiben erhalten. Vorhandener Full-Offer-Test unverändert mitgeprüft.
- Phase-6-Hauptbericht, dieser Bericht, `docs/19_CHANGELOG.md` und `design-qa.md`
  um diesen Zwischenstand ergänzt; historische Einträge bleiben erhalten.

## Was nicht geändert wurde

Keine Business-, Security-, QR-, PIN-, Auth-, RLS-, Entitlement-, Country- oder
Health-Center-Logik. Keine Migration, API- oder Datenbankänderung. Keine neuen
Testkunden, Einladungen, Mitgliedschaften, Einlösungen oder Punktebuchungen.
Bestehende angemeldete Sitzung verwendet; keine Zugangsdaten angefordert.
Keine neuen Fremdmarkenbilder oder künstlichen Fallback-Daten. Bestehende
Fallback-Logik wiederverwendet, keine neue Kompressions-/Storage-Pipeline.
Keine Erweiterung anderer Screens nach dem fehlgeschlagenen Home-Gate.
Kein Staging-/Production-Deployment und kein Beginn von Phase 7.

## Browserprüfung und verbindlicher Stopp

Die alte Vorschau-Registerkarte war auf einer Browser-Fehlerseite festgefahren.
Ein frischer lokaler Tab konnte die bestehende Sitzung übernehmen. Separat
ausgeführte 390×844-Prüfung zeigte tatsächlich 390×844 bei DPR 1 und zunächst
eine vollständig gerenderte Aufnahme. Die vorangegangene 433px-Abweichung war
damit nicht mehr die aktuelle Blockade.

Beim finalen Größenlauf mit aufeinanderfolgenden Viewportwechseln meldete DOM
die angeforderten Breiten, die Capture-Ausgabe war aber nicht durchgehend
konsistent: 320px-Aufnahme skaliert mit großer Leerfläche, 390px-Aufnahme am
rechten/unteren Rand abgeschnitten. Die genaue Ursache in der Browser-/Capture-
Synchronisierung ist nicht bewiesen. Diese Bilder zählen ausdrücklich nicht
als Evidenz. Gemäß Founder-Stoppbedingung keine weitere UI-Implementierung,
Sprachabnahme oder Rollenausweitung nach Entdeckung dieses Fehlers.

Keine ungültigen Screenshots exportiert. Personenbezogene Rohaufnahmen wurden
nicht auf Disk gespeichert und aus den Task-Variablen verworfen. Keine
generative Bildreparatur, keine DOM-/CSS-Manipulation zur Beweisfälschung.
Anonymisierte vollständige Before/After-Evidenz bleibt ausstehend.
Der verwendete Image-to-code/Design-QA-Workflow erlaubt ohne belastbare
Screenshot-Vergleiche ebenfalls keinen visuellen PASS.

## Nur vorläufige DOM-Messwerte, keine responsive Freigabe

Aktuelle Sitzung: 758 Punkte, ein Angebot, vier Punkte-Rewards, keine
persönlichen Geschenke, aktiver 2× Boost. Historische Phase 6A hatte 0 Punkte,
zwei persönliche Geschenke und inaktiven Boost. Historische 3028px deshalb
nicht als Vergleich desselben Zustands verwenden oder einen Dichte-PASS ableiten.

| Breite × Höhe | Dokumentbreite | Höhe vorher | Höhe aktueller Entwurf | Punktekarte oben |
|---|---:|---:|---:|---:|
| 320 × 568 | 320 | 2453 | 2600 | 190,89 |
| 360 × 640 | 360 | nicht erfasst | 2483 | 190,89 |
| 375 × 667 | 375 | nicht erfasst | 2494 | 190,89 |
| 390 × 844 | 390 | 2226 | 2452 | 190,89 |
| 430 × 932 | 430 | nicht erfasst | 2494 | 190,89 |
| 768 × 1024 | 768 | 2793 | 2793 | 261,84 |
| 1280 × 900 | 1280 | nicht erfasst | 2748 | 261,84 |

DOM meldete in diesen sieben Zuständen keine horizontale Seitenüberbreite und
keine abgeschnittenen Überschriften. Wegen ungültiger Capture-Zuordnung nicht
als vollständige physische Matrix gewertet. Gegenüber dem aktuellen eigenen
390px-Vorherzustand steigt die Seitenhöhe um 226px durch größere Bilder;
INFORMATION DENSITY: NOT PROVEN. Die Punktekarte lag vorher bei 235,84px.
Erste sichtbare Bilder meldeten natürliche Abmessungen 400×263; kein Nachweis
für allgemeine Größenoptimierung beliebiger Owner-Uploads.

## Automatische Gates

- Fokus: `node --test tests/customer-home-full-offer-carousel.test.mjs tests/customer-horizontal-discovery-carousel.test.mjs tests/phase6-mobile-reference.test.mjs`:
  **20/20 PASS**.
- Vollsuite: `npm test`: **1529/1529 PASS**, 0 fehlgeschlagen/übersprungen.
  Enthält vorhandene Country-, PRO-, Password-, UI-Konsistenz-, Health- und
  Security-Vertragstests; ersetzt keine neue Live-RLS-/Cross-Tenant-Matrix.
- `npm run typecheck`: **PASS**. TypeScript zusätzlich im abschließenden Build.
- `npm run lint`: **PASS**, 0 Fehler, 9 bestehende Warnungen außerhalb der
  geänderten UI-Dateien. Warnungen nicht verschwiegen oder wegkonfiguriert.
- `npm run build`: **PASS**, mit geprüfter öffentlicher Staging-Konfiguration
  ausschließlich im Prozessspeicher; bekannte Chunk-Warnung über 500 kB.
- `git diff --check`: **PASS**.
- Secret Scan aller 32 zu diesem Zeitpunkt geänderten/ungetrackten Dateien:
  **PASS**, 0 Treffer; abschließender Bericht-/ZIP-Scan wird separat ausgeführt.
- Lokale SQL-Migrationen: **149**, keine Migration geändert oder hinzugefügt.
  Staging 149/149 und 0 offen ist der frühere belegte Stand, nicht in diesem
  UI-Lauf frisch aus der Datenbank gelesen. Keine DB-Verbindung verändert.

## Offene Abnahme und Risiken

Customer Home nicht vollständig physisch abgenommen. Touch-Swipe, Pfeile,
Tastaturinteraktionen, Screenreader, alle sieben Sprachen, lang übersetzte
Titel, Loading-/Error-/Fallbackzustände, Reduced Motion, iPhone Safe Area und
Bottom-Navigation bei allen Größen bleiben offene physische Gates.
Nur vorhandene DE-Inhalte betrachtet; keine Aussage ALL 7 LANGUAGES PASS.
Tablet/Desktop DOM erfasst, aber keine abgeschlossene Screenshot-Abnahme.
Keine Behauptung, der volle Phase-6B–6F-Vertrag sei implementiert.
Vor einer Wiederaufnahme erforderlich: verlässlich synchronisierte, korrekte
Viewport-Captures und anonymisierte Before/After-Nachweise. Keine Codeänderung
als Umgehung des Browserfehlers. Erst nach bestandenem Home-Gate weitere Screens.

## Export, Sicherheit und Cleanup

Prüf-ZIP: `exports/2026-09-13_PHASE_6B_CUSTOMER_HOME_IMAGE_FIRST.zip`.
Explizites Quell-/Test-/Berichts-Paket, keine Bildbeweise und daher kein
Screenshot-Abnahme-ZIP. Keine Env-Dateien, Credentials, Recovery-URLs, Logs,
Caches, node_modules, dist/build oder älteren ZIP-Dateien aufnehmen.
Scanner prüft Tokens, Passwörter, private Schlüssel und Connection Strings;
keine Trefferwerte werden ausgegeben.
Abschließender Dateiscan: 34 Dateien einschließlich Bericht und Design-QA,
PASS / 0 Treffer. Export: 20 explizite Dateien, Quellscan und ZIP-Inhaltsscan
jeweils PASS / 0 Treffer. Keine ausgeschlossenen Artefakte im ZIP.

Task-eigene Vorschau: Prozessgruppe 13156, PIDs 13156/13494/13508/13509.
Nach Ende sämtlicher Tests und Builds mit SIGTERM geschlossen; gezielte
Prozessnachkontrolle leer, Vorschau-Exec beendet. Temporären Test-Tab geschlossen,
Viewport-Vorgabe zurückgesetzt, ursprünglichen Benutzer-Tab nicht geschlossen.
Keine fremden Prozesse verändert, keine Sitzung abgemeldet.

TASK-OWNED BACKGROUND PROCESSES STARTED: 4 (dauerhafte Vorschaugruppe)
TASK-OWNED BACKGROUND PROCESSES STOPPED: 4
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS
UNRELATED NODE PROCESSES CHANGED: NO

Status: **NOT READY**. Automatische Gates grün, physisches Customer-Home-Gate
und Before/After-Evidenz offen. Production unverändert.
