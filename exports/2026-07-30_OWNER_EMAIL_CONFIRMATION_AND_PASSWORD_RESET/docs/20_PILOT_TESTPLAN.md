
# 20_PILOT_TESTPLAN.md

# WUXUAI Bonus V1 – Pilot-Testplan

Status: **LOCK**

Dieses Dokument beschreibt den offiziellen Pilot-Testplan für WUXUAI Bonus V1.

Der Pilot ist der Übergang von:

```text
Software funktioniert technisch
```

zu:

```text
Software funktioniert im echten Restaurantalltag
```

Ein erfolgreicher Pilot ist nicht nur ein technischer Test.  
Ein erfolgreicher Pilot beweist, dass Restaurantbesitzer, Mitarbeiter und Gäste das System im Alltag verstehen und nutzen.

---

## 1. Zweck dieses Dokuments

Dieses Dokument legt fest:

- wie ein Pilotrestaurant vorbereitet wird,
- welche Voraussetzungen erfüllt sein müssen,
- welche Flows getestet werden,
- welche Rollen beteiligt sind,
- welche Geräte genutzt werden,
- welche Fehler dokumentiert werden,
- wann ein Pilot als erfolgreich gilt,
- welche Daten beobachtet werden,
- welche Änderungen nicht während des Pilots gebaut werden dürfen.

Der Pilot-Testplan ist verbindlich.

Codex darf aus diesem Dokument keine neuen Produktfunktionen ableiten.  
Codex darf nur Pilot-relevante Fixes, Tests, Dokumentationen oder kleine UX-Verbesserungen umsetzen, wenn sie explizit beauftragt werden.

---

## 2. Grundziel des Pilots

Das Ziel des ersten Pilots lautet:

> Ein echtes Restaurant nutzt WUXUAI Bonus im Alltag mit echten Gästen, echten QR-Codes, echten Punkten und echten Einlösungen.

Der Pilot soll beweisen:

1. Restaurant kann sich einrichten.
2. Restaurant versteht das Starter Kit.
3. Gäste können sich registrieren.
4. Gäste können Punkte sammeln.
5. Belohnungen können eingelöst werden.
6. Bonus Boost wird verstanden.
7. Mitarbeiter können den Ablauf bedienen.
8. Restaurantbesitzer erkennt Nutzen.
9. Software ist stabil genug für zahlende Restaurants.

---

## 3. Was der Pilot nicht ist

Der Pilot ist nicht:

- ein perfekter Product Launch,
- eine Marketingkampagne,
- ein voll automatisiertes Enterprise-System,
- ein Belastungstest mit tausenden Restaurants,
- eine POS-Integration,
- ein Stripe-Go-Live,
- ein V2-Test,
- ein Test für Filialketten,
- ein Test für andere Branchen.

Der Pilot testet V1.

V1 ist:

```text
Ein Restaurant
Ein Standort
Deutsch
30 Tage kostenlos
QR-basiert
ohne Kassensystem
ohne SMS/WhatsApp
ohne KI
ohne ERP
```

---

## 4. Pilot-Grundsätze

### 4.1 Restaurant Reality First

Der Pilot wird aus Sicht des echten Restaurantalltags bewertet.

Nicht nur:

```text
Funktioniert der Code?
```

Sondern:

```text
Würde ein Restaurant das täglich nutzen?
```

### 4.2 Kein Feature-Ausbau während Pilot

Während des Pilots werden keine großen neuen Funktionen gebaut.

Erlaubt:

- kritische Bugfixes,
- Textkorrekturen,
- kleine UX-Verbesserungen,
- Druckmaterial-Korrekturen,
- Sicherheitsfixes,
- Datenfehler-Fixes.

Nicht erlaubt:

- neue Module,
- V2-Funktionen,
- POS-Integration,
- Filialverwaltung,
- komplexe Reports,
- SMS/WhatsApp,
- neue Branchen,
- KI-Funktionen.

### 4.3 Beobachten vor Bauen

Wenn ein Problem im Pilot auftaucht:

1. beobachten,
2. dokumentieren,
3. Ursache verstehen,
4. entscheiden,
5. dann fixen.

Nicht sofort blind umbauen.

---

## 5. Voraussetzungen vor Pilotstart

Vor dem ersten Pilot müssen folgende Punkte erfüllt sein.

### 5.1 Staging bereit

Supabase Staging ist bereit.

Pflicht:

- Migrationen angewendet,
- RLS aktiv,
- RPCs getestet,
- Storage funktioniert,
- Customer Tokens funktionieren,
- Staff Sessions funktionieren,
- Audit schreibt,
- Build grün.

