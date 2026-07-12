# AGENTS.md

# WUXUAI Bonus V1 – Codex Arbeitsanweisung

Status: **AKTIV / PFLICHT**

Diese Datei ist die Startanweisung für Codex in diesem Repository.

Codex darf nicht frei planen, nicht frei interpretieren und nicht aus alten Chatverläufen raten.

Die Engineering Bible im Ordner `/docs` ist die verbindliche Wahrheit für dieses Projekt.

---

## 1. Grundregel

Vor jeder Aufgabe muss Codex zuerst diese Datei lesen.

Danach muss Codex mindestens diese zwei Dateien lesen:

```text
docs/00_START_HIER.md
docs/18_CODEX_REGELN.md
```

Wenn eine Aufgabe einen bestimmten Bereich betrifft, muss Codex zusätzlich die passende Fachdatei lesen.

---

## 2. Quellen-Priorität

Codex entscheidet immer in dieser Reihenfolge:

1. `AGENTS.md`
2. Engineering Bible in `/docs`
3. konkrete aktuelle Aufgabe des Founders
4. bestehender Code
5. Build- und Testergebnis
6. eigene technische Einschätzung

Wenn Code und Engineering Bible widersprechen:

```text
NOT READY
```

melden und den Konflikt erklären.

Nicht eigenmächtig gegen die Bible arbeiten.

---

## 3. Projektziel V1

WUXUAI Bonus V1 soll zuerst fertig gebaut und pilotfähig werden.

Fokus:

```text
Restaurant Portal V1 fertigstellen
Kundenportal V1 stabilisieren
Staff Portal V1 stabilisieren
Pilotrestaurant vorbereiten
```

Nicht V2 bauen.

Nicht neue Module erfinden.

---

## 4. V1 ist aktuell die Priorität

Codex darf V2 nur vorbereiten, wenn es ausdrücklich verlangt wird.

V2-Ideen dürfen nicht automatisch umgesetzt werden.

V1 bleibt fokussiert:

- Restaurant/Café
- ein Standort
- 30 Tage kostenlos
- keine SMS
- kein WhatsApp
- keine Kassa-Integration
- keine KI
- keine Filial-UI
- keine Aktionen
- Deutsch als UI-Sprache

---

## 5. Wichtige Fachdateien

### Produktbasis

```text
docs/01_VISION.md
docs/02_PRODUKTREGELN.md
docs/03_UX_REGELN.md
docs/17_CTO_ENTSCHEIDUNGEN.md
```

### Restaurant Portal

```text
docs/04_RESTAURANT_PORTAL.md
docs/15_DESIGN_SYSTEM.md
```

### Kundenportal

```text
docs/05_CUSTOMER_PORTAL.md
docs/09_FLOW_02_GAST_WERDEN.md
```

### Staff Portal

```text
docs/06_STAFF_PORTAL.md
docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md
```

### WUXUAI Admin Konzept

```text
docs/07_WUXUAI_ADMIN.md
```

### Flow 01 – Onboarding

```text
docs/08_FLOW_01_ONBOARDING.md
```

### Flow 02 – Gast werden

```text
docs/09_FLOW_02_GAST_WERDEN.md
```

### Flow 03 – Belohnung einlösen

```text
docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md
```

### Flow 04 – Punkte sammeln

```text
docs/11_FLOW_04_PUNKTE_SAMMELN.md
```

### Flow 05 – Bonus Boost

```text
docs/12_FLOW_05_BONUS_BOOST.md
```

### Smart Reward Engine

```text
docs/13_SMART_REWARD_ENGINE.md
```

### Datenbank / Supabase / RLS

```text
docs/14_DATABASE_ARCHITEKTUR.md
docs/23_API_RPC_REGELN.md
docs/24_SECURITY_PRIVACY.md
```

### V2

```text
docs/16_V2_MASTERPLAN.md
```

### Pilot / Go-Live / Payment

```text
docs/20_PILOT_TESTPLAN.md
docs/21_PRODUCTION_GO_LIVE_PLAN.md
docs/22_PAYMENT_STRIPE_PLAN.md
```

### Changelog

```text
docs/19_CHANGELOG.md
```

---

## 6. UI-Sprache

Alle sichtbaren UI-Texte in V1 sind Deutsch.

Englisch ist nur erlaubt für:

- Dateinamen
- Funktionsnamen
- Code
- APIs
- Libraries
- technische interne Bezeichner

Nicht erlaubt in sichtbarer UI:

- Campaign
- Reward URL
- Save later
- Customer
- Referral Warning
- Device Warning
- Token
- Slug
- RPC
- Debug
- Threshold
- required_points

---

## 7. Mobile First

Jede UI-Aufgabe wird zuerst für ca. 390 px Breite gedacht.

