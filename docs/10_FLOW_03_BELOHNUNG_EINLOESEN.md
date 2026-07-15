
# 10_FLOW_03_BELOHNUNG_EINLOESEN.md

# WUXUAI Bonus V1 – Flow 03: Punkteeinlösung verwenden

Status: **LOCK**

Dieses Dokument beschreibt den vollständigen Flow 03 des WUXUAI Bonus Systems.

Flow 03 regelt, wie ein Gast eine bereits freigeschaltete Punkteeinlösung im Restaurant verwendet.

Flow 03 ist nicht der Flow zum Punkte sammeln.  
Flow 03 ist nicht der Flow zur Registrierung.  
Flow 03 ist nicht der Flow für Bonus Boost.  
Flow 03 ist der Flow für eine sichere, einfache und nachvollziehbare Einlösung.

---

## 1. Ziel von Flow 03

Das Ziel von Flow 03 lautet:

> Ein Gast kann eine freigeschaltete Punkteeinlösung öffnen, final bestätigen und sicher verwenden.

Der Ablauf soll für den Gast und für das Restaurant sofort verständlich sein:

```text
Gast öffnet Mein Bonus
→ Gast öffnet freigeschaltete Punkteeinlösung
→ Gast bestätigt final
→ System löst serverseitig ein
→ Punkte werden abgezogen
→ Produkt bleibt als Punkteeinlösung sichtbar
→ Audit wird geschrieben
```

---

## 2. Business-Ziel

Punkteeinlösungen sind der emotionale Gegenwert des Bonusprogramms.

Wenn der Gast Punkte sammelt, erwartet er irgendwann eine echte Gegenleistung.

Flow 03 muss deshalb drei Dinge gleichzeitig erreichen:

1. Der Gast fühlt sich belohnt.
2. Das Restaurant verliert keine Kontrolle.
3. Das System verhindert doppelte oder falsche Einlösungen.

Ein schlechter Einlöseprozess zerstört Vertrauen.

Ein guter Einlöseprozess erzeugt:

- Freude beim Gast
- Vertrauen beim Restaurant
- Wiederholungsbesuche
- nachvollziehbare Buchungen

---

## 3. One Problem Rule

🟢 **FIX**

Flow 03 löst genau ein Problem:

> Wie wird eine freigeschaltete Punkteeinlösung sicher verwendet?

Flow 03 darf nicht gleichzeitig Punkte sammeln, neue Punkteeinlösungen erstellen oder Kunden registrieren.

Verboten in diesem Flow:

- Punkte vergeben
- Rechnungsbetrag eingeben
- Bonus Boost aktivieren
- neue Gäste registrieren
- Punkteeinlösung bearbeiten
- Restaurantdaten ändern

---

## 4. Abgrenzung der Einlösungsarten

WUXUAI Bonus unterscheidet normale Punkteeinlösungen und Willkommensgeschenke.

### 4.1 Punkteeinlösungen

Punkteeinlösungen werden durch gesammelte Punkte freigeschaltet.

Beispiel:

```text
Gratis Dessert
benötigt 550 Punkte
```

Der Gast sammelt Punkte und kann die Punkteeinlösung verwenden, sobald genügend Punkte vorhanden sind.

### 4.2 Willkommensgeschenke

Willkommensgeschenke werden neuen Gästen einmalig zugeteilt.

Sie kosten keine Punkte.

Sie sind zunächst gesperrt und werden erst nach der ersten bezahlten Konsumation freigeschaltet.

Willkommensgeschenke werden separat verwaltet und dürfen nicht mit normalen Punkteeinlösungen vermischt werden.

---

## 5. Einlöseregel für Punkteeinlösungen

### 5.1 Voraussetzung

Eine Punkteeinlösung ist einlösbar, wenn:

- sie zum richtigen Restaurant gehört,
- sie aktiv ist,
- sie nicht abgelaufen ist,
- der Gast genügend Punkte besitzt,
- der Gast einen gültigen Kundentoken besitzt.

### 5.2 Einlösung

Bei Einlösung:

- der Gast bestätigt final,
- die öffentliche Einlöse-RPC prüft Kundentoken, Ownership und Rate-Limit,
- Punkte werden abgezogen,
- Redemption-Historie wird gespeichert,
- Punkteeinlösung bleibt als Produktangebot sichtbar,
- Status wird anhand des neuen Punktestands neu berechnet,
- Audit-Log wird geschrieben.

Normale Punkteeinlösungen sind Katalog-Produkte des Restaurants.
Sie sind nicht einmalige Geschenke.