### 5.2 Cloudflare Preview bereit

Vor echtem Pilot sollte eine öffentlich erreichbare Preview-URL vorhanden sein.

Warum?

Gäste können nicht mit `localhost` testen.

QR-Codes brauchen eine echte URL.

### 5.3 Restaurant Starter Kit

Restaurant Starter Kit PDF muss vorhanden sein.

Enthält:

- Infoseite,
- Restaurant QR,
- Mein Bonus QR,
- Kassen-Aufsteller,
- Eingangs-Aufsteller,
- Footer,
- Logo korrekt skaliert,
- QR scanbar.

### 5.4 Testrestaurant eingerichtet

Mindestens ein Testrestaurant ist vollständig eingerichtet.

Onboarding abgeschlossen.

Dashboard erreichbar.

### 5.5 Mitarbeiter vorbereitet

Mindestens ein Staff-Mitglied existiert.

PIN/Staff Session funktioniert.

### 5.6 Testgeräte bereit

Mindestens:

- 1 Desktop/Laptop für Restaurantbesitzer,
- 1 Smartphone als Gast,
- 1 Smartphone oder Tablet für Staff-Test,
- optional zweites Smartphone für Freunde-Einladung.

### 5.7 Druckmaterial bereit

Mindestens:

- Restaurant QR am Eingang oder Tisch,
- Mein Bonus QR an der Kassa,
- Starter Kit gedruckt oder digital sichtbar,
- QR scannbar.

---

## 6. Pilotrollen

### 6.1 Restaurantbesitzer

Testet:

- Onboarding,
- Dashboard,
- Belohnungen,
- Willkommensgeschenke,
- QR Center,
- Gäste,
- Einstellungen.

### 6.2 Mitarbeiter / Kellner

Testet:

- Gast finden,
- Belohnung einlösen,
- Staff PIN / Session,
- operative Einfachheit.

### 6.3 Gast

Testet:

- QR scannen,
- registrieren,
- Mein Bonus öffnen,
- Punkte sammeln,
- Bonus Boost verstehen,
- Belohnung sehen.

### 6.4 Eingeladener Freund

Testet:

- Referral-Link,
- Registrierung über Freund,
- kein Willkommensgeschenk,
- erste Punktebuchung,
- Bonus Boost Aktivierung.

### 6.5 WUXUAI Betreiber

Testet:

- Logs,
- Audit,
- Datenbank,
- Fehler,
- Supportfähigkeit,
- Staging-Zustand.

---

## 7. Pilotphasen

Der Pilot erfolgt in Phasen.

### Phase 1 – Trockenlauf ohne echte Gäste

Ziel:

Alle Flows mit Testpersonen durchspielen.

Keine echten Kunden.

### Phase 2 – Interner Restauranttest

Ziel:

Restaurantbesitzer und Mitarbeiter testen mit wenigen bekannten Personen.

### Phase 3 – Begrenzter Gästetest

Ziel:

Echte Gäste scannen QR und registrieren sich.

Noch kein großes Marketing.

### Phase 4 – 7-Tage-Alltagstest

Ziel:

Restaurant nutzt System eine Woche im normalen Betrieb.

### Phase 5 – Auswertung

Ziel:

Entscheiden:

- weiterentwickeln,
- verbessern,
- zahlen lassen,
- zweiten Pilot starten.

---

## 8. Flow-Testübersicht

Im Pilot müssen alle V1-Flows getestet werden.

### Flow 01 – Restaurant eröffnen

Test:

```text
Restaurant registriert sich
→ Onboarding
→ Starter Kit
→ Restaurant starten
→ Dashboard
```

### Flow 02 – Gast werden

Test:

```text
Gast scannt Restaurant QR
→ Registrierung
→ persönlicher QR
→ Mein Bonus
```

### Flow 03 – Belohnung einlösen

Test:

```text
Gast zeigt einlösbare Belohnung
→ Staff prüft
→ Einlösung
→ Belohnung verschwindet
```

### Flow 04 – Punkte sammeln

Test:

```text
Gast scannt Bonus QR
→ Rechnungsbereich
→ Punkte erhalten
→ Fortschritt sichtbar
```

### Flow 05 – Bonus Boost

Test:

```text
Gast lädt Freund ein
→ Freund registriert sich
→ Freund sammelt Punkte
→ beide erhalten Bonus Boost
```

---

## 9. Flow 01 Pilot-Test

### 9.1 Ziel

Restaurantbesitzer kann ohne Schulung starten.

