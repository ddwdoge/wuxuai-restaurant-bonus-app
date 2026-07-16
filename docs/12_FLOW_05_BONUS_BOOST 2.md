
# 12_FLOW_05_BONUS_BOOST.md

# WUXUAI Bonus V1 – Flow 05: Bonus Boost

Status: **LOCK**

Dieses Dokument beschreibt den vollständigen Flow 05 des WUXUAI Bonus Systems.

Flow 05 regelt, wie Gäste Freunde einladen und dadurch einen zeitlich begrenzten Punkte-Multiplikator erhalten.

Flow 05 ist nicht einfach ein Empfehlungsprogramm.  
Flow 05 ist ein emotionaler Kundenbindungsmechanismus.

Der Bonus Boost ist einer der wichtigsten Alleinstellungsmerkmale von WUXUAI Bonus.

---

## 1. Ziel von Flow 05

Das Ziel von Flow 05 lautet:

> Ein Gast lädt einen Freund ein. Der Bonus Boost wird erst aktiviert, wenn der eingeladene Freund wirklich im Restaurant konsumiert und Punkte gesammelt hat.

Der Flow soll echte Restaurantbesuche erzeugen.

Nicht nur Registrierungen.

Nicht Fake-Konten.

Nicht einmalige Punkteschenke.

---

## 2. Business-Ziel

Normale Empfehlungsprogramme funktionieren oft so:

```text
Freund einladen
→ 500 Punkte erhalten
→ fertig
```

WUXUAI Bonus funktioniert anders:

```text
Freund einladen
→ Freund registriert sich
→ Freund kommt wirklich essen
→ Freund sammelt Punkte
→ beide erhalten Bonus Boost
→ beide kommen öfter zurück
```

Das Ziel ist nicht eine einmalige Belohnung.

Das Ziel ist:

- wiederkehrende Besuche
- höhere Motivation
- mehr Empfehlungen
- mehr Konsumation
- stärkere Kundenbindung
- mehr Umsatz für das Restaurant

---

## 3. Grundentscheidung: Bonus Boost statt Einmalbonus

🟢 **FIX**

Freunde-Einladung gibt keinen einfachen einmaligen Punktebonus.

Stattdessen gibt sie einen zeitlich begrenzten Punkte-Multiplikator.

Standard in V1:

```text
2× Punkte
30 Tage aktiv
```

Das ist emotional stärker als:

```text
500 Punkte einmalig
```

Warum?

Ein Einmalbonus ist schnell vergessen.  
Ein aktiver Boost erzeugt laufende Motivation.

Der Gast denkt:

> „Solange mein Boost aktiv ist, lohnt sich jeder Besuch mehr.“

---

## 4. Standardwerte V1

### 4.1 Multiplikator

Standard:

```text
2× Punkte
```

### 4.2 Dauer

Standard:

```text
30 Tage
```

### 4.3 Verlängerung

🟢 **FIX**

Jeder weitere erfolgreich eingeladene Freund verlängert den Bonus Boost.

Standard:

```text
+30 Tage pro erfolgreichem Freund
```

Beispiel:

```text
1 erfolgreicher Freund → 30 Tage Bonus Boost
2 erfolgreiche Freunde → 60 Tage Bonus Boost
3 erfolgreiche Freunde → 90 Tage Bonus Boost
```

### 4.4 Konfigurierbarkeit

Restaurant kann später einstellen:

- Multiplikator: 1,25× / 1,5× / 2× / 3×
- Dauer: 14 / 30 / 60 Tage
- Verlängerung pro Freund: 14 / 30 / 60 Tage

V1 darf diese Werte einfach halten.  
Architektur muss sie vorbereiten.

---

## 5. Aktivierungsregel

🟢 **FIX**

Bonus Boost wird nicht bei Registrierung aktiviert.

Bonus Boost wird erst aktiviert, wenn der eingeladene Freund:

1. sich registriert,
2. im richtigen Restaurant konsumiert,
3. eine erfolgreiche Punktebuchung aus Flow 04 erhält.

Erst dann:

```text
Einladender Gast erhält Bonus Boost
Eingeladener Gast erhält Bonus Boost
```

### Warum?

Registrierung allein erzeugt noch keinen Umsatz.

WUXUAI Bonus belohnt echte Restaurantbesuche, nicht Fake-Registrierungen.

---

## 6. Ablauf: Gast lädt Freund ein

### 6.1 Kunde öffnet Mein Bonus

Im Kundenportal sieht der Gast:

```text
🔥 Bonus Boost
```

Bonus Boost steht in der Kundenansicht immer oben.

Danach folgen:

1. Punkte
2. Punkteeinlösungen
3. Willkommensgeschenk nur wenn relevant und nicht eingelöst
4. persönlicher Bonus-QR
5. Bonuskonto speichern

Wenn Boost aktiv:

```text
🔥 2× Punkte aktiv
Du sammelst aktuell doppelte Punkte.
Noch 24 Tage gültig.
```

Wenn Boost nicht aktiv:

```text
🔥 Lade einen Freund ein
Ihr sammelt beide 30 Tage lang 2× Punkte, sobald dein Freund erstmals Punkte sammelt.
```

Zusätzlich gilt für die Kundenansicht:

- Die Punktekarte zeigt bei aktivem Boost ein Feuer-Symbol.
- Die Punktekarte zeigt den Hinweis „2× Bonus Boost aktiv“.
- Nach einer Punktebuchung zeigt die Erfolgsmeldung Normalpunkte, Bonus-Boost-Zusatz und Gesamtpunkte.
- Der „So funktioniert’s“-Drawer erklärt den Bonus Boost mit einem einfachen Beispiel.
- Abgelaufene Boosts werden nicht als aktiv angezeigt.

### 6.2 Freund einladen

Gast klickt:

```text
Freund einladen
```

System erzeugt:

- Referral-Link
- Referral-QR

Route:

```text
/r/:restaurantSlug/:referralToken
```

### 6.3 Freund öffnet Link

Freund sieht:

- Restaurantlogo
- Restaurantname
- Hinweis auf Bonus Boost
- Registrierung mit Vorname und Telefonnummer

Keine SMS.  
Kein WhatsApp.  
Kein Passwort.

### 6.4 Registrierung des Freundes

Nach Registrierung:

- Referral wird gespeichert
- Status: pending / wartet auf erste Konsumation
- noch kein Boost aktiv
- kein Willkommensgeschenk

### 6.5 Erste Konsumation

Freund konsumiert.

Freund sammelt Punkte über Flow 04.

Dann:

- Referral wird aktiviert
- Bonus Boost wird bei beiden gesetzt
- Audit wird geschrieben

---

## 7. Freunde-Einladung hat Vorrang vor Willkommensgeschenk

🟢 **FIX**

Wenn ein Gast über eine Freunde-Einladung kommt, erhält er kein Willkommensgeschenk.

Grund:

Der eingeladene Freund bekommt bereits einen starken Vorteil:

```text
2× Punkte
30 Tage Bonus Boost
```

Ein zusätzliches Willkommensgeschenk wäre zu großzügig und gefährdet die Wirtschaftlichkeit.

Regel:

```text
Referral-Gast
→ kein Willkommensgeschenk
→ Bonus Boost nach erster Punktebuchung
```

Normaler Gast:

```text
Normale Registrierung
→ Willkommensgeschenk gesperrt
→ Freischaltung nach erster Punktebuchung
```

Ein Gast darf niemals gleichzeitig erhalten:

- Willkommensgeschenk
- Bonus Boost als eingeladener Freund

Freunde-Einladung hat immer Vorrang.

---

## 8. Bonus Boost Status

### 8.1 Inaktiv

Gast hat keinen aktiven Bonus Boost.

Anzeige:

```text
🔥 Bonus Boost

Lade einen Freund ein.
Ihr sammelt beide 2× Punkte, sobald dein Freund erstmals Punkte sammelt.
```

### 8.2 Pending

Gast hat jemanden eingeladen, aber der Freund hat noch nicht konsumiert.

Anzeige:

```text
Einladung wartet.

Sobald dein Freund erstmals Punkte sammelt, startet euer Bonus Boost.
```

### 8.3 Aktiv

Gast hat aktiven Bonus Boost.

Anzeige oben im Kundenportal:

```text
🔥 Heute sammelst du 2× Punkte!

Noch 24 Tage aktiv.
```

### 8.4 Verlängert

Wenn weiterer Freund erfolgreich aktiviert wird:

```text
🎉 Dein Bonus Boost wurde um 30 Tage verlängert.
```

### 8.5 Abgelaufen

Wenn Boost abgelaufen ist:

```text
Dein Bonus Boost ist abgelaufen.

Lade einen Freund ein, um wieder 2× Punkte zu sammeln.
```

---

## 9. Emotionale Anzeige im Kundenportal

🟢 **FIX**

Bonus Boost darf nicht versteckt werden.

Wenn aktiv, erscheint er oben im Kundenportal.

Grund:

Bonus Boost ist ein emotionaler Kernmechanismus.

Der Gast soll sofort sehen:

- ich habe einen Vorteil,
- der Vorteil läuft zeitlich,
- ich sollte bald wiederkommen,
- ich kann durch Freunde verlängern.

### 9.1 Pflichtbestandteile der Anzeige

Bei aktivem Boost:

- 🔥 Icon
- Multiplikator
- verbleibende Tage
- kurze emotionale Aussage
- CTA zum Freund einladen

Beispiel:

```text
🔥 Heute sammelst du 2× Punkte!

Noch 24 Tage aktiv.

Freund einladen
+30 Tage Bonus Boost
```

### 9.2 Countdown

Ein Countdown oder Fortschrittsbalken ist erwünscht.

Ziel:

- Dringlichkeit
- Motivation
- Wiederbesuch

---

## 10. Anzeige nach Punktebuchung

Flow 04 muss Bonus Boost sichtbar machen.

Wenn Gast Punkte sammelt und Boost aktiv ist:

```text
🎉 400 Punkte erhalten

Basis:
200 Punkte

Bonus Boost:
2×

Gesamt:
400 Punkte
```

Der Gast soll den Boost fühlen.

Nicht nur im Hintergrund mehr Punkte erhalten.

---

## 11. Restaurant Dashboard KPI

🟢 **FIX**

Bonus Boost muss im Restaurant Dashboard sichtbar sein.

Nicht als technische Statistik, sondern als Business-Signal.

Beispiele:

```text
🔥 Bonus Boost aktiv
38 Gäste
```

```text
Durch Boost zurück
12 Gäste diese Woche
```

### Warum?

Restaurantbesitzer sollen sehen:

- Bonus Boost wird genutzt
- Gäste kommen zurück
- Einladungen erzeugen Aktivität
- die Software bringt Wert

Das ist wichtig für Zahlungsbereitschaft nach der Testphase.

---

## 12. Restaurant Starter Kit KPI-Box

🟢 **FIX**

Im Restaurant Starter Kit PDF darf eine kurze KPI-Box erscheinen.

Titel:

```text
💡 Freunde einladen
```

Drei KPI-Karten:

```text
🔥 Du 2× Punkte
👥 Freund 2× Punkte
📅 +30 Tage Bonus Boost
```

Regeln:

- keine langen Texte
- keine Erklärung
- keine Werbung
- Icons + KPI erklären die Funktion

Ziel:

Gast versteht in einer Sekunde:

- ich bekomme 2× Punkte
- mein Freund bekommt 2× Punkte
- der Bonus läuft 30 Tage

---

## 13. Anti-Abuse Regeln

### 13.1 Telefonnummer eindeutig

Eine Telefonnummer darf pro Restaurant nur einmal als Kunde existieren.

### 13.2 Keine Selbst-Einladung

Ein Kunde darf sich nicht selbst einladen.

### 13.3 Kein A↔B Zirkel

Wenn A B eingeladen hat, darf B nicht A als neuen Freund einladen.

### 13.4 Keine doppelte Beziehung