Wenn der Gast nach der Einlösung noch genügend Punkte hat, kann er dieselbe
Punkteeinlösung erneut verwenden.

Wenn nicht genügend Punkte übrig sind, bleibt das Produkt sichtbar, wird aber
gesperrt angezeigt.

### 5.3 Finale Kundenbestätigung ohne PIN

🟢 **FIX**

Punkteeinlösung verwenden braucht in V1 keine PIN.

Der Gast sieht vor der finalen Einlösung:

```text
Punkte wirklich einlösen?
Nach der Bestätigung werden 300 Punkte von deinem Konto abgezogen.
```

Buttons:

- Abbrechen
- Ja, Punkte einlösen

Erst nach dieser Bestätigung wird serverseitig eingelöst.

Nach erfolgreicher Einlösung sieht der Gast:

```text
Punkteeinlösung erfolgreich.
300 Punkte wurden eingelöst.
```

Wichtig:

- keine persönliche Kellner-PIN auf dem Kundenhandy
- keine manuelle PIN-Verwaltung durch Restaurantbesitzer
- keine QR-Einlösung in V1
- normale Punkteeinlösungen dürfen bei erneut ausreichendem Punktestand erneut einlösbar sein
- Willkommensgeschenke bleiben einmalig
- maximal 5 öffentliche Einlöseversuche pro Kundentoken in 10 Minuten
- Kundentokens werden für Attempt-Logging nur gehasht gespeichert

---

## 6. Einlöseregel für Willkommensgeschenke

### 6.1 Grundregel

🟢 **FIX**

Willkommensgeschenke sind nicht sofort einlösbar.

Ablauf:

```text
Registrierung
→ Willkommensgeschenk wird ausgelost
→ Status: gesperrt
→ erste bezahlte Konsumation
→ Punktebuchung erfolgreich
→ Geschenk wird freigeschaltet
→ Einlösung erst beim nächsten Besuch
```

### 6.2 Warum erst beim nächsten Besuch?

Willkommensgeschenke sollen den zweiten Besuch fördern.

Sie sind ein Dankeschön für den ersten Besuch und ein Anreiz zur Rückkehr.

Sie dürfen nicht dazu führen, dass ein Gast sich registriert und sofort etwas gratis konsumiert.

### 6.3 Einlösbarkeit

Ein Willkommensgeschenk ist einlösbar, wenn:

- es dem Gast zugeteilt wurde,
- es freigeschaltet ist,
- es noch nicht eingelöst wurde,
- es zum richtigen Restaurant gehört,
- es aktiv ist,
- der Gast die finale Einlösung bestätigt.

### 6.4 Nicht im gleichen Besuch

Das Willkommensgeschenk wird nach der ersten Punktebuchung freigeschaltet, aber erst für den nächsten Besuch genutzt.

Produktregel:

> Willkommensgeschenk = Grund zum Wiederkommen.

---

## 7. Freunde-Einladung und Einlösung

Wenn ein Gast über Freunde-Einladung registriert wurde:

- kein Willkommensgeschenk,
- Bonus Boost nach erster Konsumation,
- keine Willkommensgeschenk-Einlösung.

Freunde-Einladung hat Vorrang.

Ein Gast darf niemals gleichzeitig erhalten:

- Willkommensgeschenk
- Bonus Boost als eingeladener Freund

---

## 8. Kundenansicht

### 8.1 Übersicht der Punkteeinlösungen

Im Kundenportal sieht der Gast:

1. Bonus Boost
2. Punkte
3. aktive Punkteeinlösungen und noch nicht erreichte Punkteeinlösungen
4. Willkommensgeschenk nur wenn relevant und nicht eingelöst
5. persönlicher Bonus-QR
6. Bonuskonto speichern

Die alte Sektion „Nächste Belohnungen“ existiert in V1 nicht mehr.

### 8.2 Freigeschaltete Punkteeinlösung

Beispiel:

```text
🎁 Gratis Dessert

550 Punkte

Einlösbar
```

Button:

```text
Jetzt Punkte einlösen
```

### 8.3 Gesperrte Punkteeinlösung

Wenn Punkte fehlen:

```text
Dir fehlen noch 100 Punkte.

≈ Noch ca. 4 € bis zur Einlösung.
```

Der Eurobetrag wird automatisch aus den Bonusregeln berechnet.

### 8.4 Gesperrtes Willkommensgeschenk

Vor erster Punktebuchung:

```text
🎁 Dein Willkommensgeschenk wartet auf dich.

Nach deiner ersten bezahlten Bestellung wird es freigeschaltet.
```

### 8.5 Freigeschaltetes Willkommensgeschenk