### 9.2 Testschritte

1. `/register` öffnen.
2. Account erstellen.
3. Restaurantname eingeben.
4. Logo hochladen.
5. Farben prüfen.
6. Öffnungszeiten eintragen.
7. Bonus Designer durchgehen.
8. Willkommens-Belohnungen auswählen.
9. Restaurant Starter Kit herunterladen.
10. Startklar bestätigen.
11. Dashboard öffnen.

### 9.3 Erwartung

- keine englischen Texte,
- keine technischen Begriffe,
- kein Speichern-Button nötig,
- Daten bleiben nach Refresh erhalten,
- Restaurant Starter Kit funktioniert,
- Dashboard wird erst nach Abschluss geöffnet.

### 9.4 Fehler dokumentieren

Dokumentieren:

- welcher Schritt,
- welches Gerät,
- Screenshot,
- Console,
- erwartetes Verhalten,
- tatsächliches Verhalten.

---

## 10. Flow 02 Pilot-Test

### 10.1 Ziel

Gast wird in unter 30 Sekunden Mitglied.

### 10.2 Testschritte

1. Restaurant QR scannen.
2. Restaurant wird erkannt.
3. Vorteil sehen.
4. „Jetzt Mitglied werden“ klicken.
5. Vorname eingeben.
6. Telefonnummer eingeben.
7. Optional Geburtstag.
8. Registrierung abschließen.
9. Mein Bonus öffnen.
10. Persönlichen QR sehen.

### 10.3 Erwartung

- keine App-Installation,
- kein Passwort,
- keine SMS,
- kein WhatsApp,
- kein Restaurant-Suchen,
- Willkommensgeschenk nur gesperrt,
- Gast versteht nächsten Schritt.

### 10.4 Messwerte

- Zeit bis Registrierung,
- Abbruchstellen,
- Verständlichkeit,
- Fragen des Gasts.

---

## 11. Flow 03 Pilot-Test

### 11.1 Ziel

Belohnung kann sicher eingelöst werden.

### 11.2 Testschritte

1. Gast öffnet Mein Bonus.
2. Gast zeigt freigeschaltete Belohnung.
3. Mitarbeiter öffnet Staff Portal.
4. Mitarbeiter findet Gast.
5. Mitarbeiter sieht einlösbare Belohnung.
6. Mitarbeiter bestätigt.
7. Belohnung verschwindet.
8. Audit prüfen.

### 11.3 Erwartung

- Kunde kann nicht selbst final einlösen,
- Staff Session/PIN erforderlich,
- keine doppelte Einlösung,
- klare Erfolgsmeldung,
- keine technischen Fehlertexte.

---

## 12. Flow 04 Pilot-Test

### 12.1 Ziel

Gast sammelt Punkte ohne Kassa-Integration.

### 12.2 Testschritte

1. Gast bezahlt.
2. Gast scannt Bonus QR.
3. Restaurant wird erkannt.
4. Gast wählt Rechnungsbereich.
5. Punkte werden berechnet.
6. Punkte erscheinen im Kundenportal.
7. Audit prüfen.

### 12.3 Erwartung

- keine freie Betragseingabe,
- keine „bis X €“-Logik,
- keine manuelle Punkte-Eingabe,
- Wiederholung wird begrenzt,
- Bonus Boost wird berücksichtigt,
- erste Punktebuchung schaltet Willkommensgeschenk frei oder Referral frei.

### 12.4 Besonderer Test

Test mit 5 € Konsumation.

Erwartung:

- Gast wählt 0–10 €,
- nicht 10–20 €,
- Punkte entsprechend Standard.

---

## 13. Flow 05 Pilot-Test

### 13.1 Ziel

Bonus Boost erzeugt echte Empfehlung und Wiederkehr.

### 13.2 Testschritte

1. Gast öffnet Bonus Boost.
2. Gast teilt Link/QR mit Freund.
3. Freund registriert sich.
4. Freund bekommt kein Willkommensgeschenk.
5. Freund konsumiert.
6. Freund sammelt Punkte.
7. Bonus Boost aktiviert sich bei beiden.
8. Kundenportal zeigt 2× Punkte.
9. Dashboard zeigt Bonus Boost KPI.

### 13.3 Erwartung

- Boost nicht bei Registrierung,
- Boost erst nach Punktebuchung,
- beide erhalten Boost,
- Dauer sichtbar,
- Multiplikator wird angewendet,
- Audit vorhanden.

---

## 14. Restaurant Day Simulation

Die Restaurant Day Simulation ist ein kompletter Tagesablauf.

