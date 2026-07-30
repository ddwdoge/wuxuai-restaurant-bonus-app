# WUXUAI Bonus V1 - Startseite drei Karten Responsive UX

Datum: 2026-07-17  
Status: LOCK

## Ursache

Das Kartenraster der öffentlichen Startseite verwendete standardmäßig zwei Spalten und wechselte bereits unter 820 px auf eine Spalte. Dadurch stand die dritte Zugangskarte am Desktop allein in einer zweiten Reihe.

## Geänderte Dateien

- `src/modules/public/PublicHome.tsx`
- `src/styles.css`

## Was wurde geändert

- Desktop: drei gleich breite und gleich hohe Zugangskarten in einer Reihe.
- Tablet: zwei Karten in der ersten Reihe und eine gleich breite, zentrierte dritte Karte darunter.
- Mobile: drei vollbreite Karten untereinander.
- Karteninhalt als einheitliche vertikale Struktur ausgerichtet.
- Aktionslinks am unteren Kartenrand ausgerichtet.
- Inhaltsbreite auf 1040 px begrenzt und zentriert.
- Registrierungskarte auf `Restaurant registrieren` und `Kostenlos starten` umbenannt.
- Beschreibung der Registrierungs- und Gastkarte gemäß Auftrag angepasst.
- Bestehende Routen `/login`, `/register` und `/customer` unverändert beibehalten.
- Bestehende dezente Hover- und sichtbare Fokuszustände beibehalten.

## Was wurde nicht geändert

- Keine Funktionslogik.
- Kein Routing.
- Keine Authentifizierung.
- Keine Datenbank, RPC oder RLS.
- Keine zusätzliche Karte oder Marketingsektion.

## Responsive Prüfung

- 390 px: eine Spalte, Kartenbreite 342 px, kein horizontaler Überlauf.
- 768 px: zwei Spalten mit je 352 px; dritte Karte gleich breit und zentriert.
- 1440 px: drei Spalten mit je 336 px; alle Karten 250 px hoch.
- Desktop-Aktionslinks besitzen dieselbe vertikale Position.
- Alle drei Karten bleiben vollständige Link- und Touchflächen.

## Build Ergebnis

- `npm run build`: erfolgreich.
- `npm run lint`: ohne Fehler; 12 bereits bestehende Warnungen außerhalb des geänderten Scopes.

## Risiken

Keine offenen Risiken im geänderten UI-Scope.

Status: LOCK
