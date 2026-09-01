# 06_STAFF_PORTAL.md

# WUXUAI Bonus V1 – Restaurant Tablet / Mitarbeiter-Portal

Status: **LOCK**

Dieses Dokument definiert das Mitarbeiter-Portal von WUXUAI Bonus V1.  
Im Produkt wird diese Oberfläche in der deutschen UI bevorzugt als **Restaurant Tablet** oder **Mitarbeiterbereich** bezeichnet. Technisch darf der Begriff `Staff Tablet` weiterhin in Dateinamen, Komponenten oder internen Funktionen vorkommen. In der sichtbaren Benutzeroberfläche wird jedoch Deutsch verwendet.

---

## 1. Ziel des Mitarbeiter-Portals

Das Mitarbeiter-Portal ist nicht für Strategie, Einstellungen oder Auswertung gedacht.

Es hat nur ein Ziel:

> Mitarbeiter sollen im laufenden Restaurantbetrieb schnell und sicher Bonusvorgänge durchführen können.

Das bedeutet:

- Gast finden
- QR prüfen
- Tages-PIN für Punkte sammeln anzeigen
- Belohnungseinlösung im Restaurant visuell prüfen
- Willkommensgeschenk einlösen, wenn freigeschaltet
- keine persönliche Kellner-PIN auf dem Kundenhandy verwenden
- alles auditieren

Das Mitarbeiter-Portal darf niemals wie ein Admin-System wirken.

Ein Kellner muss im Mittagsstress innerhalb weniger Sekunden verstehen, was zu tun ist.

---

## 2. Abgrenzung zu anderen Oberflächen

### 2.1 Restaurant Portal

Das Restaurant Portal ist für Restaurantbesitzer und Manager.

Dort werden verwaltet:

- Dashboard
- Gäste
- Belohnungen
- Willkommensgeschenke
- QR Center
- Mitarbeiter
- Einstellungen

### 2.2 Mitarbeiter-Portal / Restaurant Tablet

Das Mitarbeiter-Portal ist nur für Tagesarbeit.

Dort werden keine Einstellungen geändert.

### 2.3 Kundenportal

Das Kundenportal ist für Gäste.

Gäste können dort:

- Mein Bonus öffnen
- QR zeigen
- Punkte sehen
- Bonus Boost sehen
- Belohnungen sehen
- Belohnung final bestätigen

Gäste dürfen Belohnungen nur mit finaler Bestätigung verbrauchen.
Nach der Bestätigung ist die Belohnung nicht erneut einlösbar.

### 2.4 WUXUAI Admin

WUXUAI Admin ist nur für Plattformbetreiber.

Mitarbeiter haben darauf niemals Zugriff.

---

## 3. One Persona – One Interface

Die Mitarbeiter-Oberfläche folgt der WUXUAI-Regel:

> Eine Rolle bekommt eine eigene Oberfläche.

Mitarbeiter brauchen keine Restaurant-Strategie.  
Mitarbeiter brauchen keine Tabellen.  
Mitarbeiter brauchen keine Umsatzberichte.  
Mitarbeiter brauchen keine Design-Einstellungen.

Sie brauchen nur:

- Gast suchen
- QR prüfen
- Einlösen
- Bestätigen

---

## 4. Hauptanwendungsfälle in V1

Das Mitarbeiter-Portal besitzt in V1 drei Kernfälle.

### 4.1 Tages-PIN für Punkte sammeln

🟢 **LOCK**

Punkte sammeln wird in V1 immer über eine automatisch erzeugte Tages-PIN
bestätigt.

Regel:

- pro Restaurant / Filiale täglich neue 4-stellige PIN
- gültig bis 23:59 des aktuellen Kalendertags
- serverseitig gespeichert
- serverseitig geprüft
- sichtbar nur in der Mitarbeiteransicht
- Restaurantbesitzer muss nichts verwalten

Mitarbeiter sehen:

```text
Heutige Tages-PIN
1234
Diese PIN wird benötigt, wenn Gäste Punkte sammeln.
Gültig bis heute 23:59.
```

Der Gast kann Punkte nur sammeln, wenn die gültige Tages-PIN bestätigt wird.

### 4.2 Belohnung einlösen

🟢 **LOCK**

Belohnung einlösen braucht in V1 keine Mitarbeiter-PIN und keine persönliche
Kellner-PIN auf dem Kundenhandy.

Ablauf:

1. Gast öffnet „Mein Bonus“.
2. Gast öffnet eine freigeschaltete Belohnung.
3. Gast bestätigt final:

```text
Belohnung wirklich einlösen?
Nach der Bestätigung ist diese Belohnung verbraucht und kann nicht erneut verwendet werden.
```

4. System löst serverseitig ein.
5. Belohnung wird verbraucht und kann nicht erneut eingelöst werden.
6. Gast zeigt die Bestätigung im Restaurant vor.
7. Audit Log wird geschrieben.

### 4.3 Willkommensgeschenk einlösen

Willkommensgeschenk ist nicht sofort nach Registrierung einlösbar.

Regel:

- Nach Registrierung wird ein Willkommensgeschenk zugeteilt.
- Es bleibt gesperrt.
- Nach der ersten bezahlten Konsumation und erfolgreichen Punktebuchung wird es freigeschaltet.
- Einlösung erst beim nächsten Besuch.

Mitarbeiter darf ein Willkommensgeschenk nur einlösen, wenn es im System als freigeschaltet markiert ist.

### 4.4 Gast suchen

Mitarbeiter darf Gast suchen über:

- Name
- Telefonnummer
- Kundencode
- QR-Token

Die Suche muss begrenzt sein. Keine komplette Kundenliste auf geteilten Geräten laden.

V1 Ziel:

- schnelle Suche
- wenige Ergebnisse
- nur relevante Daten

---

## 5. Punkte sammeln in V1

Punkte sammeln erfolgt in V1 primär nicht über das Mitarbeiter-Portal.

Die offiziell festgelegte V1-Logik lautet:

> Ein laminierter Bonus-QR befindet sich an der Kassa. Der Gast scannt den QR, wählt die Rechnungsstufe und sammelt Punkte mit der heutigen Tages-PIN.

Mitarbeiter geben keine persönliche Kellner-PIN auf dem Kundenhandy ein.
Die Mitarbeiteransicht zeigt nur die automatisch erzeugte Tages-PIN.

Der Mitarbeiter macht nur eine Sichtkontrolle im echten Restaurantalltag:

- Rechnung passt ungefähr zur gewählten Stufe
- Tages-PIN wird nur im Restaurantbetrieb weitergegeben

Grund:

- kein zusätzliches Handy für Kellner
- kein Tablet pro Kellner
- keine Kassa-Integration
- keine manuelle Betragseingabe
- keine zusätzliche Hardware
- keine manuelle PIN-Verwaltung durch Restaurantbesitzer

Das Mitarbeiter-Portal bleibt dadurch schlank.

---

## 6. Was Mitarbeiter nicht dürfen

Mitarbeiter dürfen in V1 niemals:

- Restaurantdaten ändern
- Öffnungszeiten ändern
- Bonusregeln ändern
- Smart Reward Engine verändern
- Willkommensgeschenk-Wahrscheinlichkeiten verändern
- Belohnungen erstellen oder bearbeiten
- Preise ändern
- Dashboard-Konfiguration ändern
- andere Restaurants sehen
- WUXUAI Admin sehen
- manuell Punkte frei vergeben, wenn der Flow nicht explizit dafür freigegeben ist

---

## 7. Sicherheit und Tages-PIN

### 7.1 Tages-PIN ersetzt persönliche Kellner-PIN für Punkte sammeln

🟢 **LOCK**

Punkte sammeln verwendet keine persönliche Mitarbeiter-PIN.

Das System erzeugt automatisch eine 4-stellige Tages-PIN:

- pro Restaurant / Filiale
- jeden Kalendertag neu
- gültig bis 23:59
- serverseitig gespeichert
- serverseitig geprüft
- sichtbar nur in der Mitarbeiteransicht

Restaurantbesitzer müssen keine PIN anlegen, ändern oder rotieren.

### 7.1.1 Schutz gegen PIN-Raten und Mehrfachbuchung

🟢 **LOCK**

Punkte sammeln wird serverseitig gegen Missbrauch geschützt.

Regel:

- maximal 5 falsche Tages-PIN-Versuche pro Gast / Restaurant / Filiale / lokalem Tag
- danach ist Punkte sammeln für diesen Gast bis Tagesende gesperrt
- falsche Versuche werden auditiert
- die Sperre wird auditiert
- maximal 2 erfolgreiche Punktebuchungen pro Gast / Restaurant / Filiale / lokalem Tag
- die Tagesgrenze verwendet in V1 `Europe/Vienna`

