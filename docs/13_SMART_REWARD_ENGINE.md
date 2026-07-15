
# 13_SMART_REWARD_ENGINE.md

# WUXUAI Bonus V1 – Smart Reward Engine

Status: **LOCK**

Dieses Dokument beschreibt die Smart Reward Engine von WUXUAI Bonus.

Die Smart Reward Engine ist eine zentrale Produkt- und Geschäftslogik des Systems.  
Sie sorgt dafür, dass Restaurantbesitzer keine Punkte berechnen müssen, dass Punkteeinlösungen wirtschaftlich bleiben und dass Willkommensgeschenke nicht zu teuer oder zu häufig vergeben werden.

Die Smart Reward Engine ist kein sichtbares einzelnes Modul für den Restaurantbesitzer.  
Sie ist die Rechen- und Schutzlogik im Hintergrund.

---

## 1. Zweck der Smart Reward Engine

Die Smart Reward Engine beantwortet eine zentrale Frage:

> Wie kann ein Restaurant attraktive Punkteeinlösungen anbieten, ohne selbst Punkte, Quoten oder Rentabilität berechnen zu müssen?

Restaurantbesitzer kennen ihre Produkte und Preise.

Restaurantbesitzer sollen nicht lernen müssen:

- wie Punkte berechnet werden,
- wie viel ein Punkt wert ist,
- wie teuer eine Punkteeinlösung sein darf,
- wie Wahrscheinlichkeiten verteilt werden,
- wie Bonus Boost die Einlösung beschleunigt,
- ob eine Punkteeinlösung wirtschaftlich gefährlich ist.

Das ist Aufgabe der Software.

---

## 2. Grundphilosophie

🟢 **FIX**

Restaurantbesitzer arbeiten mit:

```text
Produkt
Preis
Foto
Aktiv / Inaktiv
```

WUXUAI arbeitet mit:

```text
Punkten
Einlöseschwellen
Rentabilität
Wahrscheinlichkeiten
Tageslimits
Freischaltregeln
Audit
```

Der Restaurantbesitzer sieht die einfache Geschäftssprache.  
Die Software übernimmt die Mathematik.

Das entspricht der WUXUAI Philosophie:

> Menschen sollen sich auf ihr Ziel konzentrieren – nicht auf das Werkzeug.

---

## 3. Warum diese Engine notwendig ist

Ein einfaches Bonusprogramm kann gefährlich werden.

Beispiel:

```text
Gast sammelt sehr schnell Punkte
Restaurant gibt zu teure Produkte gratis ab
Bonus Boost verdoppelt Punkte
Willkommensgeschenke sind zu großzügig
Restaurant verliert Marge
```

Viele einfache Stempel- oder Punkteprogramme verhindern das nicht.

WUXUAI Bonus soll anders sein:

> Die Software schützt automatisch die Wirtschaftlichkeit des Restaurants.

---

## 4. Abgrenzung

Die Smart Reward Engine betrifft:

- normale Punkteeinlösungen
- Willkommensgeschenke
- Preis-zu-Punkte-Berechnung
- Wirtschaftlichkeitsstatus
- Willkommensgeschenk-Quoten
- Tageslimits für teurere Geschenke
- Kundenanzeige fehlender Punkte und fehlender Umsatz
- Bonus Boost Auswirkungen auf Punkte
- V2 Wochenplan-Vorbereitung

Die Smart Reward Engine ist nicht:

- Kassensystem
- Buchhaltung
- Wareneinsatz-Kalkulation mit echter Warenwirtschaft
- KI in V1
- dynamisches Pricing
- Steuerberatung
- Gewinnrechnung

---

## 5. Zwei Vorteiltypen

WUXUAI Bonus unterscheidet strikt:

### 5.1 Punkteeinlösungen

Punkteeinlösungen sind Produkte, die Kunden mit gesammelten Punkten einlösen.

Beispiel:

```text
Gratis Dessert
Preis: 5,50 €
System berechnet: 550 Punkte
```

Punkteeinlösungen sind dauerhafte Produktangebote.

Wenn ein Gast eine Punkteeinlösung verwendet:

- Punkte werden abgezogen.
- Einlöse-Historie wird geschrieben.
- Produkt bleibt sichtbar, solange es im Restaurant Portal aktiv ist.
- Status wird anhand des neuen Punktestands neu berechnet.
- Bei erneut ausreichendem Punktestand kann dasselbe Produkt erneut eingelöst werden.

