# WUXUAI Bonus Engineering Bible V1
# 00_START_HIER.md

Status: 🟢 FIX  
Zweck: Einstieg, Arbeitsregeln und Projektwahrheit für Codex, Entwickler und zukünftige Teammitglieder.  
Sprache: Deutsch als Produkt- und Entwicklungssprache für V1.  

---

## 1. Warum diese Engineering Bible existiert

WUXUAI Bonus ist inzwischen kein loses Experiment mehr. Das Projekt besteht aus mehreren Oberflächen, mehreren Nutzerrollen, einer echten Supabase-Staging-Umgebung, einem mehrstufigen Onboarding, einem Bonuspunkte-System, einer Smart Reward Engine, Kundenportal, Staff-Portal und einer später geplanten WUXUAI-Admin-Oberfläche.

In den bisherigen Gesprächen wurden viele Produktentscheidungen getroffen. Diese Entscheidungen dürfen nicht im Chat verstreut bleiben. Diese Engineering Bible ist deshalb ab jetzt die zentrale Wahrheit für das Projekt.

**Grundregel:**

> Chat = Diskussion.  
> Engineering Bible = Wahrheit.  
> Code = Umsetzung der Wahrheit.

Wenn Codex, ein Entwickler oder ein späteres Teammitglied eine Entscheidung treffen muss, wird zuerst diese Engineering Bible gelesen. Der Code darf niemals gegen die Bible arbeiten.

---

## 2. Projektname und Produktidentität

### 2.1 Offizieller Produktname für V1

**WUXUAI Bonus**

Frühere Bezeichnungen wie „Restaurant Bonus“, „Restaurant Growth OS“ oder „Restaurant Bonus OS“ dürfen im Code oder in internen technischen Dateinamen vorkommen, sind aber nicht die langfristige Produktpositionierung.

### 2.2 V1 Marktfokus

V1 fokussiert bewusst auf:

- Restaurants
- Cafés
- kleine Gastro-Betriebe

Das Ziel ist nicht, sofort alle Branchen zu bedienen. V1 soll Cashflow, echte Pilotkunden und ein funktionierendes Restaurant-Portal erzeugen.

### 2.3 V2 Erweiterung

V2 soll die Plattform auf weitere lokale Betriebe erweitern:

- Bäckereien
- Bubble-Tea-Läden
- Friseure
- Kosmetikstudios
- Einzelhandel
- Blumenläden
- Hofläden
- Vinotheken
- weitere lokale Geschäfte

Die Architektur soll deshalb langfristig geschäftsneutral bleiben. Die V1-UX bleibt aber Restaurant-fokussiert.

---

## 3. Mission

WUXUAI Bonus ist nicht einfach ein digitales Stempelkarten-System.

Die Mission lautet:

> Das einfachste Bonusprogramm für lokale Unternehmen, das aus einmaligen Kunden wiederkehrende Stammkunden macht.

Das System soll Restaurantbesitzern helfen:

- neue Gäste zu Mitgliedern zu machen,
- Gäste zum Wiederkommen zu motivieren,
- Punkte und Belohnungen wirtschaftlich zu steuern,
- Empfehlungen über Bonus Boost zu fördern,
- ohne Schulung und ohne technische Kenntnisse zu starten.

Der Restaurantbesitzer soll nicht lernen müssen, wie ein Bonuspunkte-System funktioniert. Die Software übernimmt die Logik.

---

## 4. WU Philosophie

Die zentrale WUXUAI-Philosophie lautet:

> Menschen sollen sich auf ihr Ziel konzentrieren – nicht auf das Werkzeug.

Für WUXUAI Bonus bedeutet das konkret:

- Restaurantbesitzer arbeiten mit Produkten, Preisen, Gästen und Öffnungszeiten.
- WUXUAI arbeitet im Hintergrund mit Punkten, Wahrscheinlichkeiten, Rentabilität, RLS, RPCs, Tokens und Datenbanklogik.
- Gäste sehen Belohnungen, Vorteile und ihren Fortschritt.
- Gäste sehen keine technische Bonuslogik.
- Mitarbeiter sehen nur das, was sie im Alltag brauchen.