Diese Regeln gelten auch, wenn Punkte über die Mitarbeiteransicht gebucht werden.
Es gibt keinen separaten Team-PIN-Weg ohne diesen Schutz.

### 7.2 Belohnungseinlösung ohne PIN

🟢 **LOCK**

Belohnung einlösen verwendet in V1 keine PIN.

Die Sicherheit entsteht durch:

- gültigen Kundentoken
- einlösbare Belohnung
- finale Kundenbestätigung
- serverseitige Einmalverwendung
- Audit Log

Nach Bestätigung ist die Belohnung verbraucht und nicht erneut einlösbar.

### 7.3 Audit Log

Jeder Mitarbeiter-Vorgang schreibt Audit Log.

Audit enthält:

- restaurant_id
- branch_id, falls vorhanden
- staff_member_id
- customer_id
- Aktion
- Zeitpunkt
- Zielobjekt
- Metadaten ohne sensible Geheimnisse

PIN-Hash darf niemals ins Audit Log geschrieben werden.

---

## 8. UX-Regeln für Mitarbeiter

### 8.1 Drei Sekunden Regel

Ein Mitarbeiter soll innerhalb von drei Sekunden wissen:

- Was ist der nächste Schritt?
- Welcher Gast ist gemeint?
- Welche Belohnung kann eingelöst werden?
- Muss ich bestätigen?

### 8.2 Große Buttons

Mitarbeiter arbeiten im Stress.

Buttons müssen groß sein:

- QR prüfen
- Gast suchen
- Einlösen
- Abbrechen

Keine kleinen Textlinks.

### 8.3 Keine Tabellen

Tabellen sind für Mitarbeiter ungeeignet.

Mitarbeiter sehen Karten:

- Gastkarte
- Belohnungskarte
- Statuskarte

### 8.4 Wenig Text

Nicht erklären:

> „Diese Belohnung erfüllt alle gültigen Reward-Status-Bedingungen.“

Sondern:

> „Einlösbar“

Oder:

> „Noch gesperrt“

### 8.5 Mobile und Tablet First

Mitarbeiter-Portal muss auf Tablet und Handy funktionieren.

Vorrang:

1. Tablet
2. Handy
3. Desktop

---

## 9. Deutsche Begriffe in der UI

Sichtbare Begriffe:

- Restaurant Tablet
- Gast suchen
- QR prüfen
- Belohnung einlösen
- Willkommensgeschenk
- Einlösbar
- Gesperrt
- Tages-PIN
- Bestätigen
- Abbrechen

Nicht verwenden:

- Staff
- Reward
- Token
- Redeem
- Redemption
- Customer
- RPC
- Session Token

Technische Namen dürfen im Code bestehen bleiben.

---

## 10. Belohnung einlösen – Detailregel

### 10.1 Kunde bestätigt final

🟢 **LOCK**

Kundenportal zeigt:

- Belohnung
- Hinweis „Im Restaurant zeigen“
- Bestätigungsdialog
- Erfolgsmeldung nach Einlösung

Vor der finalen Einlösung muss der Gast bestätigen:

```text
Belohnung wirklich einlösen?
Nach der Bestätigung ist diese Belohnung verbraucht und kann nicht erneut verwendet werden.
```

### 10.2 Keine PIN bei Einlösung

Einlösung braucht in V1:

- gültigen Gast
- gültige Belohnung
- gültiges Restaurant
- finale Kundenbestätigung
- atomaren RPC

Keine persönliche Kellner-PIN.
Keine manuelle PIN-Verwaltung.
Keine PIN-Eingabe auf dem Kundenhandy.

### 10.3 Einlösung ist final

Ein eingelöstes Geschenk verschwindet aus der aktiven Kundenansicht.

Fehlerkorrekturen sind später Admin-Thema, nicht Mitarbeiter-V1.

---

## 11. Willkommensgeschenk im Mitarbeiter-Portal

Das System muss im Mitarbeiter-Portal klar unterscheiden:

### 11.1 Gesperrt

Text:

> „Noch gesperrt“

Hinweis:

> „Wird nach der ersten bezahlten Bestellung freigeschaltet.“

### 11.2 Freigeschaltet

Text:

> „Einlösbar“

### 11.3 Eingelöst

Text:

> „Bereits eingelöst“

Nicht in aktiver Einlöse-Liste anzeigen.

---

## 12. Bonus Boost im Mitarbeiter-Portal

Bonus Boost wird primär im Kundenportal sichtbar gemacht.

