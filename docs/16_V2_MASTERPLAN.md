
# 16_V2_MASTERPLAN.md

# WUXUAI Bonus – V2 Masterplan

Status: **LOCK**

Dieses Dokument beschreibt die offizielle V2-Richtung von WUXUAI Bonus.

V2 ist **nicht** dazu da, V1 zu überladen.  
V2 ist die geplante Erweiterung, nachdem V1 mit echten Restaurants, echten Gästen und echtem Cashflow validiert wurde.

V1 bleibt fokussiert:

```text
Ein Restaurant
Ein Standort
Ein Bonusprogramm
Gäste registrieren
Punkte sammeln
Belohnungen einlösen
Bonus Boost
Willkommensgeschenke
```

V2 erweitert die Plattform, ohne den V1-Kern zu zerstören.

---

## 1. Zweck dieses Dokuments

Dieses Dokument legt fest:

- welche Ideen bewusst auf V2 verschoben wurden,
- welche Architektur in V1 vorbereitet sein muss,
- welche Funktionen noch nicht gebaut werden dürfen,
- wie V2 auf V1 aufsetzt,
- welche strategischen Erweiterungen später möglich sind,
- welche Business-Chancen nach dem ersten Pilot entstehen.

Codex darf diese Datei **nicht** verwenden, um V2-Funktionen sofort in V1 einzubauen.

Codex darf diese Datei nur verwenden, um V1 updatefähig und vorbereitend zu bauen.

---

## 2. Grundregel: V1 zuerst validieren

🟢 **FIX**

Vor V2 muss V1 in der Realität funktionieren.

V1 ist erfolgreich, wenn:

1. ein Restaurant sich selbst einrichten kann,
2. Gäste sich ohne Hilfe registrieren,
3. Punkte zuverlässig gesammelt werden,
4. Belohnungen eingelöst werden,
5. Bonus Boost genutzt wird,
6. Restaurantbesitzer den Nutzen erkennt,
7. mindestens ein Pilotrestaurant das System im Alltag nutzt,
8. erste zahlende Restaurants realistisch erreichbar sind.

Solange diese Bedingungen nicht erfüllt sind, dürfen V2-Funktionen nicht priorisiert werden.

---

## 3. V2-Leitprinzip

V2 erweitert nicht die Komplexität für den Nutzer.

V2 erweitert die Automatisierung im Hintergrund.

Das bedeutet:

```text
V1:
einfach starten

V2:
intelligenter steuern
```

V2 soll nicht mehr Klicks erzeugen, sondern weniger.

V2 soll nicht mehr Einstellungen verlangen, sondern bessere Empfehlungen und Automatik liefern.

---

## 4. Was V2 nicht sein darf

V2 darf nicht werden:

- ein überladenes CRM,
- ein ERP-System,
- ein Kassensystem,
- ein Buchhaltungssystem,
- ein Lieferdienstsystem,
- ein Marketing-Tool mit 100 Kampagnenfeldern,
- ein Admin-Panel für Entwickler,
- eine Sammlung von Features ohne klaren Restaurantnutzen.

WUXUAI Bonus bleibt:

> Ein Bonus- und Stammkunden-System für lokale Unternehmen.

---

## 5. V2 Hauptbereiche

V2 umfasst langfristig folgende Erweiterungsbereiche:

1. Multi-Branch / Filialen
2. Wochenplan für Belohnungen
3. Smart Reward Calendar
4. Erweiterte Smart Reward Engine
5. Smart Recommendation Engine
6. Dynamische Promotionflächen
7. QR Center Erweiterung
8. POS-QR / signierter Rechnungslink
9. WUXUAI Admin Portal
10. Branchen-Erweiterung über Restaurants hinaus
11. Mehrsprachigkeit
12. Stripe / SaaS-Abrechnung
13. Enterprise / White-Label-Optionen

---

## 6. Multi-Branch / Filialen

### 6.1 V1 Verhalten

In V1 gilt:

```text
1 Restaurant
=
1 Organisation
=
1 Filiale
=
eigene Gäste
=
eigene Punkte
=
eigene Belohnungen
=
eigenes Abo
```

Der Restaurantbesitzer sieht keine Filiallogik.

### 6.2 V2 Ziel

V2 kann mehrere Standorte unter einer Organisation verwalten.

Beispiel:

