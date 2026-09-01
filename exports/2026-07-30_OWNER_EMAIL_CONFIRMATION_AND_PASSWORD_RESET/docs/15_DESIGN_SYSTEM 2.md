
# 15_DESIGN_SYSTEM.md

# WUXUAI Bonus V1 – Design System

Status: **LOCK**

Dieses Dokument beschreibt das verbindliche Design System von WUXUAI Bonus V1.

Das Design System ist nicht nur eine Sammlung von Farben und Buttons.  
Es ist die visuelle Umsetzung der WUXUAI-Philosophie:

> Menschen sollen sich auf ihr Ziel konzentrieren – nicht auf das Werkzeug.

Für WUXUAI Bonus bedeutet das:

- Restaurantbesitzer sollen ohne Schulung verstehen, was zu tun ist.
- Gäste sollen in Sekunden erkennen, was sie bekommen.
- Mitarbeiter sollen im Stress nicht nachdenken müssen.
- Codex darf keine uneinheitlichen Seiten erzeugen.
- UI muss Mobile First sein.
- Alle sichtbaren Texte in V1 sind Deutsch.
- Jede Seite folgt „Eine Seite = Eine Entscheidung“.

---

## 1. Ziel des Design Systems

Das Ziel des Design Systems lautet:

> Jede Oberfläche von WUXUAI Bonus soll einfach, ruhig, hochwertig, verständlich und schnell nutzbar sein.

Das Design soll nicht wie ein technisches Admin-System wirken.

Es soll wirken wie:

- ein geführter Installationsassistent,
- ein täglicher Arbeitsplatz,
- eine einfache Bonus-App,
- ein professionelles SaaS-Produkt für lokale Betriebe.

---

## 2. Grundprinzipien

### 2.1 Mobile First

🟢 **FIX**

Jede Seite wird zuerst für eine Handybreite von ca. 390 px entworfen.

Danach:

1. Mobile
2. Tablet
3. Desktop

Nicht umgekehrt.

Warum?

WUXUAI Bonus wird häufig genutzt auf:

- Smartphone des Gastes
- Smartphone des Restaurantbesitzers
- Tablet an der Kassa
- Laptop im Büro

Wenn eine Seite auf Mobile nicht funktioniert, ist sie nicht fertig.

### 2.2 Eine Seite = Eine Entscheidung

🟢 **FIX**

Jeder Bildschirm hat genau ein Ziel.

Beispiele:

- Onboarding Schritt 5: Willkommens-Belohnungen auswählen
- Starter Kit Schritt: Starter Kit herunterladen
- Punkte sammeln: Rechnungsbereich wählen
- Belohnung einlösen: Belohnung zeigen
- Dashboard: Heute verstehen

Verboten:

- 5 Formulare auf einer Seite
- 10 gleich wichtige Buttons
- technische Optionen im Onboarding
- mehrere primäre Aktionen

### 2.3 Restaurant-Sprache statt Technik

Alle sichtbaren Begriffe müssen aus Sicht eines Restaurantbesitzers verständlich sein.

Verwenden:

- Gäste
- Belohnungen
- Willkommensgeschenke
- Punkte
- Bonus Boost
- QR Center
- Restaurant Starter Kit
- Mitarbeiter
- Einstellungen
- Heute im Restaurant

Verboten:

- Campaign
- Reward URL
- Slug
- Token
- Device Warning
- Referral Warning
- RPC
- JSON
- API
- Debug
- Threshold
- required_points
- user_metadata

### 2.4 Deutsch zuerst

🟢 **FIX**

V1 UI ist 100 % Deutsch.

Englisch ist nur erlaubt für:

- Dateinamen
- Funktionsnamen
- Code
- Bibliotheken
- technische APIs

Alle Buttons, Hinweise, Erklärungen, Fehlermeldungen und Wizard-Texte sind Deutsch.

### 2.5 Kein Formulargefühl

Restaurantbesitzer sollen nicht das Gefühl haben, Datenbankfelder auszufüllen.

Wenn ein Prozess komplex ist, wird er als Wizard gebaut.

Beispiel:

Falsch:

```text
Titel
Beschreibung
Status
Startdatum
Enddatum
Reward Threshold
```

Richtig:

```text
Was möchtest du verschenken?
→ Produktpreis
→ Vorschau
→ Belohnung erstellen
```

---

## 3. Layout-Grundlagen

### 3.1 Weißraum

WUXUAI Bonus verwendet großzügige Abstände.

Ziel:

- ruhige Oberfläche
- weniger Stress
- bessere Lesbarkeit
- hochwertiger Eindruck

