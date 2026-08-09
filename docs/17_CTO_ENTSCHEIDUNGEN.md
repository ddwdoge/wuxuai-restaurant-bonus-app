
# 17_CTO_ENTSCHEIDUNGEN.md

# WUXUAI Bonus V1 – CTO Entscheidungen

## 2026-08-03 – V1-Punkteflow ohne Bonnummer

- V1 besitzt keine POS-/Kassenintegration und keine Bonnummer im Punkteflow.
- Diese Entscheidung ersetzt die aktive Nutzung der am 03.08.2026 vorbereiteten
  Receipt-Haertung; historische Migrationen und nullable Spalten bleiben aus
  Nachvollziehbarkeits- und Kompatibilitaetsgruenden erhalten.
- Der oeffentliche restaurantgesteuerte Confirm-RPC hat genau fuenf Parameter:
  Restaurant, QR-Referenz, Centbetrag, Tages-PIN und Idempotenzschluessel.
- Der historische sechsparametrige Vertrag ist fuer Browserrollen gesperrt und
  erhaelt intern ausschliesslich `NULL` als Belegwert.
- Earn-Idempotenz bindet Tenant, Gast, Quelle, Betrag, QR, Aktion und Kontext.
  Reverse bindet Tenant, Aktion, Originaltransaktion, serverseitig autorisierte
  Rolle und normalisierte Begruendung. Bonnummern gehoeren zu keinem aktiven
  V1-Fingerprint.

## 2026-08-01 – Eine Punkte-Engine für beide Sammelmodi

- `customer_initiated` und `restaurant_controlled` dürfen nur unterschiedliche
  Quellen, nicht unterschiedliche Punkteergebnisse erzeugen.
- Der höchste aktuell aktive restaurantgebundene Boost wird genau einmal auf
  gerundete Basispunkte angewendet.
- Referral-Erstqualifizierung folgt erst nach einer erfolgreichen positiven
  Buchung und wird durch Preview, Fehler, Retry oder Storno nicht erneut ausgelöst.
- Interne Engine-RPCs bleiben für `public`, `anon` und `authenticated` gesperrt.

## 31.07.2026 – Zwei Punkte-Sammel-Modi

Die bisherige FIX-Entscheidung für einen ausschließlich kundeninitiierten Restaurant-QR ist **partially superseded**. Owner wählen restaurantgesteuert, kundeninitiiert oder beide. Neue Restaurants starten restaurantgesteuert, Bestandsrestaurants bleiben zunächst kundeninitiiert. Die Tages-PIN bleibt unverändert; es wird keine persönliche Mitarbeiter-PIN eingeführt.

Restaurantgesteuerte QR-Referenzen sind opaque, fünf Minuten gültig, serverseitig nur gehasht gespeichert und nach erfolgreicher Gutschrift atomar verbraucht. Standardlimit sind 300 EUR, technisch und konfigurierbar maximal 1.000 EUR.

Status: **LOCK**

Dieses Dokument sammelt die wichtigsten CTO-Entscheidungen des WUXUAI Bonus Projekts.

Es ist keine Ideensammlung.  
Es ist eine verbindliche Entscheidungsakte.

Jede Entscheidung in diesem Dokument wurde getroffen, um das Produkt einfacher, sicherer, wirtschaftlicher oder skalierbarer zu machen.

Codex darf diese Entscheidungen nicht ignorieren, nicht „optimieren“, nicht durch eigene Annahmen ersetzen und nicht gegen sie arbeiten.

## 0.1 WUXUAI Admin Restaurant-Verwaltung V1

Status: **CODE LOCK / STAGING OFFEN**

Die interne WUXUAI Admin Restaurant-Verwaltung ist ein Plattformwerkzeug,
nicht Teil des Restaurant Portals.

Route:

```text
/admin/platform
```

Regeln:

- Nur Plattformrollen dürfen globale Restaurantdaten sehen.
- Restaurant Owner dürfen diese Seite nicht öffnen.
- Plattform-Admin und Restaurantrolle bleiben getrennt.
- Globale Restaurantdaten werden über sichere Plattform-RPCs geladen.
- Statusänderungen werden auditiert.
- Keine Impersonation in V1.
- Keine Löschung von Restaurants in V1.
- Stripe-Automation bleibt ein Folgeblock.

V1 erlaubt:

- Restaurantliste
- Restaurantdetails
- Suche und Filter
- Status aktiv / pausiert / gesperrt speichern
- Trial-/Abo-Anzeige
- Audit-Auszug

V1 baut nicht:

- Stripe Checkout
- Stripe Webhooks
- Impersonation
- Feature-Flag-UI
- komplexe Support-Workflows

---

## 0.2 Public RPC für Punkteeinlösung im Kundenportal

Status: **LOCK**

Das Kundenportal ist öffentlich und arbeitet in V1 mit `customer_token`.

Deshalb darf folgende RPC bewusst für `anon` ausführbar bleiben:

```text
redeem_customer_reward(customer_token, reward_id)
```

Diese Freigabe ist nur erlaubt, wenn die Funktion serverseitig hart prüft:

- Kundentoken ist gültig und eindeutig,
- Kunde, Reward, Restaurant und Branch gehören zusammen,
- pro Kundentoken gelten maximal 5 Einlöseversuche in 10 Minuten,
- Kundentokens werden in Attempt-Logs nur gehasht gespeichert,
- Reward ist aktiv und nicht abgelaufen,
- Willkommensgeschenk ist aktiv, freigeschaltet und noch nicht eingelöst,
- normale Punkteeinlösung hat genug Punkte/Stempel,
- Punkteabzug bzw. Statuswechsel passieren atomar,
- Audit wird geschrieben.

Nicht erlaubt:

- PIN-Einlösung in V1 zurückbringen,
- 6-stellige Code-Einlösung als öffentlichen V1-Weg nutzen,
- Punkte oder Reward-Eigentum clientseitig als Wahrheit behandeln.

---

## 0.3 Owner Registration retry-safe und idempotent

Status: **LOCK**

Die Restaurant-Owner-Registrierung muss langsame Supabase-Session-Propagation
nach E-Mail-Bestätigung vertragen.

Regeln:

- Pending-Registrierungsdaten werden erst gelöscht, wenn Restaurant,
  Membership und Trial/Subscription erfolgreich erstellt oder gefunden wurden.
- Wenn die Auth-Session noch nicht bereit ist, wird mit kurzem Backoff erneut
  geprüft.
- `start_restaurant_owner_trial` ist idempotent: erneute Ausführung für denselben
  Owner erzeugt kein zweites Restaurant, keine doppelte Membership und keine
  doppelte Subscription.
- Fehlertext für Race-Zustand:

```text
Deine Registrierung wird noch vorbereitet. Bitte versuche es in wenigen Sekunden erneut.
```

---

## 1. Zweck dieses Dokuments

Dieses Dokument beantwortet:

- Warum wurde eine Entscheidung getroffen?
- Welches Problem löst sie?
- Was darf Codex daraus ableiten?
- Was ist ausdrücklich verboten?
- Was ist V1?
- Was ist V2?
- Was ist nur Idee?

Dieses Dokument schützt das Projekt vor Chaos.

Ohne dokumentierte CTO-Entscheidungen entsteht später:

- widersprüchliche UI
- falsche Businesslogik
- unnötige Features
- technische Umwege
- Codex-Interpretationen
- verlorene Produktphilosophie

---

## 2. Entscheidungskategorien

Alle Entscheidungen werden in drei Gruppen gedacht.

### 2.1 🟢 FIX

Eine FIX-Entscheidung gilt für V1 verbindlich.

Sie darf nicht geändert werden, ohne neue CTO-Entscheidung.

### 2.2 🟡 V2

Eine V2-Entscheidung wird architektonisch vorbereitet, aber nicht in V1 vollständig gebaut.

### 2.3 🔵 IDEE

Eine Idee ist noch nicht freigegeben.

