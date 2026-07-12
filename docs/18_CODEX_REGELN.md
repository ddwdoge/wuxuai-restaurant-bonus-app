
# 18_CODEX_REGELN.md

# WUXUAI Bonus V1 – Codex Regeln

Status: **LOCK**

Dieses Dokument definiert verbindlich, wie Codex im Projekt **WUXUAI Bonus** arbeiten muss.

Es ist nicht optional.

Codex darf nicht frei planen, nicht frei interpretieren und nicht aus einzelnen Chat-Nachrichten eigene Produktlogik ableiten.

Codex arbeitet ausschließlich nach:

1. Engineering Bible
2. aktueller Flow-Spezifikation
3. explizitem Auftrag des Founders / CTO
4. bestehendem Code
5. Build- und Testresultat

Wenn diese Quellen widersprüchlich sind, meldet Codex **NOT READY** und erklärt den Konflikt.

---

## 1. Zweck dieses Dokuments

Dieses Dokument ist die Arbeitsanweisung für Codex.

Es legt fest:

- wie Codex Aufgaben lesen muss,
- wie Codex Änderungen planen muss,
- was Codex niemals tun darf,
- wie Codex mit unklaren Anforderungen umgeht,
- wie Codex Berichte schreiben muss,
- wie Codex mit Datenbank, RLS, RPCs und Migrationen arbeitet,
- wie Codex UI umsetzt,
- wie Codex V1 und V2 trennt,
- wann Codex einen Flow als LOCK melden darf.

Das Ziel ist:

> Codex arbeitet wie ein disziplinierter Senior Engineer, nicht wie ein kreativer Feature-Generator.

---

## 2. Engineering Bible ist die Wahrheit

🟢 **FIX**

Die Engineering Bible ist die verbindliche Produkt- und Engineering-Wahrheit.

Nicht der Chat.  
Nicht eine einzelne alte Prompt-Antwort.  
Nicht eine spontane Vermutung.  
Nicht der bestehende Code, wenn er der Bible widerspricht.

Wenn Code und Bible unterschiedlich sind, darf Codex nicht einfach den Code für richtig halten.

Codex muss melden:

```text
Bible-Konflikt gefunden.
Code verhält sich anders als Spezifikation.
Empfehlung: Fix oder CTO-Entscheidung erforderlich.
```

---

## 3. Reihenfolge der Quellen

Codex entscheidet nach dieser Priorität:

1. **Engineering Bible**
2. **aktuelle konkrete Aufgabe**
3. **bestehender Code**
4. **Build- und Testresultat**
5. **eigene technische Einschätzung**

Eigene Einschätzung steht immer zuletzt.

---

## 4. Keine freie Produktplanung

🟢 **FIX**

Codex darf keine neue Produktlogik erfinden.

Verboten:

- neue Features vorschlagen und direkt bauen,
- UI neu strukturieren ohne Auftrag,
- V2-Funktionen in V1 einbauen,
- eigene Business-Regeln erfinden,
- eigene Punkteformeln erfinden,
- eigene Preislogik erfinden,
- eigene Referral-Regeln erfinden,
- Aktionen wieder einführen,
- englische UI-Texte erzeugen.

Wenn Codex glaubt, dass eine neue Idee sinnvoll ist, darf Codex sie nur als Hinweis im Bericht nennen.

Nicht bauen.

---

## 5. NOT READY statt Raten

🟢 **FIX**

Wenn Codex etwas nicht sicher weiß, meldet Codex:

```text
NOT READY
```

und erklärt:

- was unklar ist,
- welche Datei betroffen ist,
- welche Entscheidung fehlt,
- welche Risiken bestehen,
- welche CTO-Frage geklärt werden muss.

Codex darf bei Businesslogik niemals raten.

---

## 6. V1 und V2 strikt trennen

🟢 **FIX**

V1 wird gebaut.

V2 wird vorbereitet, aber nicht gebaut, außer ausdrücklich beauftragt.

### V1

V1 enthält:

- Restaurant Portal
- Kundenportal
- Staff Portal
- Flow 01–05
- Punkte sammeln
- Belohnungen
- Willkommensgeschenke
- Bonus Boost
- QR / Starter Kit
- 30 Tage Trial
- Deutsch
- Mobile First

### V2

V2 enthält später:

- Filialen UI
- Wochenplan
- POS-QR mit signierter Rechnung
- Stripe-Automation
- WUXUAI Admin Portal
- Mehrsprachigkeit
- Smart Recommendation Engine
- dynamische Promotionflächen
- Branchen-Erweiterung
- Enterprise-Funktionen

Codex darf V2-Ideen nicht ohne ausdrücklichen Auftrag in V1 einbauen.

---

## 7. Deutsch als UI-Sprache

🟢 **FIX**

Alle sichtbaren UI-Texte in V1 sind Deutsch.

Codex-Prompts im Projekt sollen auf Deutsch formuliert sein, damit Codex nicht versehentlich englische UI erzeugt.

Erlaubt auf Englisch:

- Dateinamen
- Funktionsnamen
- Variablennamen
- API-Begriffe im Code
- Bibliotheksnamen
- technische Logs im Code

Nicht erlaubt in sichtbarer UI:

- Campaign
- Reward
- Submit
- Save later
- Customer
- Referral Warning
- Device Warning
- Token
- Slug
- Threshold
- required_points
- API
- RPC
- JSON
- Debug

Codex muss nach jedem UI-Änderungslauf prüfen:

```text
Sind noch englische sichtbare Texte vorhanden?
```

---

## 8. Mobile First

🟢 **FIX**

Jede UI-Änderung wird zuerst für 390 px Breite gedacht.

Codex muss bei UI-Arbeiten prüfen:

- kein horizontales Scrollen,
- keine abgeschnittenen Texte,
- Karten wachsen in Höhe,
- Buttons sind groß genug,
- QR bleibt scanbar,
- Logo wird nicht verzerrt,
- Text läuft nicht aus Karten heraus.

Wenn Mobile bricht, ist die Aufgabe nicht LOCK.

---

## 9. Eine Seite = Eine Entscheidung

🟢 **FIX**

Jede UI-Seite hat genau ein Hauptziel.

Codex darf keine Seite überladen.

Beispiele:

- Onboarding Schritt 5: Willkommens-Belohnungen auswählen
- Restaurant Starter Kit: Starter Kit herunterladen
- Punkte sammeln: Rechnungsbereich wählen
- Belohnung einlösen: Belohnung zeigen
- Dashboard: Heute verstehen

Wenn eine Seite mehrere gleich wichtige Entscheidungen enthält, muss Codex melden:

```text
UX-Konflikt: Mehrere Hauptentscheidungen auf einer Seite.
```

---

## 10. Keine technischen Begriffe im Restaurant Portal

Codex muss UI-Texte immer aus Sicht des Restaurantbesitzers formulieren.

Verwenden:

- Gäste
- Belohnungen
- Willkommensgeschenke
- Punkte
- Bonus Boost
- QR Center
- Restaurant Starter Kit
- Mitarbeiter
- Einstellungen
- Heute im Restaurant

Nicht verwenden:

- Campaign
- Coupon
- RPC
- Slug
- Device Warning
- Referral Warning
- Reward Threshold
- Token
- Endpoint
- Database
- Row Level Security

Technik darf im Code sein, nicht in der Oberfläche.

---

## 11. Aufgabenbearbeitung: immer zuerst lesen

Vor jeder Änderung muss Codex lesen:

1. relevante Engineering-Bible-Datei,
2. betroffene Komponente,
3. betroffene Services,
4. betroffene Migrationen,
5. bestehende Tests oder Build-Resultate.

Codex darf nicht nur anhand der Dateinamen arbeiten.

---

## 12. Arbeitsmodus: Analyse vor Änderung

Jede Aufgabe beginnt intern mit einer Analyse.