Der gleiche Freund darf nicht mehrfach als neuer erfolgreicher Referral zählen.

### 13.5 Aktivierung nur durch echte Konsumation

Bonus Boost wird nur nach erster erfolgreicher Punktebuchung des eingeladenen Freundes aktiviert.

### 13.6 Device ID als Warnsignal

V1 darf eine Web Device ID speichern.

Diese ID ist:

- keine MAC-Adresse
- keine harte Sperre
- nur ein Anti-Abuse-Signal

Bei verdächtigen Mustern:

- gleiche Device ID erstellt viele Konten
- gleiche Device ID macht viele Empfehlungen
- viele Empfehlungen in kurzer Zeit

kann das System warnen.

---

## 14. Wirtschaftlichkeit

Bonus Boost verdoppelt Punkte.

Dadurch erreichen Gäste Belohnungen schneller.

Deshalb ist wichtig:

- Belohnungen werden durch Smart Reward Engine wirtschaftlich berechnet.
- Willkommensgeschenke sind getrennt.
- Referral-Gäste bekommen kein Willkommensgeschenk.
- Boost aktiviert erst nach Umsatz.
- Audit protokolliert jede Aktivierung.

Bonus Boost soll zusätzlichen Umsatz fördern, nicht Gratisleistungen ohne Konsumation erzeugen.

---

## 15. Serverseitige Regeln

### 15.1 Referral Token

Referral Token muss zufällig und sicher sein.

Nicht erratbar.

Nicht aus Kundennummer ableiten.

### 15.2 Token Speicherung

Server speichert nur sichere Token-Hashes, wenn möglich.

### 15.3 Aktivierung

Aktivierung erfolgt serverseitig bei Punktebuchung.

Nicht im Frontend.

### 15.4 Row Locking

Referral-Aktivierung muss doppelte Aktivierung verhindern.

### 15.5 Audit

Jede Aktivierung wird protokolliert.

Audit enthält:

- restaurant_id
- referrer_customer_id
- referred_customer_id
- referral_id
- multiplier
- duration
- extension
- active_until
- timestamp
- source: first_point_collection

---

## 16. Bonus Boost Berechnung

### 16.1 Punkteberechnung

```text
Basispunkte × Multiplikator = finale Punkte
```

Beispiel:

```text
200 Punkte × 2 = 400 Punkte
```

### 16.2 Kein Stacking der Multiplikatoren

Standard V1:

Mehrere erfolgreiche Freunde verlängern die Dauer.

Sie stapeln nicht den Multiplikator.

Beispiel:

```text
2× bleibt 2×
aber Dauer verlängert sich
```

Nicht:

```text
2× + 2× = 4×
```

### 16.3 Verlängerung

Wenn aktiver Boost existiert:

```text
active_until = active_until + extension_days
```

Wenn kein aktiver Boost existiert:

```text
active_from = now()
active_until = now() + duration_days
```

---

## 17. Dynamic „So funktioniert’s“

Bonus Boost Erklärung muss dynamisch sein.

Beispiel bei 2× und 30 Tagen:

```text
Lade einen Freund ein.

Sobald dein Freund erstmals Punkte sammelt,
erhaltet ihr beide 2× Punkte für 30 Tage.

Jeder weitere erfolgreiche Freund verlängert deinen Bonus Boost.
```

Wenn Restaurant später andere Werte nutzt, Text automatisch anpassen.

Keine hart codierten Werte in UI.

---

## 18. Fehlerzustände

### 18.1 Ungültiger Referral-Link

```text
Diese Einladung ist nicht mehr gültig.
```

### 18.2 Selbst-Einladung

```text
Du kannst dich nicht selbst einladen.
```

### 18.3 Telefonnummer bereits registriert

```text
Diese Telefonnummer ist bereits Mitglied.
```

### 18.4 Referral bereits aktiviert

```text
Diese Einladung wurde bereits aktiviert.
```

### 18.5 Keine Punktebuchung

```text
Der Bonus Boost startet erst nach der ersten bezahlten Bestellung.
```

Keine technischen Fehlermeldungen anzeigen.

