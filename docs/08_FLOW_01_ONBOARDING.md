# 08_FLOW_01_ONBOARDING.md

# WUXUAI Bonus V1 -- Flow 01: Unternehmen einrichten

Status: **LOCK**

Dieses Dokument beschreibt den vollständigen Flow 01 des WUXUAI Bonus
Systems.

Flow 01 ist der Einrichtungsfluss für Betreiber.\
Er entscheidet darüber, ob ein Unternehmen die Plattform versteht,
vertraut und in wenigen Minuten starten kann.

Flow 01 ist kein Formular.\
Flow 01 ist kein Einstellungsbereich.\
Flow 01 ist kein technisches Admin-Setup.

Flow 01 ist ein geführter Installationsassistent.

------------------------------------------------------------------------

## 1. Ziel von Flow 01

Das Ziel von Flow 01 lautet:

> Ein lokales Unternehmen soll sein Bonusprogramm in wenigen Minuten starten
> können, ohne Schulung, ohne technische Begriffe und ohne Rechnen.

Nach Flow 01 muss das Unternehmen sofort bereit sein, echte Kunden zu
registrieren und das Bonusprogramm im Betrieb zu testen.

Flow 01 ist erfolgreich, wenn der Betreiber denkt:

> „Mein Bonusprogramm ist jetzt bereit."

Nicht:

> „Ich muss noch viele Einstellungen verstehen."

------------------------------------------------------------------------

## 2. Business-Ziel

Flow 01 dient direkt dem Cashflow-Ziel der Plattform.

Ein Unternehmen soll die Software schnell testen können.\
Je schneller ein Unternehmen starten kann, desto höher ist die
Wahrscheinlichkeit, dass es die 30 Tage Testphase aktiv nutzt und später
bezahlt.

Deshalb gilt:

-   Onboarding muss kurz sein.
-   Onboarding muss geführt sein.
-   Onboarding darf keine unnötigen Entscheidungen verlangen.
-   Onboarding darf keine Detailarbeit erzwingen.
-   Onboarding darf keine technischen Begriffe enthalten.
-   Onboarding darf keine Perfektion verlangen.

Das Unternehmen soll nicht perfekt starten.

Das Unternehmen soll starten.

------------------------------------------------------------------------

## 3. WUXUAI Philosophie im Onboarding

Die WUXUAI Grundphilosophie lautet:

> Menschen sollen sich auf ihr Ziel konzentrieren -- nicht auf das
> Werkzeug.

Für Flow 01 bedeutet das:

Betreiber konzentrieren sich auf: - Name - Branche - Aussehen -
Öffnungszeiten - grobe Bonuslogik - Willkommens-Belohnungen - Starter
Kit

Die Software übernimmt: - Autosave - Slug - technische IDs -
Punkteberechnung - QR-Erzeugung - PDF-Erzeugung - Standardwerte -
Standardbilder - Verlosungslogik - spätere Freischaltung

------------------------------------------------------------------------

## 4. Grundregel: Onboarding = Installation

🟢 **FIX**

Flow 01 verhält sich wie eine Windows- oder macOS-Installation.

Der Benutzer wird Schritt für Schritt geführt.

Verboten: - mehrere große Themen auf einer Seite - lange Formulare -
permanenter Einstellungsbereich - mehrere primäre Buttons - manuelle
Speicherknöpfe - technische Begriffe - unnötige Detailfragen

Erlaubt: - Zurück - Weiter - ein klarer Fortschritt - Autosave - ein
Schritt pro Entscheidung - Schritt 7: Unternehmen aktivieren

------------------------------------------------------------------------

## 5. Flow 01 als Gate

🟢 **FIX**

Das Betreiber-Portal bleibt gesperrt, solange Flow 01 nicht
abgeschlossen ist.

Wenn `onboarding_status` nicht completed ist:

Erlaubt: - `/admin/onboarding` - `/admin/settings` für notwendige
Basisdaten

Gesperrt: - Dashboard - Gäste - Belohnungen - Willkommensgeschenke - QR
Center - Mitarbeiter - sonstige Arbeitsflächen