Codex soll im Bericht zeigen:

- welche Ursache gefunden wurde,
- welche Dateien betroffen waren,
- warum die Änderung nötig war.

Nicht akzeptiert:

```text
Ich habe es verbessert.
```

Akzeptiert:

```text
Ursache:
Route /admin/settings renderte RestaurantOnboarding.
Fix:
Eigene SettingsPage erstellt und Route angepasst.
```

---

## 13. Änderung nur im Scope

Codex darf nur ändern, was der Auftrag verlangt.

Wenn Aufgabe lautet:

```text
Settings Routing Bug fixen
```

dann darf Codex nicht:

- Dashboard redesignen,
- Datenbank neu strukturieren,
- Customer Portal ändern,
- neue Funktionen bauen.

Scope-Verletzung = NOT READY.

---

## 14. Keine Seiteneffekte auf andere Flows

Vor Abschluss muss Codex prüfen:

- Flow 01 bleibt stabil,
- Flow 02 bleibt stabil,
- Flow 03 bleibt stabil,
- Flow 04 bleibt stabil,
- Flow 05 bleibt stabil.

Eine Änderung an Belohnungen darf nicht unbemerkt Kundenregistrierung oder Punktebuchung brechen.

---

## 15. Build ist Pflicht

🟢 **FIX**

Jeder Codex-Lauf endet mit:

```bash
npm run build
```

Build muss erfolgreich sein.

Wenn Build nicht läuft:

- Aufgabe nicht LOCK,
- Fehler melden,
- keine Erfolgsmeldung.

Wenn nur Warnung:

- Warnung dokumentieren,
- einschätzen, ob blockierend.

---

## 16. Staging vor Production

🟢 **FIX**

Datenbank- und Infrastrukturänderungen laufen zuerst auf Staging.

Codex muss melden:

- Migration angewendet?
- Staging geprüft?
- Fehler?
- RLS geprüft?
- RPC geprüft?

Production wird nicht direkt geändert.

---

## 17. Migration-Regeln

Codex darf Migrationen nur mit Vorsicht erstellen.

Regeln:

1. Keine destruktiven Migrationen ohne expliziten Auftrag.
2. Neue Spalten zuerst nullable.
3. Backfill vor Not Null.
4. RLS prüfen.
5. Grants prüfen.
6. RPC-Signaturen prüfen.
7. Staging pushen.
8. Ergebnis berichten.

Codex muss Migrationen so schreiben, dass bestehende Daten nicht beschädigt werden.

---

## 18. RLS-Regeln

Row Level Security ist Pflicht.

Codex darf niemals:

- RLS deaktivieren,
- öffentliche SELECTs auf Kundendaten erlauben,
- alle active Rewards öffentlich freigeben,
- customers öffentlich lesbar machen,
- restaurant_id ignorieren,
- branch_id/organization_id inkonsistent behandeln.

Public Access erfolgt nur über sichere RPCs.

---

## 19. RPC-Regeln

Businesskritische Aktionen laufen über RPC.

Beispiele:

- Registrierung
- Punkte sammeln
- Belohnung einlösen
- Bonus Boost aktivieren
- Trial starten
- Kundenportal laden

RPCs müssen prüfen:

- restaurant_id
- branch_id
- Token
- Status
- Rechte
- aktive Einstellungen
- doppelte Aktionen
- Audit

Bei `SECURITY DEFINER`:

- `search_path` setzen,
- EXECUTE Grants bewusst setzen,
- kein unkontrolliertes PUBLIC,
- Extensions sauber referenzieren.

---

## 20. Auth-Regeln

Codex darf keine Rolle aus `user_metadata` als Autorität verwenden.

Rollen kommen aus:

- restaurant_members
- app_metadata nur vorsichtig und sekundär
- sichere RPCs
- interne Admin-Tabellen für WUXUAI Admin später

Missing Role darf niemals Owner sein.

Default Owner ist verboten.

---

## 21. Service Role Regel

Service Role darf niemals im Frontend verwendet werden.