Keine Seite darf zusammengedrückt wirken.

### 3.2 Maximale Breite

Für Admin-/Restaurantseiten:

- Inhalt nicht über die volle Desktop-Breite strecken
- Kartenbereiche klar gruppieren
- große Bildschirme nutzen Weißraum

Für Kundenportal:

- mobile Breite optimieren
- große Karten
- einspaltig, wenn nötig

### 3.3 Kartenlayout

Karten sind Standard-Komponente.

Jede Karte besitzt:

- abgerundete Ecken
- klaren Innenabstand
- ruhigen Hintergrund
- optional Schatten
- keine harten Rahmen, außer für Status
- ausreichend Textumbruch

Karten dürfen niemals Text abschneiden.

### 3.4 Kein horizontales Scrollen

🟢 **FIX**

Keine horizontale Scrollleiste auf Mobile.

Wenn Inhalt zu breit ist:

- Karten umbrechen
- Text umbrechen
- Grid anpassen
- Spalten reduzieren

---

### 3.5 Produktbilder in Punkteeinlösungen

Echte Produktfotos von Restaurants dürfen nicht abgeschnitten werden.

Für Punkteeinlösungen gilt:

- definierter Bildbereich in der Karte
- helles ruhiges Hintergrundfeld
- Bild zentriert
- originales Seitenverhältnis bleibt erhalten
- `object-fit: contain`
- kein `object-fit: cover` für echte Speisenfotos
- kein Stretching

Leerraum im Bildbereich ist erlaubt und besser als ein angeschnittenes Dessert,
Getränk oder Hauptgericht.

---

## 4. Farben

### 4.1 Restaurantfarben

WUXUAI Bonus ist White-Label-fähig.

Restaurantfarben steuern:

- Buttons
- Akzente
- PDF Starter Kit
- Kundenportal
- ausgewählte Karten
- Highlights

### 4.2 WUXUAI Standardfarben

Wenn keine Restaurantfarbe vorhanden ist:

- Primärfarbe: ruhiges Türkis / Teal
- Akzentfarbe: warmes Orange
- Hintergrund: hell / weiß
- Text: dunkles Grau
- Sekundärtext: mittleres Grau

### 4.3 Statusfarben

Statusfarben müssen konsistent sein:

- Grün = aktiv, fertig, wirtschaftlich, ausgewählt
- Gelb/Orange = Hinweis, prüfen, Empfehlung
- Rot = Blocker, Fehler, zu großzügig
- Grau = inaktiv, nicht ausgewählt, später

### 4.4 Keine Warnfarben für normale Aktionen

Ein Hauptbutton darf nicht rot sein, wenn keine Gefahr besteht.

Beispiel:

„Neue Aktion starten“ war rot und wurde entfernt.

Normale CTAs verwenden Restaurant-Primärfarbe.

---

## 5. Typografie

### 5.1 Grundregel

Wenige Worte.

Große Aussagen.

Keine Textwände.

### 5.2 Hierarchie

Jede Seite braucht:

1. klare Überschrift
2. kurzen Untertitel
3. Hauptinhalt
4. eine klare Aktion

### 5.3 Textlänge

KPI-Karten:

- maximal 1–3 Wörter pro Zeile
- Zahlen bevorzugen
- Icons unterstützen Bedeutung

Beispiel:

```text
🔥
Du 2× Punkte
```

Nicht:

```text
Wenn du einen Freund einlädst, bekommst du möglicherweise doppelte Bonuspunkte.
```

### 5.4 Zeilenumbruch

Texte müssen umbrechen dürfen.

Kein Text darf außerhalb seiner Karte liegen.

---

## 6. Buttons

### 6.1 Primärer Button

Pro Onboarding-Seite gibt es maximal einen primären Button.

Beispiele:

- Weiter
- Restaurant starten
- Restaurant Starter Kit herunterladen
- Belohnung erstellen

### 6.2 Sekundäre Buttons

Sekundär erlaubt:

- Zurück
- Abbrechen
- Bearbeiten
- Details ansehen

Aber nicht mehr als nötig.

### 6.3 Entfernte Buttons

Verboten im Onboarding:

- Speichern und später fortsetzen
- mehrere Downloadbuttons
- Erweiterte Optionen
- SVG Download als Hauptaktion
- technische Exportbuttons

### 6.4 Buttontexte

Deutsch, klar, kurz.

Beispiele:

- Weiter
- Zurück
- Restaurant starten
- QR als Bild speichern
- Restaurant Starter Kit herunterladen
- Belohnung erstellen
- Bearbeiten
- Aktivieren
- Deaktivieren

