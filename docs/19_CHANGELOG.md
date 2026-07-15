
# 19_CHANGELOG.md

# WUXUAI Bonus V1 – Changelog

Status: **LOCK**

Dieses Dokument dokumentiert die wichtigsten Produkt-, Architektur-, UX-, Sicherheits- und Engineering-Entscheidungen des WUXUAI Bonus Projekts.

Der Changelog ist nicht nur eine Liste von Codeänderungen.  
Er ist die historische Entscheidungsakte des Projekts.

Er zeigt:

- welche Richtung das Produkt genommen hat,
- warum bestimmte Funktionen entfernt wurden,
- welche Regeln als FIX gelten,
- welche Funktionen bewusst auf V2 verschoben wurden,
- welche kritischen Bugs gefunden und gelöst wurden,
- welche Infrastruktur-Meilensteine erreicht wurden,
- welche Engineering-Bible-Dateien bereits LOCK sind.

---

## 1. Zweck dieses Changelogs

Der Changelog beantwortet später Fragen wie:

- Warum gibt es keine Aktionen in V1?
- Warum gibt es Willkommensgeschenke getrennt von Belohnungen?
- Warum wird ein Willkommensgeschenk erst nach der ersten Konsumation freigeschaltet?
- Warum gibt es keine SMS-Verifizierung in V1?
- Warum arbeitet das System ohne Kassensystem-Integration?
- Warum nutzt V1 Rechnungsbereiche statt freier Betragseingabe?
- Warum gibt es Smart Reward Engine?
- Warum wurde Bonus Boost als Kernmechanismus definiert?
- Warum ist das Onboarding ein Installationsassistent?
- Warum wird die Engineering Bible zur Wahrheit erklärt?

Der Changelog schützt das Projekt vor Vergessen.

## 1.1 2026-07-13 - WUXUAI Admin Restaurant-Verwaltung

Status: **CODE LOCK / STAGING OFFEN**

Die interne WUXUAI Admin Restaurant-Verwaltung wurde als V1-Basis
ausgebaut.

Geändert:

- neue interne Route `/admin/platform`
- Detailroute `/admin/platform/restaurants/:id`
- Plattformrollen erweitert um `app_admin`, `super_admin`, `wuxuai_admin`
- Restaurantliste mit Suche und Filter
- KPI-Übersicht für globale Restaurantdaten
- Restaurantdetails mit Branding, Trial/Abo, Links, Kennzahlen und Audit-Auszug
- Statusverwaltung aktiv / pausiert / gesperrt
- sichere Detail-RPC `get_platform_restaurant_detail(input_restaurant_id)`

Nicht gebaut:

- Stripe-Automation
- Impersonation
- Löschfunktion
- Restaurant-Produktlogik
- Customer-/Staff-/Punkte-Logik

Offen:

- Migration muss noch auf Supabase Staging angewendet werden, sobald ein
  `SUPABASE_ACCESS_TOKEN` verfügbar ist.

---

## 1.2 2026-07-13 - Public-RPC-Entscheidung für Punkteeinlösung

Status: **CODE LOCK / STAGING OFFEN**

Die Security-Bewertung für `redeem_customer_reward(text, uuid)` wurde
präzisiert.

Entscheidung:

- `anon` Execute ist für diese RPC in V1 bewusst erlaubt.
- Grund: Das Kundenportal arbeitet öffentlich mit `customer_token` und ohne
  Login.
- Die Sicherheit liegt in der RPC selbst: Token, Customer, Restaurant, Branch,
  Reward-Status, Willkommensgeschenk-Status, Punktestand, atomarer Update und
  Audit.

Geändert:

- additive Migration
  `20260713003000_redeem_customer_reward_anon_security_decision.sql`
- SQL-Kommentar dokumentiert den bewussten Public-RPC-Grant.
- Branch-Zugehörigkeit wurde in `redeem_customer_reward` explizit geprüft.
- alte Code+PIN-RPCs bleiben für `anon` und `authenticated` gesperrt.
- AdminLayout nutzt eine zentrale Setup-Pfadprüfung und rendert gesperrte
  Menüpunkte nicht mehr als irreführende echte Routen.

Nicht geändert:

- keine Tages-PIN-Logik
- keine Punkteformel
- keine Customer-Portal-UX
- keine Willkommensgeschenk-Zufallslogik
- keine Bonus-Boost-Logik

Offen:

- Migration muss auf Supabase Staging angewendet werden.
- Tests mit eigenem, fremdem, eingelöstem, gesperrtem und ungültigem Reward
  müssen live gegen Staging bestätigt werden.

---

## 1.3 2026-07-13 - Live-Go Hardening Einlösung und Owner Registration

Status: **CODE LOCK / STAGING OFFEN**

Die öffentliche Punkteeinlösung und die Restaurant-Owner-Registrierung wurden
für Live-Go gehärtet.

Geändert:

- neue Tabelle `customer_reward_redemption_attempts`
- `redeem_customer_reward` limitiert auf maximal 5 Einlöseversuche pro
  Kundentoken in 10 Minuten
- Kundentokens werden in Attempt-Logs nur gehasht gespeichert
- erwartete Ablehnungen werden als JSON-Fehler zurückgegeben, damit Attempt
  Logging nicht durch Transaktionsrollback verloren geht
- Customer Portal Service zeigt diese Fehler weiter als deutsche Meldung an
- `start_restaurant_owner_trial` ist retry-/idempotenz-sicher
- `completePendingOwnerRegistration` wartet mit kurzem Backoff auf
  Supabase-Session/User und löscht Pending-Daten erst nach erfolgreichem
  Abschluss

Nicht geändert:

- keine PIN-Einlösung
- keine 6-stellige Code-Einlösung
- keine Tages-PIN-Logik
- keine Punkteformel
- keine Customer-Portal-UX außer Fehlermeldung
- keine Willkommensgeschenk-Zufallslogik
- keine Bonus-Boost-Logik

Offen:

- Migration muss auf Supabase Staging angewendet werden.
- Rate-Limit- und Owner-Registrierungs-Flows müssen live gegen Staging
  bestätigt werden.

---

## 2. Änderungsregel

🟢 **FIX**

Dieser Changelog ist append-only.

Neue Einträge dürfen ergänzt werden.  
Alte Einträge dürfen nur korrigiert werden, wenn sie sachlich falsch sind.

Produktentscheidungen werden nicht still überschrieben.

Wenn eine frühere Entscheidung geändert wird, muss ein neuer Eintrag ergänzt werden:

```text
Frühere Entscheidung:
...

Neue CTO-Entscheidung:
...

Grund:
...
```

Codex darf diesen Changelog nicht eigenmächtig umschreiben.

---

## 3. Phase 0 – Ursprungsidee

### 3.1 Ausgangspunkt

Das Projekt begann als Idee für ein Restaurant-Bonus-System.

Ursprüngliche Themen:

- Gäste gewinnen
- Kunden binden
- Punkte sammeln
- Belohnungen
- QR-Code
- Restaurant-Dashboard
- Staff-Modus
- Kundenportal

### 3.2 Erste Grundentscheidung

Es wurde früh entschieden:

```text
Keine KI in V1.
Kein POS in V1.
Kein ERP in V1.
Kein Lager in V1.
Keine Buchhaltung in V1.
```