```text
Burger House
├── Wien
├── Graz
├── Linz
└── Salzburg
```

### 6.3 Abrechnung

V2 kann Abo und Rechnung auf Organisationsebene bündeln.

Beispiel:

```text
Organisation: Burger House
Plan: Business
Max. Filialen: 20
Aktive Filialen: 17
Eine Rechnung
```

### 6.4 Punkte-Modi

V2 kann zwei Modi anbieten:

#### Modus 1 – Filialpunkte

Punkte gelten nur in der jeweiligen Filiale.

#### Modus 2 – Organisationspunkte

Punkte gelten in allen Filialen derselben Organisation.

### 6.5 Belohnungs-Gültigkeit

Belohnungen können später gelten:

- nur in dieser Filiale,
- in allen Filialen,
- in ausgewählten Filialen.

### 6.6 V1 Architekturvorbereitung

Bereits vorbereitet:

- organizations
- branches
- organization_id
- branch_id
- branch_subscriptions

Codex darf V1 UI nicht mit Filialen überladen.

---

## 7. Branch Merge / Zusammenführung

### 7.1 Problem

Einzelne Restaurants könnten in V1 separat starten und später Teil einer Kette werden.

Beispiel:

```text
Restaurant A
Restaurant B
Restaurant C
```

später:

```text
Organisation Burger House
├── Restaurant A
├── Restaurant B
└── Restaurant C
```

### 7.2 V2 Lösung

V2 braucht ein kontrolliertes Merge-Tool.

Nur WUXUAI Admin darf Zusammenführungen ausführen.

### 7.3 Warum nicht Restaurant selbst?

Zusammenführung betrifft:

- Kundendaten
- Punkte
- Belohnungen
- QR-Codes
- Abos
- Rechnungen
- Audit-Logs

Das ist zu sensibel für einfache Self-Service-UI in V1.

---

## 8. Wochenplan für Belohnungen

### 8.1 Ursprung

Restaurantbesitzer möchten nicht jeden Tag dieselbe Belohnung anbieten.

Beispiele:

```text
Montag: Kaffee
Dienstag: Dessert
Mittwoch: Sushi
Donnerstag: Menü
Freitag: Burger
```

### 8.2 V2 Ziel

Belohnungen können Wochentage erhalten.

Restaurant stellt ein:

- Montag aktiv
- Dienstag aktiv
- Mittwoch aktiv
- usw.

### 8.3 Kundenportal

Kundenportal zeigt später:

```text
Belohnungen diese Woche

Montag: Gratis Kaffee
Dienstag: Gratis Dessert
Mittwoch: Gratis Sushi
```

### 8.4 Business-Ziel

Kunde plant Besuch nach Lieblingsbelohnung.

Beispiel:

> „Mein Lieblingsdessert ist am Mittwoch einlösbar. Ich gehe Mittwoch hin.“

Das erzeugt Vorfreude und Wiederbesuche.

### 8.5 V1 Vorbereitung

V1 darf Belohnungen bereits so speichern, dass spätere weekday fields möglich sind.

Aber V1 UI bleibt:

- erstellen
- bearbeiten
- aktivieren
- deaktivieren

Kein vollständiger Wochenplan in V1.

---

## 9. Smart Reward Calendar

### 9.1 Definition

Der Smart Reward Calendar ist die V2-Erweiterung der Belohnungen.

Er steuert automatisch:

- welche Belohnungen heute sichtbar sind,
- welche Belohnungen morgen sichtbar sind,
- welche Belohnungen nur an bestimmten Tagen gelten,
- welche Belohnungen saisonal erscheinen,
- welche Belohnungen Kunden zur Rückkehr motivieren.

### 9.2 Ziel

Restaurant soll nicht täglich manuell aktivieren/deaktivieren.

Die Software übernimmt:

```text
Zeit
→ Tag
→ Belohnungsplan
→ Kundenansicht
```

### 9.3 Verbindung zu Smart Open

Smart Open steuert Restaurantstatus.

Smart Reward Calendar steuert Belohnungsstatus.

Beide arbeiten zeitbasiert.

---

## 10. Erweiterte Smart Reward Engine

V1 Smart Reward Engine:

- Produktpreis → Punkte
- Wirtschaftlichkeitsstatus
- Willkommensgeschenk-Quoten
- Willkommensgeschenk-Freischaltung
- Referral-Vorrang