Normale Punkteeinlösungen werden nicht als einmaliges Geschenk verbraucht.

### 5.2 Willkommensgeschenke

Willkommensgeschenke sind einmalige Geschenke für neue Gäste.

Sie kosten keine Punkte.

Sie werden nach Registrierung zugeteilt, bleiben aber gesperrt, bis der Gast zum ersten Mal bezahlt und Punkte sammelt.

Beispiel:

```text
Willkommensgeschenk:
Gratis Kaffee bis 4 €
Status: gesperrt
Freischaltung: nach erster Punktebuchung
```

### 5.3 Nicht vermischen

Punkteeinlösungen und Willkommensgeschenke dürfen nicht vermischt werden.

Warum?

Sie verfolgen unterschiedliche Ziele.

Punkteeinlösungen:
- Stammkunden belohnen
- Punktefortschritt sichtbar machen
- Wiederholungsbesuche fördern

Willkommensgeschenke:
- neue Gäste emotional begrüßen
- zweiten Besuch auslösen
- Einstieg attraktiver machen

Willkommensgeschenke bleiben einmalig und verschwinden nach Einlösung aus der sichtbaren Kundenansicht.

---

## 6. Aktionen entfernt

🟢 **FIX**

Das Modul „Aktionen“ existiert in V1 nicht.

Grund:

Der Begriff war unklar und verwirrend.

Alles, was mit Einlösung, Gästen und Vorteilen zu tun hat, gehört in:

- Punkteeinlösungen
- Willkommensgeschenke
- Bonus Boost
- QR
- Gäste

Die Smart Reward Engine darf keine neue „Aktionen“-Logik erzeugen.

---

## 7. Normale Punkteeinlösungen

### 7.1 Ziel

Restaurant kann eine neue Punkteeinlösung erstellen, ohne Punkte zu berechnen.

### 7.2 Eingaben des Restaurants

Restaurant gibt ein:

- Produktart
- Produktname
- Produktpreis in €
- Foto optional
- Aktiv/Inaktiv

### 7.3 Keine Punkteingabe

🟢 **FIX**

Restaurantbesitzer darf keine Punkte manuell eingeben.

Verboten:

- Punkte-Dropdown
- freie Punkte-Eingabe
- Punkteschwelle manuell setzen
- technische Punktformel anzeigen

### 7.4 Warum?

Der Besitzer kennt den Produktpreis.

Er soll nicht rechnen:

```text
5,50 € Produktwert
Wie viele Punkte sind richtig?
Was passiert bei Bonus Boost?
Ist das rentabel?
```

Die Engine rechnet.

---

## 8. Produktpreis zu Punkte

### 8.1 Grundprinzip

Der Restaurantbesitzer gibt einen Produktpreis ein.

Beispiel:

```text
Dessert
5,50 €
```

Die Engine berechnet daraus automatisch die Einlösungspunkte.

### 8.2 Einlösequote aus dem Onboarding

🟢 **FIX**

Die Engine nutzt die im Onboarding-Schritt **Punkteeinlösung** gewählte
Einlösequote.

V1-Quoten:

```text
Sparsam = 3 %
Normal = 5 %
Großzügig = 8 %
Premium = 10 %
```

### 8.3 Warum Prozent statt 10×-Multiplikator?

Restaurantbesitzer verstehen sofort, wie viel Gegenwert sie im Verhältnis zur
Konsumation zurückgeben.

Beispiel Normal:

```text
Produktwert: 5,40 €
Einlösequote: 5 %
Geschätzte Konsumation bis zur Einlösung: 5,40 € / 0,05 = 108,00 €
```

Die alte feste 10×-Regel wird für neue oder bearbeitete Punkteeinlösungen nicht
mehr verwendet.

### 8.4 Punkteberechnung

Die Engine kennt:

- Produktpreis
- gespeicherte Einlösequote des Restaurants
- Punkte-pro-Euro-Regel über `amount_per_point`

Sie berechnet:

```text
Geschätzte Konsumation = Produktpreis / Einlösequote
Benötigte Punkte = Geschätzte Konsumation / amount_per_point
```

Wenn das Restaurant später mehr Punkte pro Euro vergibt, wird die benötigte
Punktzahl entsprechend höher, während der Euro-Gegenwert gleich bleibt.

