
# 09_FLOW_02_GAST_WERDEN.md

# WUXUAI Bonus V1 – Flow 02: Gast werden

Status: **LOCK**

Dieses Dokument beschreibt den vollständigen Flow 02 des WUXUAI Bonus Systems.

Flow 02 ist der Kunden-Einstieg. Er entscheidet darüber, ob aus einem unbekannten Gast ein registriertes Bonusmitglied wird.

Flow 02 ist einer der wichtigsten Flows des gesamten Produkts. Wenn dieser Flow kompliziert ist, registrieren sich zu wenige Gäste. Wenn dieser Flow schnell, emotional und einfach ist, entsteht der Kernwert der Plattform.

---

## 1. Ziel von Flow 02

Das Ziel von Flow 02 lautet:

> Ein neuer Gast soll in unter 30 Sekunden Mitglied werden.

Der Gast soll nicht suchen.  
Der Gast soll nicht ein Restaurant auswählen.  
Der Gast soll kein Passwort erstellen.  
Der Gast soll keine App installieren.  
Der Gast soll keine SMS abwarten.  
Der Gast soll keine lange Erklärung lesen.

Der Gast soll:

```text
QR scannen
→ Restaurant erkannt
→ Vorteil sehen
→ Vorname + Telefonnummer eingeben
→ Mitglied werden
→ persönlichen QR sehen
→ Mein Bonus öffnen
```

---

## 2. Business-Ziel

Flow 02 ist kein normales Registrierungsformular.

Flow 02 ist der Moment, in dem das Restaurant eine anonyme Person in eine wiederkehrende Kundenbeziehung überführt.

Ohne Flow 02 gibt es:

- keine Stammgäste im System
- keine Punktehistorie
- keine Belohnungen
- keinen Bonus Boost
- keine Empfehlungen
- keine Rückkehrlogik

Flow 02 ist deshalb der Beginn der Kundenbindung.

---

## 3. Grundregel: Smart Context

🟢 **FIX**

Der Kunde sucht niemals das Restaurant.

Der QR-Code setzt den Restaurant-Kontext automatisch.

Ablauf:

```text
Gast scannt QR
→ Restaurant wird erkannt
→ Branding wird geladen
→ richtige Registrierung wird geöffnet
→ richtige Belohnungslogik wird geladen
```

Der Gast darf nicht manuell durch eine Restaurantliste gehen müssen.

Verboten:

- Restaurant suchen
- Restaurant auswählen
- Restaurantwechsel manuell verlangen
- generische Plattform-Startseite vor den QR-Flow stellen

Erlaubt:

- automatische Restaurant-Erkennung über Slug/QR
- transparente Rückmeldung: „Willkommen bei [Restaurantname]“

---

## 4. Einstiegsrouten

Flow 02 kann über mehrere sichere öffentliche Einstiege beginnen.

### 4.1 Restaurant QR

Route:

```text
/customer/:restaurantSlug
```

Zweck:

- normale Registrierung
- neuer Gast kommt ohne Freundeseinladung
- Gast erhält später ein Willkommensgeschenk

### 4.2 Referral QR / Freunde-Einladung

Route:

```text
/r/:restaurantSlug/:referralToken
```

Zweck:

- Gast kommt über Einladung
- kein Willkommensgeschenk
- Bonus Boost wird nach erster Konsumation aktiviert

### 4.3 Kampagnen- oder Angebotsrouten

Historisch existierende Kampagnenrouten dürfen nicht die V1-Produktlogik dominieren.

V1-Entscheidung:

- Aktionen/Kampagnen sind aus V1-UI entfernt
- Kunden-Einstieg erfolgt primär über Restaurant QR, Bonus QR oder Referral QR

---

## 5. Der erste Bildschirm

### 5.1 Ziel

Der erste Bildschirm muss in 3 Sekunden verständlich sein.

Er zeigt:

- Restaurantlogo
- Restaurantname
- klaren Vorteil
- primären CTA

### 5.2 Beispieltext

```text
Willkommen bei Akakiko Hietzing

Starte dein Bonusprogramm.

Sammle Punkte und sichere dir deine erste Belohnung.

[Jetzt Mitglied werden]
```

### 5.3 Keine Datenabfrage zuerst

🟢 **FIX**

Zuerst Vorteil zeigen.  
Dann Daten abfragen.

Nicht:

```text
Bitte registriere dich.
```

Sondern:

```text
Das bekommst du, wenn du Mitglied wirst.
```

---

## 6. Registrierung

### 6.1 Pflichtfelder

V1 Pflichtfelder:

- Vorname
- Telefonnummer

### 6.2 Optionale Felder

Optional:

- Geburtstag

### 6.3 Nicht erlaubte Felder in V1

Nicht abfragen:

- Passwort
- E-Mail als Pflicht
- Adresse
- Nachname als Pflicht
- Loginname
- Geschlecht
- lange Profilinformationen

### 6.4 Keine OTP-Kosten

🟢 **FIX**

V1 nutzt keine SMS- oder WhatsApp-Verifizierung.

Grund:

- keine laufenden Messaging-Kosten
- weniger Komplexität
- schnellerer Einstieg
- höhere Registrierungsrate

Verboten in V1:

- SMS OTP
- WhatsApp OTP
- E-Mail-Bestätigung für Gäste
- Passwortzwang

### 6.5 Telefonnummer als Identifikation

Die Telefonnummer dient in V1 als einfaches Wiedererkennungsmerkmal.

Sie ist kein perfekter Sicherheitsanker.

Deshalb gilt:

- Telefonnummer muss pro Restaurant eindeutig sein
- bestehende Telefonnummer darf kein fremdes Kundenprofil offenlegen
- bei bestehender Telefonnummer muss sicher und datensparsam reagiert werden

---

## 7. Nach erfolgreicher Registrierung

Nach erfolgreicher Registrierung darf der Gast nicht auf ein Profil-Formular geleitet werden.

Der Gast sieht:

```text
🎉 Willkommen!

Du bist jetzt Mitglied.

[Mein QR anzeigen]
[Mein Bonus öffnen]
```

Der persönliche QR ist sofort verfügbar.

---

## 8. Willkommensgeschenk bei normaler Registrierung

### 8.1 Grundregel

🟢 **FIX**

Bei normaler Erstanmeldung über den Restaurant-QR wird zufällig ein Willkommensgeschenk zugeteilt.

Aber:

Es wird nicht sofort freigeschaltet.

Freunde-Einladungen erhalten kein Willkommensgeschenk.

Die Zufallsauswahl verwendet immer den aktuell aktiven Welcome-Gift-Pool des
Restaurants.

Restaurantbesitzer können Willkommensgeschenke nach dem Onboarding im
Restaurant Portal bearbeiten, aktivieren und deaktivieren.

Ein Restaurant darf mehrere aktive Willkommensgeschenk-Optionen gleichzeitig
haben.

Wichtig:

- Restaurant-Konfiguration: mehrere aktive Optionen erlaubt.
- Kunden-Zuteilung: pro Kunde maximal ein Willkommensgeschenk.
- Die alte Regel „nur ein aktives Willkommensgeschenk pro Restaurant“ ist falsch.

Neue zukünftige Zuteilungen nutzen diese aktualisierten Daten.

Bereits eingelöste Willkommensgeschenke werden dadurch nicht erneut sichtbar
oder erneut einlösbar.

### 8.2 Ablauf

```text
Registrierung
→ Geschenk wird ausgelost
→ Geschenk wird gespeichert
→ Status: gesperrt
→ erste bezahlte Konsumation
→ Punktebuchung erfolgreich
→ Geschenk wird freigeschaltet
→ Einlösung erst beim nächsten Besuch
```

### 8.3 Warum gesperrt?

Das Willkommensgeschenk soll den zweiten Besuch fördern.

Es darf nicht dazu führen, dass ein Gast sich anmeldet, sofort etwas gratis konsumiert und danach nie wiederkommt.

Produktregel:

> Willkommensgeschenke fördern den zweiten Besuch, nicht kostenlose Sofort-Mitnahme.

### 8.4 Kundenportal vor Freischaltung

Vor erster Punktebuchung:

```text
🎁 Dein Willkommensgeschenk wartet auf dich.

Nach deiner ersten bezahlten Bestellung wird es freigeschaltet.
```

### 8.5 Kundenportal nach Freischaltung

Nach erster Punktebuchung:

```text
🎉 Dein Willkommensgeschenk ist freigeschaltet.

Du kannst es bei deinem nächsten Besuch einlösen.
```

### 8.6 Zufallsauswahl und Tageslimit

Die Auswahl erfolgt serverseitig.

Standardquoten:

- Kaffee 25 %
- Getränk 25 %
- Dessert 20 %
- Vorspeise 18 %
- Menü 5 %
- Sushi 3 %
- Hauptspeise 2 %
- Eigene Belohnung 2 %

Tageslimits V1:

- Gratis Menü: maximal 3 Vergaben pro Tag
- Gratis Hauptspeise: maximal 3 Vergaben pro Tag
- alle anderen Kategorien: kein Tageslimit

Wenn ein Tageslimit erreicht ist:

- Kategorie überspringen
- Wahrscheinlichkeit auf übrige aktive Kategorien neu verteilen
- kein Fehler für den Gast anzeigen

---

## 9. Registrierung über Freunde-Einladung

### 9.1 Vorrangregel

🟢 **FIX**

Wenn ein Gast über eine Freunde-Einladung kommt, erhält er kein Willkommensgeschenk.

Stattdessen gilt:

```text
Freunde-Einladung
→ Registrierung
→ kein Willkommensgeschenk
→ erste bezahlte Konsumation
→ Punktebuchung
→ Bonus Boost für eingeladenen Gast und einladenden Gast
```

### 9.2 Warum?

Ein eingeladener Freund erhält bereits einen starken Vorteil:

- Bonus Boost
- 2× Punkte
- Aktivierung nach echter Konsumation

Ein zusätzliches Willkommensgeschenk wäre zu großzügig und würde die Wirtschaftlichkeit schwächen.

### 9.3 Nie beides gleichzeitig

Ein Gast darf niemals gleichzeitig erhalten:

- Willkommensgeschenk
- Bonus Boost als eingeladener Freund

Freunde-Einladung hat immer Vorrang.

---

## 10. Zufällige Zuteilung des Willkommensgeschenks

### 10.1 Grundregel

Die Zuteilung erfolgt serverseitig.

Nicht im Frontend.

### 10.2 Smart Reward Engine

Die Smart Reward Engine nutzt zentral verwaltete Standardwerte.

Beispielhafte V1-Quoten:

- Kaffee 25 %
- Getränk 25 %
- Dessert 20 %
- Vorspeise 18 %
- Menü 5 %
- Sushi 3 %
- Hauptspeise 2 %
- Eigene Belohnung 2 %

Die Summe muss 100 % ergeben.

### 10.3 Aktive Kategorien

Wenn Restaurant nur bestimmte Willkommenskategorien gewählt hat, werden nur diese berücksichtigt.

Wenn nur eine Kategorie aktiv ist, erhält diese automatisch 100 %.

Wenn mehrere aktiv sind, werden die Quoten proportional auf die aktiven Kategorien normalisiert.

### 10.4 Keine Restaurant-Einstellung in V1

Restaurantbesitzer stellen in V1 keine Wahrscheinlichkeiten ein.

Sie wählen nur Kategorien.

---

## 11. Customer Token und QR Sicherheit

### 11.1 Customer QR Token

Der persönliche Kundenzugang erfolgt über einen sicheren Token.

Der Token ist nicht einfach die Telefonnummer.

Der Token ist nicht der Customer Code.

### 11.2 Customer Code

Customer Code darf als Anzeige- oder Suchhilfe existieren.

Er ist kein Geheimnis.

Er darf nicht als alleiniger Zugriffsschutz dienen.

### 11.3 Speicherung

Der Kundentoken kann im Browser gespeichert werden, aber:

- Token muss restaurantspezifisch sein
- Token darf nicht tenantübergreifend funktionieren
- Token darf nicht fremde Kundendaten öffnen

### 11.4 Public RPC

Öffentliche Kundenrouten lesen keine Tabellen direkt.

Sie nutzen sichere RPCs.

Verboten:

- öffentliche SELECTs auf customer table
- erste Kundenzeile eines Restaurants anzeigen
- Demo-Fallback in Produktion
- Kundenportal ohne gültige Identität öffnen

---

## 12. Device ID

### 12.1 Zweck

V1 darf eine Web Device ID als Anti-Abuse-Signal verwenden.

Diese ID ist keine echte MAC-Adresse.

Sie ist eine zufällige UUID im Browser.

### 12.2 Verwendung

Device ID darf genutzt werden für:

- Registrierung
- Referral Registrierung
- Punktebuchung
- Audit
- Warnhinweise

### 12.3 Keine harte Sperre

Device ID ist kein perfekter Schutz.

Browserdaten können gelöscht werden.