V2 Smart Reward Engine kann ergänzen:

- Wareneinsatz-Schätzung
- Tageslimits aktiv
- Monatslimits
- Saisonlogik
- Kategorie-Optimierung
- Belohnungsrentabilität
- Belohnungsvorschläge
- automatische Warnungen
- Auslastungsabhängigkeit

### 10.1 Beispiel

System erkennt:

```text
Hauptspeisen werden zu oft eingelöst.
```

Empfehlung:

```text
Hauptspeise seltener aktivieren
oder höhere Punkte-Schwelle berechnen.
```

### 10.2 Keine Überforderung

Restaurant sieht nicht die ganze Mathematik.

Restaurant sieht:

```text
🟢 Wirtschaftlich
🟡 Prüfen
🔴 Zu großzügig
```

---

## 11. Smart Recommendation Engine

### 11.1 Ziel

V2 kann dem Restaurant täglich eine Empfehlung geben.

Beispiel:

```text
Heute für dich:
Aktiviere Dessert als Belohnung.
Viele Gäste sind nur noch 80 Punkte entfernt.
```

### 11.2 Dashboard Integration

Dashboard-Karte:

```text
Heute für dich
```

zeigt genau eine Empfehlung.

Nicht fünf.

### 11.3 Mögliche Empfehlungen

- Neue Belohnung erstellen
- Bonus Boost hervorheben
- Willkommensgeschenk prüfen
- Geburtstagsbonus aktivieren
- ruhigen Tag mit 2× Punkten stärken
- beliebte Kategorie aktivieren
- QR Starter Kit erneut drucken

### 11.4 V1

In V1 ist diese Karte Platzhalter oder einfache Empfehlung.

V2 macht sie intelligent.

---

## 12. Dynamische Promotionflächen

### 12.1 Restaurant Starter Kit

V1 Starter Kit enthält eine statische Bonus-Boost-KPI-Box.

Beispiel:

```text
💡 Freunde einladen

🔥 Du 2× Punkte
👥 Freund 2× Punkte
📅 +30 Tage Bonus Boost
```

### 12.2 V2

Die freie Fläche kann dynamisch werden.

Mögliche Inhalte:

- Freunde einladen
- Bonus Boost
- Geburtstagsbonus
- Neue Belohnung
- Saisonaktion
- Doppelte Punkte
- Wochenbelohnung

### 12.3 Wichtig

Diese Fläche darf keine WUXUAI-Werbefläche werden.

Sie ist eine Nutzenfläche für Restaurant und Gast.

---

## 13. QR Center Erweiterung

V1:

- Restaurant Starter Kit
- ein primärer PDF-Download im Onboarding

Nach Onboarding / V2:

- Restaurant QR PNG
- Mein Bonus QR PNG
- PDF
- Sticker
- Tischkarten
- Fensteraufkleber
- Kassen-Aufsteller
- Flyer
- A6 Export
- A4 Export
- Branding-Auswahl
- Druckpakete

### 13.1 Regel

Onboarding bleibt einfach.

QR Center darf später detailliert sein.

---

## 14. POS-QR und signierter Rechnungslink

### 14.1 V1

Kein POS.

Gast scannt Bonus QR und wählt Rechnungsbereich.

### 14.2 V1.1 / V2

Kassensystem kann QR auf Rechnung drucken.

Beispiel:

```text
/w/restaurant-slug?amount=27.80&bill_id=123456&sig=...
```

### 14.3 Signatur

Signatur verhindert, dass der Kunde den Betrag selbst manipuliert.

### 14.4 Kein voller POS-Zwang

Erste Integrationsstufe ist nur QR-Link-Standard.

Nicht sofort vollständige API.

### 14.5 V3

Echte POS API später möglich.

---

## 15. Smart Upsell mit echtem Betrag

V1 kann Smart Upsell nur eingeschränkt nutzen, solange kein echter Betrag bekannt ist.

V2 mit signiertem Rechnungsbetrag kann anzeigen:

```text
Nur noch 2,20 € bis zur nächsten Bonusstufe.
```

Das ist psychologisch stark.

### 15.1 Business-Ziel

Durch den Hinweis bestellt der Gast vielleicht:

- Kaffee
- Dessert
- Getränk
- Zusatzprodukt

Restaurant erhöht Durchschnittsbon.

---

## 16. WUXUAI Admin Portal

### 16.1 V1