### 8.5 Anzeige

Restaurant Portal zeigt:

- Einlösequote
- geschätzte Konsumation bis zur Einlösung
- benötigte Punkte

Customer Portal zeigt bei zu wenigen Punkten:

```text
Dir fehlen noch XX Punkte.
≈ Noch ca. XX,XX € bis zur Einlösung.
```

Beispiel:

```text
Produktpreis: 5 €
Zielmultiplikator: 10×
Zielumsatz: 50 €
Punkte pro Euro: 10
Benötigte Punkte: 500
```

---

## 9. Wirtschaftlichkeitsstatus

Die Engine zeigt einen einfachen Status.

### 9.1 Grün

```text
🟢 Wirtschaftlich
```

Bedingung:

```text
Umsatz bis Einlösung >= 10× Produktpreis
```

### 9.2 Gelb

```text
🟡 Prüfen
```

Bedingung:

```text
Umsatz bis Einlösung zwischen 7× und 10× Produktpreis
```

### 9.3 Rot

```text
🔴 Zu großzügig
```

Bedingung:

```text
Umsatz bis Einlösung < 7× Produktpreis
```

### 9.4 Ziel

Restaurantbesitzer soll sofort wissen:

- sicher
- prüfen
- zu großzügig

Er soll nicht selbst rechnen.

---

## 10. Kundenanzeige bei fehlenden Punkten

Wenn Kunde nicht genug Punkte besitzt, zeigt Kundenportal:

```text
Dir fehlen noch XX Punkte.

≈ Noch ca. XX € bis zur Einlösung.
```

Diese Werte werden automatisch berechnet.

### 10.1 Warum?

Der Gast soll erkennen:

> Ich bin nah dran. Ein weiterer Besuch lohnt sich.

### 10.2 Beispiel

```text
Benötigt: 500 Punkte
Gast hat: 420 Punkte
Fehlen: 80 Punkte
Punkte pro Euro: 20
Anzeige: Noch ca. 4 €
```

### 10.3 Keine falsche Genauigkeit

Die Anzeige ist eine Schätzung.

Formulierung:

```text
ca.
```

muss verwendet werden.

---

## 11. Bonus Boost Einfluss

Bonus Boost verdoppelt Punkte oder erhöht sie nach Multiplikator.

### 11.1 Problem

Wenn ein Kunde 2× Punkte sammelt, erreicht er Punkteeinlösungen schneller.

### 11.2 Lösung

Die Smart Reward Engine berücksichtigt Bonus Boost in der Wirtschaftlichkeitsbetrachtung.

V1 muss mindestens sicherstellen:

- Punktebuchung zeigt Basispunkte und finale Punkte
- Punkteeinlösungen werden nicht manuell zu niedrig gesetzt
- Willkommensgeschenke sind getrennt
- Referral-Gäste erhalten kein Willkommensgeschenk

### 11.3 V2

V2 kann die Rentabilität zusätzlich unter verschiedenen Boost-Szenarien simulieren:

- kein Boost
- 1,5× Boost
- 2× Boost
- 3× Boost

---

## 12. Willkommensgeschenke

Willkommensgeschenke sind Teil der Smart Reward Engine.

### 12.1 Zweck

Willkommensgeschenke sollen neue Gäste überraschen und zur Rückkehr motivieren.

### 12.2 Nicht sofort einlösbar

🟢 **FIX**

Willkommensgeschenk wird erst nach erster bezahlter Konsumation freigeschaltet.

Ablauf:

```text
Registrierung
→ Geschenk wird zugeteilt
→ Status gesperrt
→ erste Punktebuchung
→ Geschenk freigeschaltet
→ Einlösung beim nächsten Besuch
```

### 12.3 Keine Punkte

Willkommensgeschenke kosten keine Punkte.

Sie sind kein Teil des Punkte-Einlösungssystems.

### 12.4 Eigener Bereich

Restaurant Portal hat einen eigenen Bereich:

```text
Willkommensgeschenke
```

Nicht mit normalen Punkteeinlösungen vermischen.

---

## 13. Willkommensgeschenk Standardwerte

🟢 **FIX**

V1 Standardwerte:

| Kategorie | Standard-Wertgrenze |
|----------|----------------------|
| Kaffee | bis 4 € |
| Getränk | bis 4 € |
| Dessert | bis 6 € |
| Vorspeise | bis 6 € |
| Menü | bis 16 € |
| Hauptspeise | bis 20 € |
| Sushi | bis 20 € |
| Eigene Überraschung | bis 15 € |