Codex darf Ideen niemals bauen, solange sie nicht zu FIX oder V2 verschoben wurden.

---

# A. Produkt- und Geschäftsentscheidungen

---

## 3. Mission: Aus Gästen werden Stammgäste

🟢 **FIX**

WUXUAI Bonus verkauft nicht:

- Punkte
- QR-Codes
- Gutscheine
- Adminsoftware

WUXUAI Bonus verkauft:

> Mehr Stammgäste und mehr Wiederbesuche.

### Warum?

Restaurants bezahlen nicht für Funktionen.  
Restaurants bezahlen für messbaren Nutzen.

Wenn die Software nicht hilft, Gäste zurückzubringen, ist sie für Restaurants nicht relevant.

### Codex-Regel

Jede neue Funktion muss beantworten:

```text
Hilft sie dem Restaurant, mehr Stammgäste,
mehr Wiederbesuche oder mehr Umsatz zu erzeugen?
```

Wenn nein:

Nicht bauen.

---

## 4. Cashflow First

🟢 **FIX**

V1 dient nicht dazu, die perfekte Software zu bauen.

V1 dient dazu, erste zahlende Restaurants zu gewinnen.

### Konsequenzen

- keine unnötigen Features
- schnelle Einrichtung
- ein Paket
- 30 Tage kostenlos
- einfache Bedienung
- klare Restaurant-Sprache
- keine komplexe Abrechnung vor Pilot
- keine KI in V1
- keine POS-Integration in V1

### Verboten

- V1 mit V2-Funktionen überladen
- lange Featurelisten bauen
- perfekte Konfiguration vor erster Nutzung erzwingen
- Funktionen bauen, die kein Restaurant im Pilot braucht

---

## 5. V1 fokussiert Restaurants und Cafés

🟢 **FIX**

V1 fokussiert Restaurants und Cafés.

Langfristig ist WUXUAI Bonus allgemeiner:

- Restaurants
- Cafés
- Bäckereien
- Bubble Tea
- Friseure
- Einzelhandel
- lokale Betriebe

Aber V1-Marketing und V1-UX bleiben auf Restaurants/Cafés fokussiert.

### Warum?

Fokus bringt schnelleren Cashflow.

Eine zu breite Zielgruppe verwässert Sprache, Vorlagen und Verkauf.

### V2

V2 erweitert über Business-Type-Templates.

---

## 6. Produktname V1: WUXUAI Restaurant Bonus

🟢 **LOCK / ERSETZT LANGFRISTIGE DACHMARKENREGEL AM 30.07.2026**

V1 wird unter folgender Produktpositionierung fertiggestellt:

```text
WUXUAI Restaurant Bonus
```

Die branchenneutrale Marke bleibt fuer V2 archiviert:

```text
WUXUAI Bonus
```

V2 wird erst nach ersten zahlenden V1-Restaurants, echtem Marktfeedback und
ausdruecklicher Product-Owner-Freigabe fortgesetzt.

### Warum?

Restaurantfokus reduziert Onboarding-Komplexitaet und beschleunigt den
V1-Verkauf. Die technische Erweiterbarkeit bleibt erhalten, aktiviert aber
keine Branchenprofile in V1.

### Domain

Aktuell:

```text
www.wuxuaisbi.com
```

Zukünftig möglich:

```text
wuxu.ai
```

Footer V1:

```text
Powered by WUXUAI Bonus • www.wuxuaisbi.com
```

---

## 7. Ein Paket in V1

🟢 **FIX**

V1 startet mit einem einfachen Paket.

Empfehlung:

```text
30 Tage kostenlos
danach ca. 59–69 € / Monat
```

Keine komplizierten Tarife in V1.

### Warum?

Der Gründer arbeitet allein.  
Mehr Pakete bedeuten mehr Support, mehr Logik, mehr Fehler.

### Verboten

- Basic/Pro/Premium in V1 ausbauen
- Funktionen künstlich sperren
- Enterprise-Logik vor Pilot priorisieren

---

## 8. Keine rückwirkende Zahlung nach Testphase

🟢 **FIX**

Restaurants zahlen nicht rückwirkend für kostenlose Testzeit.

V1-Regel:

```text
30 Tage kostenlos
Keine Kreditkarte
Keine Nachzahlung
Danach normales Monatsabo
```

### Warum?

Rückwirkende Zahlung erzeugt psychologischen Widerstand.

Besser:

- 30 Tage Wert beweisen
- Erfolgsbericht zeigen
- Restaurant entscheidet freiwillig

---

# B. Architektur-Entscheidungen

---

## 9. Vier getrennte Oberflächen

🟢 **FIX**

WUXUAI Bonus besitzt vier getrennte Oberflächen:

```text
WUXUAI Admin
Restaurant Portal
Staff Portal
Customer Portal
```

### Warum?

Jede Rolle hat andere Ziele.

Eine gemeinsame Oberfläche würde komplex und unverständlich.

### Regel

One Persona – One Interface.

### Verboten

- WUXUAI Admin im Restaurant Portal
- Restaurantfunktionen im Kundenportal
- Adminfunktionen im Staff Portal
- Staff-Prozesse im Kundenportal

---

## 10. Restaurant Portal zuerst stabilisieren

🟢 **FIX**

Aktuelle Entwicklungspriorität:

1. Restaurant Portal
2. Customer Portal
3. Staff Portal
4. WUXUAI Admin

### Warum?

Restaurantbesitzer entscheidet über Kauf.

Wenn Restaurant Portal nicht überzeugt, hilft das Kundenportal allein nicht.

---

## 11. WUXUAI Admin später

🟢 **FIX**

Das vollständige interne WUXUAI Admin Portal ist kein V1-Blocker.

V1 nutzt Supabase/Staging/Logs als internen Betrieb.

### V2

WUXUAI Admin wird später für:

- Restaurants
- Organisationen
- Abos
- Rechnungen
- Logs
- Support
- Feature Flags
- Smart Engine Verwaltung

gebaut.

---

## 12. Multi-Branch vorbereiten, aber nicht zeigen

🟢 **FIX**

V1 Verhalten:

```text
1 Restaurant = 1 Organisation = 1 Filiale
```

V2 vorbereitet:

```text
Organisation
├── Filiale 1
├── Filiale 2
└── Filiale 3
```

### Warum?

Spätere Ketten sollen möglich sein, ohne alte Daten umzubauen.

### V1 UI

Keine Filialverwaltung.

### Datenbank

Vorbereiten:

- organizations
- branches
- organization_id
- branch_id
- branch_subscriptions

---

## 13. Restaurant-ID bleibt V1-Anker

🟢 **FIX**

V1-Flows arbeiten weiterhin mit `restaurant_id`.

`organization_id` und `branch_id` werden vorbereitet, aber dürfen V1 nicht brechen.

### Warum?

Bestehende Flows sind bereits auf `restaurant_id` aufgebaut.

### Codex-Regel

Keine Migration darf bestehende `restaurant_id`-Flows zerstören.

---

## 14. RLS und RPC als Sicherheitskern

🟢 **FIX**

Supabase RLS ist primäre Sicherheitsgrenze.

Businesskritische Aktionen laufen über sichere RPCs.

### Beispiele

- Registrierung
- Punkte sammeln
- Punkteeinlösung verwenden
- Bonus Boost aktivieren
- Trial starten

### Verboten

- öffentliche Tabellenreads auf Kundendaten
- Frontend als einzige Sicherheit
- Service Role im Browser
- user_metadata als Rollen-Autorität

---

# C. Onboarding-Entscheidungen

---

## 15. Onboarding = Installationsassistent

🟢 **FIX**

Flow 01 ist kein Formular und kein Settingsbereich.

Es ist ein Installationsassistent.

### Warum?

Restaurantbesitzer sollen geführt werden und nicht selbst überlegen.

### Regeln