Kein vollständiges WUXUAI Admin Portal nötig.

Supabase Dashboard reicht für Pilot.

### 16.2 V2

Internes Admin Portal für:

- Restaurants
- Organisationen
- Abos
- Rechnungen
- Support
- Logs
- Missbrauch
- Feature Flags
- Smart Engine Standardwerte

### 16.3 Route

Nicht `/admin`, weil `/admin` Restaurant Portal ist.

Mögliche Route:

```text
/wuxuai-admin
```

oder

```text
/platform-admin
```

### 16.4 Rollen

Separate Plattformrollen:

- platform_owner
- platform_admin
- support
- billing_admin
- security_admin
- viewer

Nicht mit Restaurantrollen vermischen.

---

## 17. Branchen-Erweiterung

### 17.1 V1 Fokus

V1 fokussiert Restaurants und Cafés.

### 17.2 V2 Strategie

WUXUAI Bonus kann später für lokale Unternehmen erweitert werden:

- Restaurants
- Cafés
- Bäckereien
- Bubble Tea
- Friseure
- Kosmetik
- Einzelhandel
- Blumenläden
- Hofläden
- Vinotheken

### 17.3 Produktname

Langfristig nicht nur „Restaurant Bonus“.

Strategie:

```text
WUXUAI Bonus
```

als allgemeines Bonusprogramm.

### 17.4 V1

V1 Marketing bleibt fokussiert auf Restaurants/Cafés.

Architektur bleibt business-neutral vorbereitet.

---

## 18. Mehrsprachigkeit

### 18.1 V1

Deutsch zuerst.

Alle UI-Texte Deutsch.

### 18.2 Nach V1 Feature Freeze

Übersetzungen:

- Englisch
- Chinesisch

### 18.3 Architektur

i18n-ready vorbereiten, aber nicht zu früh alle Texte übersetzen.

Warum?

Während V1 ändern sich Texte häufig.

Drei Sprachen würden jede Änderung vervielfachen.

---

## 19. Stripe und Zahlungslogik

### 19.1 V1 Testphase

30 Tage kostenlos.

Keine Kreditkarte.

Keine Nachzahlung.

### 19.2 Nach Testphase

Monatsabo.

Empfehlung V1:

```text
ein Paket
ca. 59–69 €/Monat
```

### 19.3 V2

Stripe Integration:

- Checkout
- Subscription
- Rechnungen
- Webhooks
- Kündigung
- Upgrade
- Jahresabo

### 19.4 Erfolgsbericht

Vor Testende:

```text
Ihr Bonusprogramm hat erreicht:
- neue Mitglieder
- wiederkehrende Gäste
- eingelöste Belohnungen
- Bonus Boost Aktivität
```

Verkaufen über Nutzen, nicht Druck.

---

## 20. Enterprise und White Label

### 20.1 V1

White Label pro Restaurant:

- Logo
- Farben
- Kundenportal
- Starter Kit

### 20.2 V2 Enterprise

Möglich:

- Branding „Powered by WUXUAI“ ausblenden
- eigene Domain
- Filialen
- Organisationen
- zentrale Steuerung
- eigene Vorlagen
- API
- POS-Integrationen

### 20.3 Footer

V1 Starter Kit Footer:

```text
Powered by WUXUAI Bonus • www.wuxuaisbi.com
```

V2 Enterprise kann Branding-Ausblendung erlauben.

---

## 21. Notification-System

### 21.1 V1

Keine SMS.
Keine WhatsApp.
Keine Pushpflicht.

### 21.2 V2

Optionale Benachrichtigungen:

- E-Mail
- Push
- WhatsApp optional
- SMS optional
- In-App Hinweise

### 21.3 Kostenregel

Kostenpflichtige Messaging-Dienste dürfen nur optional sein.

V1 bleibt kostenfrei in der Registrierung.

---

## 22. Smart Expiry Ausbau

V1 Regel:

- Punkte haben Gültigkeit
- Ablauf kann vorbereitet sein
- Erinnerungen konzeptionell

V2:

- automatische Erinnerungen
- 30/14/7/1 Tage vorher
- Reaktivierungsaktion
- Punkte zurückholen
- Kunden zurück ins Restaurant bringen

### 22.1 Produktregel

Punkteablauf ist nicht Bestrafung.

Punkteablauf ist Rückholmechanismus.

---