Diese Werte zeigen dem Restaurant eine sinnvolle Orientierung.

Restaurant kann später bearbeiten:

- Name
- Kategorie
- Bild
- Wertgrenze
- Aktiv/Inaktiv

Diese Bearbeitung bleibt nach dem Onboarding jederzeit im Restaurant Portal
möglich.

Aktive Willkommensgeschenke bilden den Pool für neue normale Erstanmeldungen.

Ein Restaurant darf mehrere aktive Willkommensgeschenke gleichzeitig haben.
Diese aktiven Optionen bilden den Zufallspool.

Nicht erlaubt ist nur, einem einzelnen Kunden automatisch mehrere
Willkommensgeschenke zu geben.

Die alte Datenbankregel „nur ein aktives Willkommensgeschenk pro Restaurant“
ist falsch und darf nicht wieder eingeführt werden.

Deaktivierte Willkommensgeschenke werden nicht neu zugeteilt.

---

## 14. Wahrscheinlichkeitslogik für Willkommensgeschenke

### 14.1 Grundentscheidung

🟢 **FIX**

Willkommensgeschenke werden nicht gleich verteilt.

Teurere Kategorien werden seltener vergeben.

### 14.2 Standardquoten V1

| Kategorie | Quote |
|----------|-------|
| Kaffee | 25 % |
| Getränk | 25 % |
| Dessert | 20 % |
| Vorspeise | 18 % |
| Menü | 5 % |
| Sushi | 3 % |
| Hauptspeise | 2 % |
| Eigene Überraschung | 2 % |

Summe = 100 %

### 14.3 Nicht im Frontend hardcoden

🟢 **CTO FIX**

Die Quoten dürfen nicht fest im Frontend stehen.

Sie müssen zentral verwaltet werden.

Mögliche technische Orte:

- Datenbanktabelle
- Smart Engine Konfiguration
- serverseitige Konstanten mit späterer Migration

Frontend darf sie nur anzeigen oder konsumieren.

### 14.4 Restaurant bearbeitet keine Quoten in V1

Restaurantbesitzer wählt Kategorien.

Nicht:
- Wahrscheinlichkeiten
- Quoten
- Verlosungslogik

---

## 15. Normalisierung der Wahrscheinlichkeiten

### 15.1 Nur aktive Kategorien zählen

Wenn Restaurant nur einige Kategorien aktiviert, werden nur diese Kategorien berücksichtigt.

Beispiel:

Aktiv:
- Kaffee 25 %
- Dessert 20 %

Summe aktiv = 45 %

Normalisierung:

```text
Kaffee = 25 / 45
Dessert = 20 / 45
```

### 15.2 Nur eine aktive Kategorie

Wenn nur eine Kategorie aktiv ist:

```text
diese Kategorie = 100 %
```

### 15.3 Keine aktiven Kategorien

Wenn keine Kategorie aktiv ist:

- keine Willkommensgeschenke zuteilen
- Kundenportal zeigt keinen Willkommensgeschenk-Abschnitt
- System darf nicht crashen

---

## 16. Tageslimits

### 16.1 CTO-Entscheidung

🟢 **FIX**

Die Verlosung nutzt in V1 Wahrscheinlichkeiten und feste Tageslimits für teure Kategorien.

Warum?

Wenn 100 Gäste an einem Tag kommen, könnten trotz niedriger Wahrscheinlichkeit zufällig zu viele teure Geschenke entstehen.

### 16.2 Tageslimits V1

Standard:

```text
Gratis Menü: maximal 3 Vergaben pro Tag
Gratis Hauptspeise: maximal 3 Vergaben pro Tag
Alle anderen Kategorien: kein Tageslimit in V1
```

### 16.3 Keine Restaurant-Einstellung

Restaurantbesitzer stellt Tageslimits in V1 nicht ein.

Die Limits laufen automatisch serverseitig.

### 16.4 Verhalten bei erreichtem Limit

Wenn Limit erreicht:

- Kategorie überspringen
- Wahrscheinlichkeit auf übrige aktive Kategorien neu verteilen
- kein Fehler anzeigen
- Restaurantbesitzer muss nichts tun

---

## 17. Freunde-Einladung und Willkommensgeschenke

