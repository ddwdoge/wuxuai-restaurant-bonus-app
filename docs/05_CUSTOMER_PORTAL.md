# 05_CUSTOMER_PORTAL.md

# WUXUAI Bonus V1 – Customer Portal / „Mein Bonus“

Status: **LOCK**

Diese Datei beschreibt das Kundenportal von WUXUAI Bonus V1.  
Das Kundenportal ist die Oberfläche für Gäste. Es ist nicht das Restaurant Portal, nicht das Staff Tablet und nicht das WUXUAI Admin-Portal.

Das Kundenportal muss so einfach sein, dass ein Gast es ohne Erklärung versteht.

---

## 1. Ziel des Kundenportals

Das Kundenportal hat ein einziges Hauptziel:

> Aus einem anonymen Gast wird ein wiederkehrender Stammgast.

Der Gast soll nicht lernen müssen, wie ein Bonusprogramm funktioniert.  
Er soll nur sehen:

- Wie viele Punkte habe ich?
- Welche Punkteeinlösungen kann ich bekommen?
- Was fehlt mir noch?
- Wie zeige ich meinen QR-Code?
- Wie kann ich meinen Bonus Boost verlängern?

---

## 2. Grundprinzip

Das Kundenportal heißt sichtbar:

**Mein Bonus**

Nicht:
- Customer Portal
- Loyalty Dashboard
- Kundenkonto
- Benutzerbereich

Der Gast denkt nicht in Softwarebegriffen. Er denkt:

> „Was bekomme ich?“

---

## 3. Smart Context

### 3.1 Regel

Der Gast sucht niemals ein Restaurant.

Der QR-Code setzt automatisch den Restaurant-Kontext.

Ablauf:

1. Gast scannt QR.
2. Restaurant wird erkannt.
3. Branding wird geladen.
4. Richtiges Bonuskonto wird geöffnet.

### 3.2 Keine Restaurantsuche

Verboten:
- Restaurantliste als erster Einstieg
- manuelle Restaurantauswahl als Standard
- Suchfeld „Restaurant suchen“

Erlaubt:
- „Meine Restaurants“ später als Wallet/Profilbereich
- automatischer Wechsel über QR

### 3.3 Slogan

> Ein Scan. Sofort im richtigen Restaurant.

---

## 4. Registrierung / Smart Join

### 4.1 Ziel

Ein neuer Gast soll in unter 30 Sekunden Mitglied werden.

### 4.2 Ablauf

1. QR scannen
2. Restaurant erkannt
3. Vorteil sehen
4. „Jetzt Mitglied werden“
5. Vorname
6. Telefonnummer
7. optional Geburtstag
8. Konto sofort aktiv
9. Persönlicher QR erscheint

### 4.3 Keine Hürden

In V1 gibt es:
- kein Passwort
- keine SMS
- kein WhatsApp
- keine E-Mail-Pflicht
- keine App-Installation

### 4.4 Warum keine SMS

V1 soll keine laufenden Verifikationskosten erzeugen.

Telefonnummer dient als Identifikationsmerkmal, nicht als starke Sicherheitsgarantie.

Später können SMS/WhatsApp als Premium-Option ergänzt werden.

---

## 5. Willkommen nach Registrierung

Nach der Registrierung landet der Gast nicht in einem technischen Profil.

Er sieht eine emotionale Erfolgskarte:

> Willkommen!  
> Du bist jetzt Mitglied.  
> Dein Bonus ist bereit.

Danach:
- Bonus Boost Hinweis
- Punkteübersicht
- Punkteeinlösungen
- Willkommensgeschenk-Status, wenn vorhanden
- persönlicher QR
- Bonuskonto speichern

---

## 6. Willkommensgeschenk im Kundenportal

### 6.1 Grundregel

Willkommensgeschenke sind keine Punkteeinlösung.

Sie sind ein einmaliges Dankeschön für normale Neuanmeldungen.

### 6.2 Wichtige Freischaltregel