Nach erster Punktebuchung:

```text
🎉 Dein Willkommensgeschenk ist freigeschaltet.

Du kannst es bei deinem nächsten Besuch einlösen.
```

### 8.6 Einlöseansicht

Wenn der Gast auf „Jetzt einlösen“ klickt, sieht er einen klaren
Bestätigungsdialog.

Titel:

```text
Punkte wirklich einlösen?
```

Text:

```text
Nach der Bestätigung werden 300 Punkte von deinem Konto abgezogen.
```

Buttons:

```text
Abbrechen
Ja, Punkte einlösen
```

Nach Erfolg:

```text
Punkteeinlösung erfolgreich.
300 Punkte wurden eingelöst.
```

Der Text muss kurz sein.

Keine langen Erklärungen.

---

## 9. Restaurant-Sicht im Einlösefall

### 9.1 Zweck

Mitarbeiter brauchen in V1 für die Punkteeinlösung kein eigenes Gerät,
keinen Scanner und keine persönliche PIN.

Der Gast zeigt nach erfolgreicher Einlösung die Bestätigung:

```text
Punkteeinlösung eingelöst.
```

### 9.2 Ablauf

```text
Gast öffnet freigeschaltete Punkteeinlösung
→ Gast tippt „Jetzt einlösen“
→ Gast bestätigt final
→ System löst serverseitig ein
→ Gast zeigt Bestätigung im Restaurant
→ Produkt bleibt für spätere Einlösungen sichtbar
```

### 9.3 Warum ohne PIN?

V1 soll ohne Kellner-Gerät funktionieren.

Deshalb gilt:

- keine persönliche Kellner-PIN auf dem Kundenhandy
- keine manuelle PIN-Verwaltung durch Restaurantbesitzer
- keine QR-Einlösung in V1
- finale Kundenbestätigung ist Pflicht
- serverseitige Punktestandprüfung verhindert kostenlose Mehrfachnutzung
- Willkommensgeschenke bleiben serverseitig einmalig

### 9.4 Was Mitarbeiter nicht sehen sollen

Mitarbeiter sehen nicht:

- Restaurant-Einstellungen
- Abo
- Smart Reward Engine Einstellungen
- Plattformdaten
- technische Logs
- komplette Admin-Daten

---

## 10. PIN-Regel für Flow 03

### 10.1 Grundentscheidung

🟢 **FIX**

Flow 03 verwendet keine PIN.

Punkteeinlösung einlösen erfolgt:

- ohne Mitarbeiter-PIN
- ohne Tages-PIN
- ohne Staff Session im Kundenflow
- mit finaler Kundenbestätigung
- mit serverseitiger Prüfung

Die Tages-PIN gehört ausschließlich zu Flow 04 „Punkte sammeln“.

### 10.2 Sicherheitsziel

- Punkteeinlösung zieht nur serverseitig geprüfte Punkte ab.
- Punkteeinlösung gehört zum richtigen Gast.
- Punkteeinlösung gehört zum richtigen Restaurant.
- Einlösung wird auditierbar gespeichert.
- Nach Bestätigung wird der neue Punktestand berechnet.
- Erneute Einlösung ist nur möglich, wenn wieder genügend Punkte vorhanden sind.
- Willkommensgeschenke bleiben einmalig.

### 10.3 Fehlbedienung vermeiden

Der Bestätigungsdialog muss klar machen, dass Punkte abgezogen werden.

Der Gast muss vor dem Tippen verstehen:

```text
Nach der Bestätigung werden 300 Punkte von deinem Konto abgezogen.
```

---

## 11. Serverseitige Einlösung

### 11.1 Keine Frontend-Logik als Wahrheit

Das Frontend darf anzeigen, was wahrscheinlich einlösbar ist.

Die endgültige Entscheidung trifft der Server.

### 11.2 RPC

Einlösung erfolgt über sichere RPCs.

Die RPC muss prüfen:

- Restaurant stimmt
- Kunde gehört zum Restaurant
- Punkteeinlösung gehört zum Restaurant
- Punkteeinlösung ist aktiv
- Punkteeinlösung ist nicht abgelaufen
- Kunde hat genug Punkte
- finale Kundenbestätigung wurde ausgelöst
- Restaurant/Branch stimmt
- Tenant-Isolation stimmt

Für Willkommensgeschenke prüft die RPC zusätzlich:

- Geschenk wurde diesem Gast zugeteilt
- Geschenk ist freigeschaltet
- Geschenk wurde noch nicht eingelöst

### 11.3 Atomare Transaktion

Einlösung muss atomar sein.