### 17.1 Vorrang

🟢 **FIX**

Freunde-Einladung hat Vorrang.

Wenn ein Gast über Referral kommt:

```text
kein Willkommensgeschenk
Bonus Boost nach erster Punktebuchung
```

### 17.2 Warum?

Referral-Gast hat bereits starken Vorteil:

- 2× Punkte
- 30 Tage
- Freund profitiert auch

Zusätzliches Willkommensgeschenk wäre zu großzügig.

### 17.3 Regel

Ein Gast erhält niemals gleichzeitig:

- Willkommensgeschenk
- Referral-Bonus-Boost als eingeladener Gast

---

## 18. Preisgrenzen vs. festes Produkt

Willkommensgeschenke können später zwei Modi haben.

### 18.1 Modus 1 – Wertgrenze

Beispiel:

```text
Gratis Dessert bis 6 €
```

Gast kann im Restaurant ein Dessert bis 6 € wählen.

### 18.2 Modus 2 – Festes Produkt

Beispiel:

```text
Gratis Dessert = Erdbeertorte
```

Restaurant lädt Foto hoch.

Gast sieht konkretes Produkt.

### 18.3 V1 Standard

Modus 1 ist Standard.

Grund:

- einfacher
- weniger Pflege
- Restaurant kann täglich selbst entscheiden
- kein Produktfoto nötig

Modus 2 später optional.

---

## 19. Bearbeiten im Restaurant Portal

### 19.1 Punkteeinlösungen

Restaurant kann bearbeiten:

- Name
- Preis
- Foto
- Kategorie
- Aktiv/Inaktiv

Punkte werden neu berechnet.

### 19.2 Willkommensgeschenke

Restaurant kann bearbeiten:

- Name
- Kategorie
- Wertgrenze
- Foto
- Aktiv/Inaktiv
- Standardbild behalten

Diese Felder sind nach dem Onboarding editierbar.

Willkommensgeschenke bleiben kostenlos und werden nicht in Punkte umgerechnet.

Keine Punkte.

### 19.3 Historische Einlösungen

Wenn eine Punkteeinlösung bereits verwendet wurde, darf Bearbeitung alte Einlösungen nicht kaputt machen.

V2 vorbereitet:
- Versionierung von Punkteeinlösungen
- historische Snapshot-Daten

---

## 20. V2 Wochenplan

🟡 **V2**

Gespeicherte Punkteeinlösungen können später Wochentage erhalten.

Beispiel:

```text
Montag: Kaffee
Dienstag: Dessert
Mittwoch: Sushi
Donnerstag: Menü
```

Kundenportal kann zeigen:

```text
Punkteeinlösungen diese Woche
```

Ziel:

- Vorfreude erzeugen
- Kunden planen Besuche
- Lieblingsspeisen ziehen Gäste zurück
- Restaurant kann Angebote im Wochenrhythmus steuern

V1:
- Architektur vorbereiten
- nicht vollständig bauen

---

## 21. Smart Reward Engine und Dashboard

Die Engine kann später Dashboard-Hinweise erzeugen.

Beispiele:

```text
2 Punkteeinlösungen sind zu großzügig.
```

```text
Diese Punkteeinlösung wurde oft angesehen, aber selten verwendet.
```

```text
Dessert-Punkteeinlösungen bringen viele Wiederbesuche.
```

V1:
- nicht priorisieren

V2:
- Smart Recommendation Engine

---

## 22. Technische Regeln

### 22.1 Serverseitig berechnen

Wichtige Berechnungen serverseitig.

Nicht nur im Frontend.

### 22.2 Audit

Wenn Punkte oder Geschenke zugeteilt werden:

Audit schreiben.

### 22.3 Tenant-Isolation

Alle Regeln müssen restaurant_id und branch_id beachten.

### 22.4 Keine globalen Leaks

Restaurant A darf keine Reward Engine Konfiguration von Restaurant B sehen.

### 22.5 Standardwerte zentral

Standardwerte müssen zentral liegen.

Nicht überall kopieren.

---

## 23. UX-Regeln

### 23.1 Restaurant Portal

Restaurant sieht einfache Aussagen:

- Produktpreis
- empfohlene Punkte
- Wirtschaftlichkeitsstatus

Nicht:

- mathematische Formel
- interne Faktoren
- JSON
- Quoten
- Systemlogik

### 23.2 Kundenportal

