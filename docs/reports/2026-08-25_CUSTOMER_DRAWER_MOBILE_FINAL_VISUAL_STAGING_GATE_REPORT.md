# WUXUAI Bonus - Customer Drawer Mobile Final Visual Staging Gate

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Commit: `5ac164a6d8f067abd947912f47191b63d55fe59b`

## Ursache und Umfang

Der freigegebene Code-Lock-Stand wurde ohne neue Produkt- oder Businesslogik auf die bestehende Cloudflare-Staging-App ausgerollt. Das visuelle Gesamtgate konnte nicht vollstaendig geschlossen werden, weil die vorhandene Staging-Sitzung keinen nutzbaren Customer-Account mit Restaurant-Membership bereitstellt. `/customer` endet nach dem Laden im kontrollierten Fehlerzustand "Deine Vorteile konnten nicht geladen werden". Der Retry aendert diesen Zustand nicht.

Zusaetzlich sind die verlangten schwierigen Owner-Inhalte auf Staging nicht vorhanden. Der oeffentliche Portalvertrag fuer das Testrestaurant liefert derzeit keine Angebote. Staging-Daten wurden fuer einen reinen Visual-Gate-Test bewusst nicht veraendert.

## Deployment

- Cloudflare-Projekt: `wuxuai-restaurant-bonus-app`
- Staging-Domain: `https://bonus.wuxuaisbi.com`
- Deployment-ID: `3df5b25d-82ef-42e7-829d-27321d6bbae6`
- Deployment-Zeitpunkt: `2026-08-25T17:50:41.423Z`
- Deployment-Commit: `5ac164a6d8f067abd947912f47191b63d55fe59b`
- Ausgeliefertes Hauptbundle: `/assets/index-CmpI5IvN.js`
- Supabase-Umgebung: bestaetigtes Staging-Projekt `bwhv...qaya`
- Production: nicht veraendert

## Gemeinsame Drawer-Basis

Die statische Pruefung der gemeinsamen `AppDrawer`-Basis bestaetigt:

- mobile Breite `100%`
- Begrenzung ueber `100dvh` und `env(safe-area-inset-top)`
- eigener vertikaler Scrollbereich im Drawer-Body
- Footer mit `env(safe-area-inset-bottom)`
- Schliessen-Aktion mit 44 x 44 px Touchziel
- `min-width: 0` und responsive Inhaltsraster
- Drawer liegt oberhalb der Customer-Bottom-Navigation

Diese Codepruefung ersetzt nicht die fehlenden realen Customer-Flow-Tests.

## Live-Pruefung Partner Finder

Der echte Restaurantdetail-Drawer im Partner Finder wurde mit realen Staging-Daten geoeffnet. Geprueft wurden die CSS-Viewports 320, 375, 390 und 430 px. Die Browser-Werkzeugskalierung wurde bei der Messung beruecksichtigt.

| Kriterium | Ergebnis |
| --- | --- |
| Drawer innerhalb Viewport | PASS |
| Schliessen-Button sichtbar | PASS |
| Titel umbrechbar | PASS |
| Beschreibung umbrechbar | PASS |
| Restaurantname umbrechbar | PASS |
| Horizontaler Overflow | NEIN |
| Vertikales Scrollen bei Bedarf | PASS |
| Untere Aktionen erreichbar | PASS |
| Bottom Navigation korrekt ueberdeckt | PASS |
| Safe Area | PASS |
| Vorhandener langer Inhalt | PASS |

Bei 320 px war der Inhalt hoeher als der sichtbare Body und bis zu den Aktionen scrollbar. Bei 430 px passte der reale Inhalt vollstaendig in den Drawer; deshalb war dort kein Scrollweg erforderlich.

## Drawer-Matrix

| Drawer | 320 | 375 | 390 | 430 | Ergebnis |
| --- | --- | --- | --- | --- | --- |
| Einloesedetail | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Customer-Kontext nicht ladbar |
| Einloesebestaetigung / aktive Praesentation | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Kein aktiver Customer-Einloeseflow |
| Aktuelles & Angebote Detail | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Keine Angebote und kein nutzbarer Customer-Kontext |
| Restaurantinfo | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Customer-Portal nicht ladbar |
| Partner Finder Detail | PASS | PASS | PASS | PASS | Live geprueft |
| Scanner-bezogenes Customer-Sheet | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Kein nutzbarer Customer-Flow |

## Schwierige Testinhalte

Die verlangten Werte waren auf Staging nicht vorhanden und wurden nicht kuenstlich in die Datenbank geschrieben:

- Reward: `Doppelespressomitkaramellsirupundwillkommensueberraschung`
- Restaurant: `Kaffee Konditorei Baeckerei Familienbetrieb Innenstadt`
- Angebot: `Sommerfruehstueckswochenendsonderangebot`

Die CSS-Basis verwendet fuer zentrale Account- und Detailwerte `overflow-wrap: anywhere`. Eine vollstaendige visuelle Freigabe mit exakt diesen Inhalten ist dennoch offen.

## Qualitaet

- Tests: 973/973 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret Scan: PASS
- Datenbankmigration: keine
- Businesslogik geaendert: nein

## Was wurde geaendert

- Dieser Staging-Verifikationsbericht wurde hinzugefuegt.

## Was wurde nicht geaendert

- keine UI- oder CSS-Aenderung
- keine Businesslogik
- keine Customer-, Reward-, Offer- oder Restaurantdaten
- keine Datenbankmigration
- keine RLS-, RPC- oder Auth-Aenderung
- keine Production-Aktion

## Risiken und naechster Schritt

Fuer das finale Gate wird ein gueltiger Staging-Customer mit aktiver Restaurant-Membership sowie kontrollierten Reward-/Offer-Testdaten benoetigt. Danach muessen die fuenf blockierten Drawer auf allen vier Breiten real geoeffnet und gemessen werden. Ohne diese Verbindung ist ein Final Lock nicht zulaessig.

## Ergebnis

- CUSTOMER DRAWER MOBILE VISUAL: FAIL
- LONG OWNER CONTENT: FAIL
- GLOBAL HORIZONTAL OVERFLOW: NO im verifizierten Partner-Drawer; Gesamtmatrix nicht vollstaendig verifiziert
- BUSINESS LOGIC CHANGED: NO
- DB MIGRATION: NONE
- CUSTOMER MOBILE DRAWERS FINAL LOCK: NO
- PRODUCTION: LOCKED
- STRIPE: DEFERRED
- Status: NOT READY
