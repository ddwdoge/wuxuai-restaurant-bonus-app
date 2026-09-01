# 02_PRODUKTREGELN

## Zweck

Dieses Dokument definiert die verbindlichen Produktregeln für WUXUAI
Bonus V1.

## Current Lock 2026-08-24

- Produktname: **WUXUAI Bonus**; Kundenbereich: **Meine Vorteile**.
- Kundenidentität: Supabase Auth mit E-Mail, Passwortbestätigung und
  E-Mail-Bestätigung; aktive Registrierung nur über die Legal-RPCs.
- Einlösung: serverzeitgebundene 15-Minuten-Präsentation, keine sechsstellige
  Codeprüfung als normaler Staff-Flow.
- Freundschaftsbonus: fest 2x; Default 14 Tage; 7/14/28/Custom; Referrer 100
  Prozent, Freund exakt 50 Prozent der gespeicherten Dauer.
- Bei Widerspruch gilt `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`.

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

## LOCK-Ergänzung 2026-08-30: V1 Commercial Contract

- Die kostenlose Testphase beträgt drei Kalendermonate.
- Danach kostet das Basispaket `WUXUAI Bonus V1` 59 EUR pro Monat exkl. USt.
- Das Abrechnungsintervall ist monatlich; automatische Abrechnung ist noch
  nicht aktiv und Stripe bleibt `DEFERRED`.
- Solange kein Zahlungsmittel erhoben wird, muss die Akquise dies klar als
  `Kein Zahlungsmittel erforderlich` ausweisen.
- Neue Trial-Enddaten werden kalenderbasiert berechnet. Bereits gespeicherte
  Trial-Enddaten werden nicht rückwirkend verändert.
- Zukünftige Zusatzpakete bleiben technisch als leerer, deaktivierter Katalog
  vorbereitbar. Sie werden in V1 weder angezeigt, verkauft noch aktiviert.
- Diese Entscheidung ersetzt alle früheren aktiven V1-Aussagen zu 30 Tagen
  kostenlos oder einer Preisrange von 59 bis 69 EUR.

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

## LOCK-Ergänzung 2026-08-04: Meine Vorteile und Angebots-E-Mails

- Nach einem serverseitig validierten ersten Restaurantbeitritt darf der Kunde
  bestehende Memberships im zentralen Bereich `Meine Vorteile` erneut öffnen.
- Punkte, Rewards, Geschenke und Besuche bleiben strikt restaurantbezogen und
  werden nicht summiert.
- Der Restaurant-QR bleibt für ersten Beitritt und Vor-Ort-Kontext erhalten.
- Restauranttokens dürfen nicht als globale Browseridentität aggregiert werden.
- Angebots-E-Mails sind ausschließlich freiwillige, restaurantbezogene und per
  Double-Opt-in bestätigte Wochen- oder Monatszusammenfassungen; Standard ist
  `Nie`.
- Diese begrenzte Entscheidung ersetzt das frühere pauschale V1-E-Mail-Verbot
  im Modul `Aktuelles & Angebote`. Alle anderen Marketingautomationen bleiben
  außerhalb von V1.
- Ohne freigegebenen Marketingprovider bleibt der Versand deaktiviert.

## LOCK-Ergänzung 2026-08-04: Zentraler Kundenlogin

- Die zentrale Kundenidentität verwendet Supabase Auth mit bestätigter E-Mail
  und Passwort. Diese Entscheidung ersetzt die frühere passwortlose Gastregel.
- Ein QR setzt ausschließlich den Restaurantkontext. Der Beitritt benötigt eine
  aktive Kundensitzung und ausdrückliche Zustimmung.
- Die Navigation hat vier Ziele: `Start`, `Meine Lokale`, `Entdecken`, `Konto`.
- Vollständige Angebote erscheinen nur im ausgewählten Restaurantbereich; ein
  global gemischter Angebotsfeed ist in V1 verboten.
