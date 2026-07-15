
# 21_PRODUCTION_GO_LIVE_PLAN.md

# WUXUAI Bonus V1 – Production Go-Live Plan

Status: **LOCK**

Dieses Dokument beschreibt den offiziellen Go-Live-Plan für WUXUAI Bonus V1.

Der Go-Live ist nicht der Moment, in dem Code online gestellt wird.  
Der Go-Live ist der Moment, in dem echte Restaurants, echte Gäste, echte Punkte und echte Belohnungen auf einer stabilen, sicheren und kontrollierten Umgebung laufen.

WUXUAI Bonus darf erst dann produktiv gehen, wenn die technische Basis, die Business-Flows, die Sicherheitsregeln, die Datenbank, das Hosting, die Zahlungslogik und die Supportfähigkeit ausreichend vorbereitet sind.

---

## 1. Zweck dieses Dokuments

Dieses Dokument legt fest:

- wann WUXUAI Bonus als produktionsbereit gilt,
- welche Voraussetzungen vor dem Go-Live erfüllt sein müssen,
- wie Staging und Production getrennt werden,
- wie Migrationen kontrolliert werden,
- welche Umgebungsvariablen nötig sind,
- wie Cloudflare Deployment vorbereitet wird,
- wie Supabase Production vorbereitet wird,
- wie Domains und QR-Codes funktionieren,
- wie Pilotdaten von Produktionsdaten getrennt werden,
- wie Rollback und Fehlerbehandlung funktionieren,
- welche Features vor Go-Live nicht gebaut werden dürfen,
- welche Checks vor dem ersten zahlenden Restaurant notwendig sind.

Codex darf aus diesem Dokument keine neuen Produktfunktionen ableiten.  
Dieses Dokument ist ein Betriebs- und Sicherheitsplan.

---

## 2. Go-Live-Grundsatz

🟢 **FIX**

Production ist kein Testplatz.

Alle Änderungen müssen zuerst über:

```text
Lokal
→ Staging
→ Review
→ Production
```

laufen.

Niemals:

```text
lokal
→ direkt Production
```

Production enthält später echte Restaurants, echte Gäste, echte Punkte und echte Belohnungen.

Ein Fehler in Production kann bedeuten:

- falsche Punkte,
- falsche Belohnungen,
- verlorene Gäste,
- Vertrauensverlust,
- Supportaufwand,
- Datenschutzproblem.

Deshalb gilt:

> Production ist geschützt. Staging ist der Testbereich.

---

## 3. Umgebungsmodell

WUXUAI Bonus nutzt drei Umgebungen.

### 3.1 Lokal

Zweck:

- Entwicklung
- UI-Arbeit
- Codex-Fixes
- schnelle Tests
- Build prüfen

Merkmale:

- `.env.local`
- Supabase Staging oder lokale Supabase-Verbindung
- kein echter Produktionskunde
- keine echten Live-Abos

### 3.2 Staging

Zweck:

- echte Supabase-Datenbank zum Testen
- Migrationen prüfen
- RLS prüfen
- RPC prüfen
- Flow 01–05 testen
- Cloudflare Preview testen
- Pilot vor Production validieren

Staging ist die „Probe-Production“.

### 3.3 Production

Zweck:

- echte zahlende Restaurants
- echte Gäste
- echte Punkte
- echte Belohnungen
- echte Abos
- echter Support

Production wird erst genutzt, wenn Staging stabil ist.

---

## 4. Go-Live-Reihenfolge

Der Go-Live erfolgt in dieser Reihenfolge:

1. Engineering Bible aktuell
2. Code Build grün
3. Supabase Staging grün
4. Flow 01–05 auf Staging getestet
5. Cloudflare Preview funktioniert
6. Pilotrestaurant getestet
7. kritische Bugs behoben
8. Production Supabase erstellt
9. Production Migrationen angewendet
10. Production Environment Variables gesetzt
11. Cloudflare Production Deployment
12. QR-Domain geprüft
13. erstes Restaurant auf Production eingerichtet
14. Monitoring und Support bereit
15. Zahlungslogik / Trial-Logik geprüft

