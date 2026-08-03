# 02_PRODUKTREGELN

## Zweck

Dieses Dokument definiert die verbindlichen Produktregeln für WUXUAI
Bonus V1.

## Produktprinzipien

-   Onboarding = Installationsassistent, kein Administrationsformular.
-   Eine Seite = Eine Entscheidung.
-   Mobile First.
-   Deutsch als Standardsprache in V1.
-   Autosave statt manueller Speicherung.
-   Restaurant arbeitet mit Euro, WUXUAI rechnet Punkte.

## Punktevergabe ohne Kassenintegration

-   V1 besitzt keine POS- oder Kassenintegration.
-   Im Punkteflow gibt es keine Bonnummer und keine Belegreferenz.
-   Weder Gast noch Team oder Owner geben eine Bonnummer ein.
-   Sicherheit entsteht durch Restaurant- und Kundenzuordnung, kurzlebigen
    Single-Use-QR, Tages-PIN, serverseitige Betragsgrenzen, Idempotenz,
    Rate Limits und Audit.
-   Historische nullable Datenbankfelder bleiben ausschließlich als
    Vorbereitung fuer eine spaetere V3/V4-Integration erhalten.

## Flow-Regeln

-   Neuer Flow erst nach LOCK des vorherigen Flows.
-   Keine halbfertigen Seiten.
-   Jede Oberfläche zuerst UX, dann Business, dann LOCK.

## Onboarding

-   Nur notwendige Informationen.
-   Logo optional personalisieren.
-   Standard-Assets verwenden.
-   Personalisierung später im Arbeitsbereich.

## Belohnungen

-   Generische Aktionen, Coupons und Kampagnen existieren in V1 nicht.
-   `Aktuelles & Angebote` ist ein getrenntes, rein informatives V1-Modul.
-   Punkte-Belohnungen und Willkommensgeschenke sind getrennt.
-   Produktpreis eingeben, Punkte automatisch berechnen.
-   Smart Reward Engine schützt die Wirtschaftlichkeit.

## Willkommensgeschenke

-   Einmalig pro Kunde.
-   Nicht bei Freundeseinladung.
-   Freischaltung erst nach der ersten bezahlten Konsumation.
-   Einlösung erst beim nächsten Besuch.

## Dashboard

-   Fokus auf heutige Informationen.
-   Keine technischen Warnungen.
-   Heute für dich = eine Empfehlung.

## V2 Vorbereitung

-   Filialen
-   Wochenplan
-   Dynamische Belohnungen
-   Erweiterte Smart Engines

Status: LOCK

## LOCK-Ergänzung 2026-08-04: Aktuelles & Angebote

- Restaurants dürfen Wochenangebote, Monatsangebote, Mittagsmenüs, neue
  Gerichte, Saisonangebote, Veranstaltungen und allgemeine Neuigkeiten
  veröffentlichen.
- Pro Restaurant dürfen höchstens fünf Beiträge gleichzeitig veröffentlicht sein.
- Beiträge informieren nur. Sie buchen keine Punkte, schalten keine Rewards frei,
  erzeugen keine Geschenke, Codes, Einlösungen oder Journaleinträge.
- Es gibt keine Pflichtbeziehung zu Reward-, Coupon- oder Campaign-Tabellen.
- V1 erlaubt nur aggregierte Aufrufe und CTA-, Route- sowie Bonus-öffnen-Klicks
  ohne personenbezogene Daten, Profilbildung oder Segmentierung.
- Push, E-Mail, SMS, Zielgruppen, Personalisierung, Marketingautomation,
  Rabattcodes, Multiplikator-Kampagnen und Umsatzattribution bleiben V2.
- Preis-, Bild-, Produkt-, Allergen-, Verfügbarkeits- und Veranstaltungsangaben
  bleiben `LEGAL_REVIEW_REQUIRED`.

## LOCK-Ergänzung 2026-08-03: Punkte-Präsentationsfenster

- Normale Punktebelohnungen werden nach ausdrücklicher Kundenbestätigung sofort
  serverseitig belastet.
- Danach gilt ein serverzeitgebundenes Präsentationsfenster von 15 Minuten.
- Das Team kontrolliert ausschließlich den aktiven Kundenbildschirm; es gibt für
  Punktebelohnungen keinen Staff-Code, keine PIN und keinen QR-Scan.
- Reload, Browserwechsel und mehrere Tabs verlängern das Fenster nicht.
- Willkommens- und Geburtstagsgeschenke behalten ihren bestehenden
  sechsstelligen Einlösecode.
- Storno einer Punktebelohnung ist nur für Owner oder Support mit Begründung,
  Audit, Journal und atomarer Rückbuchung zulässig.