- 7 Schritte
- Autosave
- Zurück / Weiter
- Restaurant starten nur am Ende
- Gate bis Abschluss
- keine unnötigen Detailfragen

---

## 16. Onboarding fragt nur notwendige Dinge

🟢 **FIX**

Onboarding enthält nur Dinge, die zum Start zwingend nötig sind.

Nicht im Onboarding:

- Produktbilder
- Detailprodukte
- Angebotsbilder
- Punkteformeln
- PDF/SVG Optionen
- Wochenpläne
- Filiallogik
- große Einstellungen

### Warum?

Restaurant soll schnell starten.

Perfektion kommt später.

---

## 17. Kein „Speichern und später fortsetzen“

🟢 **FIX**

Manueller Speicherbutton wurde entfernt.

Grund:

Autosave ist Standard.

Restaurantbesitzer soll nie fragen:

> Habe ich gespeichert?

### 17.1 Onboarding-Fortschritt ist reload-sicher

🟢 **FIX**

Onboarding-Drafts speichern nicht nur Formulardaten, sondern immer auch den
aktuellen Wizard-Schritt.

Regel:

- jeder Schrittwechsel wird sofort gespeichert
- jede Feldänderung wird per Autosave gespeichert
- Refresh öffnet den zuletzt gespeicherten Schritt
- alte Drafts aus der früheren Angebotsstruktur werden auf die aktuelle
  7-Schritt-Struktur gemappt
- abgeschlossenes Onboarding öffnet das Dashboard statt erneut Schritt 1

Fehler beim Speichern werden sichtbar in Restaurant-Sprache angezeigt:

```text
Fortschritt konnte gerade nicht gespeichert werden.
```

---

## 18. „So funktioniert’s“ nicht dauerhaft sichtbar

🟢 **FIX**

Erklärung erscheint:

- einmal automatisch beim ersten Öffnen
- danach nur über Icon

Nicht dauerhaft als Seitenbereich.

### Warum?

Permanente Hilfe nimmt zu viel Platz und fühlt sich wie Schulung an.

---

## 19. Schritt „Angebot“ entfernt

🟢 **FIX**

Der Onboarding-Schritt „Angebot“ wurde vollständig entfernt.

### Warum?

Willkommens-Belohnungen sind bereits das Willkommenssystem.

Ein zusätzlicher Angebots-Schritt erzeugt Verwirrung.

### Verboten

- Angebotsname im Onboarding
- Ablaufdatum im Onboarding
- Angebotsbild im Onboarding
- Angebot veröffentlichen im Onboarding

---

## 20. Restaurant Starter Kit statt Gästetest

🟢 **FIX**

Schritt 6 heißt:

```text
Restaurant Starter Kit
```

Nicht:

```text
Gästetest
```

### Warum?

Restaurantbesitzer denkt:

> Ich bekomme jetzt mein Startpaket.

Nicht:

> Ich teste technisch QR-Codes.

---

## 21. Starter Kit nur ein Downloadbutton

🟢 **FIX**

Im Onboarding gibt es nur:

```text
📦 Restaurant Starter Kit herunterladen
```

Keine PNG/SVG Einzeldownloads.

Einzeldateien kommen später ins QR Center.

---

# D. Reward- und Bonus-Entscheidungen

---

## 22. Generisches Aktionen-Modul aus V1 entfernt

🟢 **FIX**

Das unklare generische Modul „Aktionen“ bleibt aus V1 entfernt. Seit der
LOCKED-Entscheidung vom 04.08.2026 ist ausschließlich das klar begrenzte,
rein informative Modul `Aktuelles & Angebote` zulässig.

### Warum?

Der Begriff ist unklar.

V1 braucht:

- Gäste
- Punkte
- Punkteeinlösung
- Willkommensgeschenke
- Bonus Boost
- QR

Nicht „Aktionen“.

### Verboten

- generischer Menüpunkt „Aktionen“ in der Sidebar
- Neue Aktion starten Button
- Aktionen als Pflichtbereich
- Reward-, Coupon-, Punkte- oder Zielgruppenkampagnen

### Eng begrenzte V1-Ausnahme

`Aktuelles & Angebote` darf höchstens fünf gleichzeitig veröffentlichte
Restaurantbeiträge zeigen. Das Modul erzeugt keine Rewards, Punkte, Geschenke,
Codes, Einlösungen, Push-Nachrichten oder Kundensegmente.

---

## 23. Punkteeinlösung ist zentral

🟢 **FIX**

Punkteeinlösung ist der zentrale Bereich für Produkte, die Gäste mit Punkten einlösen können.

Restaurant erstellt Punkteeinlösungen über:

```text
Produkt
Preis
Foto optional
Aktiv/Inaktiv
```

System berechnet Punkte.

---

## 24. Keine manuelle Punkte-Eingabe

🟢 **FIX**

Restaurantbesitzer gibt keine Punkte ein.

Keine:

- Punkte-Dropdowns
- freie Punktefelder
- manuelle Schwellen

### Warum?

Restaurant denkt in Euro.  
WUXUAI rechnet Punkte.

---

## 25. Smart Reward Engine

🟢 **FIX**

Smart Reward Engine berechnet:

- Punkte
- Wirtschaftlichkeitsstatus
- fehlende Punkte
- fehlenden Eurobetrag
- Willkommensgeschenk-Quoten
- Freischaltlogik

### Ziel

Wirtschaftlichkeit schützen.

---

## 26. Willkommensgeschenke eigener Bereich

🟢 **FIX**

Willkommensgeschenke sind eigener Menüpunkt oder eigener Bereich.

Sie sind keine normalen Punkteeinlösungen.

### Warum?

Sie haben andere Regeln:

- einmalig
- keine Punkte
- nur neue Gäste
- zunächst gesperrt
- nach erster Konsumation freigeschaltet

---

## 27. Willkommensgeschenk erst nach erster bezahlter Konsumation

🟢 **FIX**

Das Willkommensgeschenk wird nach Registrierung zugeteilt, aber gesperrt.

Freischaltung erst:

```text
erste bezahlte Konsumation
→ Punktebuchung erfolgreich
→ Geschenk freigeschaltet
```

Einlösung erst beim nächsten Besuch.

### Warum?

Willkommensgeschenk soll zweiten Besuch fördern, nicht erste Sofort-Gratiskonsumation.

---

## 28. Freunde-Einladung hat Vorrang

🟢 **FIX**

Referral-Gast bekommt kein Willkommensgeschenk.

Er bekommt Bonus Boost nach erster Konsumation.

### Regel

Ein Gast darf niemals gleichzeitig erhalten:

- Willkommensgeschenk
- Bonus Boost als eingeladener Freund

---

## 29. Willkommensgeschenk-Wahrscheinlichkeiten

🟢 **FIX**

Teurere Kategorien werden seltener vergeben.

V1 Standard:

- Kaffee 25 %
- Getränk 25 %
- Dessert 20 %
- Vorspeise 18 %
- Menü 5 %
- Sushi 3 %
- Hauptspeise 2 %
- Eigene Überraschung 2 %

### CTO-Regel

Nicht im Frontend hardcoden.

Zentral verwalten.

---

## 30. Tageslimits für Willkommensgeschenke

🟢 **FIX**

Teure Willkommensgeschenke haben in V1 feste serverseitige Tageslimits.

Standard:

```text
Gratis Menü: maximal 3 Vergaben pro Tag
Gratis Hauptspeise: maximal 3 Vergaben pro Tag
Alle anderen Kategorien: kein Tageslimit in V1
```

### Warum?

Auch bei niedriger Wahrscheinlichkeit können zufällige Häufungen entstehen.

### Regel

Wenn ein Tageslimit erreicht ist:

- Kategorie bei der Zufallsauswahl überspringen
- Wahrscheinlichkeit auf die übrigen aktiven Kategorien neu verteilen
- kein Fehler für den Gast anzeigen
- Restaurantbesitzer muss nichts einstellen