Kein Schritt darf übersprungen werden.

---

## 5. Vor-Go-Live Pflichtstatus

Vor Production muss erfüllt sein:

### 5.1 Build

```bash
npm run build
```

muss erfolgreich sein.

Keine blockierenden Warnungen.

### 5.2 Staging

Staging muss zeigen:

- Migrationen aktuell,
- RLS aktiv,
- RPCs funktionieren,
- Storage funktioniert,
- Customer Portal funktioniert,
- Staff Portal funktioniert,
- Restaurant Portal funktioniert,
- Trial Registrierung funktioniert.

### 5.3 Flows

Mindestens diese Flows müssen auf Staging getestet sein:

- Flow 01 Restaurant eröffnen
- Flow 02 Gast werden
- Flow 03 Belohnung einlösen
- Flow 04 Punkte sammeln
- Flow 05 Bonus Boost

### 5.4 Keine kritischen Bugs

Keine offenen Fehler in:

- Auth
- RLS
- RPC
- Punkteberechnung
- Einlösung
- Kundendaten
- QR-Routing
- Onboarding Gate
- Staff Session
- Storage Policies

---

## 6. Supabase Production Vorbereitung

### 6.1 Neues Projekt

Production bekommt ein eigenes Supabase-Projekt.

Beispielname:

```text
wuxuai-bonus-production
```

Nicht Staging wiederverwenden.

### 6.2 Region

Für Österreich/Deutschland:

```text
EU / Frankfurt
```

oder nächstbeste EU-Region.

### 6.3 Datenbank-Passwort

Starkes Passwort im Passwortmanager speichern.

Nicht im Chat posten.

Nicht in Git speichern.

### 6.4 API Keys

Production benötigt:

- Project URL
- Publishable Key
- Service Role Key nur serverseitig, falls nötig