Das bedeutet:

Entweder alles passiert:

- Punkteabzug
- Redemption-Historie
- Audit
- neuer Punktestand

Oder nichts passiert.

Es darf keinen Zwischenzustand geben.

### 11.4 Row Locking

Bei Einlösung müssen relevante Zeilen gelockt werden, damit Punktestand und Historie konsistent bleiben.

Problem, das verhindert werden muss:

```text
Gast löst Punkteeinlösung aus
Gast öffnet alten Screenshot oder alten Zustand erneut
→ Server prüft erneut den Punktestand
→ ohne genug Punkte keine erneute Einlösung
```

---

## 12. Audit-Log

### 12.1 Pflicht

Jede Einlösung wird protokolliert.

Audit enthält:

- restaurant_id
- branch_id falls vorhanden
- customer_id
- reward_id oder welcome_gift_id
- Aktion
- Zeit
- Punkte vorher/nachher falls Punkteeinlösung
- Metadaten
- Gerät/Device ID falls vorhanden

### 12.2 Warum Audit wichtig ist

Das Restaurant muss später nachvollziehen können:

- wer hat eingelöst?
- wann wurde eingelöst?
- welche Punkteeinlösung?
- welcher Gast?
- gab es Auffälligkeiten?

Das schützt Restaurant und Plattform.

---

## 13. Nach der Einlösung

### 13.1 Kundenportal

Nach erfolgreicher Einlösung:

- Punkte werden abgezogen
- Punkteeinlösung bleibt sichtbar
- Status wird anhand des neuen Punktestands neu berechnet
- wenn Punkte fehlen, erscheint sie gesperrt
- wenn Punkte reichen, bleibt sie einlösbar
- Verlauf kann später sichtbar sein
- Gast sieht klaren Erfolg

Beispiel:

```text
🎉 Punkteeinlösung erfolgreich.
300 Punkte wurden eingelöst.
```

### 13.2 Restaurantbestätigung

Gast zeigt im Restaurant:

```text
Punkteeinlösung eingelöst.
```

Das Restaurant sieht damit, dass für diese konkrete Nutzung Punkte eingelöst wurden.

### 13.3 Kein Rückgängig in V1

V1 benötigt keine komplexe Rückgängig-Funktion.

Wenn ein Fehler passiert, soll später ein Admin-Korrekturprozess mit Audit möglich sein.

V2 vorbereitet.

---

## 14. Fehlerzustände

### 14.1 Nicht genug Punkte

Anzeige:

```text
Du hast noch nicht genug Punkte.
```

### 14.2 Willkommensgeschenk bereits eingelöst

Nur für Willkommensgeschenke:

Anzeige:

```text
Dieses Willkommensgeschenk wurde bereits eingelöst.
```

### 14.3 Nicht freigeschaltet

Für Willkommensgeschenk:

```text
Dieses Willkommensgeschenk wird erst nach der ersten bezahlten Bestellung freigeschaltet.
```

### 14.4 Bestätigung abgebrochen

Wenn der Gast abbricht, wird nichts eingelöst.

### 14.5 Falsches Restaurant

```text
Diese Punkteeinlösung gehört nicht zu diesem Restaurant.
```

Keine technischen Fehlertexte.

Keine RPC-Fehler roh anzeigen.

---

## 15. UX-Regeln

### 15.1 Kundenportal

- große Karten
- klare Produktbilder
- wenig Text
- „Jetzt einlösen“
- klarer Bestätigungsdialog
- keine technische Sprache

### 15.2 Restaurantrealität

- kein Kellner-Gerät nötig
- keine PIN-Abfrage bei Einlösung
- Bestätigung muss in Sekunden verständlich sein
- keine unnötigen Felder

### 15.3 Restaurant Reality Check

Ein Kellner im Mittagsstress muss die Bestätigung in wenigen Sekunden verstehen.

Wenn der Gast oder Mitarbeiter Schulung braucht, ist der Flow nicht fertig.

---

## 16. Keine Vermischung mit Punkte sammeln

Flow 03 darf nicht den Rechnungsbereich oder Bonus QR nutzen.

Punkte sammeln ist Flow 04.

Punkteeinlösung einlösen ist Flow 03.

Der Unterschied muss in UI und Code klar bleiben.

---

## 17. Keine Vermischung mit Punkteeinlösung erstellen

Punkteeinlösung erstellen und bearbeiten gehört in das Restaurant Portal unter Punkteeinlösungen.

Flow 03 nutzt vorhandene Punkteeinlösungen.

Flow 03 erstellt keine neuen Punkteeinlösungen.

---