---

## 19. Staff Portal Bezug

Mitarbeiter müssen Bonus Boost nicht manuell aktivieren.

Bonus Boost wird automatisch durch Punktebuchung ausgelöst.

Mitarbeiter sieht später ggf. auf der Gastkarte:

```text
🔥 Bonus Boost aktiv
2× Punkte
noch 24 Tage
```

Aber Mitarbeiter muss nichts einstellen.

---

## 20. Restaurant Portal Bezug

Restaurantbesitzer sieht:

- aktive Boosts
- erfolgreiche Einladungen
- zurückgekehrte Gäste
- Dashboard-KPI

Restaurantbesitzer stellt in V1 möglichst wenig ein.

Bonus Boost Standard soll sofort funktionieren.

---

## 21. Customer Portal Bezug

Kundenportal ist der emotionale Ort für Bonus Boost.

Dort muss sichtbar sein:

- aktueller Status
- Vorteil
- Countdown
- Freund einladen
- Verlängerung

---

## 22. Was ausdrücklich verboten ist

Verboten:

- Bonus Boost bei Registrierung aktivieren
- einmalige Punkte statt Boost als Hauptmechanik
- Referral-Gast zusätzliches Willkommensgeschenk geben
- Multiplikatoren stapeln
- Selbst-Einladung erlauben
- A↔B Einladung erlauben
- Token im Frontend berechnen
- Referral ohne echte Punktebuchung aktivieren
- lange Erklärtexte im Kundenportal
- Bonus Boost im Kundenportal verstecken
- harte Device-ID-Sperre als einzige Sicherheit
- englische UI-Texte in V1

---

## 23. V2 Hinweise

V2 kann enthalten:

- bessere Abuse-Erkennung
- Restaurant-spezifische Boost-Kampagnen
- saisonale Boosts
- höhere Boosts für ruhige Tage
- automatische Empfehlungen
- Boost für Geburtstage
- Familien-/Gruppen-Boost
- Filialübergreifender Boost
- WUXUAI Admin-Kontrolle über Boost-Regeln
- dynamische Promotion-Fläche im Starter Kit

V1 bleibt einfach:

```text
Freund einladen
→ erste Konsumation
→ beide 2× Punkte
→ Dauer verlängern
```

---

## 24. Restaurant Reality Check

Flow 05 ist erfolgreich, wenn:

1. Gast versteht sofort, warum er Freunde einladen soll.
2. Freund erhält keinen Vorteil ohne echte Konsumation.
3. Restaurant erhält Umsatz, bevor Boost aktiviert wird.
4. Beide Gäste profitieren sichtbar.
5. Bonus Boost motiviert zur Rückkehr.
6. Restaurant sieht im Dashboard, dass Boost genutzt wird.
7. Missbrauch wird erschwert, aber der Flow bleibt einfach.

---

## 25. LOCK Kriterien

Flow 05 ist LOCK, wenn:

- Kundenportal zeigt Bonus Boost prominent
- Freund einladen funktioniert
- Referral-Link sicher ist
- Freund kann sich registrieren
- kein Willkommensgeschenk bei Referral
- Boost wird erst nach erster Punktebuchung aktiviert
- beide Kunden erhalten Boost
- weitere Freunde verlängern Boost
- Punkteberechnung nutzt Multiplikator
- Audit wird geschrieben
- Dashboard KPI vorhanden
- Dynamic „So funktioniert’s“ nutzt echte Werte
- alle Texte Deutsch
- Build erfolgreich

---

## 26. Codex-Regeln

Wenn Codex an Flow 05 arbeitet:

1. Diese Datei zuerst lesen.
2. Bonus Boost nicht zu Einmalpunkten umbauen.
3. Keine Aktivierung bei Registrierung.
4. Freunde-Einladung Vorrang vor Willkommensgeschenk.
5. Multiplikator nicht stapeln.
6. Dauer verlängern statt Multiplikator erhöhen.
7. Aktivierung nur durch echte Punktebuchung.
8. Audit schreiben.
9. Kundenportal emotional halten.
10. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