Das Willkommensgeschenk wird nach Registrierung nicht sofort eingelöst.

Ablauf:

1. Gast registriert sich.
2. System weist ein Geschenk zu.
3. Status: Gesperrt.
4. Gast bezahlt zum ersten Mal.
5. Gast sammelt Punkte.
6. Geschenk wird freigeschaltet.
7. Geschenk kann erst beim nächsten Besuch eingelöst werden.

### 6.3 Warum

Das Willkommensgeschenk soll den zweiten Besuch fördern.

Nicht:
> „Komm einmal und bekomme sofort etwas gratis.“

Sondern:
> „Danke für deinen ersten Besuch – wir freuen uns auf deinen nächsten.“

### 6.4 Anzeige vor Freischaltung

Vor der ersten Punktebuchung:

> Dein Willkommensgeschenk wartet auf dich.  
> Sammle bei deinem ersten Besuch Punkte, dann wird es freigeschaltet.

### 6.5 Anzeige nach Freischaltung

Nach der ersten Punktebuchung:

> Dein Willkommensgeschenk ist freigeschaltet.  
> Du kannst es bei deinem nächsten Besuch einlösen.

### 6.6 Einlösung

Ein Willkommensgeschenk darf nur eingelöst werden, wenn es freigeschaltet und noch nicht verwendet wurde.

Nach erfolgreicher Einlösung verschwindet das Willkommensgeschenk aus der sichtbaren Kundenansicht.

Es gibt keinen leeren „bereits eingelöst“-Block.

---

## 6A. Punkteeinlösungen im Kundenportal

### 6A.1 Grundregel

Punkteeinlösungen sind dauerhafte Produktangebote des Restaurants.

Sie verschwinden nach einer Einlösung nicht aus der Kundenansicht.

### 6A.2 Einlösung

Wenn ein Gast eine Punkteeinlösung verwendet:

1. Server prüft Kundentoken, Restaurant, aktive Punkteeinlösung und Punktestand.
1. Die öffentliche Einlöse-RPC begrenzt Einlöseversuche pro Kundentoken, damit
   fremde Reward-IDs, falsche Tokens und Spam nicht beliebig oft versucht
   werden können.
2. Benötigte Punkte werden vom Konto abgezogen.
3. Einlöse-Historie und Audit werden geschrieben.
4. Der neue Punktestand wird zurückgegeben.
5. Die Produktkarte bleibt sichtbar.
6. Der Status wird anhand des neuen Punktestands neu berechnet.

Wenn zu viele Einlöseversuche in kurzer Zeit auftreten, zeigt das
Kundenportal:

> Zu viele Einlöseversuche. Bitte warte kurz und versuche es erneut.

Wenn noch genügend Punkte übrig sind:

> Einlösbar

Wenn Punkte fehlen:

> Noch gesperrt  
> Dir fehlen noch XX Punkte.

Darunter zeigt das Kundenportal den geschätzten fehlenden Eurobetrag:

> ≈ Noch ca. XX,XX € bis zur Einlösung.

Dieser Betrag basiert auf derselben Restaurant-Logik wie die
Punkteeinlösung:

```text
Fehlender Eurobetrag = fehlende Punkte × amount_per_point
```

Die benötigten Punkte der Punkteeinlösung wurden zuvor aus Produktpreis,
gespeicherter Einlösequote und Punkte-pro-Euro-Regel berechnet.

Die Einlösequote kommt aus dem Onboarding:

- Sparsam: 3 %
- Normal: 5 %
- Großzügig: 8 %
- Premium: 10 %

### 6A.3 Abgrenzung

Punkteeinlösungen können mehrfach eingelöst werden, sobald wieder genügend Punkte vorhanden sind.

Willkommensgeschenke bleiben einmalig und verschwinden nach Einlösung.

### 6A.4 Produktbilder

Produktbilder in Punkteeinlösungen müssen im Kundenportal vollständig sichtbar
bleiben.

Regel:

- keine abgeschnittenen Speisenbilder
- kein Verzerren
- originales Seitenverhältnis beibehalten
- heller Bildbereich mit zentriertem Foto
- `object-fit: contain`

Wenn dadurch Leerraum entsteht, ist das in V1 richtig. Ein vollständig sichtbares
Produktfoto ist wichtiger als ein randlos gefülltes Bildfeld.

---

## 7. Registrierung über Freunde-Einladung

### 7.1 Priorität

Freunde-Einladung hat Vorrang vor Willkommensgeschenk.

### 7.2 Regel

Wenn ein Gast über einen Freund kommt:

- kein Willkommensgeschenk
- Bonus Boost nach erster bezahlter Konsumation
- eingeladener Freund und einladender Gast profitieren

### 7.3 Warum

Ein eingeladener Gast erhält bereits einen starken Vorteil über den Bonus Boost.  
Er soll nicht zusätzlich ein Willkommensgeschenk erhalten.

### 7.4 Kundenansicht

Bei Registrierung über Freund:

> Willkommen!  
> Dein Bonus Boost startet, sobald du erstmals Punkte sammelst.

Nach erster Konsumation:

> Bonus Boost aktiv!  
> Du sammelst jetzt 2× Punkte.

---

## 8. Bonus Boost

### 8.1 Ziel

Bonus Boost ist der emotionale Wachstumsmotor von WUXUAI Bonus.

Nicht:
> Freund einladen → einmalige Punkte

Sondern:
> Freund einladen → temporärer Punkte-Multiplikator

### 8.2 Standard V1

- 2× Punkte
- 30 Tage
- Aktivierung erst nach echter Konsumation des eingeladenen Freundes

### 8.3 Anzeige im Kundenportal

Bonus Boost muss oben sichtbar sein, wenn aktiv.

Beispiel:

> 🔥 2× Punkte aktiv  
> Du sammelst aktuell doppelte Punkte.  
> Noch 24 Tage gültig

Wenn Bonus Boost aktiv ist, muss der Effekt zusätzlich sichtbar sein:

- Punktekarte zeigt ein Feuer-Symbol und den Hinweis „2× Bonus Boost aktiv“.
- Punktekarte erklärt: „Jede Punktebuchung zählt aktuell doppelt.“
- Nach einer Punktebuchung zeigt die Erfolgskarte Normalpunkte, Bonus-Boost-Zusatz und Gesamtpunkte.
- Der „So funktioniert’s“-Drawer erklärt den Bonus Boost mit einem einfachen Beispiel.

Wenn Bonus Boost nicht aktiv ist:

> 🔥 Lade einen Freund ein  
> Ihr sammelt beide 30 Tage lang 2× Punkte, sobald dein Freund erstmals Punkte sammelt.

### 8.4 Verlängerung

Jeder erfolgreiche Freund verlängert den Boost.

Beispiel:

- 1 Freund = +30 Tage
- 2 Freunde = +60 Tage
- 3 Freunde = +90 Tage

### 8.5 Emotion

Der Gast soll spüren:

> Wenn ich jemanden einlade, bleibt mein Vorteil länger aktiv.

### 8.6 Keine Aktivierung ohne Umsatz

Bonus Boost startet erst, wenn der eingeladene Freund:
1. registriert ist
2. ins Restaurant kommt
3. eine erste bezahlte Konsumation hat
4. Punkte sammelt

---

## 9. Punkte sammeln

### 9.1 Smart Bonus QR

Für V1 sammelt der Gast Punkte über den Bonus QR.

Ablauf:

1. Gast scannt Bonus QR.
2. Restaurant wird erkannt.
3. Gast wählt Rechnungsbereich.
4. Punkte werden serverseitig berechnet.
5. Bonus Boost wird angewendet, falls aktiv.
6. Erfolgskarte erscheint.

### 9.2 Rechnungsbereiche

Nicht „bis 20 €“.

Sondern Bereiche:

- 0–10 €
- 10–20 €
- 20–30 €
- 30–40 €
- 40–50 €
- 50–75 €
- 75–100 €
- 100+ €

### 9.3 Warum Bereiche

Damit ein Gast mit 5 € nicht Punkte für 20 € erhält.

### 9.4 Smart Upsell

Wenn der Gast knapp vor der nächsten Stufe steht, kann die App anzeigen:

> Nur noch X € bis zur nächsten Bonusstufe.

Diese Funktion soll den Durchschnittsbon erhöhen.

### 9.5 Keine freie Punkte-Eingabe

Der Gast darf niemals Punkte eintippen.

---

## 10. Punkteeinlösungen im Kundenportal

### 10.0 Reihenfolge in „Mein Bonus“

Die Kundenansicht ist nach Wichtigkeit sortiert:

1. Bonus Boost
2. Punkte
3. Punkteeinlösungen
4. Willkommensgeschenk nur wenn relevant und nicht eingelöst
5. Persönlicher Bonus-QR
6. Bonuskonto speichern

### 10.1 Normale Punkteeinlösungen

Der Gast sieht:
- Bild
- Name
- benötigte Punkte
- Status
- Fortschritt

### 10.2 Wenn genug Punkte vorhanden

Anzeige:
- einlösbar
- Jetzt Punkte einlösen
- finale Bestätigung

### 10.3 Wenn Punkte fehlen

Anzeige:

> Dir fehlen noch XX Punkte.  
> Nur noch ca. XX € bis zur Einlösung.

Dieser Betrag wird automatisch aus den Bonusregeln berechnet.

### 10.4 Finale Bestätigung

Der Gast muss die Einlösung final bestätigen.

Die Einlösung erfolgt serverseitig und darf nicht erneut verwendbar sein.

Keine Tages-PIN und keine persönliche Mitarbeiter-PIN für Punkteeinlösung.

---

## 11. QR im Kundenportal

### 11.1 Persönlicher QR

Der QR ist die Mitgliedskarte.

Er muss jederzeit schnell erreichbar sein.

### 11.2 Regel

QR darf nicht versteckt sein.

Empfohlen:
- großer Button
- prominent im oberen Bereich
- „QR anzeigen“

### 11.3 Token-Sicherheit

Der QR basiert auf einem sicheren Token.

Nicht auf:
- Telefonnummer
- Kundencode als Geheimnis
- öffentlich ratbare ID

---

## 12. Meine Restaurants

V1:
Nicht zentraler Einstieg.

V2:
Optionales Wallet:

- Restaurant A
- Restaurant B
- Restaurant C

Punkte bleiben pro Restaurant/Filiale getrennt.

Smart Context bleibt Hauptzugang.

---

## 13. Sprache

V1 ist 100 % Deutsch.

Verboten:
- Customer
- Reward als sichtbarer Text
- Referral
- Campaign
- Dashboard
- Claim
- Redeem als sichtbarer Text

Erlaubt:
- technische Funktionsnamen im Code

Sichtbare Begriffe:
- Mein Bonus
- Punkte
- Punkteeinlösung
- Willkommensgeschenk
- Freunde einladen
- Bonus Boost
- QR anzeigen
- Einlösen im Restaurant

---

## 14. Mobile First

Das Kundenportal wird zuerst für Smartphone entwickelt.

Zielbreite:
- 390 px zuerst
- danach Tablet
- danach Desktop

Der Gast nutzt das System fast immer am Handy.

---

## 15. Dynamic „So funktioniert’s“

### 15.1 Regel

„So funktioniert’s“ ist dynamisch.

Es erklärt die echten Einstellungen des Restaurants.

Beispiele:
- Punkte pro Euro
- Bonus Boost Dauer
- Willkommensgeschenk-Regel
- Punkteablauf
- Punkteeinlösungslogik

### 15.2 Kein statischer Text

Verboten:
- feste 2× / 30 Tage Texte, wenn Restaurant später andere Werte hat
- allgemeine Erklärungen ohne Restaurantbezug

