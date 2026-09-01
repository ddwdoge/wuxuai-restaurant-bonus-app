# 04_RESTAURANT_PORTAL.md

# WUXUAI Bonus V1 -- Restaurant Portal

Status: **LOCK**

Diese Datei beschreibt das Restaurant Portal als zentrale
Arbeitsoberfläche für Restaurantbesitzer und Restaurantmanager.\
Das Restaurant Portal ist nicht das WUXUAI Admin-Portal, nicht das
Kundenportal und nicht das Staff Tablet. Es ist die tägliche Oberfläche
des Betriebs.

------------------------------------------------------------------------

## 1. Ziel des Restaurant Portals

Das Restaurant Portal soll dem Restaurantbesitzer helfen, sein
Bonusprogramm im Alltag zu führen.

Der Besitzer soll nicht denken:

> „Ich verwalte Software."

Er soll denken:

> „Ich sehe, was heute mit meinen Gästen passiert und was ich als
> Nächstes tun muss."

Das Restaurant Portal beantwortet täglich:

1.  Wie läuft mein Bonusprogramm heute?
2.  Kommen neue Gäste?
3.  Kommen Stammgäste zurück?
4.  Werden Punkteeinlösungen genutzt?
5.  Bringt das System wiederkehrende Besuche?
6.  Muss ich heute etwas tun?

------------------------------------------------------------------------

## 2. Abgrenzung der Oberflächen

WUXUAI Bonus besitzt vier getrennte Oberflächen.

### 2.1 WUXUAI Admin

Nur für WUXUAI intern.

Beispiele: - SaaS-Kunden verwalten - Abos verwalten - Rechnungen
verwalten - Support - Feature Flags - Logs - Missbrauch prüfen

Restaurantbesitzer sehen diese Oberfläche niemals.

### 2.2 Restaurant Portal

Für Restaurantbesitzer und Restaurantmanager.

Beispiele: - Dashboard - Gäste - Punkteeinlösung - Willkommensgeschenke - QR
Center - Mitarbeiter - Einstellungen

Hier arbeiten wir aktuell.

### 2.3 Staff Tablet

Für Mitarbeiter/Kellner.

Beispiele: - Gast suchen - QR prüfen - Punkteeinlösung prüfen - PIN/Staff
Session - schnelle Aktionen ohne Admin-Komplexität

### 2.4 Kundenportal

Für Gäste.

Beispiele: - Mein Bonus - Punkte - Punkteeinlösungen - Bonus Boost - QR zeigen

------------------------------------------------------------------------

## 3. Grundregel: One Persona -- One Interface

Jede Rolle bekommt ihre eigene Oberfläche.

Verboten: - Restaurantbesitzer-Funktionen im Kundenportal - WUXUAI
Admin-Funktionen im Restaurant Portal - komplexe Admin-Funktionen im
Staff Tablet - Mitarbeiter-PIN-Prozesse im Kundenportal

Diese Trennung verhindert Komplexität.

------------------------------------------------------------------------

## 4. Navigation im Restaurant Portal

V1 Navigation:

1.  Dashboard
2.  Gäste
3.  Punkteeinlösung
4.  Willkommensgeschenke
5.  QR Center
6.  Mitarbeiter
7.  Einstellungen

Das Modul **Aktionen** existiert in V1 nicht.

### 4.1 Warum Aktionen entfernt wurden

Der Begriff „Aktionen" ist zu unklar.

Ein Restaurantbesitzer fragt sich: - Ist das ein Gutschein? - Ist das
eine Kampagne? - Ist das ein Rabatt? - Ist das ein Menü? - Ist das eine
Punkteeinlösung?

Diese Unklarheit widerspricht der WUXUAI-Philosophie.

Alle relevanten Mechanismen gehören in eindeutige Bereiche: -
Punkteprodukte → Punkteeinlösung - Anmeldungsgeschenke →
Willkommensgeschenke - Empfehlungen → Bonus Boost - Druck/QR → QR Center

