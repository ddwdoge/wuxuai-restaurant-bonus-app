# WUXUAI Bonus V1

## Customer Portal Info-Icon fuer „So funktioniert's“

Datum: 2026-07-10

Status: LOCK

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` wurde im Projekt nicht gefunden.

## Aufgabe

Die dauerhafte untere Karte `So funktioniert's` im Kundenportal sollte entfernt und durch ein dezentes Info-Icon im Header ersetzt werden.

## Geaenderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `src/styles.css`

## Entfernte untere Karten

Entfernt aus:

- Customer Portal / Mein Bonus
- Customer Portal / Punkte sammeln
- Customer Portal / Belohnungen und Willkommensgeschenke
- Customer Portal / Bonus Boost Bereich
- Referral Landing

Die dynamischen Erklaerungstexte wurden nicht geloescht, sondern in ein Header-Modal verschoben.

## Neues Info-Icon Verhalten

Im Header erscheint rechts ein Info-Icon mit:

```text
So funktioniert's öffnen
```

Das Icon:

- sitzt rechts im Restaurant-Branding-Header
- hat eine mobile Touch-Flaeche von 44 x 44 px
- nutzt dezente Restaurantfarbe
- ist per `aria-label` benannt

## Drawer / Modal Verhalten

Beim Klick auf das Info-Icon oeffnet sich ein Modal mit:

- Titel `So funktioniert's`
- dynamischen Erklaerungstexten
- X-Button oben rechts
- Button `Schließen`
- Schliessen per Klick ausserhalb

Der Inhalt bleibt kontextuell:

- Restaurantname wird dynamisch eingesetzt.
- Punkte-sammeln-Hinweise bleiben im Punkte-sammeln-Kontext.
- Bonus-Boost-Hinweise bleiben im Bonus-Boost-Kontext.
- Referral Landing erklaert den Einladungslink und Bonus Boost dynamisch.

## Mobile Pruefung

Geprueft per CSS und Build:

- Modal wird auf Mobile als Bottom-Sheet ausgerichtet.
- Maximalhoehe verhindert Ueberlaufen.
- Info-Icon hat mindestens 44 px Touch-Flaeche.
- Kein horizontales Scrollen wurde hinzugefuegt.
- Keine permanente grosse Erklaerungskarte verlaengert die Seite.

## Unveraenderte Bereiche

Nicht geaendert:

- Punkte sammeln Logik
- Tages-PIN Logik
- Reward-Einloesung
- Bonus Boost Logik
- Referral Business-Logik
- Registrierung
- Datenbank
- RPC
- RLS

## Build Ergebnis

`npm run build` wurde erfolgreich ausgefuehrt.

## Offene Risiken

- Keine echte Browser-Screenshot-Pruefung wurde in diesem Durchlauf erstellt.
- Das alte CSS fuer `.customer-how-box` bleibt im Stylesheet vorhanden, wird aber in Customer-Komponenten nicht mehr gerendert.

## Ergebnis

Status: LOCK
