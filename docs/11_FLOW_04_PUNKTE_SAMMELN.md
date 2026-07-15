
# 11_FLOW_04_PUNKTE_SAMMELN.md

# WUXUAI Bonus V1 – Flow 04: Punkte sammeln

Status: **LOCK**

Dieses Dokument beschreibt den vollständigen Flow 04 des WUXUAI Bonus Systems.

Flow 04 regelt, wie ein Gast nach einer bezahlten Konsumation Punkte sammelt.

Flow 04 ist nicht der Flow zur Registrierung.  
Flow 04 ist nicht der Flow zur Belohnungseinlösung.  
Flow 04 ist nicht der Flow zur Erstellung von Belohnungen.  
Flow 04 ist nicht der Flow für Kassensystem-Integration.

Flow 04 ist der Flow für:

```text
Bezahlte Konsumation
→ Bonus QR
→ Rechnungsbereich
→ Punkte
→ Bonus Boost / Willkommensgeschenk / Referral-Logik auslösen
```

---

## 1. Ziel von Flow 04

Das Ziel von Flow 04 lautet:

> Ein Gast sammelt nach einer bezahlten Konsumation in wenigen Sekunden Bonuspunkte, ohne Kassa-Integration, ohne NFC und ohne zusätzliche Hardware.

Der Ablauf soll in der Realität funktionieren:

```text
Gast konsumiert
→ Rechnung entsteht
→ Gast scannt Bonus QR an der Kassa
→ Gast wählt Rechnungsbereich
→ Mitarbeiter nennt die heutige Tages-PIN
→ System berechnet Punkte serverseitig
→ Punkte werden gutgeschrieben
→ Gast sieht Fortschritt
```

---

## 2. Business-Ziel

Flow 04 ist der Motor des Bonusprogramms.

Ohne Punktebuchung gibt es:

- keine Belohnungsfreischaltung
- kein Willkommensgeschenk nach dem ersten Besuch
- keinen Bonus Boost nach Freunde-Einladung
- keinen Fortschritt im Kundenportal
- keinen Wiederkehranreiz

Punkte sammeln ist deshalb nicht nur eine technische Buchung.

Es ist der Moment, in dem der Gast spürt:

> „Mein Besuch lohnt sich.“

Gleichzeitig muss das Restaurant geschützt werden.

Flow 04 muss daher drei Dinge leisten:

1. Punkte sammeln so einfach wie möglich machen.
2. Missbrauch unattraktiv machen.
3. Wirtschaftlichkeit des Restaurants nicht gefährden.

---

## 3. Grundentscheidung: Kein Kassensystem in V1

🟢 **FIX**

V1 besitzt keine Kassensystem-Integration.

Grund:

Restaurants nutzen unterschiedliche Kassensysteme.  
Eine Integration in V1 würde Entwicklung, Support und Vertrieb stark verlangsamen.

V1 muss funktionieren mit:

- alter Kassa
- moderner Kassa
- Handkassa
- Bestellterminal
- PC-Kassa
- Tablet-Kassa
- gar keiner technischen Integration

Deshalb arbeitet V1 mit einem **einzigen Bonus QR**.

---

## 4. Grundentscheidung: Ein laminierter Bonus QR

🟢 **FIX**

Jedes Restaurant erhält einen Bonus QR für Punktebuchungen.

Dieser QR wird:

- an der Kassa platziert
- ausgedruckt
- laminiert
- aufgestellt
- im Restaurant Starter Kit bereitgestellt

Der QR führt zur Punkte-Sammel-Seite des Restaurants.

Beispielroute:

```text
/w/:restaurantSlug
```

Der QR ist nicht personalisiert pro Kunde.  
Der Kunde scannt ihn mit seinem Gerät.

---

## 5. Warum kein NFC in V1

NFC wurde diskutiert, aber für V1 verworfen.

Gründe:

- zusätzliche Hardware nötig
- Sticker/Karten müssen gekauft werden
- nicht jedes Gerät verhält sich gleich
- Restaurant müsste physische NFC-Punkte verwalten
- QR ist universeller

V1-Regel:

```text
Kein NFC erforderlich.
Kein Mitarbeiter-Handy erforderlich.
Kein Tablet pro Kellner erforderlich.
Ein QR an der Kassa reicht.
Eine automatisch erzeugte Tages-PIN bestätigt die Punktebuchung.
```

---

## 6. Warum kein Mitarbeitergerät pro Kellner

Kellner tragen oft bereits:

- Bestellgerät
- Bankomatterminal
- Kassenbeleg
- Teller
- Schreibblock