Frontend nutzt nur:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY / Publishable Key
```

### 6.5 Access Token

Supabase Access Token nur lokal / CI sicher speichern.

Nicht in Dokumentation schreiben.

Nach versehentlichem Teilen sofort rotieren.

---

## 7. Production Migrationen

### 7.1 Grundregel

Migrationen werden zuerst vollständig auf Staging getestet.

Erst danach Production.

### 7.2 Anwendung

Production Migrationen nur kontrolliert ausführen.

Beispiel:

```bash
npx supabase link --project-ref <production-ref>
npx supabase db push --include-all
```

Nur wenn sicher mit Production verbunden.

### 7.3 Schutz vor falscher Umgebung

Vor jedem Production-Push prüfen:

```text
Welcher Project Ref?
Welcher Projektname?
Ist das wirklich Production?
```

### 7.4 Migration Report

Nach Migration:

- angewendete Migrationen
- Fehler
- RLS Status
- RPC Status
- Storage Bucket
- Tabellen vorhanden
- Testdaten nicht versehentlich migriert

---

## 8. Datenbank-Checks nach Production Migration

Nach Migration prüfen:

### 8.1 Tabellen

Müssen existieren:

- organizations
- branches
- restaurants
- restaurant_members
- restaurant_branding
- branch_subscriptions
- restaurant_onboarding_drafts
- customers
- customer_qr_tokens
- loyalty_settings
- bonus_amount_tiers
- points_transactions
- rewards
- restaurant_welcome_rewards
- customer_welcome_gifts
- referrals
- customer_bonus_boosts
- staff_members
- staff_sessions
- audit_log

Falls Namen im Code abweichen, tatsächliche Tabellen gegen aktuelle Migrationen prüfen.

### 8.2 RLS

RLS aktiv auf allen sensiblen Tabellen.

### 8.3 RPC

Wichtige RPCs prüfen:

- start_restaurant_owner_trial
- register_restaurant_customer
- get_public_customer_portal
- collect_bonus_points
- redeem_reward_with_staff_session
- referral / bonus boost activation
- staff session validation

### 8.4 Storage

Bucket:

```text
restaurant-media
```

muss existieren.

Policies:

- public read
- owner/admin insert
- owner/admin update
- owner/admin delete

### 8.5 Extensions

Extension-Funktionen müssen sauber funktionieren:

- crypt
- gen_salt
- digest
- gen_random_bytes

Keine search_path-Probleme.

---

## 9. Cloudflare Production Deployment

### 9.1 Cloudflare Projekt

Production Deployment läuft über Cloudflare Pages oder vergleichbare Hosting-Struktur.

### 9.2 GitHub Verbindung

Production sollte aus einem stabilen Branch deployen.

Empfehlung:

```text
main = production ready
develop oder staging = preview/staging
```

Wenn noch allein entwickelt wird, mindestens manuell klar trennen.

### 9.3 Environment Variables

Production benötigt:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Optional später:

- VITE_APP_BASE_URL
- Stripe Publishable Key
- Sentry/Monitoring DSN
- Feature Flag Environment

`VITE_APP_BASE_URL` ist die öffentliche Basis-URL der Live-App, zum Beispiel:

```text
https://wuxuai-restaurant-bonus-os.dongdongwu4899.workers.dev
```

QR Center und Starter-Kit verwenden diese URL für öffentliche Kunden-, Bonus-
und Staff-Links. Wenn sie fehlt, verwendet die App den aktuellen Browser-Origin.

Fehlen `VITE_SUPABASE_URL` oder `VITE_SUPABASE_ANON_KEY`, darf die Live-App
keine Demo-Daten anzeigen. Stattdessen erscheint:

```text
Live-Daten konnten nicht geladen werden.
Bitte prüfe die Supabase-Verbindung.
```

### 9.4 Keine Secrets im Frontend

Nicht in Cloudflare Public Vars setzen:

- Service Role Key
- Supabase Access Token
- SUPABASE_ACCESS_TOKEN
- Stripe Secret Key
- Datenbank Passwort
- private DB URL

### 9.5 Build Command

```bash
npm run build
```

### 9.6 Output Directory

Je nach Vite:

```text
dist
```

### 9.7 Preview vor Production

Jeder größere Release zuerst als Preview prüfen.

---

## 10. Domain-Strategie

### 10.1 Kurzfristig

Aktuelle Marke / Website:

```text
wuxuaisbi.com
```

Starter Kit Footer:

```text
Powered by WUXUAI Bonus • www.wuxuaisbi.com
```

### 10.2 App-Domain

Für Production braucht die App eine stabile URL.

Beispiele:

```text
bonus.wuxuaisbi.com
app.wuxuaisbi.com
```

oder später:

```text
bonus.wuxu.ai
```

### 10.3 QR-Stabilität

QR-Codes sind langfristige Links.

Deshalb muss die Domain stabil sein.

Wenn Domain später wechselt, braucht es Weiterleitungen.

### 10.4 Raw localhost verboten

Production QR darf niemals auf:

```text
localhost
127.0.0.1
192.168.x.x
```

zeigen.

---

## 11. QR-Go-Live Check

Vor Production müssen alle QR-Typen mit echter Domain getestet werden.

### 11.1 Restaurant QR

Test:

```text
QR scannen
→ richtige Restaurant Registrierung
→ keine Demo-Daten
→ Branding korrekt
```

### 11.2 Mein Bonus / Bonus QR

Test:

```text
QR scannen
→ Punkte sammeln
→ Rechnungsbereiche
→ Punktebuchung
```

### 11.3 Referral QR

Test:

```text
QR scannen
→ Freundesregistrierung
→ kein Willkommensgeschenk
→ Bonus Boost nach Punktebuchung
```

### 11.4 Starter Kit PDF

Test:

- QR scanbar
- Logo korrekt
- Domain korrekt
- keine localhost Links
- Footer korrekt
- PDF druckbar

---

## 12. Auth-Go-Live Check

### 12.1 Restaurant Owner Registrierung

Test:

```text
/register
→ Account
→ Restaurant
→ Trial
→ Onboarding
```

### 12.2 Email Confirmation

Für Pilot kann Email Confirmation deaktiviert sein.

Für Production muss entschieden werden:

Option A:
- Email Confirmation aus
- schneller Start

Option B:
- Email Confirmation an
- sicherer, aber mehr Reibung

CTO-Entscheidung vor Production erforderlich.

### 12.3 Rollen

Prüfen:

- missing role nicht Owner
- user_metadata nicht Autorität
- restaurant_members entscheidet
- ProtectedRoute korrekt
- Settings erreichbar nach Onboarding
- Adminbereiche gesperrt vor Onboarding Abschluss

---

## 13. Trial- und Abo-Go-Live Check

### 13.1 V1 Trial

Regel:

```text
30 Tage kostenlos
Keine Kreditkarte
Keine Nachzahlung
```

### 13.2 branch_subscriptions

Nach Registrierung:

- status = trialing
- trial_started_at gesetzt
- trial_ends_at = now + 30 Tage
- branch_id vorhanden
- organization_id vorhanden

### 13.3 Nach Trial

Für frühe Production kann Zahlung noch manuell / Stripe später sein, aber Status muss nachvollziehbar sein.

### 13.4 Kein versehentliches Sperren

Restaurants dürfen nicht während Trial irrtümlich blockiert werden.

---

## 14. Demo-Daten und Seed-Daten

### 14.1 Staging

Staging darf Seed-Daten enthalten:

- Kai Sushi
- Testgäste
- Teststaff
- Testbelohnungen

### 14.2 Production

Production darf keine Demo-Daten enthalten, außer bewusst angelegte interne Testrestaurants.

Verboten:

- Hardcoded Kai Sushi Redirect
- Demo-Kunde in echter Ansicht
- Demo-Restaurant als Fallback
- Testdaten in echten Restaurant-Reports

### 14.3 Testrestaurant in Production

Falls nötig, internes Testrestaurant klar benennen:

```text
WUXUAI Test Restaurant
```

Nicht mit echten Kunden mischen.

---

## 15. Storage-Go-Live Check

Test:

1. Logo hochladen.
2. Seite neu laden.
3. Logo bleibt.
4. Kundenportal zeigt Logo.
5. Starter Kit zeigt Logo.
6. Logo nicht verzerrt.
7. Upload >5 MB wird freundlich abgelehnt.
8. falscher Dateityp wird abgelehnt.
9. Restaurant A kann nicht in Ordner von Restaurant B schreiben.

---

## 16. Security-Go-Live Check

Vor Production prüfen:

### 16.1 Tenant-Isolation

- Restaurant A sieht Restaurant B nicht.
- Staff A sieht Restaurant B nicht.
- Kunde A sieht Kunde B nicht.

### 16.2 Public Access

- keine öffentlichen Tabellenreads für Kunden.
- Public Routen nur RPC/token-basiert.

### 16.3 Staff

- PIN Hash
- Staff Session
- kein Adminzugriff
- Einlösung mit Audit

### 16.4 Punkte

- Punkte serverseitig
- keine freie Eingabe
- keine Client-Werte vertrauen

### 16.5 Referral

- kein Self-Referral
- kein A↔B
- Aktivierung erst nach Punktebuchung

### 16.6 Welcome Gift

- nicht sofort freigeschaltet
- Referral-Gast kein Welcome Gift
- erste Punktebuchung schaltet frei

---

## 17. Monitoring und Fehlerbeobachtung

V1 Minimal:

- Browser Console bei Tests
- Supabase Logs
- audit_log
- Cloudflare Build Logs
- RPC Fehler
- Auth Fehler
- Storage Fehler

Später:

- Sentry
- Error Tracking
- Uptime Monitoring
- Log Dashboard
- WUXUAI Admin Logs

---

## 18. Supportfähigkeit vor Production

Vor echtem Restaurantbetrieb muss WUXUAI beantworten können:

- Wie finde ich ein Restaurant?
- Wie sehe ich dessen Trial?
- Wie prüfe ich dessen Gäste?
- Wie prüfe ich Punktebuchungen?
- Wie sehe ich Audit?
- Wie prüfe ich QR?
- Wie helfe ich bei Login?
- Wie setze ich notfalls Onboarding zurück?
- Wie erkenne ich Storage-Probleme?

Wenn Support nur durch Raten möglich ist, ist Production nicht bereit.

---

## 19. Backup- und Recovery-Grundsatz

V1 braucht mindestens bewusstes Vorgehen:

- keine destruktiven Migrationen
- Staging zuerst
- Production vorsichtig
- wichtige Daten nicht manuell löschen
- vor riskanten Migrationen Backup/Snapshot prüfen

Später:

- automatische Backups
- Recovery Plan
- Exportfunktionen

---

## 20. Rollback-Plan

Wenn Production Release fehlerhaft ist:

1. Fehler klassifizieren.
2. Wenn kritisch: neuen Deployment-Stand zurücksetzen.
3. Supabase Migration prüfen.
4. Wenn DB-Migration nicht rollbackbar: Hotfix.
5. Restaurants informieren falls betroffen.
6. Changelog ergänzen.

### 20.1 Kritische Rollback-Gründe

- falsche Kundendaten sichtbar
- Punkte massiv falsch
- Einlösungen doppelt
- Registrierung unmöglich
- Staff Einlösung unmöglich
- RLS Problem
- QR zeigt falsches Restaurant

---

## 21. Release-Prozess

### 21.1 Vorbereitung

- Bible aktuell
- Changelog aktuell
- Build grün
- Staging grün
- Screenshots geprüft
- Migration geprüft

### 21.2 Deployment

- Cloudflare Production Deploy
- Supabase Production Migration
- Environment Variables prüfen

### 21.3 Nach Deployment

- App öffnen
- Register testen
- Login testen
- Onboarding testen
- Customer QR testen
- Bonus QR testen
- Staff Einlösung testen
- Audit prüfen

---

## 22. Erste Production-Checkliste

Vor erstem echten Restaurant:

- [ ] Production Supabase erstellt
- [ ] Production Cloudflare deployt
- [ ] Domain gesetzt
- [ ] Environment Variables korrekt
- [ ] Migrationen angewendet
- [ ] RLS geprüft
- [ ] RPCs geprüft
- [ ] Storage geprüft
- [ ] Register Flow geprüft
- [ ] Onboarding geprüft
- [ ] Starter Kit PDF geprüft
- [ ] Customer Portal geprüft
- [ ] Staff Portal geprüft
- [ ] Punkte geprüft
- [ ] Belohnung geprüft
- [ ] Bonus Boost geprüft
- [ ] Audit geprüft
- [ ] Keine Demo-Fallbacks
- [ ] Keine englischen UI-Texte
- [ ] Mobile geprüft

---

## 23. Erste Restaurant-Onboarding-Checkliste

Beim ersten echten Restaurant:

1. Account erstellen.
2. Restaurantdaten eingeben.
3. Logo hochladen.
4. Öffnungszeiten eintragen.
5. Bonus Designer abschließen.
6. Willkommens-Belohnungen wählen.
7. Starter Kit herunterladen.
8. PDF drucken.
9. QR scannen.
10. Testgast registrieren.
11. Punkte sammeln.
12. Belohnung testen.
13. Staff PIN testen.
14. Dashboard prüfen.

---

## 24. Nach Go-Live beobachten

Nach erstem Production Go-Live täglich prüfen:

- Registrierungen
- Punktebuchungen
- Einlösungen
- Fehlerlogs
- Audit
- QR Scans
- Supportfragen
- Mobile Probleme
- Storage Fehler
- Auth Fehler

---

## 25. Was nach Go-Live nicht sofort passieren darf

Nicht sofort:

- V2 starten,
- weitere Branchen starten,
- POS integrieren,
- SMS/WhatsApp einbauen,
- alle Featurewünsche bauen,
- komplexe Reports bauen,
- Multi-Branch UI bauen.

Erst:

- Production stabilisieren,
- Pilotfeedback auswerten,
- kritische Bugs fixen,
- Zahlungsbereitschaft prüfen.

---

## 26. Go-Live Erfolgskriterien

Go-Live ist erfolgreich, wenn:

1. erstes echtes Restaurant kann starten,
2. echte QR-Codes funktionieren,
3. echte Gäste können sich registrieren,
4. Punkte werden korrekt gesammelt,
5. Belohnungen können eingelöst werden,
6. Bonus Boost funktioniert,
7. keine kritischen Sicherheitsfehler,
8. Restaurantbesitzer versteht Dashboard,
9. Support kann Probleme nachvollziehen,
10. System läuft mindestens mehrere Tage stabil.

---

## 27. Go-Live Abbruchkriterien

Go-Live muss gestoppt werden, wenn:

- Kundendaten falsch sichtbar sind,
- RLS fehlerhaft,
- Punkte falsch berechnet,
- Einlösungen doppelt,
- QR zeigt falsches Restaurant,
- Registrierung blockiert,
- Staff kann nicht einlösen,
- Datenbankmigration beschädigt Daten,
- Storage nicht funktioniert,
- Restaurant kann nicht auf Portal zugreifen.

---

## 28. Codex-Regeln für Go-Live

Wenn Codex an Go-Live arbeitet:

1. Diese Datei zuerst lesen.
2. Keine neuen Features bauen.
3. Keine V2-Funktionen einbauen.
4. Staging vor Production.
5. Keine Secrets in Code.
6. Build ausführen.
7. Migrationen dokumentieren.
8. RLS/RPC prüfen.
9. Domain/QR prüfen.
10. Bei Unsicherheit: NOT READY.

---

## 29. LOCK Kriterien

Production Go-Live Plan gilt als LOCK, wenn:

- Umgebungen klar getrennt,
- Supabase Production beschrieben,
- Cloudflare Deployment beschrieben,
- Migration-Regeln beschrieben,
- Security Checks definiert,
- QR Checks definiert,
- Trial/Abo Checks definiert,
- Supportfähigkeit definiert,
- Rollback-Plan vorhanden,
- Go-Live und Abbruchkriterien vorhanden,
- Codex-Regeln klar sind.

---

## 30. Cloudflare Workers Builds Konfiguration

Die Anwendung wird als Vite-SPA gebaut und als statische Worker-Assets aus
`dist/` ausgeliefert. Die verbindliche Wrangler-Konfiguration liegt im
Repository-Root unter `wrangler.jsonc`.

Cloudflare Workers Builds muss für das verbundene GitHub-Repository so
konfiguriert sein:

```text
Produktionsbranch: main
Root-Verzeichnis: /
Build-Befehl: npm run build
Deploy-Befehl: npm run deploy
Preview-Deploy-Befehl: npm run deploy:preview
Node-Version: 22
```

Folgende Variablen müssen als Build-Variablen im Cloudflare-Dashboard gesetzt
werden, weil Vite sie während `npm run build` in das Browser-Bundle übernimmt:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_APP_BASE_URL
```

Die Werte werden nicht in `wrangler.jsonc` oder Git gespeichert. Insbesondere
dürfen `SUPABASE_ACCESS_TOKEN` und ein Supabase Service-Role-Key niemals in den
Frontend-Build gelangen. `keep_vars: true` verhindert, dass ein Wrangler-Deploy
bereits im Dashboard gepflegte Worker-Variablen entfernt.

Für React-Routen verwendet der Assets-Worker
`not_found_handling: single-page-application`. Dadurch liefern direkte Aufrufe
wie `/admin`, `/staff/...` oder `/w/...` die `index.html`, ohne eine parallele
Worker-Funktion oder ein zweites Routing-System einzuführen.

Vor einem Push kann die Konfiguration lokal geprüft werden:

```bash
npm run build
npm run deploy:check
```

Workers Builds ignoriert benutzerdefinierte Build-Konfigurationen innerhalb
der Wrangler-Datei. Build-Befehl, Branch, Root-Verzeichnis und Build-Variablen
müssen deshalb zusätzlich im Cloudflare-Build-Trigger korrekt gesetzt sein.

---

Endstatus: **LOCK**