---

## 31. Bonus Boost als emotionaler Kern

🟢 **FIX**

Bonus Boost ist kein kleines Referral-Feature.

Es ist emotionaler Kernmechanismus.

Standard:

```text
2× Punkte
30 Tage
+30 Tage pro erfolgreichem Freund
```

Aktivierung erst nach erster Punktebuchung des eingeladenen Freundes.

---

## 32. Bonus Boost sichtbar im Kundenportal

🟢 **FIX**

Wenn Bonus Boost aktiv ist, muss er oben im Kundenportal sichtbar sein.

Nicht verstecken.

Beispiel:

```text
🔥 Heute sammelst du 2× Punkte!
Noch 24 Tage aktiv.
```

---

## 33. Multiplikatoren nicht stapeln

🟢 **FIX**

Mehr erfolgreiche Freunde verlängern die Dauer.

Sie erhöhen nicht den Multiplikator.

Beispiel:

```text
2× bleibt 2×
Dauer verlängert sich
```

Nicht:

```text
2× + 2× = 4×
```

---

# E. Punkte-Entscheidungen

---

## 34. Keine Kassensystem-Integration in V1

🟢 **FIX**

V1 arbeitet ohne POS.

### Warum?

Zu viele Kassensysteme, zu viel Aufwand.

### Lösung

Ein laminierter Bonus QR an der Kassa.

---

## 35. Ein Bonus QR

🟢 **FIX**

Ein Restaurant hat einen Bonus QR zum Punkte sammeln.

Gast scannt ihn und wählt Rechnungsbereich.

Kein NFC.

Kein Mitarbeitergerät nötig.

---

## 36. Rechnungsbereiche statt freier Betrag

🟢 **FIX**

Kunde wählt Bereich:

- 0–10 €
- 10–20 €
- 20–30 €
- 30–40 €
- 40–50 €
- 50–75 €
- 75–100 €
- 100 €+

Keine freie Eingabe.

---

## 37. Keine „bis X €“-Logik

🟢 **FIX**

„bis 20 €“ ist falsch, weil 5 € Gäste sonst zu viele Punkte erhalten.

Immer Bereiche.

---

## 38. Smart Upsell mit Genauigkeitsregel

🟢 **FIX**

Wenn exakter Betrag nicht sicher bekannt ist, keine exakte Euro-Differenz behaupten.

V1 darf nur mit Bereichen arbeiten.

V2 mit POS-QR kann exakt anzeigen:

```text
Nur noch 2,20 € bis zur nächsten Stufe.
```

---

# F. Kunden-Entscheidungen

---

## 39. Historische Regel: Kunden registrieren ohne Passwort

Status: **ERSETZT AM 2026-08-04**

V1 Kundenregistrierung:

- Vorname
- Telefonnummer
- Geburtstag optional

Keine:

- SMS
- WhatsApp
- E-Mail-Pflicht
- Passwort

### Warum?

Schneller Einstieg, keine Kosten.

Diese Regel wurde durch die spätere CTO-Entscheidung zum zentralen
Supabase-Auth-Kundenkonto ersetzt.

---

## 40. Smart Context

🟢 **FIX**

Kunde sucht kein Restaurant.

QR öffnet automatisch richtigen Restaurant-Kontext.

---

## 41. Customer Token statt Customer Code als Geheimnis

🟢 **FIX**

Customer Code darf Anzeige/Suche sein.

Zugriff erfolgt über sichere Tokens.

---

# G. UI/UX Entscheidungen

---

## 42. Deutsch zuerst

🟢 **FIX**

V1 UI ist Deutsch.

Prompts für Codex im Projekt sind Deutsch.

Englisch nur im Code.

---

## 43. Mobile First

🟢 **FIX**

Jede UI zuerst für 390 px Breite.

---

## 44. Eine Seite = Eine Entscheidung

🟢 **FIX**

Jeder Bildschirm hat genau ein Ziel.

---

## 45. Keine technischen Begriffe

🟢 **FIX**

Verboten in UI:

- Campaign
- Token
- Slug
- RPC
- Device Warning
- Referral Warning
- Threshold
- required_points

---

## 46. KPI-Kommunikation statt Fließtext

🟢 **FIX**

Besonders im Starter Kit und Kundenportal:

Icons + wenige Wörter.

Beispiel:

```text
🔥 Du 2× Punkte
👥 Freund 2× Punkte
📅 +30 Tage Bonus Boost
```

---

## 47. Logo nie verzerren

🟢 **FIX**

Logo immer proportional.

Keine quadratische Maske erzwingen.

---

## 48. Starter Kit Footer

🟢 **FIX**

Footer:

```text
Powered by WUXUAI Bonus • www.wuxuaisbi.com
```

Klein, grau, dezent.

---

# H. Sicherheitsentscheidungen

---

## 49. user_metadata nicht vertrauen

🟢 **FIX**

Rollen dürfen nicht aus `user_metadata` als Autorität kommen.

### Warum?

User kann user_metadata selbst ändern.

Rollen aus:
- restaurant_members
- app_metadata nur sekundär / vorsichtig
- sichere RPCs

---

## 50. Missing Role darf niemals Owner sein

🟢 **FIX**

Früherer Fehler wurde beseitigt.

Default darf nicht Owner sein.

---

## 51. Public Zugriff nur über RPC

🟢 **FIX**

Public Seiten dürfen keine geschäftlichen Tabellen direkt lesen.

---

## 52. Service Role niemals im Frontend

🟢 **FIX**

Service Role nur serverseitig.

---

## 53. Audit für kritische Aktionen

🟢 **FIX**

Audit Pflicht für:

- Punkte
- Einlösung
- Bonus Boost
- Willkommensgeschenk
- Staff Aktionen
- Trial
- Admin Änderungen

---

# I. Entwicklungsentscheidungen

---

## 54. Flow Lock Methodik

🟢 **FIX**

Entwicklung erfolgt Flow für Flow.

Ein Flow ist erst abgeschlossen, wenn:

- Restaurant
- Gast
- Staff
- System

funktionieren.

---

## 55. Restaurant Reality Check

🟢 **FIX**

Vor LOCK prüfen:

1. Würde ein Kellner das im Stress nutzen?
2. Versteht ein Besitzer das ohne Schulung?
3. Schafft ein Gast den Ablauf in unter 30 Sekunden?
4. Würde ein Restaurant dafür zahlen?

---

## 56. Engineering Bible ist Wahrheit

🟢 **FIX**

Die Engineering Bible ist ab jetzt die zentrale Wahrheit.

Nicht der Chat.

Nicht Codex.

Nicht verstreute Erinnerung.

---

## 57. Codex darf nicht frei planen

🟢 **FIX**

Codex arbeitet nach Spezifikation.

Wenn unklar:

```text
NOT READY
```

Nicht raten.

---

## 58. Keine neuen Features während kritischer Fehler

🟢 **FIX**

Security, Routing, RLS, Datenbank und Flow-Blocker zuerst beheben.

Dann neue UI.

---

## 59. Staging vor Production

🟢 **FIX**

Migrationen und Flows zuerst auf Supabase Staging.

Keine direkte Production-Entwicklung.

---

## 60. Build ist Pflicht

🟢 **FIX**

Jeder Codex-Fix endet mit:

```text
npm run build
```

Build muss grün sein.

---

# J. V2 Entscheidungen

---

## 61. Wochenplan ist V2

🟡 **V2**

Punkteeinlösungen pro Wochentag.

Nicht V1.

---

## 62. Filialen sind V2 UI

🟡 **V2**

Architektur vorbereiten, aber V1 UI nicht zeigen.

---

## 63. POS-QR ist V1.1/V2

🟡 **V2**

QR auf Rechnung mit Betrag, bill_id und Signatur.

Nicht V1.

---

## 64. Mehrsprachigkeit nach deutscher V1

🟡 **V2**

EN/ZH nach Feature Freeze.