Nach Abschluss: - Restaurant Portal wird freigeschaltet. - Dashboard ist
erreichbar. - Einstellungen sind erreichbar. - andere Admin-Bereiche
sind erreichbar.

Grund:

Ein halbfertig eingerichtetes Unternehmen darf nicht in den Betrieb
starten.

------------------------------------------------------------------------

## 6. Schrittstruktur

🟢 **FIX**

Flow 01 besitzt nach aktueller V1-Entscheidung **7 Schritte**.

1.  Unternehmen
2.  Aussehen
3.  Geöffnet
4.  Punkteeinlösung
5.  Willkommensgeschenke
6.  Rechtliches
7.  Startklar

Der ehemalige Schritt „Angebot" wurde vollständig entfernt.

Grund:

Willkommens-Belohnungen sind das Standard-Willkommenssystem von WUXUAI
Bonus.\
Ein zusätzlicher Angebots-Schritt verwirrt und gehört nicht ins
Onboarding.

------------------------------------------------------------------------

## 7. Schritt 1 -- Unternehmen

### Ziel

Der Besitzer gibt die wichtigsten Basisdaten seines Betriebs an.

### Inhalt

Erlaubt:

- Unternehmensname
- Branche
- Sprache
- kompakter Unterbereich „Rechtliche Angaben“
- Unternehmensname
- Rechtsform
- Straße und Hausnummer
- Postleitzahl
- Ort
- Land
- Kontakt-E-Mail

Die rechtlichen Stammdaten dienen ausschließlich der automatischen Erzeugung
des unternehmensbezogenen Legal-Pakets. Der Betreiber schreibt im Onboarding keine
juristischen Freitexte.

Optional:

- Telefonnummer
- Firmenbuchnummer und Firmenbuchgericht
- UID-Nummer
- Kammerzugehörigkeit
- Aufsichtsbehörde
- Barrierefreiheitskontakt
- abweichender Beschwerdekontakt

Ist kein Beschwerdekontakt angegeben, wird die Kontakt-E-Mail verwendet.

V1 Sprache: - Deutsch

Zentrale Branchenprofile in V1:

- Restaurant
- Café
- Bäckerei
- Bubble Tea
- Eisdiele
- Einzelhandel
- Friseursalon
- Kosmetikstudio
- Fitnessstudio
- Dienstleistung
- Sonstiges

Die Branche wird als barrierefreies Dropdown mit der leeren Auswahl
„Branche auswählen“ dargestellt. Abhängige Geschenk- und
Belohnungsauswahlen werden zentral nach Branchenprofil konfiguriert.

Wenn die Branche geändert wird, bleiben gültige Werte erhalten. Nicht mehr
passende Werte werden kontrolliert zurückgesetzt; bestehende individuelle
Werte bleiben lesbar und werden nicht automatisch gelöscht.

### Nicht fragen

Nicht fragen: - technischer Slug - Datenbank-ID - Organisation-ID -
Filial-ID - Rechnungsdaten - juristische Freitexte

Diese Dinge werden später oder automatisch behandelt.

### Automatisches Legal-Paket

Nach dem erfolgreichen Abschluss erzeugt das System aus zentral versionierten
Mastervorlagen automatisch:

- Impressum
- Teilnahmebedingungen
- Datenschutzerklärung
- Bonusregeln
- Kassenabgrenzung

Das Paket wird als prüfbarer Entwurf vorbereitet. Vor der Veröffentlichung
sieht der Owner Vorschau, Änderungen, Versionsnummer, Gültigkeitsdatum und die
Auswirkungen auf neue sowie bestehende Gäste. Erst die ausdrückliche
Bestätigung veröffentlicht die Version. Im Pilotmodus dürfen dafür als
„rechtliche Prüfung empfohlen“ gekennzeichnete Mastervorlagen verwendet
werden. Im Productionmodus dürfen ausschließlich zentral freigegebene
Mastervorlagen veröffentlicht werden.

------------------------------------------------------------------------