------------------------------------------------------------------------

## 5. Dashboard

### 5.1 Name und Funktion

Menüpunkt: **Dashboard**\
Hauptüberschrift: **Heute im Restaurant**\
Untertitel: **Dein Bonusprogramm auf einen Blick.**

Das Dashboard ist die wichtigste Seite des Restaurant Portals.

### 5.2 Ziel

Das Dashboard soll innerhalb von 5 Sekunden zeigen:

-   Neue Mitglieder heute
-   Vergebene Bonuspunkte heute
-   Eingelöste Punkteeinlösungen
-   Bonus Boost Einladungen
-   Wiederkehrende Gäste

### 5.3 Was nicht auf das Dashboard gehört

Nicht anzeigen: - QR-Code bereit - Device Warnungen - Referral
Warnungen - interne Statusinformationen - technische Warnungen - leere
Diagramme - leere Teamkarten - Debug-Daten - Entwicklerbegriffe

### 5.4 Hauptaktion

Der Button **„Neue Aktion starten"** wird entfernt.

Grund: Aktionen existieren nicht in V1.

Das Dashboard besitzt keinen künstlichen Hauptbutton, wenn dieser nicht
klar zum aktuellen Produktziel gehört.

### 5.5 Schnellzugriffe

Das Dashboard darf Schnellzugriffe anzeigen:

-   QR Center
-   Punkteeinlösung
-   Gäste
-   Mitarbeiter

Diese Karten sind Navigation, keine KPI.

### 5.6 Heute für dich

Das Dashboard besitzt eine Karte:

**Heute für dich**

Diese Karte zeigt genau eine Empfehlung.

V1: - Platzhalter oder einfache Empfehlung, zum Beispiel „Neue Punkteeinlösung
erstellen".

Später dynamisch: - Bonus Boost aktivieren - Freunde einladen - Neue
Punkteeinlösung - Geburtstagsaktion - Saisonhinweis

Regel: Immer nur eine Empfehlung. Keine Liste.

------------------------------------------------------------------------

## 6. Punkteeinlösung

Punkteeinlösung ist der zentrale Bereich für Produkte, die Gäste mit gesammelten Punkten einlösen können.

### 6.1 Grundregel

Restaurantbesitzer geben keine Punkte ein.

Restaurantbesitzer geben ein: - Produkt - Preis - Foto optional -
Aktiv/Inaktiv

WUXUAI berechnet: - Einlösequote - geschätzte Konsumation bis zur
Einlösung - benötigte Punkte - Wirtschaftlichkeit - fehlende Punkte -
geschätzten fehlenden Umsatz

Die Einlösequote kommt aus dem Onboarding-Schritt **Punkteeinlösung**:

- Sparsam: 3 %
- Normal: 5 %
- Großzügig: 8 %
- Premium: 10 %

Formel:

```text
Geschätzte Konsumation = Produktpreis / Einlösequote
Benötigte Punkte = Geschätzte Konsumation / amount_per_point
```

Beispiel:

```text
Produktpreis: 5,40 €
Normal: 5 %
Geschätzte Konsumation: 108,00 €
```

### 6.2 Neue Punkteeinlösung

Neue Punkteeinlösung wird per Wizard erstellt.

Schritte: 1. Produktart wählen 2. Produktpreis eingeben 3.
Automatische Punkteberechnung sehen 4. Foto optional hochladen 5.
Vorschau prüfen 6. Punkteeinlösung erstellen

### 6.3 Gespeicherte Punkteeinlösungen

Gespeicherte Punkteeinlösungen werden als Karten angezeigt.

Jede Karte enthält: - Bild oder Standardbild - Name - Kategorie -
Produktpreis - automatisch berechnete Punkte - Status Aktiv/Inaktiv -
Bearbeiten - Aktivieren/Deaktivieren

Produktbilder in Punkteeinlösungen müssen vollständig sichtbar bleiben.