---

## 7. KPI-Karten

### 7.1 Zweck

KPI-Karten zeigen schnelle, verständliche Informationen.

Sie sind keine Formulare.

### 7.2 Aufbau

Eine KPI-Karte enthält:

- Icon
- Zahl oder kurzer Wert
- kurzer Titel
- optional kleiner Untertext

Beispiel:

```text
👥
12
Neue Mitglieder heute
```

### 7.3 Responsives Verhalten

Desktop:

- maximal 3–5 Karten pro Zeile je nach Kontext

Tablet:

- 2 Karten pro Zeile

Mobile:

- 1–2 Karten pro Zeile

Karten wachsen in Höhe.

Text bricht um.

Nichts überlappt.

### 7.4 Auswahlkarten

Auswahlkarten sind spezielle KPI-Karten.

Beispiel Willkommens-Belohnungen:

- Gratis Getränk
- Gratis Kaffee
- Gratis Dessert

Verhalten:

- nicht ausgewählt = grau
- ausgewählt = grün
- Klick toggelt
- erneuter Klick wählt ab
- kein gesondertes „Aktiv“-Feld

### 7.5 Keine starren Karten

Karten dürfen nicht so starr sein, dass Text herausläuft.

Verboten:

- feste Höhe ohne Umbruch
- Text außerhalb Karte
- abgeschnittener Belohnungsname
- Button über Kartenrand

---

## 8. Onboarding Design

### 8.1 Installationsassistent

Onboarding ist ein Wizard.

Nicht:

- Einstellungen
- Adminformular
- Konfiguration
- Dashboard

### 8.2 Fortschritt

Fortschritt zeigt:

- vergangene Schritte grün
- aktueller Schritt hervorgehoben
- zukünftige Schritte hellgrau

### 8.3 Navigation

Schritte 1–6:

- Zurück
- Weiter

Letzter Schritt:

- Restaurant starten

Kein „Restaurant starten“ vorher.

### 8.4 Autosave

Kein manueller Speichern-Button.

System speichert automatisch.

### 8.5 So funktioniert’s

Nicht als permanenter rechter Bereich.

Stattdessen:

- Icon im Header
- beim ersten Mal automatisch zeigen
- danach nur per Klick

### 8.6 Onboarding-Inhalt

Onboarding enthält nur, was zum Start notwendig ist.

Nicht im Onboarding:

- Belohnungsbilder
- Produktdetails
- detaillierte Angebote
- Punktformeln
- SVG Downloads
- API-Optionen

---

## 9. Restaurant Starter Kit Design

### 9.1 Onboarding UI

Im Onboarding zeigt Schritt 6 nur einen Hauptbutton:

```text
📦 Restaurant Starter Kit herunterladen
```

Keine PNG/SVG-Einzeloptionen.

### 9.2 PDF Layout

Das PDF ist professionell, ruhig und druckfertig.

Regeln:

- Logo oben
- Restaurantname
- große Überschrift
- QR zentriert
- kurzer Hinweis
- Footer
- genug Weißraum
- keine überflüssigen Texte

### 9.3 QR

QR ist der Hauptfokus.

Regeln:

- groß
- schwarz
- zentriert
- scanbar
- nicht verzerrt

### 9.4 Logo

Logo proportional.

Kein fester quadratischer Zwang.

Technische Regel:

```css
object-fit: contain;
```

### 9.5 Footer

Footer:

```text
Powered by WUXUAI Bonus • www.wuxuaisbi.com
```

Klein, grau, dezent.

Nicht als Werbung.

### 9.6 Bonus Boost KPI-Box

PDF darf eine kurze KPI-Box enthalten:

```text
💡 Freunde einladen

🔥 Du 2× Punkte
👥 Freund 2× Punkte
📅 +30 Tage Bonus Boost
```

Keine langen Texte.

---

## 10. Dashboard Design

### 10.1 Hauptüberschrift

Dashboard-Seite zeigt:

```text
Heute im Restaurant
```

Untertitel:

```text
Dein Bonusprogramm auf einen Blick.
```

### 10.2 Inhalte

Nur wichtigste KPI:

- Neue Mitglieder heute
- Vergebene Bonuspunkte heute
- Eingelöste Belohnungen
- Bonus Boost Einladungen
- Wiederkehrende Gäste

### 10.3 Entfernte Elemente

Nicht anzeigen:

- Device Warnungen
- Referral Warnungen
- QR-Code bereit
- technische Statuskarten
- leere Teamkarten
- leere Diagramme