Diese Philosophie ist nicht dekorativ. Sie entscheidet jede Produkt- und UX-Frage.

Wenn eine Funktion den Restaurantbesitzer zwingt, Punkte, Formeln oder technische Regeln zu verstehen, ist die Funktion falsch gestaltet.

---

## 5. Cashflow First

WUXUAI Bonus V1 wird nach dem Prinzip **Cashflow First** gebaut.

Das bedeutet:

- V1 muss schnell pilotfähig werden.
- V1 muss Restaurants echten Nutzen zeigen.
- V1 darf nicht durch perfekte, aber unnötige Konfigurationen verzögert werden.
- Alles, was später bearbeitet werden kann, gehört nicht ins Onboarding.
- Alles, was Restaurantbesitzer nicht sofort brauchen, wird in V2 oder spätere Versionen verschoben.

Beispiele:

- Onboarding fragt nicht nach Produktbildern für jede Belohnung.
- Onboarding fragt nicht nach komplexen Angeboten.
- Onboarding fragt nicht nach Filialstrukturen.
- Onboarding fragt nicht nach manuellen Punkteschwellen.

V1 muss ein Restaurant in wenigen Minuten startfähig machen.

---

## 6. Portal-Architektur

WUXUAI Bonus besteht aus getrennten Oberflächen. Diese dürfen nicht vermischt werden.

### 6.1 WUXUAI Admin

Nur für den Betreiber der SaaS-Plattform.

Aufgaben:

- Organisationen verwalten
- Restaurants verwalten
- Abos verwalten
- Rechnungen verwalten
- Stripe verwalten
- Support
- Feature Flags
- Logs
- Missbrauchserkennung
- Systemwartung

Kein Restaurant sieht diese Oberfläche.

### 6.2 Restaurant Portal

Für Restaurantbesitzer und Restaurant-Manager.

Aufgaben:

- Onboarding
- Dashboard / Heute im Restaurant
- Gäste
- Belohnungen
- Willkommensgeschenke
- QR Center
- Mitarbeiter
- Einstellungen

Aktuell arbeiten wir hauptsächlich an diesem Portal.

### 6.3 Staff Portal

Für Kellner und Mitarbeiter.

Aufgaben:

- Gast suchen
- Gast QR prüfen
- Belohnung einlösen
- Punktevergabe bestätigen
- PIN / Staff Session nutzen

Diese Oberfläche muss extrem schnell und einfach bleiben.

### 6.4 Customer Portal

Für Gäste.

Aufgaben:

- Mitglied werden
- Mein Bonus ansehen
- Punkte sehen
- Belohnungen sehen
- Bonus Boost sehen
- Freund einladen
- QR zeigen

Keine Restaurant- oder Admin-Funktionen.

### 6.5 One Persona – One Interface

Jede Rolle bekommt ihre eigene Oberfläche.

> Eine Rolle = eine Oberfläche = ein Ziel.

Es darf keine große Oberfläche für alle geben.

---

## 7. Entwicklungsprinzip: Flow → Review → Lock

WUXUAI Bonus wird nicht chaotisch gebaut.

Jede Funktion wird nach diesem Rhythmus entwickelt:

1. Flow oder Seite definieren
2. Business-Ziel klären
3. UX-Ziel klären
4. Codex-Prompt schreiben
5. Codex baut
6. Bericht prüfen
7. Restaurant Reality Check
8. Bugs fixen
9. LOCK oder NOT READY entscheiden

Ein Flow ist erst fertig, wenn er aus Sicht von Restaurant, Gast und Mitarbeiter funktioniert.

Nicht nur der Build muss grün sein. Der Alltag muss funktionieren.

---

## 8. LOCK Status-Regeln

### 🟢 FIX

Eine Entscheidung ist endgültig für V1. Sie darf nicht ohne neue CTO-Entscheidung geändert werden.