Grund:

V1 soll schnell Cashflow erzeugen und nicht zu groß werden.

---

## 4. Phase 1 – Produktkern definiert

### 4.1 Mission

🟢 **FIX**

WUXUAI Bonus verkauft nicht Softwarefunktionen.

WUXUAI Bonus verkauft:

```text
Mehr Stammgäste.
Mehr Wiederbesuche.
Mehr Kundenbindung.
```

Mission:

```text
Aus Gästen werden Stammgäste.
```

### 4.2 Cashflow First

🟢 **FIX**

Das Produkt soll zuerst mit Restaurants/Cafés echten Cashflow erzeugen.

Das bedeutet:

- V1 einfach halten
- kein Overengineering
- klare Preisstrategie
- schneller Pilot
- keine unnötigen V2-Funktionen

### 4.3 V1 Zielgruppe

🟢 **FIX**

V1 fokussiert Restaurants und Cafés.

V2 kann weitere lokale Betriebe unterstützen.

---

## 5. Phase 2 – Vier Oberflächen definiert

### 5.1 Oberfläche 1: WUXUAI Admin

Interne Plattformverwaltung.

Nicht für Restaurants.

### 5.2 Oberfläche 2: Restaurant Portal

Arbeitsoberfläche für Restaurantbesitzer.

Hier entstehen:

- Dashboard
- Belohnungen
- Willkommensgeschenke
- QR Center
- Gäste
- Mitarbeiter
- Einstellungen

### 5.3 Oberfläche 3: Staff Portal

Operative Oberfläche für Mitarbeiter.

Nur:

- Gast finden
- Belohnung einlösen
- Punkte prüfen
- Staff Session/PIN

### 5.4 Oberfläche 4: Kundenportal

Gastansicht.

Nur:

- Mein Bonus
- QR
- Punkte
- Belohnungen
- Willkommensgeschenk
- Bonus Boost

### 5.5 CTO-Entscheidung

🟢 **FIX**

One Persona – One Interface.

Keine Oberfläche darf mehrere Zielgruppen vermischen.

---

## 6. Phase 3 – Flow Lock Methodik

### 6.1 Flow-Entwicklung eingeführt

🟢 **FIX**

Entwicklung erfolgt nicht featureweise, sondern in Business-Flows.

Offizielle V1-Flows:

1. Restaurant eröffnen
2. Gast werden
3. Belohnung einlösen
4. Punkte sammeln
5. Bonus Boost

### 6.2 Flow Lock

Ein Flow gilt erst als abgeschlossen, wenn:

- Restaurantbesitzer-Perspektive passt
- Mitarbeiter-Perspektive passt
- Gast-Perspektive passt
- System- und Sicherheitslogik passt
- Build erfolgreich ist
- keine kritischen offenen Fehler bestehen

### 6.3 One Problem Rule

🟢 **FIX**

Jeder Flow löst genau ein Geschäftsproblem.

Keine Mehrfachaufgaben pro Flow.

---

## 7. Phase 4 – Flow 01: Restaurant eröffnen

### 7.1 Onboarding als Installationsassistent

🟢 **FIX**

Flow 01 wurde als Installation Wizard definiert.

Nicht als Adminformular.

### 7.2 Onboarding Gate

🟢 **FIX**

Solange Onboarding nicht abgeschlossen ist, bleibt das Restaurant Portal gesperrt.

### 7.3 Autosave

🟢 **FIX**

Manuelles „Speichern und später fortsetzen“ wurde entfernt.

Autosave speichert:

- Eingaben
- aktuellen Schritt
- Checkliste
- Draft

### 7.4 Schrittstruktur

Finale V1-Struktur:

1. Restaurant
2. Aussehen
3. Geöffnet
4. Punkteeinlösung
5. Willkommens-Belohnungen
6. Restaurant Starter Kit
7. Startklar

### 7.5 Angebotsschritt entfernt

🟢 **FIX**

Der Onboarding-Schritt „Angebot“ wurde entfernt.

Grund:

Willkommens-Belohnungen sind bereits das Willkommenssystem.

### 7.6 Schritt 5 vereinfacht

🟢 **FIX**

Im Onboarding werden nur Kategorien für Willkommens-Belohnungen ausgewählt.

Keine Bilder.  
Keine Produkte.  
Keine Details.  
Keine Formulare.

### 7.7 Schritt 6 umbenannt

🟢 **FIX**

„Gästetest“ wurde zu:

```text
Restaurant Starter Kit
```

### 7.8 Starter Kit

Starter Kit enthält:

- Infoseite
- Restaurant QR
- Mein Bonus QR
- Kassen-Aufsteller
- Eingangs-Aufsteller

### 7.9 Footer

Footer:

```text
Powered by WUXUAI Bonus • www.wuxuaisbi.com
```

### 7.10 Logo-Regel

🟢 **FIX**

Logo darf niemals verzerrt, beschnitten oder quadratisch erzwungen werden.

---

## 8. Phase 5 – Flow 02: Gast werden

### 8.1 Smart Context

🟢 **FIX**

Gast sucht kein Restaurant.

QR erkennt Restaurant automatisch.

### 8.2 Registrierung ohne Passwort

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

### 8.3 Willkommensgeschenk

Normale Registrierung:

```text
Willkommensgeschenk wird zugeteilt
Status: gesperrt
Freischaltung nach erster Punktebuchung
Einlösung beim nächsten Besuch
```

### 8.4 Freunde-Einladung hat Vorrang

Referral-Gast erhält kein Willkommensgeschenk.

Er erhält Bonus Boost nach erster Punktebuchung.

---

## 9. Phase 6 – Flow 03: Belohnung einlösen

### 9.1 Kunden-Selbst-Einlösung verboten

🟢 **FIX**

Gast darf Belohnung zeigen, aber nicht final selbst einlösen.

Einlösung erfolgt über Mitarbeiter/Staff Session.

### 9.2 Atomare Einlösung

🟢 **FIX**

Einlösung muss serverseitig atomar erfolgen.

### 9.3 Audit

Jede Einlösung wird protokolliert.

### 9.4 Willkommensgeschenk-Einlösung

Willkommensgeschenk darf erst eingelöst werden, wenn es freigeschaltet wurde.

---

## 10. Phase 7 – Flow 04: Punkte sammeln

### 10.1 Kein POS in V1

🟢 **FIX**

Keine Kassensystem-Integration in V1.

### 10.2 Single Bonus QR

🟢 **FIX**

Ein laminierter Bonus QR an der Kassa.

### 10.3 Keine freie Betragseingabe

🟢 **FIX**

Gast wählt Rechnungsbereich.

### 10.4 Keine „bis X €“-Stufen

🟢 **FIX**

Rechnungsbereiche:

- 0–10 €
- 10–20 €
- 20–30 €
- 30–40 €
- 40–50 €
- 50–75 €
- 75–100 €
- 100 €+

### 10.5 Erste Punktebuchung als Auslöser

Erste Punktebuchung kann auslösen:

- Willkommensgeschenk freischalten
- Referral aktivieren
- Bonus Boost starten

### 10.6 Smart Upsell mit Genauigkeitsregel

Wenn exakter Betrag nicht sicher bekannt ist, keine konkrete Euro-Differenz behaupten.

---

## 11. Phase 8 – Flow 05: Bonus Boost