### 14.1 Morgens

Restaurantbesitzer öffnet Dashboard.

Prüfen:

- versteht er Dashboard?
- sieht er Wichtiges?
- keine technischen Warnungen?

### 14.2 Erster Gast

Gast scannt Restaurant QR.

Prüfen:

- Registrierung schnell?
- Willkommensgeschenk gesperrt?
- QR sichtbar?

### 14.3 Mittag

Mehrere Gäste sammeln Punkte.

Prüfen:

- Bonus QR funktioniert?
- Rechnungsbereiche verständlich?
- keine falsche Betragslogik?

### 14.4 Einlösung

Gast löst Belohnung ein.

Prüfen:

- Staff findet Gast?
- Einlösung schnell?
- Belohnung verschwindet?

### 14.5 Freunde-Einladung

Gast lädt Freund ein.

Prüfen:

- Link funktioniert?
- Freund bekommt kein Willkommensgeschenk?
- Boost nach Konsumation?

### 14.6 Abend

Restaurantbesitzer schaut Dashboard.

Prüfen:

- sieht er Wert?
- sieht er neue Gäste?
- sieht er Bonus Boost?
- erkennt er Nutzen?

---

## 15. Geräte-Test

### 15.1 Mobile

Testbreite:

```text
ca. 390 px
```

Prüfen:

- keine horizontalen Scrollleisten,
- Buttons groß genug,
- QR groß genug,
- Texte nicht abgeschnitten.

### 15.2 Tablet

Prüfen:

- Staff Portal gut bedienbar,
- Karten nicht zu klein,
- QR scannbar.

### 15.3 Desktop

Prüfen:

- Restaurant Portal ruhig,
- keine zu breiten Zeilen,
- keine leeren Adminflächen.

---

## 16. Browser-Test

Mindestens testen:

- Chrome Desktop,
- Safari iPhone falls möglich,
- Chrome Android falls möglich,
- Edge/Chrome Windows falls möglich.

Wichtig:

- PDF Download,
- QR Scan,
- Kamera/QR Verhalten,
- Local Storage Token,
- Login/Logout.

---

## 17. Druck-Test

### 17.1 Starter Kit

Drucken:

- Seite 1 Anleitung,
- Restaurant QR,
- Mein Bonus QR,
- Kassen-Aufsteller,
- Eingangs-Aufsteller.

### 17.2 Prüfen

- QR scanbar,
- Logo nicht verzerrt,
- Text lesbar,
- Footer dezent,
- Bonus Boost KPI verständlich.

### 17.3 Laminierung

Optional testen:

- QR nach Laminierung scanbar?
- Reflexion stört?
- Größe passend?

---

## 18. Datenprüfung

Nach Pilot-Tests prüfen:

- customers
- points_transactions
- customer_welcome_gifts
- rewards
- reward_redemptions
- referrals
- customer_bonus_boosts
- audit_log

### 18.1 Erwartung

Keine doppelten Kunden durch gleiche Telefonnummer.

Keine Punkte ohne Restaurant.

Keine Referral-Aktivierung ohne Punktebuchung.

Keine eingelöste Belohnung ohne Audit.

---

## 19. RLS- und Sicherheitsprüfung

Vor echten Gästen prüfen:

- Restaurant A sieht nicht Restaurant B.
- Kunde sieht nur eigenes Konto.
- Staff sieht nur operativen Bereich.
- Public Routes lesen keine Tabellen direkt.
- Tokens funktionieren.
- Demo-Daten leaken nicht.

---

## 20. Testdaten-Regel

Pilotdaten müssen klar erkennbar sein.

Beispiel:

```text
Akakiko Testgast 1
Test Telefonnummer
Test Staff
```

Wenn echte Gäste genutzt werden, keine Fake-Daten in deren Profilen.

---

## 21. Fehlerbericht-Vorlage

Jeder Fehler wird so dokumentiert:

```text
FLOW:
z. B. Flow 04 Punkte sammeln

ROLLE:
Gast / Restaurant / Staff / System

GERÄT:
iPhone / Android / Desktop / Tablet

SCHRITTE:
1.
2.
3.

ERWARTET:
...

PASSIERT:
...

SCREENSHOT:
...

CONSOLE:
...

NETWORK:
...

PRIORITÄT:
Kritisch / Hoch / Mittel / Niedrig
```

---

## 22. Prioritäten

### Kritisch

- Sicherheitsproblem
- Datenverlust
- falsche Punkte
- falsche Belohnungseinlösung
- fremde Daten sichtbar
- Registrierung unmöglich
- QR funktioniert nicht

