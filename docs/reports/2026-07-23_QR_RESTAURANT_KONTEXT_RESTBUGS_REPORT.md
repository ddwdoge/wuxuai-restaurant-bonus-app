# QR-Restaurantkontext: Restbugs

Datum: 23.07.2026

## Ausgangslage

- Branch: `codex/fix-qr-restaurant-context`
- Ausgangscommit: `237a8d1`
- URL-Slug und URL-Token hatten bereits Vorrang.
- Kundentoken, Kunde und Restaurant werden serverseitig weiterhin gebunden.
- Der alte Restore-Key war nur nach Restaurant-Slug getrennt.

## Ursache

Der aktive Einlösecode wurde unter
`wuxuai-active-redemption:<restaurantSlug>` gespeichert. Dadurch fehlten
Kundenscope und Einlösungs-ID im Schlüssel. Ein Route-Unmount beendete das
Polling, aber der Datensatz ließ sich bei mehreren Kunden desselben Restaurants
nicht sicher zuordnen. Zusätzlich setzte der Portal-Fehlerpfad Restaurant,
Branding und Einstellungen nicht vollständig zurück.

## Umsetzung

### P1-1 und P2-2

- Ein Indexschlüssel trennt Restaurant und SHA-256-Fingerprint des
  Kundenzugangs.
- Der eigentliche Datensatzschlüssel enthält zusätzlich die Einlösungs-ID.
- Kundenzugänge werden nicht im Klartext in Schlüsseln oder Payloads gespeichert.
- Restaurant B findet weder Index noch Code von Restaurant A.
- Kunde 2 findet keinen Zustand von Kunde 1 im selben Restaurant.
- Bei Rückkehr zu A lädt das Portal den Datensatz, fragt den Serverstatus ab
  und zeigt nur einen serverseitig aktiven Vorgang.
- Eingelöste und abgelaufene Vorgänge werden lokal entfernt und als
  Endzustand angezeigt.
- Polling endet beim Unmount und startet erst nach erfolgreicher
  Wiederherstellung neu.

### P2-1

Bei jedem Portal-Ladefehler werden sichtbar zurückgesetzt:

- Restaurant
- Branding
- Loyalty-Einstellungen
- Kunde
- Punkteeinlösungen
- Retention-Daten
- aktiver UI-Einlösezustand
- geöffnete Einlöse-Details

Der gescopte Restore-Datensatz bleibt bei einem normalen Netzwerkfehler
erhalten. Nach erfolgreichem Retry wird er erneut serverseitig geprüft.
Ein ungültiger Kundenzugang entfernt nur den betroffenen Restaurant- und
Kundenscope.

### P3-1

Leere und syntaktisch ungültige Slugs werden vor Service-, Restore- und
Polling-Aufrufen abgewiesen. Die UI zeigt neutral:

> Restaurant wurde nicht gefunden.

## Serverseitige Autorität

`get_customer_redemption_status` bleibt die Autorität für Restaurant,
Kundenzugang, Einlösungs-ID und Status. Lokale Daten können keine Einlösung
starten oder verbrauchen. Ein manipuliertes Restore-Objekt mit unpassendem Scope
wird vor dem Serveraufruf verworfen.

## Verhaltenstests

Neue ausführbare Tests prüfen mit echtem In-Memory-Storage und injizierter
Serverstatus-Funktion:

1. A → B → A mit demselben aktiven Code.
2. Keine Anzeige und kein Serverstatus-Aufruf für A während B aktiv ist.
3. Getrennte Kunden desselben Restaurants.
4. Manipulierter Restaurant-/Token-Scope.
5. Serverseitig eingelöster Vorgang wird lokal entfernt.
6. Leerer oder syntaktisch ungültiger Slug ruft keinen Portal-Service auf.
7. Loader-Fehler liefert keine alten Portaldaten zurück.

Die bestehenden Regex-Regressionstests bleiben zusätzlich bestehen.

## Lokale Browserprüfung

Production-Preview bei 390 × 844 px:

- Akakiko Hietzing geladen.
- Danach Wuxuai food geladen; alter Name nicht sichtbar.
- Ungültiger Restaurant-Slug zeigt nur den neutralen Fehlerzustand.
- Alter Restaurantname und altes Branding sind im Fehlerzustand nicht sichtbar.
- `document.documentElement.scrollWidth === window.innerWidth`.
- Retry-Button: ungefähr 169 × 50 px.
- Keine sichtbaren React- oder Seitenfehler.
- Keine unerwarteten Network-Fehler im geprüften A/B-/Fehlerseitenablauf.

## Manuelle Staging-Testanleitung

### Szenario A: Aktive Einlösung A → B → A

1. Auf einem iPhone den QR von Restaurant A öffnen.
2. Mit einem isolierten Testkunden eine Punkteeinlösung starten.
3. Code und verbleibende Zeit dokumentieren, nicht konsumieren.
4. QR von Restaurant B scannen.
5. Prüfen: B lädt; kein Code, Reward oder Polling von A sichtbar.
6. Zur URL von A zurückkehren.
7. Prüfen: derselbe Code erscheint, Restzeit stammt vom Server und Polling läuft.
8. Code im Staff Portal konsumieren.
9. A neu laden und den eingelösten Endzustand prüfen.
10. Sicherstellen, dass keine zweite Einlösung gestartet wurde.

### Szenario B: Zwei Kunden auf demselben Gerät

1. Restaurant A mit Token von Testkunde 1 öffnen und Code starten.
2. Restaurant A mit Token von Testkunde 2 öffnen.
3. Prüfen: kein Code und kein Polling von Kunde 1.
4. Zu Kunde 1 zurückkehren.
5. Prüfen: ursprünglicher Code wird nach Serverprüfung restauriert.

### Szenario C: Loader-Netzwerkfehler

1. Restaurant A erfolgreich laden.
2. Netzwerk vor einem Portal-Reload deaktivieren.
3. Reload auslösen.
4. Prüfen: kein Restaurantname, Logo, Reward oder alte Einstellung sichtbar.
5. Netzwerk aktivieren und „Erneut versuchen“ wählen.
6. Prüfen: korrekter Restaurant- und Einlösezustand wird neu geladen.

### Szenario D: PWA und Mobile Safari

1. Szenario A im normalen Mobile-Safari-Tab durchführen.
2. Kundenportal zum Home-Bildschirm hinzufügen.
3. Szenario A in der installierten PWA wiederholen.
4. In beiden Oberflächen Back/Forward, Refresh und Ablaufstatus prüfen.

## Qualitätsprüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bestehende Warnungen
- Tests: 96/96 erfolgreich
- Build: erfolgreich
- Mobile 390 px: erfolgreich
- Horizontaler Overflow: keiner
- Touchflächen: Retry 50 px hoch
- Migration: keine
- RLS/Security: unverändert

## Separater kritischer Produktbefund

`start_customer_redemption` zieht Punkte bei Beginn einer normalen
Punkteeinlösung sofort ab und schreibt eine negative Punktetransaktion.
`expire_redemption_codes` setzt Code und Redemption-Event bei Ablauf lediglich
auf `expired`; eine Rückbuchung findet nicht statt.

Damit können reservierte Punkte nach einem nicht konsumierten, abgelaufenen Code
dauerhaft fehlen. Dieser QR-Kontext-Auftrag ändert die Geschäftslogik bewusst
nicht. Vor FINAL LOCK ist eine CTO-Entscheidung für Rückbuchung,
Wiederaktivierung oder verbindlichen Verbrauchszeitpunkt erforderlich.

## Offene Risiken

- Physischer Mobile-Safari- und installierter PWA-Test nicht durchgeführt.
- Vollständiger Staging-Ablauf mit echten A-/B-Testtokens nicht durchgeführt.
- Punkterückbuchung bei abgelaufenem, nicht konsumiertem Code ist ungeklärt.
- Der sechsstellige Code muss für UI-Restore lokal im `sessionStorage` vorliegen;
  der Server speichert weiterhin nur den Hash. Manipulation erzeugt keine
  serverseitig gültige Einlösung, kann aber den eigenen lokalen Anzeigecode
  unbrauchbar machen.

## Status

`READY_FOR_STAGING`

Kein FINAL LOCK und keine Production-Freigabe vor Szenario A–D sowie der
Entscheidung zum Punkteverhalten bei abgelaufenen Reservierungen.