Service Role nur:

- Server
- Edge Functions
- sichere Admin-Prozesse

Wenn Codex Service Role im Browser sieht, muss Codex das als kritischen Fehler melden.

---

## 22. Customer Token Regel

Customer Code ist kein Geheimnis.

Kundenzugriff erfolgt über sichere Tokens.

Codex darf nicht:

- Customer Code als Zugriffsschutz nutzen,
- Telefonnummer allein als Login verwenden,
- ersten Kunden eines Restaurants anzeigen,
- Demo-Fallback im Produktivmodus nutzen.

---

## 23. Staff / Tages-PIN Regel

Staff-Aktionen müssen zur aktuellen Flow-Regel passen.

V1-Regel:

- Punkte sammeln nutzt automatisch erzeugte Tages-PIN.
- Tages-PIN ist nur in der Mitarbeiteransicht sichtbar.
- Belohnung einlösen nutzt keine PIN.
- Belohnung einlösen nutzt finale Kundenbestätigung und serverseitige Einmalverwendung.
- Keine persönliche Kellner-PIN auf dem Kundenhandy.
- Keine manuelle PIN-Verwaltung durch Restaurantbesitzer.

Roh-PIN nicht unnötig wiederverwenden.

Staff darf:

- Gast finden,
- Tages-PIN sehen,
- operative Aktionen ausführen.

Staff darf nicht:

- Einstellungen ändern,
- Bonusregeln ändern,
- Abo sehen,
- Restaurantdaten verwalten.

---

## 24. Audit-Regeln

Audit ist Pflicht bei:

- Punktebuchung,
- Belohnungseinlösung,
- Willkommensgeschenk-Zuteilung,
- Willkommensgeschenk-Freischaltung,
- Bonus Boost Aktivierung,
- Staff Aktion,
- Admin Änderung,
- Trial Start,
- kritischen Systemereignissen.

Audit darf keine sensiblen Daten enthalten:

- keine PINs,
- keine PIN Hashes,
- keine Secret Keys,
- keine Tokens im Klartext.

---

## 25. Keine Geheimnisse in Git

Codex darf niemals schreiben:

- Supabase Secret Key,
- Service Role Key,
- Access Token,
- Stripe Secret,
- private DB URL,
- echte Passwörter

in:

- Code,
- README,
- Markdown,
- Git,
- Beispielausgaben.

`.env.local` muss ignoriert bleiben.

---

## 26. UI-Änderungen

Bei UI-Änderungen muss Codex prüfen:

- alle Texte Deutsch,
- Mobile First,
- keine technischen Begriffe,
- keine abgeschnittenen Karten,
- keine starren Logo-Boxen,
- nur notwendige Buttons,
- Design System einhalten,
- keine Aktionen in V1 zurückbringen.

---

## 27. Onboarding-Regeln für Codex

Bei Flow 01 darf Codex nicht:

- Angebotsschritt zurückbringen,
- Produktbilder verlangen,
- Belohnungsdetails im Onboarding verlangen,
- manuelles Speichern einbauen,
- Restaurant starten vor letztem Schritt anzeigen,
- SVG/PNG Einzel-Downloads im Onboarding zeigen,
- So funktioniert’s dauerhaft als Seitenbereich anzeigen.

---

## 28. Belohnungs-Regeln für Codex

Codex darf nicht:

- manuelle Punkte-Eingabe einbauen,
- Punkte-Dropdown verwenden,
- Produktpreis ignorieren,
- Wirtschaftlichkeitsstatus entfernen,
- Willkommensgeschenke mit Punkte-Belohnungen vermischen,
- Aktionen wieder einführen.

---

## 29. Willkommensgeschenk-Regeln für Codex

Codex muss beachten:

- normales Signup → Willkommensgeschenk zugeteilt, gesperrt,
- erste Punktebuchung → freigeschaltet,
- Einlösung erst nächster Besuch,
- Referral Signup → kein Willkommensgeschenk,
- Quoten zentral,
- teure Kategorien seltener,
- Tageslimits vorbereiten,
- Restaurant bearbeitet keine Quoten in V1.