Regel:

- echte Produktfotos nicht hart zuschneiden
- `object-fit: contain` verwenden
- originales Seitenverhältnis erhalten
- heller ruhiger Bildbereich
- Leerraum ist besser als abgeschnittene Speisen
- Kartenhöhe bleibt kontrolliert, damit das Layout nicht springt

### 6.4 Bearbeiten

Restaurant kann später ändern: - Foto - Name - Preis - Kategorie -
Aktiv/Inaktiv

Nach Preisänderung: - Punkte werden automatisch neu berechnet.

Verboten: - manuelle Punkte-Eingabe - Punkte-Dropdown -
Restaurantbesitzer muss Rechenlogik verstehen

------------------------------------------------------------------------

## 7. Willkommensgeschenke

Willkommensgeschenke sind ein eigener Bereich und kein Teil der normalen
Punkteeinlösungen.

### 7.1 Ziel

Willkommensgeschenke sind ein Dankeschön für neue Gäste.

Sie werden einmalig nach der Registrierung zugeteilt, aber nicht sofort
eingelöst.

### 7.2 Eigener Menüpunkt

Im Restaurant Portal gibt es einen eigenen Menüpunkt:

**Willkommensgeschenke**

Nicht verstecken unter Punkteeinlösung, wenn dadurch Verwirrung entsteht.

### 7.3 Trennung

Punkteeinlösungen: - Kunde sammelt Punkte - Kunde löst später ein

Willkommensgeschenke: - Kunde registriert sich - Geschenk wird
zugeteilt - Geschenk bleibt gesperrt - erste bezahlte Konsumation
schaltet es frei - Einlösung erst beim nächsten Besuch

### 7.4 Bearbeitbare Felder

Restaurant kann bearbeiten: - Name - Kategorie - Wertgrenze in € -
Foto - Standardbild behalten - Aktiv/Inaktiv

Keine Punkte. Keine Einlösungspunkte. Keine Punkteberechnung.

Nach dem Onboarding bleibt der Bereich vollständig bearbeitbar.
Änderungen werden im Restaurant Portal gespeichert und sind nach Reload weiter
vorhanden.

Aktive Willkommensgeschenke bilden den Pool für zukünftige normale
Erstanmeldungen.

Deaktivierte Willkommensgeschenke werden nicht mehr neu zugeteilt.

Bereits eingelöste Willkommensgeschenke werden durch spätere Bearbeitung nicht
wieder aktiviert.

### 7.5 Standardwerte

-   Kaffee bis 4 €
-   Getränk bis 4 €
-   Dessert bis 6 €
-   Vorspeise bis 6 €
-   Menü bis 16 €
-   Hauptspeise bis 20 €
-   Sushi bis 20 €
-   Eigene Überraschung bis 15 €

### 7.6 Freunde-Einladung

Registrierung ohne Freund: - Willkommensgeschenk

Registrierung über Freund: - kein Willkommensgeschenk - stattdessen
Bonus Boost nach erster Konsumation

Freunde-Einladung hat immer Vorrang.

------------------------------------------------------------------------

## 8. QR Center

### 8.1 Onboarding

Im Onboarding gibt es nur:

**Restaurant Starter Kit herunterladen**

Keine Einzel-Downloads. Keine SVG. Keine erweiterten Optionen.

### 8.2 Nach Onboarding

Im QR Center dürfen später Einzeldateien angeboten werden: - Restaurant
QR PNG - Mein Bonus QR PNG - PDF - Sticker - Aufsteller - Tischkarte -
Fensteraufkleber

### 8.3 Zweck

QR Center ist der Ort für Druckmaterial und QR-Verwaltung.

Nicht das Onboarding.

------------------------------------------------------------------------

## 9. Mitarbeiter

Mitarbeiterbereich dient der einfachen Verwaltung von Staff-Zugängen.

V1 Ziele: - Mitarbeiter anlegen - PIN vergeben - Aktiv/Inaktiv -
Aktivität sehen