### 11.1 Bonus Boost statt Einmalbonus

🟢 **FIX**

Freunde-Einladung gibt keinen Einmalpunktebonus, sondern einen temporären Multiplikator.

Standard:

```text
2× Punkte
30 Tage
+30 Tage pro erfolgreichem Freund
```

### 11.2 Aktivierung erst nach Konsumation

🟢 **FIX**

Bonus Boost aktiviert sich erst, wenn der eingeladene Freund erstmals Punkte sammelt.

### 11.3 Multiplikator nicht stapeln

🟢 **FIX**

Weitere Freunde verlängern Dauer, erhöhen aber nicht den Multiplikator.

### 11.4 Emotional sichtbar

Bonus Boost muss im Kundenportal prominent sichtbar sein.

### 11.5 Starter Kit KPI-Box

KPI-Box:

```text
💡 Freunde einladen
🔥 Du 2× Punkte
👥 Freund 2× Punkte
📅 +30 Tage Bonus Boost
```

---

## 12. Phase 9 – Aktionen entfernt

### 12.1 Entscheidung

🟢 **FIX**

Das Modul „Aktionen“ wurde aus V1 entfernt.

### 12.2 Grund

Der Begriff war unklar und hat nichts zum Kern beigetragen.

### 12.3 Konsequenz

Dashboard-Button „Neue Aktion starten“ wird entfernt.

Belohnungen und Willkommensgeschenke werden zentrale Bereiche.

---

## 13. Phase 10 – Belohnungen neu definiert

### 13.1 Restaurant gibt Preis ein

🟢 **FIX**

Restaurantbesitzer gibt Produktpreis ein.

WUXUAI berechnet Punkte automatisch.

### 13.2 Keine Punkte-Dropdowns

🟢 **FIX**

Keine manuelle Punkte-Eingabe.

### 13.3 Smart Reward Engine

Eingeführt als Kernlogik.

Berechnet:

- Punkte
- Wirtschaftlichkeit
- fehlenden Eurobetrag
- Willkommensgeschenk-Quoten

---

## 14. Phase 11 – Willkommensgeschenke eigener Bereich

### 14.1 Entscheidung

🟢 **FIX**

Willkommensgeschenke sind eigener Bereich.

Nicht normale Punkte-Belohnungen.

### 14.2 Standardwerte

- Kaffee bis 4 €
- Getränk bis 4 €
- Dessert bis 6 €
- Vorspeise bis 6 €
- Menü bis 16 €
- Hauptspeise bis 20 €
- Sushi bis 20 €
- Eigene Belohnung bis 15 €

### 14.3 Quoten

- Kaffee 25 %
- Getränk 25 %
- Dessert 20 %
- Vorspeise 18 %
- Menü 5 %
- Sushi 3 %
- Hauptspeise 2 %
- Eigene Belohnung 2 %

---

## 15. Phase 12 – Willkommensgeschenke Tageslimit Fix

### 15.1 Ziel

Willkommensgeschenke bleiben wirtschaftlich kontrolliert und werden nur bei normaler Erstanmeldung vergeben.

### 15.2 Änderung

- Willkommensgeschenke werden nur über normale Restaurant-QR-Registrierung zugeteilt.
- Freunde-Einladungen erhalten kein Willkommensgeschenk.
- Zufallsauswahl nutzt serverseitige Kategoriequoten.
- Gratis Menü ist auf maximal 3 Vergaben pro Tag begrenzt.
- Gratis Hauptspeise ist auf maximal 3 Vergaben pro Tag begrenzt.
- Andere Kategorien haben in V1 kein Tageslimit.
- Erreichte Tageslimits werden still übersprungen.
- Übrige aktive Kategorien werden neu normalisiert.
- Geschenkstatus startet als gesperrt.
- Erste erfolgreiche Punktebuchung schaltet das Geschenk frei.

### 15.3 Warum

Teure Willkommensgeschenke dürfen trotz niedriger Wahrscheinlichkeit nicht zufällig zu oft an einem Tag vergeben werden.

### 15.4 Status

LOCK mit Staging-Hinweis: Migration muss vor Production auf Staging validiert werden.

### 14.4 Tageslimits

Tageslimits für teure Kategorien als Architekturregel vorbereitet.

---

## 15. Phase 12 – Smart Reward Engine

### 15.1 Zweck

Restaurantbesitzer arbeitet mit Euro.

WUXUAI arbeitet mit Punkten.

### 15.2 Wirtschaftlichkeitsregel

Standard:

```text
ca. 10× Produktwert als Zielumsatz vor Einlösung
```

Hinweis 2026-07-12:
Diese frühere Regel wurde für neue oder bearbeitete Punkteeinlösungen durch
die gespeicherte Einlösequote aus Phase 45 ersetzt.

### 15.3 Status

- 🟢 Wirtschaftlich
- 🟡 Prüfen
- 🔴 Zu großzügig

### 15.4 Kundenanzeige

Wenn Punkte fehlen:

```text
Dir fehlen noch XX Punkte.
≈ Noch ca. XX € bis zur Einlösung.
```

---

## 16. Phase 13 – Multi-Branch vorbereitet

### 16.1 V1

```text
1 Restaurant = 1 Organisation = 1 Filiale
```

### 16.2 V2

Organisationen mit mehreren Filialen.

### 16.3 Technisch vorbereitet

- organizations
- branches
- organization_id
- branch_id
- branch_subscriptions

### 16.4 UI nicht in V1

Keine Filialverwaltung im V1 UI.

---

## 17. Phase 14 – Supabase Staging

### 17.1 Staging eingerichtet

Supabase Staging Projekt wurde erstellt und verbunden.

### 17.2 Migrationen

Migrationen wurden angewendet und geprüft.

### 17.3 Wichtige Prüfungen

Bestätigt:

- Tabellen vorhanden
- RLS aktiv
- RPCs validiert
- Branch Vorbereitung
- Audit
- Bonus Boost
- Customer Portal
- Staging ready

### 17.4 Storage

Bucket:

```text
restaurant-media
```

erstellt.

Policies:

- public read
- authenticated owner/admin insert/update/delete

---

## 18. Phase 15 – Auth und Security Hardening

### 18.1 Role Default Bug gefixt

Default Owner entfernt.

Missing role ist nicht Owner.

### 18.2 user_metadata nicht vertrauen

Rollen werden aus Membership / sicherer Quelle abgeleitet.

### 18.3 ProtectedRoute Demo-Redirect entfernt

Hardcoded `/customer/kai-sushi` entfernt.

### 18.4 TenantProvider Filter

Frontend filtert zusätzlich, RLS bleibt Hauptschutz.

### 18.5 Customer Token

Customer Code ist kein Geheimnis.

Sichere Tokens für Customer Portal.

---

## 19. Phase 16 – Bundle und Performance

### 19.1 Route-Level Code Splitting

Eingeführt.

### 19.2 Vendor Splitting

Eingeführt.

### 19.3 Ergebnis

Main Bundle deutlich reduziert.

Keine Build-Warnungen.

---

## 20. Phase 17 – Settings Routing Bug

### 20.1 Problem

`/admin/settings` leitete falsch zurück oder renderte Onboarding.

### 20.2 Ursachen