### 10.4 Heute für dich

Eine Karte mit genau einer Empfehlung.

Keine Liste.

V1 Platzhalter erlaubt.

---

## 11. Belohnungsdesign

### 11.1 Wizard

Neue Belohnung wird als Wizard erstellt.

Nicht als langes Formular.

Schritte:

1. Art wählen
2. Preis eingeben
3. Punkte automatisch sehen
4. Foto optional
5. Vorschau
6. erstellen

### 11.2 Karten

Gespeicherte Belohnungen als Karten.

Karte zeigt:

- Bild
- Name
- Kategorie
- Preis
- automatisch berechnete Punkte
- Status
- Bearbeiten
- Aktivieren/Deaktivieren

### 11.3 Keine Punkte-Eingabe

UI darf kein Punkte-Dropdown zeigen.

### 11.4 Kundenansicht

Gast sieht:

- Bild
- Punkte
- fehlende Punkte
- ca. fehlende Euro

---

## 12. Willkommensgeschenke Design

### 12.1 Eigener Bereich

Willkommensgeschenke haben eigenes Menü.

### 12.2 Karten

Jede Karte zeigt:

- Symbol/Bild
- Name
- Wertgrenze
- Aktiv/Inaktiv
- Bearbeiten

### 12.3 Kein Punktebezug

Keine Punkte anzeigen.

Willkommensgeschenke sind kein Punkteprodukt.

### 12.4 Kundenstatus

Gesperrt:

```text
Wartet auf deine erste bezahlte Bestellung.
```

Freigeschaltet:

```text
Bei deinem nächsten Besuch einlösbar.
```

---

## 13. Kundenportal Design

### 13.1 Mobile First

Kundenportal ist primär Handy-App.

### 13.2 Start

Oben:

- Restaurantlogo
- Restaurantname
- Punkte
- Bonus Boost falls aktiv

### 13.3 QR

Mein QR muss leicht erreichbar sein.

### 13.4 Belohnungen

Belohnungen als große Karten.

Nicht genug Punkte:

```text
Dir fehlen noch XX Punkte.
≈ Noch ca. XX € bis zur Einlösung.
```

### 13.5 Bonus Boost

Wenn aktiv, prominent oben.

Nicht verstecken.

---

## 14. Staff Portal Design

### 14.1 Ziel

Mitarbeiter im Stress.

Wenig Text.

Große Buttons.

### 14.2 Hauptaktionen

- Gast suchen
- Belohnung einlösen
- Punkte prüfen
- PIN bestätigen

### 14.3 Kein Admin

Staff sieht keine Einstellungen.

### 14.4 Fehler

Deutsch, einfach.

Nicht technisch.

---

## 15. Einstellungen Design

### 15.1 Übersicht

Einstellungen ist ein Menü, kein Formular.

Karten:

- Restaurantdaten
- Aussehen
- Öffnungszeiten
- Bonusprogramm
- Konto & Testphase

### 15.2 Unterseiten

Jede Unterseite ein Ziel.

### 15.3 Klickbare Karten

Karten müssen klickbar wirken:

- Pfeil
- Hover
- Cursor
- kurze Beschreibung

---

## 16. Icons

### 16.1 Zweck

Icons erklären schneller als lange Texte.

### 16.2 Konsistenz

Gleiche Bedeutung = gleiches Icon.

Beispiele:

- 👥 Gäste / Freunde
- 🎁 Belohnungen / Geschenke
- 🔥 Bonus Boost
- 📅 Zeit / Tage
- ⭐ Punkte / Bonus
- 📱 QR / Handy
- 🏠 Dashboard / Heute
- ⚙ Einstellungen
- 👨‍🍳 Mitarbeiter

### 16.3 Keine Icon-Flut

Nicht zu viele Icons auf einer Seite.

Icons unterstützen, ersetzen aber nicht Struktur.

---

## 17. Fehlermeldungen

### 17.1 Deutsch

Alle Fehlermeldungen Deutsch.

### 17.2 Kein technischer Fehler

Nicht anzeigen:

```text
RPC failed
RLS violation
undefined
500 internal server error
```

Stattdessen:

```text
Das hat gerade nicht funktioniert.
Bitte versuche es erneut.
```

### 17.3 Konkrete Nutzerhilfe

Wenn möglich, erklären:

```text
Bitte lade ein Bild unter 5 MB hoch.
```

oder

```text
Bitte wähle zuerst eine Belohnung aus.
```

---

## 18. Responsive Regeln

### 18.1 Mobile