### Hoch

- Onboarding blockiert
- Dashboard nicht erreichbar
- Staff kann nicht einlösen
- Punkte werden nicht gespeichert
- Bonus Boost aktiviert falsch

### Mittel

- UX verwirrend
- Text falsch
- Button unklar
- mobile Darstellung schwach

### Niedrig

- Designfeinschliff
- Abstände
- kleinere Texte
- kosmetische Details

---

## 23. Pilot-Erfolgskriterien

Pilot ist erfolgreich, wenn:

1. Restaurant kann starten.
2. QR Codes funktionieren.
3. mindestens echte oder testnahe Gäste registrieren sich.
4. Punktebuchungen funktionieren.
5. mindestens eine Belohnung wird eingelöst.
6. Bonus Boost Flow funktioniert.
7. Restaurantbesitzer versteht Dashboard.
8. Mitarbeiter versteht Staff Portal.
9. keine kritischen Bugs offen.
10. Restaurantbesitzer erkennt Nutzen.

---

## 24. Pilot-Abbruchkriterien

Pilot muss gestoppt werden, wenn:

- Kundendaten falsch sichtbar sind,
- Punkte massiv falsch berechnet werden,
- Einlösungen doppelt passieren,
- Restaurant nicht mehr zugreifen kann,
- QR auf falsches Restaurant zeigt,
- RLS/Security Problem auftaucht,
- Migration Production-Daten gefährdet.

---

## 25. Nach dem Pilot

Nach Pilot erfolgt Auswertung.

Fragen:

1. Hat Restaurant die App verstanden?
2. Haben Gäste sich registriert?
3. Haben Mitarbeiter den Ablauf akzeptiert?
4. Welche Seite war verwirrend?
5. Welche Funktion wurde genutzt?
6. Welche Funktion wurde ignoriert?
7. Wo entstand Supportbedarf?
8. Würde Restaurant nach 30 Tagen zahlen?
9. Welche V1-Fixes sind Pflicht?
10. Welche Ideen gehören V2?

---

## 26. Was nach Pilot nicht sofort passieren darf

Nicht sofort:

- alle Wünsche bauen,
- Featureliste aufblasen,
- V2 starten,
- komplexe Reports bauen,
- POS integrieren,
- SMS/WhatsApp aktivieren,
- mehrsprachig werden.

Erst:

- Bugs fixen,
- UX-Reibung reduzieren,
- V1 stabilisieren,
- zweites Restaurant testen.

---

## 27. Pilot-Bericht

Nach jedem Pilot wird ein Bericht erstellt:

```text
Restaurant:
Zeitraum:
Teilnehmer:
Geräte:
Flows getestet:
Erfolge:
Fehler:
Fragen:
Restaurantfeedback:
Gastfeedback:
Mitarbeiterfeedback:
Kritische Fixes:
V2-Ideen:
Entscheidung:
```

Entscheidung:

- weiter testen
- V1 fixen
- zweiter Pilot
- zahlendes Abo anbieten
- Pilot stoppen

---

## 28. Pilot und Zahlungsmodell

V1 Testphase:

```text
30 Tage kostenlos
Keine Kreditkarte
Keine Nachzahlung
```

Vor Ablauf:

Erfolgsbericht:

- neue Mitglieder
- Punktebuchungen
- Belohnungen
- Bonus Boost
- wiederkehrende Gäste

Ziel:

Restaurant entscheidet aufgrund echten Nutzens.

---

## 29. Codex-Regeln im Pilot

Während Pilot darf Codex nur:

- klare Bugs fixen,
- UI-Reibung reduzieren,
- deutsche Texte korrigieren,
- mobile Probleme beheben,
- Sicherheitsprobleme beheben,
- Datenfehler beheben.

Codex darf nicht:

- V2-Funktionen bauen,
- neue Module erfinden,
- Businesslogik ändern ohne CTO,
- Pilotfeedback ungefiltert als Feature bauen.

---

## 30. LOCK Kriterien

Pilot-Testplan gilt als LOCK, wenn:

- alle V1-Flows abgedeckt sind,
- Rollen klar definiert sind,
- Geräte-Test definiert ist,
- Druck-Test definiert ist,
- Fehlerbericht-Vorlage vorhanden ist,
- Abbruchkriterien vorhanden sind,
- Erfolgskriterien vorhanden sind,
- Nach-Pilot-Auswertung definiert ist,
- Codex-Regeln für Pilot klar sind.

---

Endstatus: **LOCK**