Kein komplexes Rollenmodell in V1.

Staff Aktionen müssen serverseitig geprüft werden.

------------------------------------------------------------------------

## 10. Gäste

Gästebereich dient der Übersicht über Kunden.

V1: - Name - Punkte - Status - letzte Aktivität - Bonus Boost aktiv -
Punkteeinlösungen

Später: - Stammkundenstatus - Wiederkehrhäufigkeit -
Lieblingsbelohnungen - Wochenplanung

------------------------------------------------------------------------

## 11. Einstellungen

Einstellungen sind ein Menü, kein langes Formular.

Unterseiten: - Restaurantdaten - Aussehen - Öffnungszeiten -
Bonusprogramm - Konto & Testphase

Regel: Jede Karte ist klickbar. Jede Unterseite hat ein klares Ziel.

------------------------------------------------------------------------

## 12. UX-Regeln für das Restaurant Portal

### 12.1 Mobile First

Alle Seiten zuerst für 390 px Breite denken.

### 12.2 Keine Entwicklerbegriffe

Verboten: - Campaign - Reward URL - Token - Device Warning - Referral
Warning - RPC - Slug - JSON

### 12.3 Restaurant-Sprache

Verwenden: - Gäste - Punkte - Punkteeinlösung - Willkommensgeschenke -
Kassa - QR - Mitarbeiter - Startklar

### 12.4 Keine langen Formulare

Wenn ein Vorgang komplex wird: - Wizard verwenden - Ein Bildschirm =
Eine Entscheidung

------------------------------------------------------------------------

## 13. Technische Regeln

### 13.0 Onboarding Bonus-Designer

Onboarding Schritt 4 heißt **Punkteeinlösung**, nicht mehr „Belohnen“.

In diesem Schritt legt der Restaurantbesitzer fest, wie viel Gegenwert Gäste
nach mehreren Besuchen einlösen können.

Für diese Punkteeinlösung gelten feste V1-Rückgabequoten:

- Sparsam: 3 %
- Normal: 5 %
- Großzügig: 8 %
- Premium: 10 %

Berechnung:

```text
Konsumation = Durchschnittsbon × Besuche
Einlösewert = Konsumation × Rückgabequote
```

Beispiel:

```text
18 € × 5 Besuche = 90 €
Sparsam: 3 % von 90 € = 2,70 €
Normal: 5 % von 90 € = 4,50 €
Großzügig: 8 % von 90 € = 7,20 €
Premium: 10 % von 90 € = 9,00 €
```

Diese Rückgabequoten gelten nur für den Onboarding-Bonus-Designer und dürfen
nicht mit späteren Bonus-Boost-, Tages-PIN- oder Einlöse-Regeln vermischt
werden.

### 13.1 RLS bleibt Quelle der Sicherheit

Frontend darf unterstützen, aber nicht Sicherheit ersetzen.

### 13.2 Onboarding Gate

Wenn Onboarding nicht abgeschlossen: - nur Onboarding und Einstellungen
erlaubt - andere Admin-Seiten blockiert

Wenn abgeschlossen: - Restaurant Portal freigeschaltet

### 13.3 Settings Route

/admin/settings darf niemals Onboarding rendern.

SettingsPage ist eigene Seite.

### 13.4 Onboarding Fortschritt

Onboarding-Fortschritt ist reload-sicher.

Gespeichert werden:

- aktueller Schritt
- Formularwerte
- Punkteeinlösungsquote
- Willkommens-Belohnungen
- Branding und Logo-Link
- Öffnungszeiten
- Checkliste

Jeder Schrittwechsel wird sofort gespeichert. Zusätzlich läuft Autosave bei
Feldänderungen.

Beim erneuten Öffnen lädt der Wizard den gespeicherten Draft aus Supabase und
öffnet den zuletzt gespeicherten Schritt.