---

## 65. SMS/WhatsApp optional später

🟡 **V2**

Nicht V1.

## 66. Optionale Partnerrestaurant-Karte ist V1

🟢 **FIX / V1 – 23.07.2026**

- Die Karte ist eine optionale Entdecken-Seite, kein Ersatz für den QR-Einstieg.
- Leaflet mit OpenStreetMap ist die einzige interne Kartenlösung.
- Es wird keine Google Maps JavaScript-, Places-, Nearby-, Routes- oder
  Distance-Matrix-API verwendet.
- Marker stammen ausschließlich aus der eigenen Datenbank und benötigen eine
  ausdrückliche öffentliche Freigabe.
- Owner bearbeiten in V1 nur den bestehenden primären Standort. Eine echte
  Multi-Filialverwaltung bleibt V2.
- Auswahl auf Karte oder Liste verändert keinen aktiven Kundentoken und startet
  weder Registrierung, Punktebuchung noch Einlösung.
- Der Finder trägt sichtbar den Titel `Lokale entdecken` und bietet Karte und
  barrierefreie Liste mit Besuchen, restaurantbezogenen Punkten und der
  nächsten Einlösemöglichkeit.
- Die Daten werden über genau einen begrenzten Aggregat-RPC geladen. Kundenzugänge
  bleiben restaurantbezogen, werden nur gehasht geprüft und nie zurückgegeben.
- `Belohnung bald erreichbar` gilt zentral ab 70 Prozent. Öffnungsstatus,
  Mittagspause und Tagesgrenzen verwenden `Europe/Vienna`.

---

## 66. WUXUAI Admin Basis

🟢 **V1 BASIS**

Das vollständige WUXUAI Admin Portal bleibt ein späterer Ausbau.

Für V1 wird aber eine schlanke interne Basis gebaut:

- Restaurantliste
- Trial Status
- Abo-Status
- Zahlungsstatus
- manuelle Trial-Verlängerung
- manuelles Aktivieren / Pausieren
- Audit für jede interne Änderung

Stripe Checkout und Stripe Webhooks bleiben ein eigener Folgeblock.

Restaurantrollen geben keinen Zugriff auf WUXUAI Admin.
Plattformrollen bleiben getrennt von Restaurantrollen.

Logikregeln:

- Ein Nutzer kann gleichzeitig Restaurant Owner und Plattform Admin sein.
- Restaurant Portal prüft Restaurantrolle.
- WUXUAI Admin prüft Plattformrolle.
- Plattformrolle darf Restaurantrolle nicht überschreiben.
- Read-only Plattformrollen sehen keine Schreibaktionen.
- Zahlung manuell bestätigen ändert nicht automatisch Abo-Status oder Restaurantstatus.
- Restaurant pausieren ist in V1 eine Subscription-Pause und kein generischer Customer-Portal-Kill.
- Multi-Branch-Fan-out in der Restaurantliste ist verboten.
- Restaurant Settings zeigen Abo/Testphase mit echten `branch_subscriptions`-Daten.
- Die Restaurant-Settings-Seite muss auch mit der einfachen V1-Basistabelle funktionieren und darf nicht an fehlenden Stripe-/Payment-Spalten scheitern.
- V1 Trial: 30 Tage kostenlos, keine Kreditkarte, danach Monatsabo.
- Keine Fake-Zahlung, kein Dummy-Checkout und kein Fake-Abo-Erfolg vor echter Stripe-Anbindung.

---

## 67. Branchen-Erweiterung V2

🟡 **V2**

Restaurants/Cafés zuerst.

Später lokale Betriebe.

---

## 68. Echte Restaurantdaten statt Demo-Daten

🟢 **V1 FIX**

Wenn Supabase aktiv ist, zeigt das Restaurant Portal nur echte Tenant-Daten
des aktuellen Restaurants.

Das gilt für:

- Dashboard-KPI
- Punkteeinlösungen
- Willkommensgeschenke
- Gäste
- Kundenportal
- QR-nahe Kundenflows

Wenn keine echten Daten vorhanden sind:

```text
Leerer Zustand statt Demo-Daten.
```

Demo-Daten sind nur erlaubt:

- ohne Supabase-Konfiguration
- in explizitem Demo-Modus

Begründung:

Restaurantbesitzer müssen sofort erkennen, was in ihrem echten Restaurant
passiert. Demo-Karten auf echten Seiten zerstören Vertrauen.

---

## 69. Tages-PIN und PIN-lose Punkteeinlösung

🟢 **LOCK**

Punkte sammeln und Punkteeinlösung verwenden sind in V1 bewusst unterschiedlich
abgesichert.

### 69.1 Punkte sammeln

Punkte sammeln braucht immer eine automatisch erzeugte 4-stellige Tages-PIN.

Regel:

- pro Restaurant / Filiale täglich neu
- gültig bis 23:59
- serverseitig gespeichert
- serverseitig geprüft
- sichtbar nur in der Mitarbeiteransicht
- Restaurantbesitzer muss nichts verwalten
- keine persönliche Kellner-PIN auf dem Kundenhandy

Keine Punktebuchung darf ohne korrekte Tages-PIN erfolgen.

Zusätzlicher Fraud-Schutz:

- maximal 5 falsche Tages-PIN-Versuche pro Gast / Restaurant / Filiale / lokalem Tag
- danach ist Punkte sammeln für diesen Gast bis Tagesende gesperrt
- falsche Versuche werden als `daily_pin_failed` auditiert
- Sperren werden als `daily_pin_locked` auditiert
- maximal 2 erfolgreiche Punktebuchungen pro Gast / Restaurant / Filiale / lokalem Tag
- eine dritte Punktebuchung am selben lokalen Tag wird serverseitig blockiert
- V1 verwendet für Tages-PIN und Tageslimit einheitlich `Europe/Vienna`

### 69.2 Punkteeinlösung verwenden

Punkteeinlösung verwenden braucht keine PIN.

Regel:

- Gast öffnet eine freigeschaltete Punkteeinlösung
- Gast bestätigt final
- nach Bestätigung werden Punkte abgezogen
- Punkteeinlösung bleibt als Produktangebot sichtbar
- bei erneut ausreichendem Punktestand ist dieselbe Punkteeinlösung erneut einlösbar
- Server prüft Restaurant, Gast, Punkteeinlösung, aktiven Status und Punktestand
- Einlöse-Historie wird geschrieben
- Audit Log wird geschrieben

Pflichttext:

```text
Punkte wirklich einlösen?
Nach der Bestätigung werden 300 Punkte von deinem Konto abgezogen.
```

Nach Erfolg:

```text
Punkteeinlösung erfolgreich.
300 Punkte wurden eingelöst.
```

Willkommensgeschenke bleiben davon getrennt:

- einmalig
- keine Punkte
- nach Einlösung verbraucht
- danach nicht mehr sichtbar

### 69.3 Verboten

Verboten:

- persönliche Kellner-PIN auf dem Kundenhandy
- manuelle PIN-Verwaltung durch Restaurantbesitzer
- Tages-PIN für Punkteeinlösung verwenden
- normale Punkteeinlösung dauerhaft aus der Kundenansicht entfernen
- Willkommensgeschenk mehrfach einlösbar machen
- Punktebuchung ohne Tages-PIN

Die Software übernimmt die tägliche PIN-Erstellung automatisch.

---

## 70. Codex Selbstkontroll-Loop

🟢 **LOCK**

Für jede Codex-Aufgabe gilt ab jetzt ein verbindlicher Selbstkontroll-Loop.

Codex darf **LOCK** nur melden, wenn im betroffenen Umfang geprüft wurde:

- Code
- Verbindung
- Sicherheit
- Build
- Dokumentation
- alte Logik
- Export

Wenn ein Punkt nicht vollständig geprüft wurde:

```text
NOT READY
```

### 70.1 Kein theoretisches LOCK

Verboten:

- theoretisches LOCK
- „soweit im Code validierbar“ als LOCK
- FINAL LOCK ohne echte Prüfung der betroffenen Verbindung
- FINAL LOCK ohne Staging-Test bei Migrationen oder Flow-Verbindungen

### 70.2 Status-Stufen

Erlaubte Status:

- `LOCK`
- `CODE LOCK`
- `FINAL LOCK`
- `NOT READY`

FINAL LOCK ist nur erlaubt, wenn zusätzlich:

- Migration auf Staging angewendet
- echter Staging-Flow getestet
- RLS/Security geprüft
- keine offenen Risiken

### 70.3 Pflicht nach jeder Aufgabe

Nach jeder Aufgabe müssen erstellt werden:

- Report unter `/docs/reports/YYYY-MM-DD_AUFGABENNAME_REPORT.md`
- Prüf-ZIP unter `/exports/YYYY-MM-DD_AUFGABENNAME.zip`

Build ist Pflicht:

```text
npm run build
```

---

# 71. Was Codex niemals aus CTO-Entscheidungen ableiten darf

Codex darf nicht:

- V2 in V1 bauen
- generische Aktionen oder Kampagnen wieder einführen; die einzige V1-Ausnahme
  ist das LOCKED Informationsmodul `Aktuelles & Angebote`
- Punkte manuell machen
- Willkommensgeschenke sofort freischalten
- Referral und Welcome Gift kombinieren
- POS verpflichtend machen
- SMS/WhatsApp einbauen
- WUXUAI Admin mit Restaurant Portal vermischen
- Englisch in UI schreiben
- Demo-Daten in echten Restaurantseiten anzeigen
- ohne Build abschließen
- bei Unklarheit improvisieren
- persönliche Kellner-PIN auf dem Kundenhandy einführen
- Tages-PIN für Punkteeinlösung verwenden
- FINAL LOCK ohne Staging-/Verbindungsprüfung melden

---

# 72. Sichtbarer Begriff: Punkteeinlösung

🟢 **LOCK**

Der normale Punktebereich heißt in V1 sichtbar:

```text
Punkteeinlösung
```

Nicht mehr:

```text
Belohnungen
```

### 72.1 Bedeutung

Punkteeinlösungen sind Produkte, die Gäste mit gesammelten Punkten einlösen können.

Restaurantbesitzer denken in:

- Produkt
- Preis
- Aktiv/Inaktiv

WUXUAI berechnet automatisch, wie viele Punkte zur Einlösung nötig sind.

### 72.2 Abgrenzung

Willkommensgeschenke bleiben ein eigener Bereich.

Willkommensgeschenke:

- kosten keine Punkte
- werden einmalig nach Registrierung vergeben
- werden nicht als Punkteeinlösung bezeichnet

### 72.3 Technische Namen

Bestehende technische Namen wie `rewards`, `RewardsPage` oder `rewardService` dürfen in V1 bestehen bleiben.

Der Begriffswechsel betrifft die sichtbare UI und die Produktdokumentation, nicht die Datenbankarchitektur.

---

## 73. Willkommensgeschenke nach Onboarding bearbeitbar

Status: **LOCK**

Willkommensgeschenke sind nicht nur ein Onboarding-Schritt.

Restaurantbesitzer können den Welcome-Gift-Pool später im Restaurant Portal
bearbeiten.

Bearbeitbar:

- Name
- Kategorie
- Wertgrenze in €
- Foto oder Standardbild
- Aktiv/Inaktiv

Regeln:

- Willkommensgeschenke bleiben kostenlos.
- Willkommensgeschenke sind keine Punkteeinlösungen.
- Aktive Willkommensgeschenke bilden den Pool für zukünftige normale
  Erstanmeldungen.
- Ein Restaurant darf mehrere aktive Willkommensgeschenk-Optionen gleichzeitig
  haben.
- Die falsche Unique-Regel „nur ein aktives Willkommensgeschenk pro Restaurant“
  ist entfernt und darf nicht wieder eingeführt werden.
- Pro Kunde bleibt maximal ein automatisch zugeteiltes Willkommensgeschenk
  erlaubt.
- Deaktivierte Willkommensgeschenke werden nicht neu zugeteilt.
- Bereits eingelöste Willkommensgeschenke werden durch spätere Bearbeitung
  nicht reaktiviert.
- Freunde-Einladungen erhalten weiterhin kein Willkommensgeschenk.

---

## 74. Einstellungen zeigen echte Daten

Status: **LOCK**

Die Restaurant-Einstellungen sind in V1 keine Platzhalter-Seite.

Regel:

- Jede klickbare Karte braucht echte Funktion oder echten Link.
- Restaurantdaten werden aus dem aktuellen Tenant geladen.
- Bearbeitbare Felder speichern in Supabase mit normalem User-Kontext.
- Branding nutzt die bestehende Restaurant-Mediathek und zeigt echte Logo-/Farbdaten.
- Öffnungszeiten bearbeiten die vorhandene `opening_hours`-Struktur.
- Tages-PIN bleibt automatisch und ist nicht manuell bearbeitbar.
- Abo/Testphase zeigt echte Subscription-Daten oder klaren Nicht-verfügbar-Status.
- Keine Stripe-Fake-Funktion in V1.
- Fehlende Stripe-/Payment-Spalten werden als "Zahlung wird bald aktiviert" behandelt, nicht als sichtbarer DB-Fehler.
- Keine Fake-Klicks, keine leeren Modale, keine Dummy-Daten.

Warum:

Restaurantbesitzer vertrauen Einstellungen nur, wenn sichtbare Änderungen
wirklich gespeichert werden. Platzhalterkarten wirken unfertig und
widersprechen der WUXUAI-Philosophie.

---

## 75. Onboarding Bonus-Designer Rückgabequoten

Status: **LOCK**

Onboarding Schritt 4 heißt **Punkteeinlösung**, nicht mehr „Belohnen“.

Im Onboarding-Schritt **Punkteeinlösung** gelten feste V1-Rückgabequoten:

- Sparsam: 3 %
- Normal: 5 %
- Großzügig: 8 %
- Premium: 10 %

Berechnung:

```text
Konsumation = Durchschnittsbon × Besuche
Einlösewert = Konsumation × Rückgabequote
```

Diese Rückgabequoten dienen der Onboarding-Empfehlung. Keine neue
Tages-PIN-Logik, keine neue Reward-Einlösung und keine neue Bonus-Boost-Logik
wird daraus abgeleitet.

Die gewählte Quote wird pro Restaurant gespeichert und ist die zentrale
Berechnungsgrundlage für normale Punkteeinlösungen. Nach dem Onboarding kann
der Owner ausschließlich ganze Werte von 1 % bis 10 % wählen. Der Standard ist
3 %. Historische Altwerte werden nicht stillschweigend überschrieben.

Formel:

```text
Geschätzte Konsumation = Produktpreis / Einlösequote
Benötigte Punkte = ceil(Geschätzte Konsumation - Punkte pro Euro)
```

Beispiel Normal:

```text
5,40 € / 0,05 = 108,00 €
```

Neue oder bearbeitete Punkteeinlösungen verwenden diese Quote. Die alte feste
10×-Produktwert-Regel gilt dafür nicht mehr.

---

## 76. Live-Runtime ohne Demo-Modus

Status: **LOCK**

Ab V1 Live-Test gilt:

- Die Runtime enthält keinen aktiven Demo-Modus.
- `demoData`, Demo-Restaurant, Demo-Branding, Demo-User und Kai-Sushi-Daten
  dürfen nicht mehr in aktive App-Flows importiert werden.
- Wenn Supabase nicht konfiguriert ist, zeigt die App eine deutsche
  Verbindungsfehlermeldung statt Demo-Daten:

```text
Live-Daten konnten nicht geladen werden.
Bitte prüfe die Supabase-Verbindung.
```

Pflichtvariablen für Cloudflare / Live:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Optional:

```text
VITE_APP_BASE_URL
```

Nicht in die Live-App:

```text
SUPABASE_ACCESS_TOKEN
Service Role Key
Demo-Flags
Demo-Daten
```

Öffentliche Kunden-URLs laden Restaurants ausschließlich per echtem Slug aus
Supabase. Unbekannte Slugs zeigen einen deutschen Fehler und niemals
Demo-Restaurantdaten.

---

# 77. LOCK Kriterien

Diese CTO-Entscheidungsdatei gilt als LOCK, wenn:

- alle wichtigen FIX-Entscheidungen dokumentiert sind
- V1/V2 klar getrennt sind
- Codex klare Verbote hat
- Geschäftslogik nachvollziehbar ist
- Sicherheitsentscheidungen dokumentiert sind
- UX-Entscheidungen dokumentiert sind
- Entwicklungsprozess dokumentiert ist
- keine Entscheidung widersprüchlich zur übrigen Bible ist

---

# 78. Codex-Regeln

Wenn Codex diese Datei liest:

1. FIX ist verbindlich.
2. V2 nicht ohne Auftrag bauen.
3. Ideen nicht bauen.
4. Bei Konflikt zwischen Chat und Bible: Bible gewinnt.
5. Bei Konflikt zwischen Code und Bible: Bericht erstellen, nicht eigenmächtig ändern.
6. Bei Unsicherheit: NOT READY.
7. Build ausführen.
8. Deutsch in UI.
9. Mobile First.
10. Keine Demo-Daten in Live-/Staging-Runtime.
11. Restaurantnutzen vor Technik.

---

Endstatus: **LOCK**
## CTO-Entscheidung 2026-07-14: Tages-PIN, Geschenktypen und Einlösecode

🟢 **FIX / V1**

- Tages-PIN: vierstellig, automatisch, lokal pro Restaurant/Filiale und Tag, nur für Punkte sammeln.
- Punkte sammeln: maximal zwei erfolgreiche Buchungen pro Gast, Restaurant/Filiale und lokalem Tag; atomar und idempotent.
- Willkommensgeschenk: einmalig pro Gast und Restaurant/Filiale.
- Geburtstagsgeschenk: einmalig pro Gast, Restaurant/Filiale und Jahr; 14 Tage vorher zufällig aus aktiven Willkommensgeschenken.
- Einlösung: verbindliche Kundenbestätigung, danach sechsstelliger einmaliger Code für 15 Minuten, Mitarbeiterbestätigung ohne PIN.
- Alte Screenshots und abgelaufene/verwendete Codes werden serverseitig abgelehnt.

Diese Entscheidung hat Vorrang vor älteren Aussagen, nach denen eine Einlösung ohne prüfbaren Code bereits unmittelbar nach dem Kundenbutton vollständig abgeschlossen ist.

## CTO-Entscheidung 2026-07-22: Retention-Funktionen V1

🟢 **FIX / V1**

- Ablauf-Erinnerungen: serverseitige Stufen 7/3/1/0 Tage, Darstellung im Startseiten-Drawer und freiwilliger Web Push. Drawer ist der vollständige Fallback.
- Geburtstagsgeschenk: freiwilliger Tag/Monat, Abholung 3 Tage vor bis 7 Tage nach dem Geburtstag, serverseitige Zufallsauswahl aus dem freigegebenen aktiven Willkommensgeschenk-Pool, höchstens einmal pro Jahr.
- Diese Geburtstagsregel ersetzt die automatische Auswahl 14 Tage vor dem Geburtstag.
- Bonus Boost: beide Beteiligten erhalten nach der ersten gültigen Punktebuchung des geworbenen Neukunden 30 Tage lang exakt 2× Punkte.
- Weitere erfolgreiche Empfehlungen verlängern den aktiven Boost des Empfehlenden jeweils um 30 Tage.
- Keine Push-Nachricht, Auslosung oder Empfehlung darf die bestehende serverseitige Punkte- oder Einlösesicherheit umgehen.

## CTO-Entscheidung 2026-07-24: Legal-Compliance-Layer

🟢 **TECHNISCHE GRUNDLAGE / EXTERNE PRÜFUNG ERFORDERLICH**

- Das Restaurant ist Betreiber und Aussteller seines restaurantbezogenen Bonusprogramms; WUXUAI ist technischer SaaS-Plattformanbieter und hält keine Kundengelder.
- Punkte sind kein Geld, kein Bankguthaben, keine E-Wallet und kein allgemeines Zahlungsmittel. Sie sind nicht auszahlbar, verkäuflich oder zwischen Kunden beziehungsweise Restaurants übertragbar.
- Teilnahmebedingungen und Datenschutzinformationen sind je Restaurant versioniert und unveränderlich. Eine konfigurierte erneute Annahme wird versionsgebunden gespeichert.
- Marketing-Push, Marketing-SMS und Marketing-E-Mail sind getrennte, freiwillige Einwilligungen und standardmäßig aus. Ohne gültige kanalspezifische Einwilligung blockiert der Server Marketingversand.
- Öffentliche rechtliche Inhalte laufen über begrenzte RPCs. Legal-, Consent- und Kundentabellen erhalten keine öffentliche Lesepolicy.
- Datenschutzlöschung und Programmende sind geprüfte Abläufe, keine sofortigen Lösch- oder Abschaltaktionen.
- Die technische Grundlage benötigt vor Production externe österreichische Rechts- und Steuerprüfung.

## CTO-Entscheidung 2026-07-28: V1 Bonus-Aktivitätsprotokoll

🟢 **FIX / V1 / EXTERNE RECHTSPRÜFUNG ERFORDERLICH**

- WUXUAI dokumentiert Punktebewegungen und Einlösungsaktivitäten innerhalb des Bonusprogramms.
- WUXUAI ist keine Registrierkasse, kein RKSV-System, kein Kassenbelegsystem, kein Buchhaltungssystem und keine Steuerberatung.
- Steuerlich, kassentechnisch oder buchhalterisch relevante Vorgänge erfasst das Restaurant eigenverantwortlich in seinem Kassensystem.
- Erfolgreiche Einlösungen erhalten genau einen unveränderbaren Snapshot im Bonus-Aktivitätsprotokoll.
- Korrekturen erfolgen als auditiertes Protokollstorno; der Ursprungsdatensatz bleibt erhalten.
- Monats- und Jahresübersichten verwenden serverseitige Kalendergrenzen in `Europe/Vienna` und schließen Testkunden standardmäßig aus.
- Historische Lücken werden gekennzeichnet und niemals mit heutigen Stammdaten als historische Wahrheit aufgefüllt.
- Der bestehende RPC `get_reward_accounting_export` bleibt als technischer Kompatibilitätsvertrag erhalten, wird aber nicht als Steuer- oder Kassenexport bezeichnet.
- Referral-, Werbe- und Kompensationsarten werden im Journal klassifizierbar, ohne dadurch neue V1-Ausgabe- oder Einlöseflows einzuführen.
- Alle rechtlichen Hinweise tragen bis zur externen Prüfung den Status `LEGAL_REVIEW_REQUIRED` beziehungsweise `DRAFT_LEGAL_REVIEW_REQUIRED`.

## CTO-Entscheidung 2026-07-28: Restaurantbezogene Dauer des Freundschaftsbonus

🟢 **FIX / V1**

- Der Freundschaftsbonus bleibt exakt 2×; Standarddauer bleibt 30 Tage.
- Owner/Admin dürfen pro Restaurant 1 bis 365 ganze Tage konfigurieren.
- Manager, Mitarbeiter und Kunden dürfen diese Einstellung nicht ändern.
- Die gespeicherte Dauer wird erst bei einer neuen erfolgreichen Empfehlungsqualifizierung verwendet.
- Laufende Bonuszeiträume bleiben bei Einstellungsänderungen unverändert.
- Weitere erfolgreiche Empfehlungen verlängern einen aktiven Zeitraum um die zum Qualifizierungszeitpunkt gespeicherte Dauer.
- Diese Entscheidung ersetzt für die Dauer die feste 30-Tage-Regel aus der Retention-Entscheidung vom 22.07.2026; der 2×-Multiplikator bleibt unverändert.