Ein zusätzliches Handy oder Tablet pro Kellner ist in V1 nicht realistisch.

Deshalb:

- Gast scannt Bonus QR selbst.
- Restaurant kontrolliert visuell.
- Mitarbeiter gibt die heutige Tages-PIN weiter.
- System protokolliert.

Die Tages-PIN wird nicht vom Restaurantbesitzer verwaltet.
Sie wird automatisch pro Restaurant / Filiale erzeugt.

---

## 7. Rechnungsbereiche statt freie Betragseingabe

🟢 **FIX**

Der Gast gibt keinen freien Rechnungsbetrag ein.

Der Gast wählt einen Rechnungsbereich.

Grund:

Freie Betragseingabe ist zu leicht manipulierbar.

Falsch:

```text
Gast tippt 99 €
obwohl Rechnung 12 € war.
```

Richtig:

```text
Gast wählt Rechnungsbereich:
10–20 €
```

---

## 8. Warum keine „bis X €“-Logik

🟢 **FIX**

Die ursprüngliche Idee „bis 20 €“ wurde verworfen.

Problem:

Ein Gast mit 5 € Konsumation könnte die Stufe „bis 20 €“ wählen und zu viele Punkte erhalten.

Deshalb gilt:

```text
0–10 €
10–20 €
20–30 €
30–40 €
40–50 €
50–75 €
75–100 €
100 €+
```

Nicht:

```text
bis 20 €
bis 30 €
bis 40 €
```

Die UI muss immer klare Bereiche anzeigen.

---

## 9. Standard-Rechnungsbereiche V1

🟢 **FIX**

V1-Standardregel:

```text
Punkte = round(Mindestwert des gewählten Rechnungsbereichs × Großzügigkeitsfaktor)
```

Die obere Grenze darf nicht als Punktewert verwendet werden.

Der tatsächliche Rechnungsbetrag darf nicht direkt als Punktewert verwendet
werden. Er entscheidet nur, welche Rechnungsstufe erreicht wurde.

Großzügigkeitsfaktoren:

| Einstellung | Faktor |
|-------------|--------|
| Sparsam | 0,9 |
| Normal | 1,0 |
| Großzügig | 1,1 |
| Premium | 1,2 |

V1-Standardwerte:

| Rechnungsbereich | Standardpunkte |
|------------------|----------------|
| 0–10 € | 0 Punkte |
| 10–20 € | 10 Punkte |
| 20–30 € | 20 Punkte |
| 30–40 € | 30 Punkte |
| 40–50 € | 40 Punkte |
| 50–75 € | 50 Punkte |
| 75–100 € | 75 Punkte |
| 100 €+ | 100 Punkte |

Diese Werte sind Standardwerte.

Die Architektur darf spätere Anpassung pro Restaurant vorbereiten.

In V1 soll die Oberfläche einfach bleiben.

---

## 10. Systemberechnung

### 10.1 Grundregel

Der Kunde wählt einen Rechnungsbereich.

Das System berechnet Punkte serverseitig.

Der Kunde darf niemals Punkte direkt eingeben.

### 10.2 Server ist Wahrheit

Frontend zeigt nur.

Backend entscheidet:

- welcher Bereich gültig ist
- wie viele Punkte vergeben werden
- welcher Bonus Boost gilt
- ob Wiederholung blockiert wird
- ob Willkommensgeschenk freigeschaltet wird
- ob Referral aktiviert wird

### 10.3 Keine Client-Vertrauenslogik

Verboten:

- Punkte aus Frontend übernehmen
- Multiplikator aus Frontend übernehmen
- Kundeneingabe ungeprüft speichern
- Restaurant-Kontext nur aus UI ableiten

---

## 10A. Tages-PIN für Punkte sammeln

🟢 **LOCK**

Punkte sammeln braucht in V1 immer eine automatisch generierte Tages-PIN.

Regel:

- 4-stellig
- nur Zahlen
- pro Restaurant / Filiale täglich neu
- gültig bis 23:59
- serverseitig gespeichert
- serverseitig geprüft
- sichtbar nur in der Mitarbeiteransicht
- Restaurantbesitzer muss nichts verwalten

Der Gast sieht beim Punkte sammeln:

```text
Bitte Mitarbeiter um die Tages-PIN.
```

Feld:

```text
Tages-PIN
```

Wenn die Tages-PIN falsch ist:

```text
Die Tages-PIN ist nicht korrekt.
```

Wenn die Tages-PIN korrekt ist:

```text
Punkte gesammelt!
```

Keine Punktebuchung darf ohne korrekte Tages-PIN erfolgen.
Die PIN darf nicht im Frontend berechnet oder aus Kundendaten abgeleitet werden.