## 8. Schritt 2 -- Aussehen

### Ziel

Das Restaurant soll sofort wie die eigene Marke wirken.

### Inhalt

Erlaubt: - Logo hochladen - Primärfarbe - Akzentfarbe - Vorschau

### Logo-Regeln

Logo darf niemals: - verzerrt werden - abgeschnitten werden - in eine
quadratische Maske gezwungen werden - auf feste Größe gepresst werden

Logo muss proportional skaliert werden.

Technische Regel: - `object-fit: contain` - Querformat, Hochformat und
Quadrat müssen sauber aussehen

### Farberkennung

Wenn möglich: - Farben aus Logo automatisch erkennen - Besitzer kann
später anpassen

### Nicht im Onboarding

Nicht fragen: - Produktbilder - Belohnungsbilder - Angebotsbilder -
Bildgalerie - Layoutvarianten

Alles, was nur schöner macht, kommt später.

------------------------------------------------------------------------

## 9. Schritt 3 -- Geöffnet

### Ziel

Smart Open wird vorbereitet.

Das Restaurant gibt Öffnungszeiten ein.

### Smart Open

🟢 **FIX**

Das Restaurant wird nicht manuell geöffnet oder geschlossen.

Der Status basiert auf Öffnungszeiten.

Beispiel: - geöffnet bis 22:00 - geschlossen, öffnet morgen um 10:00

### Inhalt

Erlaubt: - Wochentage - Öffnungszeiten - Pausen optional - Sondertage
später

### Nicht bauen in V1

Nicht priorisieren: - komplexer Feiertagskalender -
Betriebsurlaub-Automation - saisonale Zeiten

V2 vorbereitet.

------------------------------------------------------------------------

## 10. Schritt 4 -- Punkteeinlösung

### Ziel

Der Betreiber definiert die spätere Punkteeinlösung über verständliche
Auswahlen, ohne selbst eine Punkteformel zu berechnen.

### Bonus Designer

🟢 **FIX**

Betreiber sollen nicht mit Punktformeln arbeiten.

Er beantwortet einfache Fragen:

-   Wie hoch ist der durchschnittliche Rechnungsbetrag?
-   Welche Branche wurde gewählt?
-   Wie großzügig soll das Bonusprogramm sein?
-   Welche Einlöseart ist typisch?
-   Welche Einlösequote von 1 bis 10 Prozent passt?

Die Software berechnet daraus:

- erwartete Konsumation bis zur Einlösung
- empfohlenen Einlösewert
- passende Belohnungskategorie
- spätere interne Punkteeinlösung

### Verboten

Verboten: - Punkteformel direkt zeigen - manuelle Punktewerte
verlangen - technische Modusnamen wie `amount_based` -
`required_points` - `reward threshold` - englische Begriffe

### Rückgabequoten

🟢 **FIX**

Schritt 4 verwendet Geschäftssprache statt abstrakter Faktoren.

V1-Rückgabequoten:

- Sparsam: 3 % und zurückhaltender Belohnungswert
- Standard: 3 % als empfohlener Ausgangspunkt
- Großzügig: 8 %
- Premium: 10 %

Berechnung:

```text
Konsumation = Produktwert / Einlösequote
Benötigte Punkte = ceil(Konsumation × Punkte pro Euro)
```

Beispiel:

```text
Produktwert 4 € / 3 % = ca. 133,33 € Konsumation
ca. 133,33 € × 10 Punkte pro Euro = 1.334 Punkte
```

### Restaurant arbeitet mit Euro

🟢 **FIX**

Das Unternehmen denkt in Euro, Produkten oder Leistungen.

WUXUAI rechnet im Hintergrund Punkte.

------------------------------------------------------------------------

## 11. Schritt 5 -- Willkommens-Belohnungen

### Grundentscheidung

🟢 **FIX**

Schritt 5 dient zur Auswahl eines passenden Willkommensgeschenks aus dem
zentralen Branchenprofil.

Die Auswahl erfolgt über ein Dropdown. „Eigene Auswahl“ öffnet ein kompaktes
Formular für Bezeichnung, kurze Beschreibung, optionalen Wert und optionales
Bild über den bestehenden Owner-Upload.