### 15.3 Darstellung

Erklärung erscheint:
- beim ersten Besuch einmal
- danach über Info-Icon

Nicht dauerhaft Fläche blockieren.

---

## 16. Datenschutz und Sicherheit

### 16.1 Minimaldaten

V1 fragt nur:
- Vorname
- Telefonnummer
- optional Geburtstag

Keine unnötigen Daten.

### 16.2 Customer Token

Customer Portal darf nicht einfach den ersten Kunden laden.

Zugriff nur über:
- sicheren Token
- Restaurant-Slug
- serverseitige Prüfung

### 16.3 Keine öffentlichen Tabellenzugriffe

Public Pages lesen nicht direkt Tabellen.

Sie verwenden sichere RPCs.

---

## 17. Anti-Abuse

### 17.1 Telefonnummer

Telefonnummer ist pro Restaurant eindeutig.

### 17.2 Device ID

Web Device ID dient nur als Warnsignal.

Nicht als harte Sperre.

### 17.3 Referral Schutz

- keine Selbst-Einladung
- kein A↔B Kreis
- keine doppelte Einladung derselben Person
- Bonus erst nach echter Konsumation

---

## 18. Was ausdrücklich verboten ist

- Passwortpflicht in V1
- SMS/WhatsApp in V1
- Kunde kann Punkte selbst eingeben
- Kunde kann Punkteeinlösung ohne gültigen Serverstatus verwenden
- Willkommensgeschenk sofort beim ersten Besuch einlösen
- Willkommensgeschenk und Freunde-Bonus gleichzeitig
- Restaurantsuche als Standardzugang
- englische UI
- lange Textseiten
- technische Begriffe
- QR-Link statt QR-Erlebnis

---

## 19. V2 Hinweise

V2 vorbereitet:
- Meine Restaurants Wallet
- Wochenübersicht für Punkteeinlösungen
- Push/Email/SMS optional
- dynamische Nachrichten
- Multibranch Punkte
- weitere Branchen
- Premium-Login
- App/PWA Erweiterung

---

## 20. LOCK Kriterien

Customer Portal ist LOCK, wenn:

- QR-Kontext automatisch Restaurant setzt
- Registrierung unter 30 Sekunden möglich ist
- keine SMS/WhatsApp/Passwort nötig sind
- Willkommensgeschenk gesperrt und später freigeschaltet wird
- Freunde-Einladung kein Willkommensgeschenk gibt
- Bonus Boost sichtbar und emotional ist
- Punkte sammeln über Bonus QR funktioniert
- Punkteeinlösungen fehlende Punkte und Euro anzeigen
- QR immer schnell erreichbar ist
- alle Texte Deutsch sind
- Mobile Ansicht sauber ist
- keine öffentlichen Datenlecks existieren

---

Endstatus: **LOCK**
## CTO-Ergänzung 2026-07-14: Geschenke und Einlösecode

🟢 **FIX / V1**

- Willkommensgeschenk: einmalig pro Gast und Restaurant/Filiale.
- Geburtstagsgeschenk: einmalig pro Gast, Restaurant/Filiale und Kalenderjahr.
- Das Geburtstagsgeschenk wird 14 Tage vor dem Geburtstag serverseitig zufällig aus den aktiven Willkommensgeschenken ausgewählt und bleibt bis zum Ende des Geburtstags gültig.
- Vor einer Geschenk- oder Punkteeinlösung bestätigt der Gast verbindlich direkt vor dem Mitarbeiter.
- Erst danach erzeugt der Server einen einmaligen sechsstelligen Einlösecode für 15 Minuten.
- Das Kundenportal zeigt Code und Countdown; es gibt kein PIN-Feld für Einlösungen.
- Abgelaufene oder verwendete Codes sind nicht erneut nutzbar.

Diese Ergänzung ersetzt für den Einlösezeitpunkt ältere Beschreibungen einer sofort vollständig abgeschlossenen Einlösung direkt nach dem Bestätigungsbutton.