- RestaurantSetupGate blockierte Settings
- AdminLayout blockierte Settings
- Route rendert RestaurantOnboarding statt SettingsPage

### 20.3 Fix

- Settings erlaubt
- eigene SettingsPage
- Route korrigiert

---

## 21. Phase 18 – Dashboard Redesign

### 21.1 Dashboard neu gedacht

Hauptüberschrift:

```text
Heute im Restaurant
```

### 21.2 Entfernt

- Device Warnungen
- Referral Warnungen
- QR-Code bereit
- leere technische Karten
- Neue Aktion starten

### 21.3 Fokus

- neue Mitglieder
- Punkte
- Belohnungen
- Bonus Boost
- wiederkehrende Gäste

---

## 22. Phase 19 – Engineering Bible gestartet

### 22.1 Entscheidung

🟢 **FIX**

Engineering Bible ist die Wahrheit.

### 22.2 Dateien bis jetzt LOCK

- 00_START_HIER.md
- 01_VISION.md
- 02_PRODUKTREGELN.md
- 03_UX_REGELN.md
- 04_RESTAURANT_PORTAL.md
- 05_CUSTOMER_PORTAL.md
- 06_STAFF_PORTAL.md
- 07_WUXUAI_ADMIN.md
- 08_FLOW_01_ONBOARDING.md
- 09_FLOW_02_GAST_WERDEN.md
- 10_FLOW_03_BELOHNUNG_EINLOESEN.md
- 11_FLOW_04_PUNKTE_SAMMELN.md
- 12_FLOW_05_BONUS_BOOST.md
- 13_SMART_REWARD_ENGINE.md
- 14_DATABASE_ARCHITEKTUR.md
- 15_DESIGN_SYSTEM.md
- 16_V2_MASTERPLAN.md
- 17_CTO_ENTSCHEIDUNGEN.md
- 18_CODEX_REGELN.md

---

## 23. Offene Hauptbereiche nach diesem Changelog

Noch weiter auszuarbeiten:

- laufender Projekt-Changelog nach neuen Code-Sprints
- genaue Implementierungs-Spezifikationen für Belohnungen
- Willkommensgeschenke-Seite im Restaurant Portal
- Dashboard finaler LOCK
- QR Center finaler LOCK
- Gäste finaler LOCK
- Mitarbeiter finaler LOCK
- Einstellungen-Unterseiten
- Payment/Stripe Spezifikation
- Pilot-Testplan
- Production-Go-Live-Plan

---

## 24. Phase – Echte Daten statt Demo-Daten

Ziel:

Restaurantbesitzer sehen auf echten Restaurantseiten ausschließlich ihre
eigenen Restaurantdaten.

Änderung:

- Demo-Belohnungen werden nicht als Fallback auf echten Supabase-Seiten gezeigt.
- Willkommensgeschenke werden nur aus echten Tenant-Daten angezeigt.
- Dashboard-KPI zeigen echte Werte oder 0.
- Kundenportal zeigt nur echte aktive Belohnungen und das echte zugeteilte Willkommensgeschenk.
- Ladefehler werden intern geloggt und im UI ruhig auf Deutsch angezeigt.
- Leere Datenbestände zeigen leere Zustände statt Demo-Karten.

Warum:

Demo-Karten wie Beispielbelohnungen wirken in einem echten Restaurant wie
falsche Kundendaten. Das zerstört Vertrauen und macht Pilotbetrieb unsauber.

Betroffene Bereiche:

- Restaurant Portal
- Belohnungen
- Willkommensgeschenke
- Dashboard
- Kundenportal
- Design System
- Codex-Regeln

Risiken:

- Bestehende Staging-Seed-Daten bleiben echte Daten, wenn sie in der Datenbank liegen.
- Datenbereinigung in Staging/Produktion ist getrennt von dieser UI-/Code-Regel.

Status:

LOCK

---

## 25. Phase – Tages-PIN und PIN-lose Belohnungseinlösung

Ziel:

Punkte sammeln soll im Restaurantalltag sicherer werden, ohne Kellner-Geräte
oder manuelle PIN-Verwaltung einzuführen.

Änderung:

- Punkte sammeln braucht eine automatisch erzeugte 4-stellige Tages-PIN.
- Tages-PIN gilt pro Restaurant / Filiale täglich bis 23:59.
- Tages-PIN wird serverseitig gespeichert und geprüft.
- Tages-PIN ist nur in der Mitarbeiteransicht sichtbar.
- Restaurantbesitzer muss keine PIN verwalten.
- Belohnung einlösen braucht keine PIN.
- Belohnung einlösen erfolgt mit finaler Kundenbestätigung.
- Nach Bestätigung ist die Belohnung verbraucht und nicht erneut einlösbar.

Warum:

V1 soll ohne Kellner-Tablet, ohne Scanner und ohne POS-Integration funktionieren.
Gleichzeitig darf Punkte sammeln nicht komplett ungeschützt sein.

Betroffene Bereiche:

- Staff Portal
- Flow 03 Belohnung einlösen
- Flow 04 Punkte sammeln
- Smart Reward Engine
- CTO-Entscheidungen

Risiken:

- Bestehender Code kann noch ältere Staff-PIN- oder Redemption-Code-Logik enthalten.
- Diese Changelog-Phase ist Dokumentation und keine Implementierung.
- Bei der nächsten Code-Aufgabe muss der Code gegen diese neue Bible-Regel geprüft werden.

Status:

LOCK

---

## 26. Phase – Codex Selbstkontroll-Loop

Ziel:

Codex darf künftig keinen theoretischen LOCK-Status mehr melden.

Änderung:

- Vor jeder Aufgabe muss die Bible gelesen werden.
- Nach jeder Aufgabe muss aktiv geprüft werden:
  - UI
  - Flow
  - DB/RPC
  - Sicherheit
  - alte Logik
  - Build
  - Dokumentation
  - Export
- Bei Migrationen muss Staging separat gemeldet werden.
- Bei Flow-Änderungen reicht Build allein nicht.
- FINAL LOCK ist nur mit Staging-/Verbindungsprüfung erlaubt.
- Wenn etwas nicht geprüft wurde, gilt NOT READY.

Warum:

WUXUAI Bonus V1 darf nicht durch Annahmen pilotiert werden.
LOCK bedeutet echte Prüfung, nicht nur sauberen Code.

Betroffene Bereiche:

- AGENTS.md
- Codex-Regeln
- CTO-Entscheidungen
- alle zukünftigen Reports
- alle zukünftigen Aufgaben

Risiken:

- Aufgaben dauern etwas länger.
- Reports werden strenger.
- Nicht live geprüfte Aufgaben können maximal CODE LOCK oder NOT READY sein.

Status:

LOCK

---

## 27. Changelog-Regeln für Zukunft

Jeder größere Sprint ergänzt:

```text
Datum / Phase
Ziel
Änderung
Warum
Betroffene Bereiche
Risiken
Status
```

Beispiel:

```text
Phase XX – Belohnungen Wizard
Ziel:
Restaurant erstellt Belohnung ohne Punkte zu rechnen.

Änderung:
Produktpreis steuert automatische Punkteberechnung.

Status:
LOCK
```

---

## 28. Verbotene Changelog-Praxis

Verboten:

- alte Entscheidungen still überschreiben
- nur „gefixt“ schreiben ohne Ursache
- technische Änderung ohne Businessgrund dokumentieren
- V2-Funktion als V1 darstellen
- offene Risiken verschweigen
- Build-Status weglassen
- Migrationen ohne Ergebnis dokumentieren

---

## 29. Phase – Begriff Punkteeinlösung

Ziel:

Der normale Punktebereich soll für Restaurantbesitzer und Gäste eindeutig benannt sein.

Änderung:

- Sichtbarer Menüpunkt „Belohnungen“ wird zu „Punkteeinlösung“.
- Restaurant Portal spricht von Produkten, die mit Punkten einlösbar sind.
- Kundenportal spricht von „Punkteeinlösungen“.
- Staff Portal spricht von „Punkteeinlösung prüfen“.
- Willkommensgeschenke bleiben ein eigener Bereich.

Warum:

„Belohnungen“ war zu breit und konnte mit Willkommensgeschenken verwechselt werden.
„Punkteeinlösung“ beschreibt den konkreten V1-Zweck: Gäste lösen gesammelte Punkte gegen Produkte ein.

Betroffene Bereiche:

- Restaurant Portal
- Kundenportal
- Staff Portal
- Smart Reward Engine Dokumentation
- CTO-Entscheidungen

Risiken:

- Technische Namen bleiben aus Stabilitätsgründen vorerst bei `reward`.
- Historische Dokumentstellen können alte Begriffe enthalten, wenn sie ausdrücklich Altfunktion oder Dateinamen beschreiben.

Status:

LOCK

---

## 30. Phase – Customer Portal Reihenfolge

Ziel:

Die Kundenansicht soll zuerst das zeigen, was fuer Gaeste im Restaurant wirklich wichtig ist.

Änderung:

Neue Reihenfolge in „Mein Bonus“:

1. Bonus Boost
2. Punkte
3. Punkteeinlösungen
4. Willkommensgeschenk nur wenn relevant und nicht eingelöst
5. Persönlicher Bonus-QR
6. Bonuskonto speichern

Zusätzlich:

- „Nächste Belohnungen“ wurde aus der Kundenansicht entfernt.
- QR und Bonuskonto speichern sind Hilfsfunktionen und stehen weiter unten.
- Willkommensgeschenke bleiben getrennt von Punkteeinlösungen.
- Eingelöste Willkommensgeschenke verschwinden aus der sichtbaren Kundenansicht.

Warum:

Gaeste wollen zuerst wissen, ob ihr Boost aktiv ist, wie viele Punkte sie haben und was sie damit einloesen koennen.

Status:

LOCK

---

## 31. Phase – Willkommensgeschenke nach Onboarding bearbeitbar

Ziel:

Restaurantbesitzer können Willkommensgeschenke nach Abschluss des Onboardings
weiter pflegen.

Änderung:

- Willkommensgeschenke bleiben eigener Bereich im Restaurant Portal.
- Name, Kategorie, Wertgrenze, Foto und Aktiv/Inaktiv sind bearbeitbar.
- Bilder können ersetzt oder auf das Standardbild zurückgesetzt werden.
- Mehrere aktive Willkommensgeschenke bilden den Pool für zukünftige normale
  Erstanmeldungen.
- Deaktivierte Willkommensgeschenke werden nicht neu zugeteilt.
- Bereits eingelöste Willkommensgeschenke werden durch spätere Bearbeitung
  nicht wieder aktiv.

Warum:

Das Onboarding soll schnell bleiben, aber Restaurants müssen den Welcome-Gift-
Pool später im Alltag anpassen können.

Status:

LOCK

---

## 32. Phase – Bonus Boost 2× Sichtbarkeit

Ziel:

Der Gast soll sofort verstehen, wenn Bonus Boost aktiv ist und Punkte aktuell doppelt zählen.

Änderung:

- Aktiver Bonus Boost steht oben im Kundenportal als „🔥 2× Punkte aktiv“.
- Die Punktekarte zeigt bei aktivem Boost ein Feuer-Symbol und den Hinweis „2× Bonus Boost aktiv“.
- Nach erfolgreicher Punktebuchung zeigt die Erfolgskarte Normalpunkte, Bonus-Boost-Zusatz und Gesamtpunkte.
- Der „So funktioniert’s“-Drawer erklärt den 2× Effekt mit einem einfachen Beispiel.
- Ohne aktiven Boost bleibt die Einladungskarte „Freund einladen“ sichtbar.
- Abgelaufene Boosts werden nicht als aktiv angezeigt.

Warum:

Bonus Boost ist ein emotionaler Kernvorteil. Gäste müssen den Vorteil direkt sehen, nicht erst aus Zahlen ableiten.

Status:

LOCK

---

## 33. Phase – Punkteeinlösung als wiederholbares Produktangebot

Ziel:

Normale Punkteeinlösungen sollen sich wie dauerhaft sichtbare Produkte des Restaurants verhalten, nicht wie einmalige Willkommensgeschenke.

Änderung:

- Punkteeinlösungen bleiben nach Einlösung sichtbar.
- Bei Einlösung werden die benötigten Punkte serverseitig abgezogen.
- Jede Einlösung wird als Historie und Audit gespeichert.
- Der neue Punktestand bestimmt sofort den Kartenstatus.
- Wenn genug Punkte übrig sind, bleibt das Produkt einlösbar.
- Wenn Punkte fehlen, bleibt das Produkt sichtbar, aber gesperrt.
- Willkommensgeschenke bleiben einmalig und verschwinden nach Einlösung.

Warum:

Restaurant-Punkteeinlösungen sind Produktkatalog-Einträge. Gäste sollen dasselbe Produkt später erneut einlösen können, sobald sie wieder genügend Punkte gesammelt haben.

Status:

LOCK

---

## 34. Phase – Tages-PIN Brute-Force-Schutz und Punkte-Tageslimit

Ziel:

Vor dem Pilot werden zwei Fraud-Szenarien geschlossen: Tages-PIN darf nicht geraten werden können und Gäste dürfen nicht beliebig oft am selben Tag Punkte sammeln.

Änderung:

- Falsche Tages-PIN-Versuche werden pro Gast / Restaurant / Filiale / lokalem Tag gezählt.
- Nach 5 falschen Versuchen wird Punkte sammeln für diesen Gast bis Tagesende gesperrt.
- Falsche Versuche und Sperren werden auditiert.
- Pro Gast / Restaurant / Filiale / lokalem Tag sind maximal 2 erfolgreiche Punktebuchungen erlaubt.
- Eine dritte Punktebuchung wird serverseitig blockiert.
- Alle Tagesgrenzen verwenden in V1 `Europe/Vienna`.

Warum:

Die Tages-PIN ist bewusst einfach für den Restaurantbetrieb. Deshalb muss der Server Missbrauch begrenzen und darf sich nicht auf UI-Hinweise verlassen.

Status:

LOCK

---

## 35. Phase – WUXUAI Admin Trial- und Zahlungsbasis

Ziel:

WUXUAI braucht vor zahlenden Pilotkunden eine interne Basis, um Restaurants, Testphasen und Zahlungsstatus zu sehen und manuell zu verwalten.

Änderung:

- Interne Route für WUXUAI Admin vorbereitet.
- Plattformrollen bleiben getrennt von Restaurantrollen.
- Restaurantliste zeigt Trial, Abo, Zahlung, Gäste, Punkte und Einlösungen.
- Trial kann manuell verlängert werden.
- Restaurants können manuell aktiviert oder pausiert werden.
- Zahlungsstatus kann manuell gesetzt werden.
- Jede interne Änderung wird auditiert.

Warum:

Stripe Checkout und Webhooks sind ein eigener Folgeblock. V1 braucht zuerst eine sichere manuelle Verwaltung, damit Pilotkunden operativ betreut werden können.

Status:

LOCK

---

## 36. Phase – WUXUAI Admin Payment P1/P2 Logikfix

Ziel:

Die interne Trial- und Zahlungsbasis wird vor Staging-LOCK logisch gehärtet.

Änderung:

- Restaurantliste verhindert Multi-Branch-Fan-out.
- `current_period_end` wird nicht durch Zahlungs- oder Abo-Klicks überschrieben.
- Zahlung manuell bestätigen ist von Abo-Aktivierung getrennt.
- Pausieren setzt in V1 nicht automatisch `restaurants.status = suspended`.
- Read-only Plattformrollen sehen keine Schreibbuttons.
- Plattformrolle und Restaurantrolle sind im Frontend getrennt.
- Testphase verlängern downgraded aktive Abos nicht.
- Restaurants ohne Subscription zeigen „Kein Abo eingerichtet“.
- Audit enthält den echten vorherigen Subscription-Zustand.

Warum:

WUXUAI Admin verwaltet interne Plattformzustände. Diese Zustände dürfen Restaurant- und Kundenflows nicht versehentlich blockieren oder zukünftige Stripe-Daten überschreiben.

Status:

LOCK

---

## 37. Phase – Einstellungen echte Daten

Ziel:

Die Restaurant-Einstellungen dürfen nicht mehr wie Platzhalter wirken.
Restaurantbesitzer müssen echte Daten sehen, bearbeiten und speichern können.

Änderung:

- `/admin/settings` zeigt echte Restaurantdaten statt Platzhalter-Unterseiten.
- Restaurantname und Telefonnummer sind bearbeitbar.
- Branding zeigt echtes Logo und echte Farben.
- Logo-Upload nutzt die vorhandene Restaurant-Mediathek.
- Öffnungszeiten bearbeiten die gespeicherte `opening_hours`-Struktur.
- Punkteeinlösung, Willkommensgeschenke, Mitarbeiter/Tages-PIN und QR Center sind echte Links.
- Abo & Testphase zeigt echte Daten oder einen klaren Nicht-verfügbar-Zustand.
- Fake-Klicks und leere Detailseiten wurden entfernt.

Warum:

Einstellungen sind ein Vertrauensbereich. Jede klickbare Karte braucht echte Funktion oder echten Link.

Status:

LOCK

---

## 38. Phase – Punkteeinlösung Produktbilder vollständig sichtbar

Ziel:

Hochgeladene Produktfotos in Punkteeinlösungen sollen professionell und
vollständig sichtbar sein.

Änderung:

- Admin-Karten für gespeicherte Punkteeinlösungen nutzen `object-fit: contain`.
- Wizard-Vorschau und Foto-Vorschau nutzen `object-fit: contain`.
- Customer-Portal-Karten für Punkteeinlösungen nutzen `object-fit: contain`.
- Medienbereiche wurden größer und ruhiger gestaltet.
- Leerraum im Bildbereich ist erlaubt, damit echte Speisenbilder nicht
  abgeschnitten werden.

Warum:

Restaurantbesitzer laden echte Produktfotos hoch. Abgeschnittene Desserts,
Getränke oder Hauptspeisen wirken unprofessionell und schwächen das Vertrauen
in das Bonusprogramm.

Status:

LOCK

---

## 39. Phase – Willkommensgeschenke Statuswechsel repariert

Ziel:

Restaurantbesitzer können Willkommensgeschenke nach dem Onboarding zuverlässig
aktivieren und deaktivieren.

Änderung:

- Der Statuswechsel nutzt einen schmalen Update-Pfad und ändert nur `active`.
- Das Vollspeichern der Geschenkdetails wird beim Aktivieren/Deaktivieren nicht
  mehr ausgelöst.
- Der alte Unique-Index für nur ein aktives Willkommensgeschenk pro Restaurant
  wird defensiv entfernt.
- Der aktive Welcome-Gift-Pool bleibt mit mehreren aktiven Geschenken möglich.

Warum:

Willkommensgeschenke bilden einen Pool. Aktiv/Inaktiv muss deshalb pro Geschenk
funktionieren, ohne andere Geschenkdetails oder alte Einmaligkeitsregeln
mitzuziehen.

Status:

LOCK

---

## 40. Phase – Abo & Testphase echte Daten

Ziel:

Die Settings-Seite `Abo & Testphase` zeigt echte Trial-/Abo-Daten und keinen
DB-Fehler, wenn optionale Stripe-/Payment-Spalten noch nicht vorhanden sind.

Änderung:

- Der Subscription-Loader nutzt rückwärtskompatible Selects auf
  `branch_subscriptions`.
- Fehlende Payment-/Stripe-Spalten werden nicht mehr als UI-Fehler angezeigt.
- Wenn kein Datensatz vorhanden ist, wird ein einfacher Trial-Datensatz auf
  Basis der vorhandenen V1-Basisspalten angelegt.
- Trial aktiv, Trial abgelaufen und Abo aktiv werden klar angezeigt.
- Stripe-unfertig zeigt `Zahlung wird bald aktiviert` statt Fake-Zahlung.

Warum:

Restaurantbesitzer müssen in den Einstellungen einen vertrauenswürdigen
Kontostatus sehen. Technische Schema-Unterschiede zwischen Basis- und
Payment-Erweiterung dürfen nicht als 400-Fehler in der Oberfläche landen.

Status:

LOCK

---

## 41. Phase – Willkommensgeschenke Unique Constraint entfernt

Ziel:

Mehrere aktive Willkommensgeschenke pro Restaurant muessen erlaubt sein.

Änderung:

- Die falsche Unique Constraint `rewards_one_active_welcome_gift_per_restaurant_idx`
  wurde per Migration entfernt.
- Der aktive Welcome-Gift-Pool verwendet nur noch einen normalen Pool-Index.
- Aktivieren/Deaktivieren nutzt den schmalen Statuswechsel auf `rewards.active`.
- Speichern aktualisiert die bestehende Zeile und erzeugt keine neue doppelte
  Konfiguration.
- Staging-Migration `20260712001000_welcome_gifts_status_update_fix.sql` wurde
  angewendet.

Warum:

Restaurant-Konfiguration und Kunden-Zuteilung sind unterschiedliche Regeln.
Ein Restaurant darf mehrere aktive Optionen haben. Ein Kunde bekommt bei
normaler Erstanmeldung maximal ein Willkommensgeschenk.

Status:

FINAL LOCK

---

## 42. Phase – Onboarding Bonus-Designer Faktoren fixiert

Ziel:

Frühere Entscheidung: Der Onboarding-Schritt **Punkteeinlösung** verwendete
V1-Faktoren für die Großzügigkeitsstufen.

Frühere Werte:

- Sparsam: 0,8
- Normal: 1,0
- Großzügig: 1,1
- Premium: 1,2
- Die Empfehlung berechnet sich aus:
  Durchschnittsbon × gewünschte Besuche bis erste Freude × Faktor.