### 10A.1 Brute-Force-Schutz und Tageslimit

🟢 **LOCK**

Die Tages-PIN wird serverseitig gegen Erraten geschützt.

Regel:

- maximal 5 falsche Tages-PIN-Versuche pro Gast / Restaurant / Filiale / lokalem Tag
- danach ist Punkte sammeln für diesen Gast in diesem Restaurant bis Tagesende gesperrt
- falsche Versuche werden als `daily_pin_failed` auditiert
- die Sperre wird als `daily_pin_locked` auditiert
- bei Sperre erscheint:

```text
Zu viele falsche Versuche. Bitte wende dich an das Restaurant.
```

Punkte sammeln hat zusätzlich ein serverseitiges Tageslimit:

- maximal 2 erfolgreiche Punktebuchungen pro Gast / Restaurant / Filiale / lokalem Tag
- eine dritte Punktebuchung am selben lokalen Tag wird blockiert
- bei Erreichen des Limits erscheint:

```text
Du hast heute bereits Punkte gesammelt.
```

Alle Tagesprüfungen verwenden für V1 denselben lokalen Restauranttag:

```text
Europe/Vienna
```

Frontend-Status, Browser-Zeit oder Kundeneingaben dürfen diese Grenzen nicht umgehen.

---

## 11. Bonus Boost im Punktefluss

### 11.1 Grundregel

🟢 **FIX**

Wenn ein aktiver Bonus Boost besteht, wird er bei der Punktebuchung angewendet.

Beispiel:

```text
Basis: 200 Punkte
Bonus Boost: 2×
Gutschrift: 400 Punkte
```

### 11.2 Anzeige im Kundenportal

Nach erfolgreicher Punktebuchung soll der Gast verstehen:

```text
Punkte gesammelt!

Normal:
200 Punkte

Bonus Boost:
+200 Punkte

Gesamt:
400 Punkte 🔥
```

Der emotionale Effekt ist wichtig.

Wenn kein Bonus Boost aktiv ist, genügt:

```text
Punkte gesammelt!
50 Punkte wurden gutgeschrieben.
```

Die Anzeige nutzt die serverseitige Punktebuchungsantwort.
Das Frontend darf keine eigenen Bonuspunkte erfinden.

### 11.3 Audit

Audit speichert:

- Basispunkte
- Multiplikator
- finale Punkte
- Bonus Boost ID falls vorhanden

---

## 12. Erste Punktebuchung als Auslöser

Flow 04 löst andere Produktregeln aus.

### 12.1 Willkommensgeschenk

Bei normaler Registrierung:

```text
Registrierung
→ Willkommensgeschenk gesperrt
→ erste Punktebuchung
→ Willkommensgeschenk freigeschaltet
```

Wichtig:

Das Geschenk ist danach für den nächsten Besuch einlösbar.

### 12.2 Freunde-Einladung

Bei Referral-Registrierung:

```text
Freund registriert sich
→ kein Willkommensgeschenk
→ erste Punktebuchung
→ Referral wird aktiviert
→ Bonus Boost für beide
```

### 12.3 Vorrang

Freunde-Einladung hat Vorrang.

Ein Gast erhält nicht gleichzeitig:

- Willkommensgeschenk
- Bonus Boost als eingeladener Freund

---

## 13. Smart Upsell

### 13.1 Business-Idee

Smart Upsell soll dem Gast zeigen:

> „Du bist nah an der nächsten Bonusstufe.“

Beispiel:

```text
Nur noch 3 € bis zur nächsten Bonusstufe.
```

Ziel:

- Durchschnittsbon erhöhen
- Gast emotional motivieren
- Restaurantumsatz steigern

### 13.2 Einschränkung in V1

Da V1 ohne Kassensystem arbeitet und der Gast keinen freien Betrag eingeben soll, ist Smart Upsell in V1 nur eingeschränkt möglich.

V1 darf zeigen:

- aktuelle gewählte Stufe
- nächste Stufe
- Punkteunterschied
- allgemeiner Hinweis auf höhere Stufe

Beispiel:

```text
Nächste Stufe:
20–30 €

Dort erhältst du mehr Punkte.
```

Wenn ein exakter Rechnungsbetrag sicher verfügbar ist, zum Beispiel später durch POS-QR oder signierten Rechnungslink, darf angezeigt werden:

```text
Nur noch 2,20 € bis zur nächsten Bonusstufe.
```

### 13.3 CTO-Regel

Keine falsche Genauigkeit anzeigen.