Wenn `onboarding_status` abgeschlossen ist, öffnet der Restaurantbesitzer das
Dashboard und nicht erneut Schritt 1.

### 13.5 Einstellungen mit echten Daten

Einstellungen dürfen in V1 keine Platzhalter-Funktionen zeigen.

Regel:

- Restaurantdaten laden echte Tenant-Daten.
- Restaurantname und Telefonnummer werden direkt gespeichert, wenn die Felder vorhanden sind.
- Branding zeigt echte Logo- und Farbdaten.
- Logo-Upload nutzt die bestehende Restaurant-Mediathek.
- Öffnungszeiten bearbeiten die gespeicherten `opening_hours`.
- Punkteeinlösung, Willkommensgeschenke, Mitarbeiter/Tages-PIN und QR Center sind echte Links.
- Abo & Testphase zeigt echte Subscription-Daten oder einen klaren Nicht-verfügbar-Zustand.
- Abo & Testphase darf keine kaputten DB-Spalten abfragen. Wenn Stripe-/Payment-Felder noch fehlen, zeigt die Seite einen ruhigen V1-Status.
- V1 Testphase: 30 Tage kostenlos, keine Kreditkarte, danach Monatsabo.
- Solange Stripe Checkout/Webhooks nicht echt aktiv sind, gibt es keine Fake-Zahlung und keinen Fake-Erfolg.
- Keine klickbare Karte darf ins Leere führen.
- Keine Karte darf wie eine Funktion wirken, wenn dahinter keine echte Funktion steht.

### 13.5 Echte Daten statt Demo-Daten

Wenn Supabase aktiv ist, zeigen Restaurantseiten ausschließlich echte
Tenant-Daten des aktuellen Restaurants.

Regel:

- keine Demo-Punkteeinlösungen
- keine Demo-Gäste
- keine Demo-Willkommensgeschenke
- keine Demo-KPI
- keine Platzhalterkarten, die wie echte Daten wirken

Wenn keine echten Daten vorhanden sind, zeigt die UI einen ruhigen leeren
Zustand.

Erlaubt:

- Demo-Daten nur ohne Supabase-Konfiguration
- Demo-Daten nur in explizitem Demo-Modus

Ladefehler zeigen keine technischen Details im UI.

Standardtext:

```text
Daten konnten gerade nicht geladen werden.
```

------------------------------------------------------------------------

## 14. Was ausdrücklich verboten ist

-   Aktionen in V1 wieder einführen
-   Dashboard mit technischen Warnungen überladen
-   Restaurantbesitzer Punkte berechnen lassen
-   Willkommensgeschenke mit Punkteeinlösungen vermischen
-   SVG als Hauptdownload im Onboarding
-   mehrere primäre Buttons auf einer Onboarding-Seite
-   englische UI-Texte in V1
-   lange Admin-Formulare ohne Wizard
-   Demo- oder Platzhalterdaten in echten Restaurantseiten anzeigen

------------------------------------------------------------------------

## 15. V2 Hinweise

V2 vorbereitet: - Filialen - Wochenplan für Punkteeinlösungen - automatische
Tagesaktivierung - dynamische „Heute für dich"-Empfehlungen - WUXUAI
Admin Portal - Enterprise-Funktionen - Branding entfernen für höhere
Tarife - weitere Branchen neben Restaurants/Cafés

------------------------------------------------------------------------

## 16. LOCK Kriterien

Restaurant Portal gilt als LOCK, wenn:

-   Dashboard in 5 Sekunden verständlich ist
-   Aktionen vollständig aus UI entfernt sind
-   Punkteeinlösungen ohne manuelle Punkte funktionieren
-   Willkommensgeschenke eigenständig sind
-   QR Center klar vom Onboarding getrennt ist
-   Einstellungen navigierbar sind
-   Mobile Ansicht sauber ist
-   alle Texte Deutsch sind
-   Build erfolgreich ist

------------------------------------------------------------------------

Endstatus: **LOCK**
