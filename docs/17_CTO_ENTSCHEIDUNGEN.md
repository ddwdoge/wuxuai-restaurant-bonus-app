
# 17_CTO_ENTSCHEIDUNGEN.md

# WUXUAI Bonus V1 – CTO Entscheidungen

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

## 6. Produktname langfristig: WUXUAI Bonus

🟢 **FIX / Strategie**

Das Produkt soll nicht dauerhaft nur „Restaurant Bonus“ heißen.

Langfristige Marke:

```text
WUXUAI Bonus
```

V1 kann in Kommunikation Restaurants/Cafés fokussieren.

### Warum?

Das gleiche Bonusmodell funktioniert auch für andere lokale Betriebe.

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

## 22. Aktionen-Modul aus V1 entfernt

🟢 **FIX**

Das Modul „Aktionen“ wird aus V1 entfernt.

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

- Aktionen in Sidebar
- Neue Aktion starten Button
- Aktionen als Pflichtbereich

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

## 39. Kunden registrieren ohne Passwort

🟢 **FIX**

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
- Aktionen wieder einführen
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
Berechnungsgrundlage für normale Punkteeinlösungen.

Formel:

```text
Geschätzte Konsumation = Produktpreis / Einlösequote
Benötigte Punkte = Geschätzte Konsumation / amount_per_point
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