---

## 30. Punkte-Regeln für Codex

Codex darf nicht:

- freie Betragseingabe einbauen,
- „bis X €“-Stufen verwenden,
- Punkte clientseitig vertrauen,
- POS als Pflicht einbauen,
- NFC als Pflicht einbauen,
- Mitarbeitergerät als Pflicht einbauen,
- Punktebuchung ohne Tages-PIN erlauben.

Flow 04 nutzt:

- Bonus QR
- Rechnungsbereiche
- Tages-PIN
- serverseitige Berechnung
- Audit

---

## 31. Bonus Boost-Regeln für Codex

Codex muss beachten:

- kein Einmalpunktebonus als Hauptmechanik,
- Aktivierung erst nach erster Punktebuchung des Freundes,
- beide erhalten Boost,
- Multiplikator stapelt nicht,
- Dauer verlängert sich,
- Referral hat Vorrang vor Willkommensgeschenk,
- Kundenportal emotional,
- Dashboard KPI vorhanden.

---

## 32. Dashboard-Regeln für Codex

Dashboard heißt inhaltlich:

```text
Heute im Restaurant
```

Es zeigt nur wichtige Tagesinformationen.

Nicht anzeigen:

- Device Warnungen
- Referral Warnungen
- technische Statuskarten
- leere Diagramme
- QR-Code bereit
- Debug-Daten

„Neue Aktion starten“ ist entfernt.

---

## 33. Settings-Regeln für Codex

Settings ist eine eigene Seite.

`/admin/settings` darf niemals `RestaurantOnboarding` rendern.

Einstellungen sind ein Menü:

- Restaurantdaten
- Aussehen
- Öffnungszeiten
- Bonusprogramm
- Konto & Testphase

Unterseiten separat.

---

## 34. QR / Starter Kit Regeln für Codex

Im Onboarding:

- nur Restaurant Starter Kit PDF
- ein Hauptbutton
- keine SVG/PNG Einzeloptionen

Im QR Center später:

- PNG
- SVG
- PDF
- Sticker
- Aufsteller
- Tischkarten

PDF Regeln:

- Logo proportional,
- QR zentriert,
- Footer dezent,
- Bonus Boost KPI Box,
- keine technischen Texte.

---

## 35. Report-Format für Codex

Jeder Codex-Bericht muss enthalten:

- Aufgabe
- gelesene Bible-Dateien
- geänderte Dateien
- geänderte Migrationen
- geänderte RPCs
- geprüfte alte Logik
- UI-Prüfung
- Flow-Prüfung
- RLS/Security-Prüfung
- Build-Ergebnis
- Staging-Ergebnis
- offene Risiken
- Status: LOCK / CODE LOCK / FINAL LOCK / NOT READY

---

## 36. Codex Selbstkontroll-Loop

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

### 36.1 Bible zuerst lesen