Gast sieht:

- Bild
- benötigte Punkte
- fehlende Punkte
- ca. fehlender Eurobetrag

Nicht:

- Produktpreis des Restaurants
- Wirtschaftlichkeitsstatus
- interne Engine-Logik

### 23.3 Willkommensgeschenke

Gast sieht:

- was er bekommen hat
- ob gesperrt oder freigeschaltet
- was als Nächstes passieren muss

---

## 24. Was ausdrücklich verboten ist

Verboten:

- Restaurantbesitzer Punkte manuell eingeben lassen
- Punkte-Dropdown für Punkteeinlösungen
- Willkommensgeschenke mit Punkteeinlösungen vermischen
- Willkommensgeschenk sofort einlösbar machen
- Referral-Gast Willkommensgeschenk geben
- Wahrscheinlichkeiten im Frontend hardcoden
- Quoten im V1-Restaurant-UI bearbeitbar machen
- teure Geschenke genauso häufig vergeben wie günstige
- Bonus Boost Effekte ignorieren
- technische Formeln im UI anzeigen
- englische UI-Texte
- Aktionen wieder einführen

---

## 25. Beispiele

### 25.1 Dessert

```text
Restaurant gibt ein:
Dessert
Preis: 5,50 €

Engine:
Zielumsatz: 55 €
Benötigte Punkte: abhängig von Punkte-pro-Euro
Status: wirtschaftlich
```

### 25.2 Hauptspeise

```text
Restaurant gibt ein:
Hauptspeise
Preis: 20 €

Engine:
Zielumsatz: 200 €
Benötigte Punkte: hoch
Status: wirtschaftlich, wenn Schwelle ausreichend
```

### 25.3 Referral-Kunde

```text
Gast kommt über Freund
→ kein Willkommensgeschenk
→ erste Punktebuchung
→ Bonus Boost
```

### 25.4 Normaler Kunde

```text
Gast registriert normal
→ Willkommensgeschenk ausgelost
→ gesperrt
→ erste Punktebuchung
→ freigeschaltet
→ nächster Besuch einlösbar
```

---

## 26. V2 Hinweise

V2 kann enthalten:

- Wochenplan
- dynamische Kategorien
- Restaurant-spezifische Quoten
- WUXUAI Admin-Konfiguration
- Wareneinsatz-Schätzung
- Saisonlogik
- Auslastungsabhängige Verlosung
- Tageslimits aktiv
- Monatslimits
- Reward-Versionierung
- automatische Empfehlungen
- KI-gestützte Produktvorschläge

V1 bleibt bewusst einfach.

---

## 27. Datenregel

Punkteeinlösungen und Willkommensgeschenke verwenden in echten Restaurantseiten
nur echte Tenant-Daten.

Wenn Supabase aktiv ist:

- normale Punkteeinlösungen kommen aus den echten Punkteprodukten des Restaurants
- Willkommensgeschenke kommen aus dem echten Welcome-Gift-Pool des Restaurants
- Kundenportal zeigt nur echte aktive Punkteeinlösungen und das echte zugeteilte Willkommensgeschenk
- fehlen Daten, zeigt die UI einen leeren Zustand
- keine Demo- oder Platzhalterdaten als Fallback

Finale Reihenfolge im Kundenportal:

1. Bonus Boost
2. Punkte
3. Punkteeinlösungen
4. Willkommensgeschenk nur wenn relevant und nicht eingelöst
5. Persönlicher Bonus-QR
6. Bonuskonto speichern

Demo-Daten sind nur erlaubt, wenn Supabase nicht konfiguriert ist oder ein
expliziter Demo-Modus aktiv ist.

---

## 28. Rückgabequoten im Onboarding

Für den Onboarding-Bonus-Designer im Schritt **Punkteeinlösung** gelten feste
V1-Rückgabequoten:

| Einstellung | Rückgabe |
|-------------|----------|
| Sparsam | 3 % |
| Normal | 5 % |
| Großzügig | 8 % |
| Premium | 10 % |

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

Diese Rückgabequoten betreffen den Onboarding-Bonus-Designer. Bestehende
Tages-PIN-, Bonus-Boost- und RPC-Regeln werden dadurch nicht geaendert.

---

## 29. Tages-PIN und Einlösung

🟢 **LOCK**

Die Smart Reward Engine berechnet Punkte und Einlöseschwellen.