### Ziel

Der Restaurantbesitzer soll Schritt 5 in ca. 60 Sekunden abschließen.

### Kategorien

Der Besitzer wählt aus:

-   Gratis Getränk
-   Gratis Kaffee
-   Gratis Dessert
-   Gratis Vorspeise
-   Gratis Hauptspeise
-   Gratis Menü
-   Eigene Belohnung

### Verhalten

-   Standard: nichts ausgewählt.
-   Das Dropdown zeigt nur Optionen der gewählten Branche.
-   Bestehende individuelle Werte bleiben erhalten.
-   Ein Branchenwechsel setzt nur ungültige Profilwerte zurück.
-   Texte dürfen nicht überlaufen.
-   Mobile First.

### Nach Auswahl

Nach Klick auf Weiter erscheint eine Bestätigung.

Die Bestätigung zeigt: - ausgewählte Kategorien - Hinweis, dass neue
Gäste zufällig eine davon erhalten - Hinweis, dass Details später unter
Willkommensgeschenke bearbeitet werden können

### Keine Bearbeitung im Onboarding

Verboten: - Produktname eingeben - Foto hochladen - Preisgrenze setzen -
Punktwerte setzen - Produkte festlegen

### Warum?

Ein Restaurantbesitzer weiß im Onboarding vielleicht noch nicht, welches
Dessert oder Getränk später konkret verschenkt wird.

Das muss er heute nicht entscheiden.

### Produktregel

Onboarding fragt nur, was jetzt notwendig ist.

Alles, was morgen entschieden werden kann, gehört nicht ins Onboarding.

------------------------------------------------------------------------

## 12. Willkommensgeschenke -- Systemregeln

Diese Regeln werden im Onboarding vorbereitet, aber im eigenen Bereich
verwaltet.

### Trennung

Willkommensgeschenke sind nicht normale Punkte-Belohnungen.

Punkte-Belohnung: - Kunde sammelt Punkte - Kunde löst später ein

Willkommensgeschenk: - Kunde registriert sich - Geschenk wird
zugeteilt - Geschenk ist zunächst gesperrt - erste bezahlte Konsumation
schaltet es frei - Einlösung erst beim nächsten Besuch

### Freischaltung

🟢 **FIX**

Willkommensgeschenke werden nicht sofort eingelöst.

Ablauf:

1.  Gast registriert sich.
2.  System lost Willkommensgeschenk aus.
3.  Status: gesperrt.
4.  Gast bezahlt zum ersten Mal.
5.  Punktebuchung erfolgreich.
6.  Geschenk wird freigeschaltet.
7.  Gast kann es beim nächsten Besuch einlösen.

Ziel: Willkommensgeschenk fördert den zweiten Besuch, nicht kostenlose
Sofort-Mitnahme.

### Freunde-Einladung

🟢 **FIX**

Wenn Gast über Freundeseinladung kommt:

-   kein Willkommensgeschenk
-   stattdessen Bonus Boost nach erster Konsumation

Freunde-Einladung hat Vorrang.

Ein Gast darf niemals gleichzeitig erhalten: - Willkommensgeschenk -
Bonus Boost als eingeladener Freund

------------------------------------------------------------------------

## 13. Schritt 6 -- Rechtliches

### Grundentscheidung

🟢 **FIX**

Schritt 6 heißt:

**Rechtliches**

Nicht: - juristische Freitextseite - QR Test - Download Center

### Ziel

Der Betreiber prüft die automatisch aus Unternehmensdaten, Bonusregeln und
zentralen Mastertemplates vorbereiteten Pflichtdokumente.

### Onboarding UI

Die Seite zeigt kompakt:

- Unternehmensdaten vollständig oder konkret fehlend
- Teilnahmebedingungen vorbereitet
- Datenschutzerklärung vorbereitet
- Bonusregeln vorbereitet
- Kassenabgrenzung vorbereitet
- Status der Kundenregistrierung

