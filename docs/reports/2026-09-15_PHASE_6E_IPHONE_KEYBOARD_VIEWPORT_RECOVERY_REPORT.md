# Phase 6E – iPhone Keyboard Viewport Recovery

Datum: 2026-09-15
Branch: `codex/v1-phase-6-compact-mobile-ui`
Commit: `cc10e8b7e6dda1ca9982814cf71aa441c7122faf`
Staging-Version: `00fe9fa5-70b2-47f9-b92b-8d2d2e6dc816`
Status: **FINAL LOCK**

## Ursache

Der reproduzierte iPhone-Befund zeigt, dass der Owner-Drawer nach dem
Schliessen der Bildschirmtastatur mit der zuvor gesetzten vertikalen
Visual-Viewport-Geometrie stehen bleiben kann. Der aktuelle gemeinsame
Drawer schrieb `visualViewport.height` und `visualViewport.offsetTop` in
CSS-Variablen, mass nach einem Viewport-Ereignis jedoch nur bis 320 ms nach.
Ein Keyboard-Close ohne danach noch verwertbares `visualViewport.resize`-
oder `visualViewport.scroll`-Ereignis liess diese Variablen unveraendert. Der
naechste Touch beziehungsweise Scroll lieferte erst den Impuls, der die
Geometrie wieder aktualisierte.

Der Founder-Screenshot ist physische Fehler-Evidenz. Er enthaelt keine
gespeicherte Aktion. Numerische iPhone-DOM-Werte des damaligen Fehlers waren
nicht remote erfassbar und werden deshalb nicht erfunden.

## Geaenderte Dateien

- `src/shared/components/AppDrawer.tsx`
- `tests/staff-pin-mobile-layout.test.mjs`

## Was wurde geaendert

- Der bestehende Visual-Viewport-Vertrag misst die vertikale Geometrie nach
  `requestAnimationFrame`, einem zweiten Frame sowie nach 100, 250 und 500 ms.
- Verlaesst der Fokus ein Texteingabefeld im Owner-Drawer, startet dieselbe
  begrenzte Messreihe erneut.
- Fehlt auch nach 500 ms das terminale Safari-Viewport-Ereignis, darf nur ein
  `owner-mobile-drawer` mit beendetem Texteingabefokus und einer echten
  Keyboard-typischen Hoehenreduktion auf die unveraenderte Layout-Viewport-
  Hoehe zurueckfallen.
- Ein Fokuswechsel zwischen zwei Texteingaben gilt nicht als Keyboard-Close.
- Unmoegliche vertikale Kombinationen werden auf den Layout-Viewport
  begrenzt; die Breite bleibt ausschliesslich CSS-basiert.
- Alle Frames, Timer sowie Focus-, Visual-Viewport-, Resize- und
  Orientation-Listener werden beim Unmount entfernt.

## Was wurde nicht geaendert

- keine Drawer-DOM-Struktur
- kein Footer-Hide/Show; Footer bleibt dauerhaft im normalen Scrollfluss
- keine Breitenlogik, kein Zoom und kein `transform: scale()`
- keine Formular-, Angebots-, Upload-, Speicher- oder Veroeffentlichungslogik
- keine Business-, Security-, API-, RLS- oder Datenbanklogik
- keine Migration und keine Datenaktion
- keine Production-Aenderung

## Automatische Gates

- Focused Owner/Drawer/Staff/Offers: **174/174 PASS**
- Security Contracts: **55/55 PASS**
- Full Tests: **1797/1797 PASS**
- Typecheck: **PASS**
- Lint: **PASS**, 0 Fehler und 8 vorbestehende Warnungen
- Build: **PASS**, 2124 Module; bestehende Chunkgroessenwarnung
- Secret Scan des exakten Scopes: **PASS**
- Git Diff Check des exakten Scopes: **PASS**

## Staging

Die finale Version `00fe9fa5-70b2-47f9-b92b-8d2d2e6dc816` ist zu 100 Prozent
ausschliesslich auf `wuxuai-restaurant-bonus-app-staging` aktiv. Ihr
Deployment-Metadatum entspricht exakt Commit
`cc10e8b7e6dda1ca9982814cf71aa441c7122faf`.

Ein vorheriger Uploadversuch wurde vom Build-Guard vor dem Upload gestoppt,
weil die oeffentlichen Buildvariablen nicht im Prozess gesetzt waren. Eine
danach kurz aktivierte inhaltsgleiche Zwischenversion hatte ein falsches
Commit-Metadatum und wurde durch die oben genannte korrekt zugeordnete Version
vollstaendig ersetzt.

Read-only Desktop-Smoke mit autorisiertem TEST_ONLY-Owner:

- neues Hauptasset geladen;
- Angebotsdrawer ohne Speicherung geoeffnet und geschlossen;
- `innerWidth = clientWidth = document.scrollWidth = 415` CSS-px;
- Panel und Footer jeweils 415 CSS-px breit;
- Overlay-Viewporthoehe 1088.75 CSS-px, vertikaler Versatz 0;
- Panel ist der Scroll-Container; Footer bleibt im DOM;
- kein horizontaler Seitenoverflow.

## Physischer Founder-Restgate

Der Founder hat dieselbe aktive Staging-Version auf einem echten iPhone
geprueft und am 2026-09-15 als **PASS** bestaetigt:

- Nach dem Schliessen der Tastatur stellte der Drawer normale Hoehe und
  Position selbststaendig wieder her.
- Kein Touch und keine Scrollbewegung waren fuer die Wiederherstellung noetig.
- Bei geoeffneter Tastatur blieb der Footer durch Scrollen erreichbar.
- `Abbrechen` schloss den Drawer; es wurde nichts gespeichert.
- Safe Area und Keyboard-Recovery bestanden auf dem realen iPhone.

Damit ist der zuvor reproduzierte physische Defekt auf dem exakten Fix-Commit
und der exakten Staging-Version geschlossen.

## Risiken

Kein offenes Code-, Build-, Security-, Staging-Deployment- oder physisches
iPhone-Risiko im engen Scope. Phase 6E erreicht **FINAL LOCK**.

## Finaler Status

- Root Cause identifiziert: **PASS**
- Stale Drawer-Hoehe nach Keyboard-Close: **NONE**
- Stale Drawer-Position nach Keyboard-Close: **NONE**
- Pointer/Scroll fuer Recovery erforderlich: **NO**
- Footer dauerhaft im DOM und mit Keyboard erreichbar: **PASS**
- Eingabewert erhalten: **PASS**
- Safe Area: **PASS**
- Daten gespeichert: **NO**
- Production geaendert: **NO**
- Status: **PHASE 6E OWNER MOBILE FINAL LOCK**
