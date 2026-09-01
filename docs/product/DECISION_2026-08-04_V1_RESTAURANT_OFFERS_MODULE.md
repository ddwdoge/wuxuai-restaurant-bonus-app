# Produktentscheidung: Aktuelles & Angebote in V1

Datum: 2026-08-04  
Status: **LOCKED**

## Entscheidung

WUXUAI Bonus V1 erhaelt ein eng begrenztes Informationsmodul mit dem sichtbaren
Namen `Aktuelles & Angebote`. Restaurants koennen damit aktuelle, oeffentlich
zulaessige Informationen fuer ihre Gaeste veroeffentlichen.

Das Modul ist kein Kampagnen-, Reward-, Gutschein- oder Automationssystem. Das
bisherige V1-Verbot fuer generische Aktionen, Coupons und Marketingkampagnen
bleibt bestehen.

## Produktnutzen

- Restaurants koennen zeitnahe Informationen ohne technische Kampagnenlogik
  bereitstellen.
- Gaeste sehen relevante Neuigkeiten im Kundenportal und im
  Partnerlokal-Finder.
- Die einfache V1-Bedienung bleibt erhalten.

## Erlaubter V1-Umfang

Zulaessige Beitragstypen:

- Wochenangebot
- Monatsangebot
- Mittagsmenü
- Neues Gericht
- Saisonangebot
- Veranstaltung
- Allgemeine Neuigkeit

Pro Restaurant duerfen gleichzeitig hoechstens fuenf Beitraege veroeffentlicht
sein. Erlaubt sind:

- Titel, Bild, Kurzbeschreibung und ausfuehrliche Beschreibung
- Angebotsart
- optionaler Preis und optionaler vorheriger Preis
- `Gueltig von` und `Gueltig bis`
- optionale Wochentage und Uhrzeiten
- Zuordnung zum V1-Restaurantstandort
- Entwurf, geplante Veroeffentlichung, Veroeffentlichung und Deaktivierung
- automatische oeffentliche Ausblendung nach Ablauf
- Darstellung im Kundenportal und Partnerlokal-Finder
- einfache aggregierte Aufruf-, CTA-, Route- und Bonus-oeffnen-Klickzahlen

## Strikte Trennung von Bonusfunktionen

Ein Beitrag darf nicht mit Rewards, Punkten, Willkommens- oder
Geburtstagsgeschenken, Einloesungen, Codes, Coupons oder Gutscheinen verbunden
werden. Er darf keine Punkte veraendern, keine Einloesung ausloesen und keinen
Restaurant-, Kunden- oder QR-Kontext setzen.

Die historische rewardgebundene Kampagnenarchitektur bleibt ausserhalb dieses
Moduls und darf dafuer nicht wieder aktiviert oder umgedeutet werden.

## Datenschutz und Auswertung

V1 erlaubt nur personenbezugsfreie, aggregierte Kennzahlen, beispielsweise die
Anzahl der Aufrufe eines Beitrags. Keine Kundenprofile, Zielgruppen,
personenbezogene Attribution, Standortverlaeufe oder individuellen
Interaktionshistorien werden fuer dieses Modul erstellt.

## Rechtlicher Rahmen

Die Restaurantbetreiber sind fuer die von ihnen eingestellten Inhalte
verantwortlich. Vor einer Production-Freigabe ist eine rechtliche Pruefung der
Preisangaben, Streichpreise, Verfuegbarkeit, Bildrechte, Produktinformationen,
Allergene und Veranstaltungsinformationen erforderlich.

Der verbindliche Owner-Hinweis lautet:

> Das Restaurant ist für die Richtigkeit, Aktualität, Verfügbarkeit und
> rechtliche Zulässigkeit seiner Angebots-, Preis-, Produkt- und Bildangaben
> verantwortlich.

## Ausdruecklich nicht Teil von V1

- Push-, E-Mail- oder SMS-Versand
- Segmentierung und Personalisierung
- Coupon-, Rabatt- oder Gutscheincodes
- Punkte-Multiplikatoren
- Marketingautomation
- KI-generierte Kampagnen
- Funnels und personenbezogene Attribution
- A/B-Tests
- Werbenetzwerke

Diese Funktionen bleiben V2 oder einer spaeteren ausdruecklichen
Produktentscheidung vorbehalten.

## Umsetzungsvorgaben

- Keine neue Hauptnavigation ausser dem freigegebenen Owner-Eintrag
  `Aktuelles & Angebote`.
- Staff darf Beitraege weder erstellen noch bearbeiten oder veroeffentlichen.
- Tenant-Isolation und minimaler oeffentlicher Datenvertrag sind serverseitig
  durchzusetzen.
- Das Kundenportal zeigt nur aktive, freigegebene und aktuell gueltige Inhalte
  des jeweiligen Restaurants.
- Diese Entscheidung erlaubt die spaetere Implementierung, ist selbst aber
  ausschliesslich eine Dokumentationsfreigabe.