Der Betreiber schreibt keine juristischen Freitexte. Pflichtdokumente werden
nicht umgangen. Rechtliche Mastertemplates bleiben `LEGAL_REVIEW_REQUIRED`.

### Warum?

Pflichtdaten und Pflichtdokumente müssen vor der Aktivierung vollständig sein.
Optionale Unternehmensangaben blockieren den Abschluss nicht.

### Nach Onboarding

Das Starter Kit und echte Unternehmens-QRs werden erst nach erfolgreicher
Aktivierung im QR Center bereitgestellt. Im Onboarding gibt es keinen echten
Kunden-QR und keinen öffentlichen Kundentest.

------------------------------------------------------------------------

## 14. Schritt 7 -- Startklar

### Ziel

Der Betreiber bestätigt, dass alles bereit ist.

### Checkliste

Die Checkliste enthält:

-   Unternehmensdaten fertig
-   Aussehen fertig
-   Öffnungszeiten fertig
-   Bonusprogramm fertig
-   Willkommens-Belohnungen fertig
-   Rechtliche Pflichtdokumente vorbereitet
-   Kundenregistrierung bereit

Entfernt: - Angebot erstellt - Angebot veröffentlicht

Grund: Angebote wurden aus Onboarding entfernt.

### Button

Button: **Unternehmen aktivieren**

Dieser Button erscheint nur auf Schritt 7.

Nicht vorher.

### Verhalten

Wenn Checkliste unvollständig: - Button deaktiviert - fehlende Punkte
anzeigen

Wenn vollständig: - Button aktiv - Klick speichert endgültig -
`onboarding_status = completed` - `completed_at` setzen - Weiterleitung
zu `/admin`

------------------------------------------------------------------------

## 15. Autosave und Persistence

🟢 **FIX**

Es gibt keinen Button „Speichern und später fortsetzen".

Warum?

Autosave ist Standard.

Regeln: - jede Feldänderung wird gespeichert - jeder Schrittwechsel wird
gespeichert - Refresh behält Werte - Browser schließen behält
Fortschritt - Rückkehr öffnet letzten Schritt

Benutzer soll niemals fragen:

> Habe ich gespeichert?

### Draft

Onboarding-Draft speichert: - current_step - draft_data - checklist -
restaurant_id - branch_id - organization_id

### Completion

Nach Abschluss darf Onboarding nicht automatisch neu starten.

Wenn abgeschlossen: - `/admin/onboarding` kann auf Abschluss hinweisen
oder zu `/admin` leiten - kein Reset - keine Duplikat-Restaurants

------------------------------------------------------------------------

## 16. So funktioniert's

### Grundregel

🟢 **FIX**

„So funktioniert's" ist kein permanenter Seitenbereich.

Es erscheint: - beim ersten Besuch automatisch einmal - danach nur über
Icon

Icon: **ⓘ So funktioniert's**

### Verhalten

-   Nutzer schließt Erklärung.
-   Danach nicht automatisch wieder anzeigen.
-   Klick auf Icon öffnet erneut.

### Text

Text muss dynamisch sein: - aktueller Restaurantname - aktuelle
Einstellungen - aktuelle Bonuslogik - aktuelle Willkommens-Belohnungen

Keine harten Standardtexte mit falschen Werten.

------------------------------------------------------------------------

## 17. Sprache

🟢 **FIX**

Alle sichtbaren Texte in V1 sind Deutsch.

Englisch ist nur erlaubt für: - Code - Dateinamen - Funktionsnamen -
Bibliotheken - API-Begriffe im Code

Verboten in UI: - You selected - Every new guest - Campaign - Reward
URL - Image URL - Save later - Admin setup

------------------------------------------------------------------------

## 18. Mobile First

🟢 **FIX**

Jede Onboarding-Seite wird zuerst für 390 px Breite entworfen.

Regeln: - keine horizontalen Scrollleisten - keine abgeschnittenen
Texte - Karten wachsen in Höhe - Texte umbrechen - QR und Logo
zentriert - Buttons gut klickbar - keine überladenen Spalten