Deshalb:

- Device ID = Warnsignal
- Telefonnummer = stärkere Eindeutigkeit
- echte Konsumation = Hauptschutz

---

## 13. Anti-Abuse-Regeln im Kunden-Einstieg

### 13.1 Telefonnummer

Eine Telefonnummer darf pro Restaurant nur einmal als aktiver Kunde existieren.

### 13.2 Keine Selbst-Einladung

Ein Kunde darf sich nicht selbst einladen.

### 13.3 Kein A↔B Zirkel

Wenn A B eingeladen hat, darf B nicht A als neuen Freund einladen.

### 13.4 Nur echte Konsumation aktiviert Vorteile

Referral Bonus Boost wird nicht bei Registrierung aktiviert.

Willkommensgeschenk wird nicht bei Registrierung freigeschaltet.

Beides benötigt echte Punktebuchung nach bezahlter Konsumation.

---

## 14. Kundenportal nach Registrierung

### 14.1 Hauptinhalte

Das Kundenportal zeigt:

- Restaurantlogo
- Restaurantname
- persönlicher QR
- Punkte
- Belohnungen
- Willkommensgeschenk
- Bonus Boost
- Freunde einladen
- aktuelle Vorteile

### 14.2 Kein Admin

Verboten:

- Restaurantdaten bearbeiten
- Mitarbeiterfunktionen
- Abos
- technische IDs
- interne Logs

### 14.3 Minimalität

Das Kundenportal ist kein CRM.

Es soll dem Gast zeigen:

- Was habe ich?
- Was fehlt mir?
- Was kann ich einlösen?
- Was bekomme ich, wenn ich wiederkomme?

---

## 15. Fehlende Punkte und geschätzter Eurobetrag

Wenn der Gast nicht genug Punkte für eine Belohnung hat, zeigt das System:

```text
Dir fehlen noch XX Punkte.

≈ Noch ca. XX € bis zur Einlösung.
```

Diese Berechnung erfolgt automatisch aus den Bonusregeln.

Der Gast soll erkennen:

> Ich bin nah dran. Ein weiterer Besuch lohnt sich.

---

## 16. Bonus Boost Anzeige

### 16.1 Sichtbarkeit

🟢 **FIX**

Bonus Boost ist emotionaler Kernmechanismus.

Wenn aktiv, muss er oben im Kundenportal sichtbar sein.

Beispiel:

```text
🔥 Heute sammelst du 2× Punkte!
Noch 24 Tage aktiv.
```

### 16.2 Freunde einladen

Der Gast sieht:

```text
Lade einen Freund ein
+30 Tage Bonus Boost
```

### 16.3 Kein versteckter Bonus

Bonus Boost darf nicht tief im Menü versteckt werden.

---

## 17. QR Verhalten für Kunden

### 17.1 Mein QR

Der Kunde kann seinen persönlichen QR zeigen.

Verwendung:

- Mitarbeiter findet Kundenkonto
- Belohnung einlösen
- Willkommensgeschenk prüfen

### 17.2 Bonus QR

Der Bonus QR des Restaurants dient zum Punkte sammeln.

Ablauf:

```text
Gast bezahlt
→ scannt Bonus QR
→ Restaurant erkannt
→ Rechnungsbereich wählen
→ Punkte werden gutgeschrieben
```

### 17.3 Kein freier Betrag

Der Gast gibt keinen freien Eurobetrag ein.

Er wählt Rechnungsbereiche.

---

## 18. Smart Upsell

Beim Punkte sammeln kann die App anzeigen:

```text
Nur noch X € bis zur nächsten Bonusstufe.
```

Ziel:

- Durchschnittsbon erhöhen
- Gast emotional motivieren
- mehr Umsatz für Restaurant

Diese Anzeige muss kurz, klar und nicht aufdringlich sein.

---

## 19. Dynamic „So funktioniert’s“

### 19.1 Grundregel

„So funktioniert’s“ ist dynamisch.

Es wird aus Restaurant-Einstellungen erzeugt.

### 19.2 Kundenportal

Es erklärt:

- wie Punkte gesammelt werden
- welche Belohnungen möglich sind
- ob Bonus Boost aktiv ist
- wie Freunde-Einladung funktioniert
- wann Willkommensgeschenk freigeschaltet wird

### 19.3 Keine harten Werte

Keine festen Texte wie „2× für 30 Tage“, wenn Restaurant später andere Werte hat.