Prüfen:

- kein horizontales Scrollen
- keine abgeschnittenen Texte
- Karten wachsen in Höhe
- Logos werden nicht verzerrt
- QR-Codes sind zentriert und scanbar
- Buttons sind groß genug
- keine überladenen Layouts

---

## 8. One Screen = One Decision

Jede Seite hat genau ein Hauptziel.

Wenn eine Seite mehrere gleich wichtige Entscheidungen enthält, muss Codex melden:

```text
UX-Konflikt: Mehrere Hauptentscheidungen auf einer Seite.
```

Nicht einfach weiterbauen.

---

## 9. V1-Verbote

Codex darf in V1 nicht bauen:

- Aktionen-Modul
- Kassa-/POS-Integration
- SMS-Verifizierung
- WhatsApp-Verifizierung
- KI-Funktionen
- ERP/Lager/Buchhaltung
- Filial-UI
- komplexe Reports
- manuelle Punkte-Eingabe
- Punkte-Dropdown
- englische UI
- Produktbilder als Pflicht im Onboarding
- mehrere Downloadbuttons im Onboarding-Starter-Kit
- Demo-Fallbacks in Production

---

## 10. Sicherheitsregeln

Codex darf niemals:

- Service Role im Frontend verwenden
- user_metadata als Rollenautorität verwenden
- Public Select auf Kundendaten erlauben
- Customer Code als Geheimnis verwenden
- Staff PIN im Klartext speichern
- Token Hashes zurückgeben
- Punkte clientseitig als Wahrheit behandeln
- Belohnungen ohne finale Kundenbestätigung und serverseitige Einmalverwendung einlösen
- RLS deaktivieren
- Secrets in Code/Markdown/Git schreiben

---

## 11. Datenbank-Regeln

Bei Supabase-/SQL-Arbeiten muss Codex lesen:

```text
docs/14_DATABASE_ARCHITEKTUR.md
docs/23_API_RPC_REGELN.md
docs/24_SECURITY_PRIVACY.md
```

Pflicht:

- Migrationen zuerst auf Staging
- RLS prüfen
- RPC Grants prüfen
- Build ausführen
- keine destruktiven Änderungen ohne Auftrag
- restaurant_id / branch_id / organization_id beachten
- Audit für kritische Aktionen

---

## 12. Codex Selbstkontroll-Loop

Status: **LOCK**

Gilt für jede Aufgabe ab jetzt.

Codex darf Status **LOCK** nur melden, wenn Code, Verbindung, Sicherheit,
Build und Dokumentation im betroffenen Umfang geprüft wurden.

Wenn ein Punkt nicht vollständig geprüft wurde:

```text
NOT READY
```

melden.

Kein theoretisches LOCK.  
Kein „soweit im Code validierbar“ als LOCK.  
Kein FINAL LOCK ohne echte Prüfung der betroffenen Verbindung.

### 12.1 Pflichtlektüre vor jeder Änderung