## CTO-Entscheidung 2026-08-03: Punkte-Präsentationsfenster

🟢 **LOCKED / V1**

- Normale Punktebelohnungen benötigen keinen sechsstelligen Staff-Code mehr.
- Die ausdrückliche Kundenbestätigung belastet die Punkte serverseitig sofort
  und endgültig.
- Danach gilt ein serverzeitgebundenes Präsentationsfenster von 15 Minuten.
- Das Team kontrolliert nur den aktiven Bildschirm; keine elektronische
  Mitarbeiterbestätigung, PIN oder QR-Prüfung.
- Status: `REDEEMED_ACTIVE` zu `REDEEMED_COMPLETED`.
- Reload, Browserwechsel und parallele Tabs verlängern das Fenster nicht.
- Nur Owner oder Support dürfen mit Begründung, Audit, Journal und atomarer
  Rückbuchung stornieren.
- Willkommens- und Geburtstagsgeschenke behalten den sechsstelligen Code.

Diese Entscheidung ersetzt die Code-Regel vom 14.07.2026 ausschließlich für
normale Punktebelohnungen.

## CTO-Entscheidung 2026-08-04: Aktuelles & Angebote

🟢 **LOCKED / V1**

- `Aktuelles & Angebote` ist ein kleines Informations- und Werbemodul für
  Wochenangebote, Monatsangebote, Mittagsmenüs, neue Gerichte, Saisonangebote,
  Veranstaltungen und allgemeine Neuigkeiten.
- Pro Restaurant dürfen maximal fünf Beiträge gleichzeitig veröffentlicht sein.
- Angebote und Rewards sind getrennte fachliche Objekte; es gibt keine
  Pflichtbeziehung zu Reward-, Coupon- oder Campaign-Tabellen.
- Beiträge dürfen keine Punktebewegung, Freischaltung, Geschenkvergabe,
  Einlösung, Codes oder Einlösungsjournale erzeugen.
- Kunden sehen Beiträge nur beim Öffnen der App, des Kundenportals oder des
  Partnerlokal-Finders. V1 versendet keine automatische Benachrichtigung.
- Analytics bleibt aggregiert und PII-frei: Aufrufe, CTA-, Route- und
  Bonus-öffnen-Klicks. Keine Betrachterlisten, Profile oder Segmente.
- Push, E-Mail, SMS, Zielgruppen, Personalisierung, Coupons, Rabattcodes,
  Punkte-Multiplikator-Kampagnen, Marketingautomation, A/B-Tests und
  Umsatzattribution bleiben V2.
- Preiswerbung, Streichpreise, Verfügbarkeit, Bildrechte, Produktinformationen,
  Allergene und Veranstaltungsangaben bleiben `LEGAL_REVIEW_REQUIRED`.

Diese Entscheidung ersetzt frühere pauschale Verbote dynamischer
Promotionflächen ausschließlich für dieses eng begrenzte Informationsmodul.

## CTO-Entscheidung 2026-08-04: Zentraler Kundenbereich und Angebots-E-Mails

🟢 **LOCKED / V1 / DRAFT_LEGAL_REVIEW_REQUIRED**

- `Mein WUXUAI` verbindet serverseitig validierte restaurantbezogene
  Memberships, ohne Punkte restaurantübergreifend zu summieren.
- Der QR bleibt für Beitritt und Vor-Ort-Kontext; bestehende Memberships dürfen
  ohne erneuten Scan geöffnet werden.
- Telefonnummer, Geburtstag und Gerätekennung sind keine Zugangsnachweise.
- Pro Restaurant sind freiwillig `Nie`, `Wöchentlich` und `Monatlich` erlaubt;
  Standard ist `Nie`, Aktivierung erst nach Double-Opt-in.
- Digest-Versand ist serverseitig und periodisch idempotent. Owner sehen nur
  Aggregate.
- Diese Entscheidung ersetzt die E-Mail-Sperre der unmittelbar vorherigen
  `Aktuelles & Angebote`-Entscheidung nur für bestätigte Digests.
- Ohne geeigneten Marketingprovider bleibt Versand technisch deaktiviert.

Diese Entscheidung wird hinsichtlich Auth-Modell, Navigation und globaler
Angebotsansicht durch die nachfolgende Entscheidung `Zentraler Kundenlogin und
Restaurantkontext` präzisiert beziehungsweise ersetzt.

## CTO-Entscheidung 2026-08-04: Zentraler Kundenlogin und Restaurantkontext

🟢 **LOCKED / V1**

- Eine bestätigte Supabase-Auth-Session ist die zentrale Kundenidentität.
- Kunden registrieren sich mit E-Mail, Passwort, Vorname, Telefonnummer und
  optionalem Geburtstag. Passwörter werden ausschließlich von Supabase Auth
  verarbeitet.
- Ein Restaurant-QR setzt nur den Restaurantkontext und enthält keine
  Kundendaten oder globalen Kundentokens.
- Memberships entstehen ausschließlich nach bewusster Zustimmung und bleiben
  zusammen mit Punkten, Rewards, Geschenken und Angeboten restaurantbezogen.
- Bestehende Restaurantkunden werden nur mit gültigem geheimem Restauranttoken
  verknüpft; Telefonnummer, Geburtstag oder Gerätekennung reichen nicht.
- Die zentrale Navigation lautet `Start`, `Meine Lokale`, `Entdecken`, `Konto`.
- Es gibt keinen global gemischten Angebotsfeed. Vollständige Angebote werden
  nur im bewusst geöffneten Restaurantkontext gezeigt.
- Angebots-E-Mails bleiben deaktiviert, bis die gesonderte Infrastruktur
  freigegeben ist.

## CTO-Entscheidung 2026-08-09: Einheitliches Präsentationsfenster und automatische Geburtstagszuteilung

🟢 **LOCKED / V1 / VORRANG VOR DEN EINLÖSEENTSCHEIDUNGEN VOM 14.07., 22.07. UND 03.08.**

- Punktebelohnungen, Willkommensgeschenke und Geburtstagsgeschenke verwenden
  nach ausdrücklicher Kundenbestätigung dasselbe serverzeitgebundene
  15-Minuten-Präsentationsfenster.
- Ein neuer sechsstelliger Mitarbeitercode ist kein primärer V1-Geschenkflow.
  Historische aktive Codes bleiben nur aus Kompatibilitätsgründen lesbar.
- Geschenkzuteilung, Kunde, Restaurant, Status und Gültigkeit werden beim Start
  serverseitig geprüft. Doppelklick, parallele Tabs und weitere Geräte erzeugen
  kein zweites Fenster.
- Nach Ablauf wird die Zuteilung unveränderbar als eingelöst markiert und im
  Journal sowie Audit protokolliert; sie wird nicht gelöscht.
- Ein täglicher Serverjob weist 14 Tage vor dem Geburtstag genau ein aktives,
  für Geburtstage freigegebenes Willkommensgeschenk zu. Die Gültigkeit reicht
  bis zum Beginn des 15. Tages nach dem Geburtstag.
- Pro Kunde, Restaurant und Geburtstagsjahr existiert höchstens eine
  Zuteilung. Der 29. Februar wird in Nicht-Schaltjahren am 28. Februar behandelt.
- Geburtstags- und Punkte-Schwellen-E-Mails werden nur als private,
  idempotente Transaktionsqueue erzeugt. Versandfehler rollen weder Punkte noch
  Geschenke zurück. Ein freigegebener serverseitiger Versandprovider bleibt
  Voraussetzung für tatsächliche Zustellung.
- Stripe bleibt ausdrücklich außerhalb dieses Sprints.