Wenn das System den exakten Rechnungsbetrag nicht sicher kennt, darf es keinen konkreten fehlenden Eurobetrag behaupten.

### 13.4 V2/V1.1

Später:

- QR auf Rechnung enthält Betrag
- Betrag signiert
- System kennt echten Betrag
- Smart Upsell wird exakt

---

## 14. Timing im Restaurant

### 14.1 Standard V1

Standard:

```text
Gast bezahlt
→ scannt Bonus QR
→ sammelt Punkte
```

### 14.2 Optional vor Zahlung

Wenn das Restaurant Smart Upsell aktiv nutzen möchte, kann der QR auch vor finalem Zahlungsvorgang gezeigt werden.

Dann kann der Gast noch etwas ergänzen.

Beispiel:

```text
Rechnung wird präsentiert
→ Gast scannt Bonus QR
→ sieht nächste Stufe
→ bestellt noch Dessert
→ neue Rechnung
→ Punkte sammeln
```

Diese Variante ist ein Betriebsprozess, keine Pflichtfunktion.

---

## 15. Missbrauchsschutz

### 15.1 Ein Beleg = eine Punktebuchung

🟢 **FIX**

Produktregel:

```text
Eine Rechnung
=
eine Punktebuchung
```

### 15.2 V1 Einschränkung

Ohne Kassensystem gibt es keine echte Beleg-ID.

Deshalb nutzt V1:

- Zeitlimit
- Restaurant
- Kunde
- Audit
- verdächtige Muster

Beispiel:

```text
Maximal eine Punktebuchung pro Gast/Restaurant innerhalb von 5 Minuten.
```

### 15.3 Zukunft

V1.1/V2:

- Rechnungsnummer
- POS-QR
- signierter Betrag
- Kassiererbestätigung
- Beleg-ID

---

## 16. Audit

Jede Punktebuchung wird protokolliert.

Audit enthält:

- restaurant_id
- branch_id
- customer_id
- Rechnungsbereich
- Basispunkte
- Bonus Boost Multiplikator
- finale Punkte
- Zeitpunkt
- Device ID falls vorhanden
- IP oder Fingerprint falls verfügbar
- Quelle: Bonus QR
- ob Willkommensgeschenk freigeschaltet wurde
- ob Referral/Bonus Boost aktiviert wurde

---

## 17. Kundenansicht nach Punktebuchung

Nach erfolgreicher Punktebuchung sieht der Gast:

```text
🎉 Punkte erhalten

Du hast 200 Punkte gesammelt.
```

Wenn Bonus Boost aktiv:

```text
🔥 Bonus Boost aktiv

Heute hast du 2× Punkte gesammelt.
```

Dann:

- aktueller Punktestand
- Fortschritt zur nächsten Belohnung
- Hinweis auf Willkommensgeschenk falls freigeschaltet
- Hinweis auf Bonus Boost falls aktiviert

---

## 18. Fehlerzustände

### 18.1 Kein Kundentoken

Anzeige:

```text
Bitte öffne zuerst dein Bonuskonto.
```

### 18.2 Wiederholung blockiert

Anzeige:

```text
Du hast gerade erst Punkte gesammelt.
Bitte warte kurz, bevor du erneut Punkte sammelst.
```

### 18.3 Falsches Restaurant

Anzeige:

```text
Dieser QR-Code gehört zu einem anderen Restaurant.
```

### 18.4 Keine Verbindung

Anzeige:

```text
Punkte konnten gerade nicht gespeichert werden.
Bitte versuche es erneut.
```

Keine technischen RPC-Fehler anzeigen.

---

## 19. QR im Starter Kit

Der Bonus QR ist Teil des Restaurant Starter Kits.

Die PDF soll klar zeigen:

```text
Bonuspunkte sammeln
Für die Kassa
```

Die Bonus-QR-Seite darf keine technischen Begriffe enthalten.

---

## 20. Keine Vermischung mit Flow 03

Flow 04 sammelt Punkte.

Flow 03 löst Belohnungen ein.

Diese Flows dürfen nicht vermischt werden.

Verboten:

- Belohnung einlösen im Punkte-Sammel-Flow
- Punkte sammeln im Einlöse-Flow
- persönliche Mitarbeiter-PIN für Kundenpunkte-Scan verlangen
- Tages-PIN im Kundenportal automatisch auslesen oder berechnen
- Kunden Selbst-Einlösung über Punkte-QR erlauben

---

## 21. UX-Regeln

### 21.1 Mobile First

Die Punkte-Sammel-Seite wird auf dem Handy genutzt.

Sie muss funktionieren bei:

- einer Hand
- schlechter Beleuchtung
- Kassa-Situation
- kurzer Aufmerksamkeit

### 21.2 Große Karten

Rechnungsbereiche sind große Karten.

Keine kleinen Dropdowns.

### 21.3 Keine langen Texte

Der Gast soll sofort verstehen:

```text
Wähle deinen Rechnungsbereich.
Bitte Mitarbeiter um die Tages-PIN.
Sammle Punkte.
Fertig.
```

### 21.4 Keine horizontalen Scrollleisten

Mobile Ansicht darf nicht brechen.

---

## 22. Restaurant Reality Check

Flow 04 ist nur gut, wenn:

1. Gast kann Punkte in unter 15 Sekunden sammeln.
2. Kellner muss kein zusätzliches Gerät verwenden.
3. Restaurant braucht keine Kassa-Integration.
4. Kunde kann keine Punkte manuell eingeben.
5. System protokolliert alles.
6. Bonus Boost wird korrekt angewendet.
7. Willkommensgeschenk wird erst nach echter Konsumation freigeschaltet.
8. Referral wird erst nach echter Konsumation aktiviert.

---

## 23. Was ausdrücklich verboten ist

Verboten:

- freie Betragseingabe in V1
- „bis 20 €“-Logik
- Kunde gibt Punkte ein
- Punkte aus Frontend übernehmen
- Bonus Boost ohne Punktebuchung aktivieren
- Willkommensgeschenk sofort freischalten
- mehrfaches Punkte sammeln direkt hintereinander
- Punkte sammeln ohne korrekte Tages-PIN
- Tages-PIN im Frontend berechnen
- Tages-PIN für Belohnungseinlösung verwenden
- Kassa-Integration als V1-Pflicht
- NFC als V1-Pflicht
- Mitarbeitergerät als V1-Pflicht
- englische UI-Texte
- technische Fehlertexte im Kundenportal

---

## 24. V2 Hinweise

V2/V1.1 kann enthalten:

- POS QR auf Rechnung
- signierter Rechnungsbetrag
- Beleg-ID
- Kassiererbestätigung
- echte Smart Upsell Euro-Berechnung
- dynamische Tagesstufen
- Filialübergreifende Punkte
- Betrugswarnungen im WUXUAI Admin
- Belegfoto optional
- Kassenanbieter-Plugins

V1 bleibt bewusst einfach.

---

## 25. LOCK Kriterien

Flow 04 ist LOCK, wenn:

- Bonus QR funktioniert
- Restaurant automatisch erkannt wird
- Gast Rechnungsbereich wählen kann
- keine freie Betragseingabe existiert
- klare Rechnungsbereiche angezeigt werden
- Punkte serverseitig berechnet werden
- Tages-PIN serverseitig geprüft wird
- Tages-PIN nur in der Mitarbeiteransicht sichtbar ist
- Bonus Boost angewendet wird
- erste Punktebuchung Willkommensgeschenk freischaltet
- erste Punktebuchung Referral aktivieren kann
- Wiederholungsbuchung begrenzt ist
- Audit geschrieben wird
- Kundenansicht Erfolg zeigt
- alle Texte Deutsch sind
- Mobile Ansicht sauber ist
- Build erfolgreich ist

---

## 26. Codex-Regeln

Wenn Codex an Flow 04 arbeitet:

1. Diese Datei zuerst lesen.
2. Keine freie Betragseingabe einbauen.
3. Keine „bis X €“-Stufen verwenden.
4. Keine POS-Pflicht einbauen.
5. Punkte niemals clientseitig vertrauen.
6. Bonus Boost serverseitig berechnen.
7. Willkommensgeschenk-Regel beachten.
8. Referral-Regel beachten.
9. Audit-Log schreiben.
10. Tages-PIN für jede Punktebuchung serverseitig prüfen.
11. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
## CTO-Ergänzung 2026-07-14: Tageslimit und Idempotenz

🟢 **FIX / V1**

- Maximal zwei erfolgreiche Punktebuchungen pro Gast, Restaurant/Filiale und lokalem Kalendertag.
- Die Prüfung und Buchung erfolgen atomar und serverseitig.
- Jede Anfrage besitzt eine Idempotency-ID; derselbe Request erzeugt keine Doppelbuchung.
- Kunden- und Mitarbeiterweg verwenden dieselbe Tages-PIN-, Fehlversuchs- und Tageslimit-Sicherung.
- Sperrmeldung: „Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.“
- Die Restaurant-Zeitzone bestimmt Tages-PIN und Tagesgrenze; V1-Standard ist `Europe/Vienna`.