Sie ersetzt aber nicht die Sicherheitsregeln der Flows:

### 29.1 Punkte sammeln

Punkte sammeln braucht immer die automatisch erzeugte Tages-PIN:

- 4-stellig
- pro Restaurant / Filiale täglich neu
- gültig bis 23:59
- serverseitig gespeichert
- serverseitig geprüft
- sichtbar nur in der Mitarbeiteransicht
- keine manuelle Verwaltung durch Restaurantbesitzer

Die Engine darf keine Punkte gutschreiben, wenn die Tages-PIN nicht korrekt
validiert wurde.

Zusätzliche Sicherheitsregeln:

- maximal 5 falsche Tages-PIN-Versuche pro Gast / Restaurant / Filiale / lokalem Tag
- danach ist Punkte sammeln für diesen Gast bis Tagesende gesperrt
- falsche Versuche und Sperren werden auditiert
- maximal 2 erfolgreiche Punktebuchungen pro Gast / Restaurant / Filiale / lokalem Tag
- alle Tagesgrenzen verwenden in V1 `Europe/Vienna`

Die Engine darf keine Punkte gutschreiben, wenn eine aktive Tages-PIN-Sperre
besteht oder das Tageslimit bereits erreicht ist.

### 29.2 Punkteeinlösung verwenden

Punkteeinlösung verwenden braucht keine PIN.

Die Einlösung erfolgt über:

- finale Kundenbestätigung
- serverseitige Prüfung
- atomare Einmalverwendung
- Audit Log

Keine persönliche Kellner-PIN darf auf dem Kundenhandy abgefragt werden.
Die Tages-PIN gehört ausschließlich zu Flow 04 „Punkte sammeln“.

---

## 30. LOCK Kriterien

Smart Reward Engine gilt als LOCK, wenn:

- normale Punkteeinlösungen über Preis berechnet werden
- keine manuelle Punkte-Eingabe existiert
- Wirtschaftlichkeitsstatus angezeigt wird
- Kunden fehlende Punkte und ca. fehlender Umsatz sehen
- Willkommensgeschenke getrennt sind
- Willkommensgeschenk-Quoten zentral dokumentiert sind
- Referral-Gast kein Willkommensgeschenk erhält
- Willkommensgeschenk erst nach erster Punktebuchung freigeschaltet wird
- teure Kategorien seltener sind
- Tageslimit-Architektur vorbereitet ist
- Tages-PIN gegen Brute Force geschützt ist
- maximal 2 erfolgreiche Punktebuchungen pro lokalem Tag erlaubt sind
- keine Demo- oder Platzhalterdaten in echten Restaurantseiten erscheinen
- Rückgabequoten im Onboarding einheitlich angewendet werden
- Punktebuchung nur mit gültiger Tages-PIN erfolgt
- Punkteeinlösung ohne PIN, aber mit finaler Kundenbestätigung erfolgt
- alle Texte Deutsch sind
- Build erfolgreich ist

---

## 31. Codex-Regeln

Wenn Codex an der Smart Reward Engine arbeitet:

1. Diese Datei zuerst lesen.
2. Keine Punkte-Eingabe für Restaurantbesitzer einbauen.
3. Keine Aktionen zurückbringen.
4. Willkommensgeschenke getrennt halten.
5. Referral-Regel nicht brechen.
6. Freischaltung erst nach erster Punktebuchung.
7. Quoten zentral verwalten.
8. Tageslimits vorbereiten, aber V1 nicht überkomplizieren.
9. Keine mathematischen Formeln im UI anzeigen.
10. Bei aktiver Supabase-Verbindung nur echte Tenant-Daten anzeigen.
11. Tages-PIN für Punkte sammeln nicht mit Punkteeinlösung vermischen.
12. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
## CTO-Ergänzung 2026-07-14: Geburtstagsgeschenk

🟢 **FIX / V1**

V1 besitzt keinen separaten Geburtstagsgeschenk-Editor. Ein täglicher idempotenter Serverjob wählt 14 Tage vor dem Geburtstag zufällig genau ein aktives Willkommensgeschenk des Restaurants aus. Pro Gast, Restaurant/Filiale und Kalenderjahr ist nur eine Zuteilung erlaubt. Deaktivierte oder abgelaufene Vorlagen werden nicht verwendet; fehlt eine aktive Vorlage, wird nur ein Systemprotokoll geschrieben.