Vor jeder Änderung lesen:

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`

Zusätzlich immer die passenden Flow-Dateien lesen.

### 36.2 Aufgabe verstehen

Vor dem Bauen intern klären:

- Welcher Flow ist betroffen?
- Welche Persona ist betroffen?
- Welche DB/RPCs sind betroffen?
- Welche alte Logik könnte noch stören?
- Welche V1-Regeln dürfen nicht verletzt werden?

Nicht einfach losbauen.

### 36.3 Verbotene Dinge prüfen

Vor und nach der Änderung prüfen:

- keine Aktionen
- keine Kampagnen
- keine KI
- kein POS
- kein SMS/WhatsApp
- keine persönliche Kellner-PIN
- keine manuelle PIN-Verwaltung durch Restaurantbesitzer
- keine Demo-Daten im Supabase-Betrieb
- keine öffentlichen Customer-Tabellenreads
- keine manuelle Punkte-Eingabe
- keine Punktebuchung ohne Tages-PIN

Wenn alte Logik noch aktiv in einem V1-Flow hängt:

```text
NOT READY
```

### 36.4 Selbsttest nach Änderung

Codex prüft aktiv:

- UI: Deutsch, Mobile First, keine abgeschnittenen Texte, keine englischen Begriffe
- Flow: Start, nächster Schritt, gespeicherter Status, Anzeige im Portal
- DB/RPC: Migration, RLS, alte RPCs, restaurant_id, branch_id, customer_token, membership
- Sicherheit: anon, Kunde, Restaurant, Service Role, Secrets
- alte Logik: campaign, action, starter_offer, coupon, demo, fallback, redeem_reward_with_pin, collect_points ohne daily_pin

### 36.5 Build

Immer ausführen:

```text
npm run build
```

Wenn Build fehlschlägt:

```text
NOT READY
```

### 36.6 Migration / Staging

Wenn eine Migration geändert oder erstellt wurde, muss Codex melden:

- Migration erstellt: Ja/Nein
- Migration auf Staging angewendet: Ja/Nein
- `npx supabase db push --include-all` erfolgreich: Ja/Nein
- relevante RPCs erreichbar: Ja/Nein

Wenn Migration nicht auf Staging angewendet wurde:

```text
kein FINAL LOCK
```

Dann maximal:

```text
CODE LOCK
```

### 36.7 Echter Flow-Test

Bei Flow-relevanten Änderungen reicht Build nicht.

Codex muss den echten Flow testen oder klar **NOT READY** melden.

Wenn nicht live gegen Staging getestet:

```text
maximal CODE LOCK, nicht FINAL LOCK
```

### 36.8 Report und Export

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

### 36.9 Status-Regel

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

### 36.10 Ausgabeformat

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

Bei UI:

```text
Desktop geprüft
Tablet geprüft
Mobile geprüft
```

Bei DB:

```text
Migration angewendet
RLS geprüft
RPC geprüft
```

---

## 36. LOCK melden

Codex darf LOCK nur melden, wenn:

- Scope erfüllt,
- Build grün,
- keine offensichtlichen Regelverstöße,
- relevante Tests durchgeführt,
- keine bekannten Blocker,
- alle sichtbaren Texte Deutsch,
- keine V1/V2-Vermischung.

Wenn ein Risiko bleibt:

```text
LOCK mit Hinweis
```

nur wenn Risiko nicht blockierend ist.

Bei blockierendem Risiko:

```text
NOT READY
```

---

## 37. NOT READY melden

Codex muss NOT READY melden bei:

- Build Fehler,
- Migration Fehler,
- RLS Unsicherheit,
- Sicherheitsrisiko,
- unklare Businessregel,
- Konflikt mit Engineering Bible,
- Scope-Verletzung,
- UI bricht Mobile,
- englische UI sichtbar,
- fehlende zentrale Produktlogik.

---

## 38. Keine Scheinerfolge

Codex darf nicht schreiben:

```text
erledigt
```

wenn nur UI gebaut wurde, aber:

- DB fehlt,
- Migration nicht angewendet,
- RLS nicht geprüft,
- Build nicht gelaufen,
- Flow nicht getestet,
- Kundenseite nicht angepasst.

Bericht muss ehrlich sein.

---

## 39. Demo-Modus

Demo-Daten dürfen nur in Demo-Modus wirken.

Demo darf nicht in Produktion leaken.

Verboten:

- Hardcoded Kai Sushi Redirects
- Produktionsfallback auf Demo-Restaurant
- Demo-Kunde als echter Kunde
- Demo-Slug in geschützten Routen

---

## 40. Performance-Regeln

Codex muss Bundle-Größe beachten.

Route-level Code Splitting und Vendor Splitting bleiben erhalten.

Customer Portal darf nicht Admin/Staff Code unnötig laden.

Bei großer neuer Seite:

- lazy loading prüfen,
- Bundleauswirkung melden.

---

## 41. Fehlertexte

UI zeigt keine rohen technischen Fehler.

Beispiel falsch:

```text
new row violates row-level security policy
```

Richtig:

```text
Das hat gerade nicht funktioniert.
Bitte versuche es erneut.
```

Intern darf technischer Fehler geloggt werden.

---

## 42. Keine langfristigen Annahmen ohne Dokumentation

Wenn Codex eine technische Annahme trifft, muss sie im Bericht stehen.

Beispiel:

```text
Annahme:
Willkommensgeschenk-Tageslimits werden in V1 nur vorbereitet, nicht aktiv erzwungen.
```

---

## 43. Änderungen an Engineering Bible

Codex darf Engineering Bible nicht still ändern.

Wenn eine Produktregel geändert werden muss:

1. CTO/Founder entscheidet,
2. Bible wird aktualisiert,
3. dann Code.

Nicht umgekehrt.

---

## 44. Minimalismus-Regel

Wenn eine Funktion auch später entschieden werden kann, gehört sie nicht ins Onboarding.

Wenn eine Funktion nicht direkt Restaurantnutzen erzeugt, nicht in V1 bauen.

Wenn ein Bildschirm zu viele Optionen hat, reduzieren.

---

## 45. Restaurant Reality Check

Vor LOCK muss Codex mindestens gedanklich prüfen:

1. Würde ein Restaurantbesitzer das ohne Schulung verstehen?
2. Würde ein Kellner das im Mittagsstress nutzen?
3. Schafft ein Gast den Ablauf in unter 30 Sekunden?
4. Würde ein Restaurant dafür bezahlen?

Wenn eine Antwort Nein ist:

NOT READY oder UX-Nachbesserung melden.

---

## 46. Arbeiten mit Founder-Berichten

Wenn der Founder einen Screenshot oder Fehlerbericht sendet:

Codex soll nicht breit umbauen.

Codex soll:

1. Fehler exakt reproduzieren oder analysieren,
2. Ursache finden,
3. kleinen Fix machen,
4. Build,
5. Bericht.

Keine zusätzlichen Ideen bauen.

---

## 47. Dateistruktur

Codex soll bestehende Struktur respektieren.

Keine unnötige Reorganisation des Projekts.

Wenn größere Umstrukturierung nötig:

- erst Vorschlag,
- kein direkter Umbau.

---

## 48. Keine Abhängigkeiten ohne Grund

Neue Libraries nur, wenn nötig.

Vor neuer Library prüfen:

- Bundlegröße,
- Wartung,
- Security,
- Nutzen,
- Alternativen.

---

## 49. Testdaten

Testdaten dürfen nicht in Produktlogik leaken.

Seed-Daten in Staging sind erlaubt.

Produktionscode darf nicht von Testnamen abhängig sein.

Wenn Supabase aktiv ist:

- keine Demo-Daten auf Restaurantseiten anzeigen
- keine Platzhalterkarten, die wie echte Daten wirken
- keine Seed-Daten aus anderen Restaurants als Fallback verwenden
- Ladefehler intern loggen
- im UI nur ruhige deutsche Fehlermeldung zeigen

Standard:

```text
Daten konnten gerade nicht geladen werden.
```

Wenn echte Daten fehlen:

```text
Leerer Zustand statt Demo-Daten.
```

Demo-Daten sind nur erlaubt, wenn Supabase nicht konfiguriert ist oder ein
expliziter Demo-Modus aktiv ist.

---

## 50. Endregel

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

Nicht bauen.

---

## 51. LOCK Kriterien

Dieses Codex-Regelwerk gilt als LOCK, wenn:

- Codex klare Arbeitsreihenfolge hat,
- V1/V2 getrennt sind,
- Sicherheitsregeln klar sind,
- UI-Regeln klar sind,
- DB/RLS/RPC-Regeln klar sind,
- Reporting klar ist,
- NOT READY klar definiert ist,
- Scope-Verletzungen verboten sind,
- Engineering Bible als Wahrheit definiert ist.

---

Endstatus: **LOCK**