Mitarbeiter müssen nur erkennen können:

- Gast hat aktiven Boost
- Punkte werden bereits vom System berechnet

Mitarbeiter berechnen niemals Boost.

Das System berechnet:

- Basis-Punkte
- Multiplikator
- finale Punkte

---

## 13. Anti-Abuse im Mitarbeiter-Kontext

Mitarbeiter-Portal unterstützt Missbrauchsschutz durch:

- Tages-PIN für Punkte sammeln
- Audit Log
- finale Kundenbestätigung bei Einlösung
- keine freien Punktevergaben
- keine Änderung von Regeln
- keine Anzeige anderer Restaurants

Geräte-ID ist ein Anti-Abuse-Signal im Kundenkontext, nicht primär im Mitarbeiterportal.

---

## 14. Technische Regeln

### 14.1 Keine direkten Tabellen-Schreibzugriffe für kritische Aktionen

Kritische Aktionen laufen über RPC:

- Belohnung einlösen
- Punkte sammeln mit Tages-PIN
- QR-Token auflösen
- Tages-PIN validieren

### 14.2 Row Locks

Einlösung muss doppelte Einlösung verhindern.

RPC muss atomar arbeiten.

### 14.3 Tenant Isolation

Alle Staff-Aktionen prüfen:

- restaurant_id
- branch_id, falls vorhanden
- customer gehört zum Restaurant
- reward gehört zum Restaurant
- Tages-PIN gehört zum Restaurant / zur Filiale

### 14.4 Kein POS

V1 besitzt keine POS-Integration.

Mitarbeiter-Portal darf keine Kassa ersetzen.

---

## 15. Was ausdrücklich verboten ist

- Staff UI mit Admin-Funktionen überladen
- Mitarbeiter Punkte frei eintippen lassen
- Restaurantregeln im Mitarbeiterportal ändern
- Einlösung ohne finale Kundenbestätigung erlauben
- technische Begriffe anzeigen
- komplette Kundenlisten auf geteilten Geräten laden
- persönliche Kellner-PIN auf dem Kundenhandy verwenden
- manuelle PIN-Verwaltung durch Restaurantbesitzer verlangen
- Cross-Tenant-Daten sichtbar machen
- Belohnung doppelt einlösen

---

## 16. V2 Hinweise

V2 kann vorbereiten:

- echter Kamera-QR-Scanner
- NFC Mitarbeiterkarte
- Kassierer-Freigabe für hohe Punktebuchungen
- POS-QR auf Rechnung
- Rollen Staff / Supervisor / Manager
- Schichtprotokoll
- Mitarbeiteraktivität pro Tag
- Fehlerkorrektur mit Manager-Freigabe

Nicht in V1 bauen, wenn es den Start verzögert.

---

## 17. Reality Check

Mitarbeiter-Portal ist nur LOCK, wenn:

1. Ein Kellner kann es im Mittagsstress nutzen.
2. Ein neuer Mitarbeiter versteht es ohne Schulung.
3. Ein Gast kann seine Belohnung in wenigen Sekunden zeigen.
4. Einlösung ist sicher und auditierbar.
5. Keine Admin-Funktionen sind sichtbar.
6. Keine technischen Begriffe erscheinen.

---

## 18. LOCK Kriterien

06_STAFF_PORTAL.md ist LOCK, wenn dokumentiert ist:

- Ziel und Abgrenzung
- Mitarbeiter-Hauptflows
- Belohnungseinlösung
- Willkommensgeschenk-Einlösung
- Tages-PIN Sicherheit
- Audit Log
- UX Regeln
- Verbote
- V2 Hinweise

Endstatus: **LOCK**
## CTO-Ergänzung 2026-07-14: Einlösung per sechsstelliger Code

🟢 **FIX / V1**

Die Tages-PIN bleibt ausschließlich für Punktebuchungen. Bei Punkteeinlösungen, Willkommensgeschenken und Geburtstagsgeschenken gibt der Mitarbeiter keine PIN ein.

Nach der verbindlichen Kundenbestätigung zeigt der Gast einen sechsstelligen Code. Die Mitarbeiteransicht prüft diesen Code serverseitig. Der Code ist 15 Minuten gültig, nur einmal verwendbar und wird nach Verwendung oder Ablauf deaktiviert. Diese Regel ersetzt ältere Hinweise, nach denen eine reine Bestätigungsansicht ohne prüfbaren Code ausreicht.