## 23. Reward Versioning

### 23.1 Problem

Restaurant bearbeitet Belohnung nach Einlösungen.

Beispiel:

- früher: Erdbeertorte 500 Punkte
- später: Cheesecake 650 Punkte

Historische Einlösung darf nicht kaputt gehen.

### 23.2 V2 Lösung

Belohnungen bekommen Versionen oder Snapshots.

Einlösungen speichern:

- damaliger Name
- damaliges Bild
- damalige Punkte
- damaliger Preis
- damalige Kategorie

---

## 24. Analytics

### 24.1 V1

Nur einfache KPI.

### 24.2 V2

Erweiterte Auswertung:

- Registrierungen
- Wiederkehr
- Punktebuchungen
- Belohnungen
- Bonus Boost
- Willkommensgeschenke
- QR-Scans
- Conversion
- durchschnittliche Aktivität pro Gast

### 24.3 Keine Überladung

Analytics darf Restaurant nicht erschlagen.

Dashboard zeigt immer nur das Wichtigste.

---

## 25. Feature Flags

V2 braucht Feature Flags.

Beispiele:

- Wochenplan aktiv
- Multi-Branch aktiv
- POS-QR aktiv
- Smart Recommendation aktiv
- Enterprise Branding aktiv
- neue Branchen aktiv

Feature Flags helfen:

- Pilotgruppen
- kontrollierter Rollout
- Rollback
- Enterprise-Funktionen

---

## 26. Security Ausbau

V2 kann enthalten:

- bessere Device Analyse
- Rate Limits
- Audit UI
- Admin Warnungen
- Staff Anomalien
- Referral Graph
- Missbrauchsmuster
- manuelle Sperren
- Restaurant-Risikobewertung

V1 Anti-Abuse bleibt einfach.

---

## 27. Support & Betrieb

V2 braucht Support-Prozesse:

- Restaurant suchen
- Onboarding prüfen
- QR testen
- Kundenproblem prüfen
- Abo prüfen
- Audit ansehen
- Fehler nachstellen

Support darf keine Kundendaten unkontrolliert verändern.

---

## 28. Was nicht in V2 automatisch gebaut werden darf

Auch in V2 gilt:

Verboten ohne klare Entscheidung:

- ERP
- Lager
- Buchhaltung
- Lieferdienst
- vollständiges POS
- komplexes CRM
- zu viele Marketingmodule
- KI ohne klaren Nutzen
- Branchenwechsel ohne validierten Markt

V2 darf nicht das Produkt verwässern.

---

## 29. V2 Prioritäten nach Pilot

Nach dem ersten Pilot sollte priorisiert werden:

1. Kritische Bugs
2. UX-Reibung
3. Dashboard-Nutzen
4. Belohnungsverwaltung
5. Willkommensgeschenke
6. QR Center
7. Zahlungsmodell
8. WUXUAI Admin Minimal
9. Wochenplan
10. Multi-Branch

Nicht alles gleichzeitig.

---

## 30. CTO-Regel für V2

Jede V2-Funktion muss beantworten:

1. Erhöht sie Wiederbesuche?
2. Erhöht sie Umsatz?
3. Spart sie dem Restaurant Zeit?
4. Macht sie das Produkt leichter verkäuflich?
5. Passt sie zur Einfachheit?

Wenn nicht:

Nicht bauen.

---

## 31. LOCK Kriterien

Der V2 Masterplan gilt als LOCK, wenn:

- V1 Fokus geschützt bleibt
- V2-Funktionen klar getrennt sind
- Multi-Branch vorbereitet ist
- Wochenplan dokumentiert ist
- POS-QR als späterer Standard definiert ist
- Smart Engines erweiterbar sind
- WUXUAI Admin geplant ist
- Branchen-Erweiterung dokumentiert ist
- keine V2-Funktion als V1-Pflicht missverstanden wird
- Codex klare Grenzen kennt

---

## 32. Codex-Regeln

Wenn Codex V2-Dokumente liest:

1. V2 nicht automatisch in V1 bauen.
2. Nur Architektur vorbereiten, wenn ausdrücklich verlangt.
3. V1 Einfachheit schützen.
4. Keine neuen Features ohne Flow/CTO-Freigabe.
5. V2-Ideen als geplant markieren.
6. Keine UI überladen.
7. Keine Produktlogik erfinden.
8. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