Vor jeder Änderung lesen:

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`

Zusätzlich immer die passenden Flow- und Fachdateien lesen.

Beispiele:

- Punkte sammeln: `docs/11_FLOW_04_PUNKTE_SAMMELN.md`, `docs/06_STAFF_PORTAL.md`
- Belohnung einlösen: `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`, `docs/13_SMART_REWARD_ENGINE.md`
- Gast registrieren: `docs/09_FLOW_02_GAST_WERDEN.md`
- Restaurant Portal: `docs/04_RESTAURANT_PORTAL.md`
- Customer Portal: `docs/05_CUSTOMER_PORTAL.md`

### 12.2 Vor dem Bauen klären

Vor dem Bauen intern klären:

- Welcher Flow ist betroffen?
- Welche Persona ist betroffen?
- Welche DB/RPCs sind betroffen?
- Welche alte Logik könnte noch stören?
- Welche V1-Regeln dürfen nicht verletzt werden?

Codex darf nicht einfach losbauen.

### 12.3 Vor und nach der Änderung prüfen

Nicht einbauen:

- Aktionen
- Kampagnen
- KI
- POS
- SMS/WhatsApp
- persönliche Kellner-PIN
- manuelle PIN-Verwaltung durch Restaurantbesitzer
- Demo-Daten im Supabase-Betrieb
- Customer-Tabellen direkt öffentlich lesen
- Punkte manuell eingeben
- Punktebuchung ohne Tages-PIN

Wenn alte Logik noch aktiv in einem V1-Flow hängt:

```text
NOT READY
```

### 12.4 Selbsttest nach Änderung

Codex prüft nach jeder Änderung:

- UI: Deutsch, Mobile First, keine technischen Begriffe, keine Demo-Fallbacks im echten Betrieb
- Flow: Start, nächster Schritt, Statusspeicherung, Portalanzeige
- DB/RPC: Migration, RLS, alte RPCs, restaurant_id, branch_id, customer_token, membership
- Sicherheit: anon, Kunde, Restaurant, Service Role, Secrets
- alte Logik: campaign, action, starter_offer, coupon, demo, fallback, redeem_reward_with_pin, collect_points ohne daily_pin

### 12.5 Build

Immer ausführen:

```text
npm run build
```

Wenn Build fehlschlägt:

```text
NOT READY
```

### 12.6 Migration / Staging

Wenn eine Migration geändert oder erstellt wurde, muss Codex melden:

- Migration erstellt: Ja/Nein
- Migration auf Staging angewendet: Ja/Nein
- `npx supabase db push --include-all` erfolgreich: Ja/Nein
- relevante RPCs erreichbar: Ja/Nein

Wenn Migration nicht auf Staging angewendet wurde:

```text
kein FINAL LOCK
```

Maximal:

```text
CODE LOCK
```

### 12.7 Echter Flow-Test

Bei Flow-relevanten Änderungen reicht Build nicht.

Codex muss den echten Flow testen oder klar **NOT READY** melden.

Wenn nicht live gegen Staging getestet:

```text
maximal CODE LOCK, nicht FINAL LOCK
```

### 12.8 Report und Export

Nach jeder Aufgabe:

- Report unter `/docs/reports/YYYY-MM-DD_AUFGABENNAME_REPORT.md`
- Prüf-ZIP unter `/exports/YYYY-MM-DD_AUFGABENNAME.zip`

ZIP darf nicht enthalten:

- `node_modules`
- `.env`
- `.env.local`
- `dist`
- `build`
- alte ZIP-Artefakte
- Secrets

### 12.9 Status-Regel

Codex darf nur **LOCK** melden, wenn:

- Build erfolgreich
- keine kritischen offenen Risiken
- betroffener Flow geprüft
- keine alte Logik widerspricht
- Dokumentation aktualisiert
- Export erstellt

Codex darf **FINAL LOCK** nur melden, wenn zusätzlich:

- Migration auf Staging angewendet
- echter Staging-Flow getestet
- RLS/Security geprüft
- keine offenen Risiken

Wenn etwas fehlt:

```text
NOT READY
```

### 12.10 Abschlussformat

Am Ende immer:

```text
- Aufgabe:
- Build: Ja/Nein
- Migration: Keine / Erstellt / Auf Staging angewendet / Nicht angewendet
- Flow-Test: Ja/Nein
- RLS/Security: Ja/Nein
- Alte Logik geprüft: Ja/Nein
- Report:
- Prüf-ZIP:
- Offene Risiken:
- Status: LOCK / CODE LOCK / FINAL LOCK / NOT READY
```

---

## 13. Reporting-Format

Jeder Codex-Bericht muss enthalten:

```text
Ursache
Geänderte Dateien
Was wurde geändert
Was wurde nicht geändert
Build Ergebnis
Migration falls vorhanden
Staging Ergebnis falls relevant
Risiken
Status: LOCK oder NOT READY
```

Bei UI zusätzlich:

```text
Desktop geprüft
Tablet geprüft
Mobile geprüft
```

Bei Datenbank zusätzlich:

```text
Migration angewendet
RLS geprüft
RPC geprüft
```

---

## 14. LOCK / NOT READY

Codex darf nur **LOCK** melden, wenn:

- Scope erfüllt
- Build grün
- keine offensichtlichen Regelverstöße
- relevante Tests durchgeführt
- alle sichtbaren Texte Deutsch
- keine V1/V2-Vermischung
- keine kritischen Risiken offen

Bei Unsicherheit:

```text
NOT READY
```

melden.

Nicht raten.

---

## 15. Aktueller Arbeitsfokus nach Bible Freeze

Die Engineering Bible ist für V1 ausreichend.

Jetzt nicht weiter dokumentieren, sondern V1 fertig bauen.

Empfohlene Reihenfolge:

1. Restaurant Dashboard finalisieren
2. Belohnungen finalisieren
3. Willkommensgeschenke finalisieren
4. QR Center prüfen
5. Gäste prüfen
6. Mitarbeiter prüfen
7. Einstellungen-Unterseiten prüfen
8. Pilot-Testplan ausführen

---

## 16. Endregel

Codex arbeitet nicht für Code.

Codex arbeitet für:

```text
Restaurantbesitzer
Mitarbeiter
Gast
WUXUAI Betreiber
```

Jede Änderung muss diesen Rollen helfen.

Wenn nicht:

```text
NOT READY
```

melden.

Endstatus: **AKTIV / LOCK**
