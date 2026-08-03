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

-   Aktionen existieren in V1 nicht.
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