Neue CTO-Entscheidung:

Diese Faktoren wurden durch Rückgabequoten ersetzt.

Siehe Phase 44.

Grund:

Restaurantbesitzer sollen im Onboarding eine einfache und verlässliche
Empfehlung sehen. Prozente sind für Restaurantbesitzer verständlicher als
abstrakte Faktoren.

Status:

ERSETZT DURCH PHASE 44

---

## 43. Phase – Onboarding Schritt 4 Punkteeinlösung

Ziel:

Der Onboarding-Schritt 4 heißt nicht mehr „Belohnen“, sondern
**Punkteeinlösung**.

Änderung:

- Step-Navigation: `Punkteeinlösung`
- Seitentitel: `Wie sollen Gäste Punkte einlösen?`
- Erklärung: Gäste lösen später gesammelte Punkte gegen ein Produkt ein.
- Schritt 5 bleibt `Willkommensgeschenke`.

Warum:

„Belohnen“ war zu allgemein und konnte mit Willkommensgeschenken verwechselt
werden. Schritt 4 beschreibt die normale spätere Punkte-Einlösung.

Status:

LOCK

---

## 44. Phase – Onboarding Punkteeinlösung mit Rückgabequoten

Ziel:

Der Onboarding-Schritt **Punkteeinlösung** nutzt klare Rückgabequoten statt
abstrakter Faktoren.

Neue CTO-Entscheidung:

- Sparsam: 3 % Rückgabe
- Normal: 5 % Rückgabe
- Großzügig: 8 % Rückgabe
- Premium: 10 % Rückgabe

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

Warum:

Restaurantbesitzer verstehen Rückgabe-Prozente schneller als Faktoren. Der
Onboarding-Bonus-Designer bleibt in Restaurant-Sprache und zeigt erwartete
Konsumation sowie empfohlenen Einlösewert.

Nicht geändert:

- Tages-PIN
- Punkte sammeln
- Reward-Einlösung
- Willkommensgeschenke
- Bonus Boost
- QR Center

Status:

LOCK

---

## 45. Phase – Punkteeinlösung nutzt gespeicherte Einlösequote

Ziel:

Die im Onboarding gewählte Prozentlogik soll später wirklich für
Punkteeinlösungen verwendet werden.

Änderung:

- `loyalty_settings.redemption_return_rate` speichert die Restaurant-Quote.
- Onboarding speichert die gewählte Quote pro Restaurant.
- Punkteeinlösungsseite nutzt die gespeicherte Quote.
- Neue oder bearbeitete Produkte berechnen:

```text
Geschätzte Konsumation = Produktpreis / Einlösequote
Benötigte Punkte = Geschätzte Konsumation / amount_per_point
```

Beispiel:

```text
5,40 € / 0,05 = 108,00 €
```

Customer Portal:

- zeigt weiterhin fehlende Punkte
- zeigt den fehlenden Eurobetrag aus `fehlende Punkte × amount_per_point`
- nutzt dadurch dieselbe gespeicherte Punkteeinlösung

Nicht geändert:

- Tages-PIN
- Punkte sammeln
- Bonus Boost
- Willkommensgeschenke
- QR Center
- Staff Portal

Status:

LOCK

---

## 45.1 Phase – Onboarding Fortschritt reload-sicher

Problem:

Beim Reload konnte der Onboarding-Wizard wieder auf Schritt 1 fallen, obwohl der
Restaurantbesitzer bereits weiter war.

Ursache:

Der Wizard nutzte zwar Autosave, aber Schrittwechsel mussten ebenfalls sofort
und versionssicher im Onboarding-Draft gespeichert werden.

Änderung:

- `current_step` wird beim Weiter- und Zurückgehen sofort gespeichert.
- Feldänderungen bleiben zusätzlich per Autosave gespeichert.
- Drafts erhalten eine Wizard-Strukturversion.
- Alte Draft-Schritte aus der früheren Angebotsstruktur werden weiterhin auf
  die aktuelle 7-Schritt-Struktur gemappt.
- Speichern-Fehler erscheinen sichtbar auf Deutsch:
  „Fortschritt konnte gerade nicht gespeichert werden.“

Nicht geändert:

- keine neue Produktlogik
- keine neue Datenbankstruktur
- keine Kampagnen oder Aktionen
- keine QR-, Punkte-, Tages-PIN- oder Willkommensgeschenk-Logik

Status:

LOCK

---

## 46. LOCK Kriterien

Dieser Changelog gilt als LOCK, wenn:

- Hauptentscheidungen dokumentiert sind
- V1 und V2 getrennt sind
- Sicherheitsmeilensteine dokumentiert sind
- Flow-Entwicklung nachvollziehbar ist
- Engineering Bible Fortschritt dokumentiert ist
- Codex später Projektgeschichte nachvollziehen kann

---

## 47. Codex-Regeln

Wenn Codex diesen Changelog liest:

1. Changelog ist Historie, nicht neue Spezifikation.
2. Für konkrete Regeln immer die jeweilige Bible-Datei lesen.
3. Changelog darf nicht als alleinige Quelle für Implementierung dienen.
4. Bei Widerspruch zwischen Changelog und Fachdatei: Fachdatei gewinnt.
5. Neue wichtige Entscheidungen im Changelog ergänzen, nicht überschreiben.

---

Endstatus: **LOCK**

---

## 48. Phase – Kritischer technischer Cleanup Migration, UI-Text und Setup-Checklist

Problem:

Der App-Audit vom 2026-07-13 fand drei konkrete Blocker:

- zwei lokale Supabase-Migrationen verwendeten denselben Timestamp `20260712001000`
- die öffentliche Startseite zeigte den englischen sichtbaren Text
  `Customer QR / Bonus`
- `loadSetupChecklist` nutzte noch alte Campaign-/Coupon-Pfade als V1-Setup-
  Kriterien

Änderung:

- Die bereits auf Staging angewendete Migration
  `20260712001000_welcome_gifts_status_update_fix.sql` bleibt unverändert.
- Die noch nicht auf Staging bestätigte Einlösequoten-Migration wurde auf
  `20260712002000_loyalty_redemption_return_rate.sql` verschoben.
- Die öffentliche Startseite zeigt jetzt `Bonus-QR für Gäste`.
- `loadSetupChecklist` prüft für V1 keine Campaigns oder Coupons mehr.
- QR-Bereitschaft ist nicht mehr an aktive Kampagnen gekoppelt.

Nicht geändert:

- keine Tabellen gelöscht
- keine neue Produktlogik
- keine Aktionen oder Kampagnen zurückgebracht
- keine Tages-PIN-, Punkte-, Willkommensgeschenk- oder Bonus-Boost-Logik geändert

Staging:

`npx supabase db push --include-all` wurde nach Bereitstellung eines
temporären Supabase Access Tokens ausgeführt.

Angewendet:

- `20260712002000_loyalty_redemption_return_rate.sql`

Status:

LOCK

---

## 49. Phase – Startseite Karten klickbar und Gasttext deutsch

Problem:

Die öffentliche Startseite zeigte eine Gast-Karte mit englischem Text und die
Karten wirkten optisch zu wenig wie klare Aktionen.

Änderung:

- `Customer QR / Bonus` wurde durch `Gast-Bonus öffnen` ersetzt.
- Die Gast-Karte erklärt jetzt: `Für Gäste, die ihr Bonuskonto öffnen oder
  einen QR-Code scannen möchten.`
- Alle Startseiten-Karten zeigen eine sichtbare Aktion mit Pfeil.
- Hover und Tastatur-Fokus sind sichtbar.
- `/customer` ohne Restaurant-Kontext zeigt eine deutsche Hinweisseite statt
  erneut die Startseite.

Nicht geändert:

- keine Auth-Logik
- keine Customer-Token-Logik
- keine Datenbank
- keine RPCs
- keine Punkte-, Tages-PIN-, QR- oder Willkommensgeschenk-Logik

Status:

LOCK

---

## 50. Phase – Tenant-Isolation gegen alte Restaurantdaten gehärtet

Problem:

Ein neu angemeldeter Restaurant-Account konnte kurzzeitig oder durch zu breite
Frontend-Abfragen alte Daten eines anderen Restaurants sehen. Besonders
kritisch war der Dashboard-/Tenant-Kontext:

- alter Restaurant-State blieb beim User-Wechsel bis zum nächsten Tenant-Load
  erhalten
- Restaurants wurden zu breit geladen und erst im Frontend gefiltert
- Demo-KPI-Fallbacks konnten im Supabase-/Live-Betrieb falsche Zahlen anzeigen

Änderung:

- `TenantProvider` leert Restaurant, Branding und aktive Restaurant-ID sofort
  beim User-Wechsel.
- Alte asynchrone Tenant-Loads dürfen nach einem User-Wechsel keinen alten
  State mehr zurückschreiben.
- Restaurants werden nur noch serverseitig eingeschränkt geladen:
  `owner_id = aktueller User` oder explizite `restaurant_members`-
  Mitgliedschaft.
- `setActiveRestaurantId` akzeptiert nur IDs aus der aktuell erlaubten
  Restaurantliste.
- Dashboard-Neumitglieder verwenden Demo-Daten nur noch im lokalen Demo-Modus.
- Reward-/Loyalty-Demo-Fallbacks bleiben auf lokale Entwicklung begrenzt.

Nicht geändert:

- keine neue Produktlogik
- keine neue Datenbankstruktur
- keine Tages-PIN-, Punkte-, Punkteeinlösungs-, Willkommensgeschenk-,
  Bonus-Boost- oder QR-Logik

Status:

NOT READY bis Staging-User-Wechsel, neuer Account und RLS live geprüft sind.

---

## 51. Phase – Reward-RPC Security und Legacy Code+PIN deaktiviert

Problem:

Historische V1-Zwischenstände enthielten noch einen parallelen
Code+PIN-Einlöseweg mit `create_redemption_code` und
`redeem_reward_with_pin`. Diese Logik ist nicht mehr der V1-Standard und darf
nicht als öffentlicher Einlöseweg neben der PIN-losen Punkteeinlösung bestehen.

Änderung:

- `redeem_customer_reward` bleibt der V1-Weg für die Kundenbestätigung ohne
  PIN.
- Die RPC prüft den Kundentoken, das Restaurant, die aktive Punkteeinlösung und
  Willkommensgeschenke getrennt.
- Normale Punkteeinlösungen bleiben Katalogprodukte und schreiben
  Einlösungsverlauf sowie Punkteabzug.
- Willkommensgeschenke bleiben einmalig und werden nach Einlösung auf
  `redeemed` gesetzt.
- `create_redemption_code` verwendet intern `gen_random_bytes` statt
  `random()`.
- `create_redemption_code` und `redeem_reward_with_pin` erhalten keinen
  öffentlichen Execute-Grant mehr.

Nicht geändert:

- keine Tages-PIN-Logik
- keine Punkteberechnung
- keine Customer-Portal-UX
- keine Willkommensgeschenk-Zufallslogik
- keine Bonus-Boost-Logik

Status:

NOT READY bis Migration auf Staging angewendet und Tenant-/RLS-/Reward-Flows
live geprüft sind.

---

## 52. Phase – Demo-Modus aus Live-Runtime entfernt

Problem:

Live-Tests dürfen niemals Demo-Daten anzeigen. Alte Runtime-Fallbacks konnten
bei fehlender Supabase-Verbindung oder lokalen Entwicklungsbedingungen noch
Demo-Restaurant, Demo-User, Demo-KPIs oder Kai-Sushi-Daten liefern.

Änderung:

- Aktive `demoData`-Imports wurden aus Auth, Tenant, Onboarding, Loyalty,
  Rewards, Campaigns, Dashboard und Staff entfernt.
- `src/shared/lib/demoData.ts` wurde aus der Runtime entfernt.
- Fehlende Supabase-Konfiguration führt zu:
  `Live-Daten konnten nicht geladen werden. Bitte prüfe die Supabase-Verbindung.`
- Customer Portal lädt öffentliche Slugs nur noch über Supabase-RPCs.
- QR Center und Onboarding-Starter-Kit verwenden `VITE_APP_BASE_URL`, wenn
  gesetzt, sonst den aktuellen Origin.
- Cloudflare Live-Env muss `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`
  enthalten. `SUPABASE_ACCESS_TOKEN` gehört nicht in die Live-App.

Nicht geändert:

- keine Datenbankänderung
- keine RPC-Änderung
- keine Tages-PIN-, Punkte-, Punkteeinlösungs-, Willkommensgeschenk-,
  Bonus-Boost- oder QR-Token-Logik

Status:

NOT READY bis der neue Build in Cloudflare deployed und live geprüft wurde.

---

## 2026-07-14 – Tages-PIN, Buchungslimit, Geschenke und Einlösecode V1

- idempotente Punktebuchungswrapper für Kunden- und Mitarbeiterportal ergänzt
- maximal zwei erfolgreiche Punktebuchungen pro lokalem Tag serverseitig abgesichert
- lokale Tages-PIN-Erzeugung an Restaurant-Zeitzone gebunden
- harte Eindeutigkeit für Willkommens- und jährliche Geburtstagsgeschenke ergänzt
- tägliche idempotente Geburtstagsvergabe aus aktiven Willkommensgeschenken ergänzt
- gemeinsames gehashtes sechsstellige Codesystem mit 15-Minuten-Ablauf ergänzt
- alte öffentliche Direkt-/PIN-Einlösewege gesperrt
- Customer Portal und Staff Portal auf verbindliche Codebestätigung umgestellt
- sichtbare Begriffe „Punkteeinlösung“, „Willkommensgeschenk“ und „Geburtstagsgeschenk“ vereinheitlicht

---

## 2026-07-15 – Cloudflare Workers Git-Deployment konfiguriert

- fehlende `wrangler.jsonc` als Ursache der Cloudflare-Meldung behoben
- Vite-SPA als statischer Assets-Worker mit History-Fallback konfiguriert
- reproduzierbare Deploy-, Preview- und Dry-Run-Skripte ergänzt
- audit-sauberen Wrangler festgelegt und Deployment-Standard auf Node 22 gesetzt
- erforderliche Vite-Buildvariablen und Workers-Build-Einstellungen dokumentiert
- keine Zugangsdaten oder Supabase-Secrets in die Konfiguration übernommen