- einspaltig
- große Buttons
- keine überladenen Karten
- QR groß
- Sticky CTA nur wenn sinnvoll

### 18.2 Tablet

- zwei Spalten möglich
- Staff Portal optimiert

### 18.3 Desktop

- mehr Weißraum
- Kartenraster
- keine zu breite Textzeilen

### 18.4 Test

Jede UI muss geprüft werden auf:

- 390 px Mobile
- Tablet
- Desktop

---

## 19. Barrierearme Grundregeln

V1 muss mindestens beachten:

- ausreichende Kontraste
- große Klickflächen
- sichtbare Fokuszustände
- keine winzigen Textlinks als Hauptaktion
- sinnvolle Buttontexte
- klare Fehlertexte

---

## 20. Animationen

Animationen sind erlaubt, aber sparsam.

Erlaubt:

- leichte Hover-Effekte
- Karten-Skalierung bei Auswahl
- sanftes Öffnen von Drawer
- Ladezustände

Verboten:

- lange Animationen
- Ablenkung beim QR
- Animationen, die Bedienung verlangsamen

---

## 21. Was ausdrücklich verboten ist

Verboten:

- englische UI-Texte
- technische Begriffe
- mehrere primäre CTAs
- Onboarding mit Detailformularen überladen
- Text außerhalb KPI-Karten
- starr verzerrte Logos
- QR-Codes nicht zentriert
- SVG als Hauptdownload
- Dashboard mit Warnungen überladen
- Aktionen-Modul in V1
- Punkte manuell eingeben lassen
- Kundenportal wie Adminportal aussehen lassen
- Staff Portal mit Restaurant-Admin-Funktionen überladen
- Demo- oder Platzhalterkarten anzeigen, wenn echte Restaurantdaten fehlen

---

## 22. Leere Zustände

Wenn Supabase aktiv ist und für ein Restaurant noch keine echten Daten
vorhanden sind, zeigt die UI einen klaren leeren Zustand.

Regel:

- keine Fake-KPI
- keine Demo-Karten
- keine Seed-Namen
- keine technischen Fehlertexte
- kurze deutsche Erklärung
- eine klare nächste Aktion, wenn sinnvoll

Standard bei Ladefehlern:

```text
Daten konnten gerade nicht geladen werden.
```

---

## 23. Einstellungen

Einstellungsseiten dürfen nicht wie eine Sammlung unfertiger Module wirken.

Jede Karte in den Einstellungen ist genau eine von drei Arten:

- Bearbeitbare Karte mit echter Speicherung.
- Link-Karte zu einer bestehenden echten Seite.
- Info-Karte ohne Klick, wenn eine Funktion noch nicht bereit ist.

Verboten:

- Fake-Klicks
- leere Detailseiten
- Buttons ohne Speicherung
- Platzhalter, die wie echte Funktionen wirken
- technische Begriffe wie `Slug`, `RPC`, `Token` oder `API`

Wenn Daten fehlen, zeigt die UI einen ruhigen deutschen Status statt Demo-Daten.

---

## 24. V2 Hinweise

V2 Design kann enthalten:

- vollständiges Komponenten-System
- Theme Editor
- Branchen-Templates
- Bildgalerie
- KI-Bildverbesserung
- dynamische Promotionflächen
- Wochenplan UI
- Multi-Branch UI
- Enterprise Branding Kontrolle
- Mehrsprachigkeit EN/ZH

V1 bleibt fokussiert und deutsch.

---

## 25. LOCK Kriterien

Design System gilt als LOCK, wenn:

- alle Hauptflächen mobile-first funktionieren
- Onboarding wie Wizard wirkt
- Dashboard wie täglicher Arbeitsplatz wirkt
- Kundenportal in Sekunden verständlich ist
- Staff Portal im Stress nutzbar ist
- QR/PDF professionell wirkt
- Karten responsiv sind
- Logos nicht verzerrt werden
- keine englischen UI-Texte erscheinen
- keine technischen Begriffe sichtbar sind
- echte Restaurantseiten keine Demo-Daten anzeigen
- Build erfolgreich ist

---

## 26. Codex-Regeln

Wenn Codex UI baut:

1. Diese Datei zuerst lesen.
2. Mobile First.
3. Deutsch in UI.
4. Eine Seite = Eine Entscheidung.
5. Keine technischen Begriffe.
6. Keine neuen Farben ohne Grund.
7. Keine langen Formulare, wenn Wizard besser ist.
8. Karten responsiv machen.
9. Logos proportional halten.
10. Bei aktiver Supabase-Verbindung leere Zustände statt Demo-Daten anzeigen.
11. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