Desktop adaptiert von Mobile.

Nicht umgekehrt.

------------------------------------------------------------------------

## 19. Technische Regeln

### RLS

Onboarding-Drafts sind nur für Restaurant Admin/Owner sichtbar.

### Storage

Logo-Upload nutzt: `restaurant-media/{restaurant_id}/branding/...`

Bucket: - public read - owner/admin write - max 5 MB - PNG/JPG/JPEG/SVG

### Starter Kit

PDF-Generierung darf keine SVG als Hauptdownload erzwingen.

PNG/SVG Einzeldateien gehören ins QR Center.

### Onboarding Gate

Gating muss auf `/admin` greifen.

Settings darf erreichbar bleiben, wenn es für Setup notwendig ist.

------------------------------------------------------------------------

## 20. Was ausdrücklich verboten ist

Verboten:

-   Onboarding als normale Einstellungsseite
-   Dashboard vor abgeschlossenem Onboarding freigeben
-   manuelles Speichern verlangen
-   „Speichern und später fortsetzen"
-   Unternehmen aktivieren vor letztem Schritt
-   Angebote-Schritt wieder einbauen
-   Bilduploads für Belohnungen im Onboarding verlangen
-   Produktdetails im Onboarding verlangen
-   Punkte im Onboarding manuell eingeben
-   echte Kunden-QRs vor erfolgreicher Aktivierung anzeigen
-   englische UI-Texte
-   technische Labels
-   SVG als Hauptdownload
-   Logo verzerren
-   QR-Codes schief oder unzentriert anzeigen

------------------------------------------------------------------------

## 21. V2 Hinweise

V2 vorbereitet: - tiefgreifende Branchen-Speziallogik - Filialen - Wochenplan für
Belohnungen - dynamische Starter Kit Botschaften - QR Center mit
Sticker/Flyer/Tischkarten - erweiterte Smart Reward Engine - Enterprise
Branding Entfernung - mehrsprachige UI nach deutscher V1

------------------------------------------------------------------------

## 22. Betreiber Reality Check

Flow 01 ist nur gut, wenn:

1.  Betreiber versteht jeden Schritt ohne Schulung.
2.  Einrichtung dauert ca. 10 Minuten oder weniger.
3.  Es gibt keine unnötigen Entscheidungen.
4.  Kein technischer Begriff erscheint.
5.  Nach Abschluss kann ein echter Gast registriert werden.
6.  Starter Kit ist druckbar und verständlich.
7.  Betreiber fühlt sich startklar.

------------------------------------------------------------------------

## 23. LOCK Kriterien

Flow 01 ist LOCK, wenn:

-   7 Schritte korrekt vorhanden
-   Angebote-Schritt entfernt
-   Onboarding Gate funktioniert
-   Autosave funktioniert
-   Logo Upload funktioniert
-   Bonus Designer ohne Punkteformeln funktioniert
-   Willkommens-Belohnungen nur Kategorien wählen
-   Rechtsschritt Pflichtdaten und Pflichtdokumente verständlich zeigt
-   keine echten Kunden-QRs vor Aktivierung sichtbar sind
-   Unternehmen aktivieren erst in Schritt 7 möglich ist
-   Abschluss zu `/admin` leitet
-   Dashboard danach freigeschaltet
-   alle Texte Deutsch
-   Mobile Ansicht sauber
-   Build erfolgreich

------------------------------------------------------------------------

## 24. Codex-Regeln

Wenn Codex an Flow 01 arbeitet:

1.  Diese Datei zuerst lesen.
2.  Keine neue Onboarding-Struktur erfinden.
3.  Keine Aktionen zurückbringen.
4.  Keine Bildpflichten einbauen.
5.  Keine Punkte-Eingabe einbauen.
6.  Kein Englisch in UI.
7.  Kein technisches Vokabular sichtbar machen.
8.  Mobile First prüfen.
9.  Build ausführen.
10. Wenn eine Regel unklar ist: NOT READY melden.

------------------------------------------------------------------------

Endstatus: **LOCK**