Werte kommen aus Konfiguration.

---

## 20. UX-Regeln

### 20.1 Mobile First

Kundenportal wird zuerst für Smartphones entwickelt.

Typische Nutzung:

- Gast sitzt am Tisch
- Gast steht an der Kassa
- Gast hält Handy in einer Hand

### 20.2 Keine langen Texte

Kunden lesen nicht lange Erklärungen.

Verwenden:

- Icons
- KPI-Karten
- kurze Sätze
- klare Zahlen

### 20.3 Emotion

Der Gast soll sich freuen.

Beispiele:

- „Fast geschafft“
- „Heute sammelst du 2× Punkte“
- „Dein Geschenk wartet auf dich“
- „Nur noch ca. 4 €“

---

## 21. Was ausdrücklich verboten ist

Verboten:

- Passwortpflicht für Gäste
- SMS OTP in V1
- WhatsApp OTP in V1
- E-Mail-Pflicht
- lange Registrierung
- Restaurantauswahl durch Gast
- öffentliche Kundentabellen lesen
- Customer Code als Geheimnis nutzen
- Willkommensgeschenk sofort einlösbar machen
- Referral-Gast zusätzliches Willkommensgeschenk geben
- Bonus Boost bei Registrierung aktivieren
- englische UI-Texte
- technische Begriffe im Kundenportal
- Admin-Funktionen im Kundenportal

---

## 22. V2 Hinweise

V2 kann enthalten:

- echtes passwortloses Login mit SMS/WhatsApp optional
- Push-Benachrichtigungen
- Wochenübersicht der Belohnungen
- Lieblingsbelohnungen
- Wallet mit mehreren Restaurants
- Multi-Branch Bonuskonten
- dynamische Promotion-Flächen
- Geburtstagsbonus
- bessere Wiederherstellung bei Gerätewechsel

V1 bleibt einfacher.

---

## 23. Restaurant Reality Check

Flow 02 ist erfolgreich, wenn:

1. Gast kann in unter 30 Sekunden Mitglied werden.
2. Gast muss kein Restaurant suchen.
3. Gast versteht den Vorteil sofort.
4. Gast gibt nur Vorname und Telefonnummer ein.
5. Gast erhält sofort sein Kundenkonto.
6. Willkommensgeschenk wird korrekt zugeteilt, aber nicht sofort freigeschaltet.
7. Referral-Gast erhält kein Willkommensgeschenk.
8. Kundenportal zeigt klar, was als Nächstes passiert.

---

## 24. LOCK Kriterien

Flow 02 ist LOCK, wenn:

- Smart Context funktioniert
- `/customer/:slug` öffnet richtige Restaurantansicht
- Registrierung ohne Passwort/SMS/WhatsApp funktioniert
- sichere Kundentokens erstellt werden
- keine Demo-Daten in Produktion erscheinen
- Willkommensgeschenk korrekt gesperrt ist
- Freunde-Einladung Vorrang hat
- Bonus Boost nach erster Punktebuchung aktiviert
- Kundenportal mobil sauber ist
- alle Texte Deutsch sind
- Build erfolgreich ist

---

## 25. Codex-Regeln

Wenn Codex an Flow 02 arbeitet:

1. Diese Datei zuerst lesen.
2. Keine SMS/WhatsApp einbauen.
3. Keine Passwortlogik einbauen.
4. Keine Restaurant-Suche einbauen.
5. Keine öffentlichen Tabellenzugriffe.
6. Keine Demo-Fallbacks in Produktion.
7. Willkommensgeschenk nicht sofort freischalten.
8. Referral-Regel nicht überschreiben.
9. Mobile First prüfen.
10. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
## CTO-Ergänzung 2026-07-14: Eindeutige Geschenkzuteilung

🟢 **FIX / V1**

- Eine normale Erstanmeldung erzeugt höchstens ein Willkommensgeschenk pro Gast und Restaurant/Filiale.
- Reload, erneuter QR-Scan, Gerätewechsel und parallele Registrierung dürfen kein zweites Willkommensgeschenk erzeugen.
- Geburtstagsgeschenke sind getrennte Zuteilungen und entstehen höchstens einmal pro Gast, Restaurant/Filiale und Kalenderjahr.
- Die Geburtstagsauswahl erfolgt ausschließlich serverseitig aus dem aktiven Willkommensgeschenk-Pool.