## 18. Sicherheitsregeln

Verboten:

- Einlösung ohne ausdrückliche finale Kundenbestätigung
- Einlösung ohne finale Kundenbestätigung
- persönliche Kellner-PIN auf dem Kundenhandy
- Tages-PIN für Punkteeinlösung verwenden
- Einlösung über falsches Restaurant
- Einlösung ohne Serverprüfung
- doppelter Punkteabzug
- doppelte Redemption
- öffentliche Tabellenreads
- Kundendaten anderer Restaurants anzeigen
- technische Fehler im UI anzeigen
- Customer Code als geheimes Zugriffsmittel verwenden

---

## 19. V2 Hinweise

V2 kann enthalten:

- Admin-Korrekturprozess
- Rückgängig innerhalb kurzer Zeit
- Manager-Freigabe für teure Punkteeinlösungen
- Belegfoto
- POS-Integration
- Kassensystem-Bestätigung
- automatische Küchenhinweise
- Wochenplan der Punkteeinlösungen
- Tageslimits für Einlösungen
- Umsatzanalyse pro eingelöster Punkteeinlösung

V1 bleibt einfach.

---

## 20. Datenmodell-Hinweise

Benötigte Konzepte:

- customers
- rewards
- customer_rewards oder reward redemptions
- welcome gift assignments
- points_transactions
- audit_log
- restaurants
- branches

Keine neue Datenbankstruktur darf ohne Prüfung bestehende Flows brechen.

---

## 21. LOCK Kriterien

Flow 03 ist LOCK, wenn:

- Kunde sieht freigeschaltete Punkteeinlösung
- Kunde kann Einlöseansicht öffnen
- Kunde muss final bestätigen
- Einlösung braucht keine PIN
- keine persönliche Kellner-PIN erscheint auf dem Kundenhandy
- Server prüft alle Bedingungen
- Einlösung ist atomar
- Punkte werden korrekt abgezogen
- Willkommensgeschenk-Regel wird beachtet
- Punkteeinlösung verschwindet nach Einlösung
- Audit wird geschrieben
- alle Texte Deutsch
- Build erfolgreich

---

## 22. Codex-Regeln

Wenn Codex an Flow 03 arbeitet:

1. Diese Datei zuerst lesen.
2. Punkte sammeln nicht in Flow 03 einbauen.
3. Einlösung ohne finale Kundenbestätigung niemals erlauben.
4. Willkommensgeschenk-Regeln beachten.
5. Keine PIN für Punkteeinlösung verwenden.
6. Serverseitige RPC-Prüfung nicht umgehen.
7. Audit-Log schreiben.
8. Keine technischen Fehler anzeigen.
9. Mobile/Tablet UX prüfen.
10. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
## CTO-Entscheidung 2026-07-14: Verbindliche Bestätigung und Einlösecode

🟢 **FIX / V1 / VORRANG VOR ÄLTEREN DIREKT-EINLÖSUNGSABSCHNITTEN**

Der sichtbare Produktbegriff lautet „Punkteeinlösung“.

Aktiver V1-Ablauf:

1. Gast öffnet Punkteeinlösung, Willkommensgeschenk oder Geburtstagsgeschenk.
2. Die UI warnt: „Bitte erst direkt vor dem Mitarbeiter bestätigen.“
3. Gast bestätigt „Jetzt verbindlich einlösen“.
4. Der Server prüft Gast, Restaurant/Filiale, Status und Punktestand atomar.
5. Bei Punkteeinlösungen werden Punkte verbindlich reserviert/abgezogen; bei Geschenken wird die einmalige Zuteilung auf `redemption_started` gesetzt.
6. Der Server erzeugt einen gehasht gespeicherten sechsstelligen Code mit 15 Minuten Gültigkeit.
7. Der Mitarbeiter bestätigt den Code ohne PIN.
8. Der Server setzt Code und Einlösung atomar auf verwendet/eingelöst.

Ein abgelaufener Geschenkcode bleibt verbraucht. Bei einer normalen Punkteeinlösung ist ein neuer Versuch nur durch eine neue ausdrückliche Kundenbestätigung mit neuer Idempotency-ID möglich; der Punktestand wird erneut geprüft und Punkte werden erneut abgezogen. Screenshots alter Codes funktionieren nicht.

Die Tages-PIN wird weiterhin niemals für Einlösungen verwendet. Aussagen in älteren Abschnitten, wonach die Einlösung unmittelbar nach dem Kundenbutton vollständig abgeschlossen ist oder eine reine Bestätigungsansicht ausreicht, sind durch diese Entscheidung ersetzt.