Beispiele:

- Deutsch zuerst.
- Mobile First.
- Aktionen aus V1 entfernen.
- Onboarding als Installationsassistent.
- Willkommensgeschenke eigener Bereich.
- Punkte werden automatisch aus Europreisen berechnet.

### 🟡 V2

Architektur vorbereiten, aber noch nicht vollständig bauen.

Beispiele:

- Filialen zusammenführen.
- Wochenplan für Belohnungen.
- Dynamische Promotionflächen.
- Mehrsprachigkeit.
- Enterprise-Regeln.

### 🔵 IDEE

Noch nicht beschlossen. Nicht entwickeln.

Codex darf Ideen niemals automatisch bauen.

---

## 9. Sprache und i18n

### 9.1 V1 Sprache

V1 ist zu 100 % Deutsch.

Alle sichtbaren Texte müssen Deutsch sein:

- Buttons
- Labels
- Hinweise
- Wizard-Texte
- Fehlertexte
- Dashboard-Texte
- PDF-Texte
- Kundenportal-Texte

Englische UI-Texte sind V1-Blocker.

### 9.2 Englisch ist nur erlaubt für technische Begriffe

Erlaubt:

- Dateinamen
- Funktionsnamen
- Klassen
- APIs
- Bibliotheken
- technische Identifikatoren

Nicht erlaubt:

- „You selected“
- „Reward“
- „Offer“
- „Campaign“
- „Save later“
- englische Dashboard- oder Wizard-Texte

### 9.3 i18n später

Die Architektur soll i18n-fähig bleiben. Englisch und Chinesisch werden aber erst nach deutschem V1 Feature Freeze übersetzt.

Grund:

Während V1 ändern sich Texte häufig. Drei Sprachen würden jede Änderung verdreifachen.

---

## 10. UX Grundgesetze

### 10.1 One Screen = One Decision

Jede Seite und jeder Wizard-Schritt hat genau eine Aufgabe.

Nicht:

- fünf Formulare
- fünf Entscheidungen
- mehrere offene Bereiche

Sondern:

- eine Frage
- eine Entscheidung
- Weiter

### 10.2 Mobile First

Jede neue Oberfläche wird zuerst für ca. 390 px Breite entwickelt.

Reihenfolge:

1. Mobile
2. Tablet
3. Desktop

Restaurantbesitzer und Mitarbeiter nutzen häufig Handy oder Tablet. Desktop darf nicht die einzige Wahrheit sein.

### 10.3 Keine technischen Begriffe

Restaurantbesitzer denken nicht in:

- RPC
- RLS
- Token
- Campaign
- Reward Threshold
- Amount Based
- Staff Session

Sichtbare UI muss in Restaurant-Sprache sprechen:

- Gäste
- Punkte
- Belohnungen
- Willkommensgeschenke
- QR-Code
- Mitarbeiter
- Startpaket
- Heute

### 10.4 Keine unnötigen Buttons

Im Onboarding gibt es pro Seite möglichst nur einen primären Call-to-Action.

Wenn der Restaurantbesitzer mehr als drei Buttons gleichzeitig sieht, ist die Seite wahrscheinlich zu komplex.

### 10.5 Autosave statt Speichern-Angst

Onboarding speichert automatisch.

Der Restaurantbesitzer soll nie denken:

> Habe ich gespeichert?

Deshalb gibt es im Onboarding keinen sichtbaren Button „Speichern und später fortsetzen“.

---

## 11. Onboarding Grundregel

Onboarding ist ein Installationsassistent.

Nicht:

- Einstellungen
- Admin-Bereich
- Bearbeitungsseite

Sondern:

> Restaurant einrichten → Startpaket herunterladen → Restaurant starten.

Während Onboarding nicht abgeschlossen ist:

- Arbeitsbereich gesperrt
- nur Onboarding und ggf. Einstellungen erlaubt
- Dashboard, Gäste, Belohnungen, QR Center und Mitarbeiter nicht nutzbar

Nach Abschluss:

- Arbeitsbereich freigeschaltet
- Onboarding wird nicht automatisch neu gestartet
- Restaurant landet im Dashboard

---

## 12. V1 Onboarding-Minimalismus

Onboarding fragt nur nach dem, was für den Start wirklich notwendig ist.

Im Onboarding bleiben:

- Restaurantdaten
- Logo
- Öffnungszeiten
- Bonus Designer
- Willkommens-Belohnungen als Kategorien
- Restaurant Starter Kit
- Startklar

Aus dem Onboarding entfernt:

- Produktbilder für Belohnungen
- Angebotsbilder
- Angebots-PDFs
- komplexe Angebote
- manuelle Punkteschwellen
- lange Produktbeschreibungen
- mehrere offene Formulare

Alles, was später bearbeitet werden kann, gehört in den Arbeitsbereich.

---

## 13. Restaurant Starter Kit

Das Restaurant Starter Kit ist der druckfertige Startpunkt nach dem Onboarding.

Im Onboarding gibt es nur einen Hauptbutton:

> 📦 Restaurant Starter Kit herunterladen

Keine SVG-Downloads.
Keine einzelnen PNG-Downloads.
Keine erweiterten Optionen im Onboarding.

Einzelne QR-Downloads, Sticker, Flyer und weitere Druckoptionen gehören später in das QR Center.

Das Starter Kit enthält:

- Restaurant QR für neue Gäste
- Mein Bonus QR für Punkte sammeln
- Kassen-Aufsteller
- Eingangs-Aufsteller
- dezenter Footer „Powered by WUXUAI Bonus • www.wuxuaisbi.com“

Das Logo muss proportional skaliert werden und darf niemals verzerrt oder zugeschnitten werden.

---

## 14. Dashboard Grundregel

Das Dashboard heißt in der Hauptüberschrift:

> Heute im Restaurant

Es ist der tägliche Arbeitsplatz des Restaurantbesitzers.

Es beantwortet in 5 Sekunden:

1. Wie läuft mein Bonusprogramm heute?
2. Kommen neue Gäste?
3. Kommen Stammgäste zurück?
4. Muss ich heute etwas tun?
5. Was bringt mir heute mehr Umsatz?

Das Dashboard zeigt keine technischen Warnungen, keine leeren Diagramme und keine Entwicklerdaten.

Das Modul „Aktionen“ wird aus V1 entfernt. Der Button „Neue Aktion starten“ darf nicht mehr erscheinen.

---

## 15. Belohnungen und Willkommensgeschenke

### 15.1 Belohnungen

Belohnungen sind normale Punkte-Einlösungen.

Restaurantbesitzer geben ein:

- Produkt
- Preis
- Foto optional
- Aktiv/Inaktiv

Die Software berechnet automatisch:

- benötigte Punkte
- geschätzten Umsatz bis Einlösung
- Wirtschaftlichkeitsstatus

Restaurantbesitzer geben niemals Punkte manuell ein.

### 15.2 Willkommensgeschenke

Willkommensgeschenke sind ein eigener Bereich.

Sie sind nicht dasselbe wie Punkte-Belohnungen.

Sie werden einmalig nach Registrierung zugeteilt, bleiben zuerst gesperrt und werden erst nach der ersten bezahlten Konsumation freigeschaltet.

Einlösung erst beim nächsten Besuch.

Freunde-Einladung hat Vorrang:

- Normale Registrierung → Willkommensgeschenk
- Registrierung über Freund → kein Willkommensgeschenk, dafür Bonus Boost nach erster Konsumation

---

## 16. Smart Reward Engine

Die Smart Reward Engine ist ein Kernbestandteil von WUXUAI Bonus.

Prinzip:

> Der Restaurantbesitzer arbeitet mit Euro.  
> WUXUAI arbeitet mit Punkten.

Aufgaben:

- Europreise in Punkte umrechnen
- Wirtschaftlichkeit prüfen
- Willkommensgeschenk-Quoten verwalten
- teure Geschenke seltener vergeben
- Tageslimits vorbereiten
- Rentabilität schützen

Diese Logik darf nicht hart im Frontend verstreut sein. Sie muss zentral verwaltet werden.

---

## 17. Bonus Boost

Bonus Boost ist keine einfache Empfehlungsfunktion.

Bonus Boost ist emotionale Kundenbindung.

Regel:

- Gast lädt Freund ein
- Freund registriert sich
- Boost noch nicht aktiv
- Freund kommt essen
- Freund sammelt erstmals Punkte
- dann erhalten beide Bonus Boost

Bonus Boost ist in V1 ein sichtbarer emotionaler Kern:

- im Kundenportal oben sichtbar
- mit Countdown
- mit „Heute sammelst du 2× Punkte“
- im Starter Kit als KPI-Kommunikation

Starter Kit KPI-Box:

- 🔥 Du 2× Punkte
- 👥 Freund 2× Punkte
- 📅 +30 Tage Bonus Boost

---

## 18. Datenbank und Sicherheit

Sicherheit wird serverseitig entschieden.

Frontend darf niemals allein über Berechtigungen entscheiden.

Grundsätze:

- RLS bleibt primäre Datenbank-Sicherheit
- RPCs für öffentliche oder sensible Aktionen
- keine öffentlichen Tabellenreads für sensible Daten
- staff PIN / staff session serverseitig validiert
- Token gehasht speichern
- QR-Token zufällig und rotierbar
- Audit Log für wichtige Aktionen

Device ID ist nur ein Missbrauchssignal, keine harte Sperre.

---

## 19. Multi-Branch V2 Vorbereitung

V1:

- ein Restaurant = eine Organisation = eine Filiale
- eigenes Abo
- eigene Punkte
- eigene Gäste
- eigene Belohnungen

V2:

- Organisation mit mehreren Filialen
- gemeinsame oder filiallokale Punkte
- Filialen zusammenführen
- Filiallimits im Abo
- zentrale Verwaltung für Ketten

V1 UI darf keine Filialkomplexität zeigen. Die Architektur darf aber vorbereitet sein.

---

## 20. Codex Arbeitsregeln

Codex muss immer zuerst relevante Bible-Dateien lesen.

Codex darf nicht:

- neue Business-Logik erfinden
- englische UI-Texte erzeugen
- technische Begriffe in UI schreiben
- Onboarding verkomplizieren
- Aktionen wieder einführen
- Punkte manuell vom Restaurant erfassen lassen
- Willkommensgeschenke mit Punkte-Belohnungen vermischen
- V2 Features in V1 aktivieren, wenn sie nur vorbereitet werden sollen

Codex muss:

- Deutsch schreiben
- Mobile First berücksichtigen
- Build ausführen
- geänderte Dateien melden
- Risiken nennen
- LOCK oder NOT READY zurückgeben

---

## 21. Wie diese Bible erweitert wird

Jede Datei wird Schritt für Schritt vollständig ausgebaut.

Nicht alles auf einmal.

Arbeitsweise:

1. Eine Datei vollständig schreiben
2. Datei in ZIP einbauen
3. Inhalt prüfen
4. LOCK setzen
5. nächste Datei

Diese Datei `00_START_HIER.md` ist die Grundlage. Alle weiteren Dateien bauen darauf auf.

---

## 22. Aktueller Stand dieser Datei

Status: 🟢 FIX

Diese Datei definiert:

- Produktmission
- Portale
- Entwicklungsregeln
- UX-Grundgesetze
- Onboarding-Prinzipien
- Restaurant Starter Kit
- Dashboard-Grundregel
- Belohnungen und Willkommensgeschenke
- Smart Reward Engine
- Bonus Boost
- Sicherheitsprinzipien
- V2 Vorbereitung
- Codex-Regeln

Diese Datei darf nur geändert werden, wenn eine neue CTO-Entscheidung getroffen wird.
