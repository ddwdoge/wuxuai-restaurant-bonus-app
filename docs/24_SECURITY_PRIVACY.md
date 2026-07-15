
# 24_SECURITY_PRIVACY.md

# WUXUAI Bonus V1 – Sicherheit & Datenschutz

Status: **LOCK**

Dieses Dokument beschreibt die verbindlichen Sicherheits- und Datenschutzregeln für WUXUAI Bonus V1.

WUXUAI Bonus verarbeitet Daten von Restaurants, Mitarbeitern und Gästen.  
Dadurch ist Sicherheit kein späteres Extra, sondern ein Kernbestandteil des Produkts.

Dieses Dokument ist keine Rechtsberatung.  
Es definiert technische, organisatorische und produktbezogene Mindestregeln für ein sicheres, vertrauenswürdiges SaaS-System.  
Rechtliche Dokumente wie Datenschutzerklärung, AV-Vertrag, Impressum und Vertragsbedingungen müssen vor echtem Production-Betrieb separat geprüft und erstellt werden.

---

## 1. Zweck dieses Dokuments

Dieses Dokument legt fest:

- welche Daten WUXUAI Bonus verarbeitet,
- welche Daten besonders geschützt werden müssen,
- welche Sicherheitsgrenzen gelten,
- wie Restaurantdaten getrennt werden,
- wie Kundendaten geschützt werden,
- wie Staff-Zugriffe funktionieren,
- wie öffentliche QR-Flows abgesichert werden,
- wie Tokens, PINs und Sessions behandelt werden,
- wie Audit-Logs zu führen sind,
- wie Datenminimierung in V1 umgesetzt wird,
- welche Datenschutzrisiken Codex niemals ignorieren darf.

Codex muss diese Datei lesen, bevor Auth, Rollen, RLS, RPCs, Tokens, Kundenprofile, Staff Sessions, Storage, Audit oder Public Routes geändert werden.

---

## 2. Sicherheitsgrundsatz

🟢 **FIX**

Sicherheit wird nicht nur im Frontend gelöst.

Sicherheit entsteht durch mehrere Schichten:

```text
UI
→ Auth
→ RLS
→ RPC
→ Tokenprüfung
→ Staff Session
→ Audit
→ Staging-Test
→ Production-Regeln
```

Wenn eine Schicht fehlerhaft ist, muss eine andere Schicht weiterhin Schaden begrenzen.

Frontend darf nie die einzige Sicherheitsgrenze sein.

---

## 3. Datenschutzgrundsatz

🟢 **FIX**

WUXUAI Bonus sammelt nur Daten, die für den Bonusprozess notwendig sind.

V1 folgt dem Prinzip:

```text
So wenig Daten wie möglich.
So viele Daten wie nötig.
```

Für Gäste bedeutet das:

- Vorname
- Telefonnummer
- Geburtstag optional
- Bonuspunkte
- Belohnungen
- QR-/Token-Bezug
- Aktivitätsdaten im Bonusprogramm

Nicht notwendig in V1:

- Adresse
- Nachname als Pflicht
- E-Mail als Pflicht
- Passwort
- Geschlecht
- detaillierte persönliche Profile
- Zahlungsdaten der Gäste

---

## 4. Datenkategorien

### 4.1 Restaurantdaten

Beispiele:

- Restaurantname
- Logo
- Farben
- Öffnungszeiten
- Restauranttyp
- Owner Account
- Trial-/Abo-Status
- Belohnungen
- Willkommensgeschenke
- QR-Codes
- Mitarbeiter

Diese Daten gehören zum jeweiligen Restaurant / Branch.

### 4.2 Gästedaten

Beispiele:

- Vorname
- Telefonnummer
- optional Geburtstag
- Kundencode
- Punktebalance
- Punktebuchungen
- eingelöste Belohnungen
- Willkommensgeschenk-Status
- Bonus Boost Status
- Referral-Beziehungen
- Device ID als Warnsignal

### 4.3 Mitarbeiterdaten

Beispiele:

- Mitarbeitername
- PIN Hash
- Rolle / Status
- Staff Session
- Aktionen im Audit

### 4.4 Plattformdaten

Beispiele:

- Trial Status
- Abo-Status
- Organisation / Branch
- Audit Logs
- Feature Flags
- Systemlogs
- WUXUAI Admin Daten später

---

## 5. Mandantentrennung

🟢 **FIX**

Restaurantdaten sind strikt getrennt.

Restaurant A darf niemals Daten von Restaurant B sehen.

Das gilt für:

- Gäste
- Punkte
- Belohnungen
- Willkommensgeschenke
- Staff
- Audit
- QR Tokens
- Referral Daten
- Branding
- Trial/Abo Daten

Technische Anker:

```text
restaurant_id
branch_id
organization_id
```

V1 verwendet `restaurant_id` als wichtigsten Anker.

V2 ist mit `branch_id` und `organization_id` vorbereitet.

---

## 6. RLS ist Pflicht

🟢 **FIX**

Alle sensiblen Tabellen benötigen Row Level Security.

RLS darf nicht deaktiviert werden, um einen kurzfristigen Fehler zu lösen.

Wenn eine Aktion durch RLS blockiert wird, muss die Policy korrekt repariert werden.

Verboten:

```text
alter table ... disable row level security;
```

ohne explizite CTO-Entscheidung.

---

## 7. Public Routes und Datenschutz

Öffentliche Routen sind notwendig, weil Gäste ohne Login QR-Codes scannen.

Beispiele:

```text
/customer/:restaurantSlug
/r/:restaurantSlug/:referralToken
/w/:restaurantSlug
```

Aber öffentliche Routen dürfen nicht direkt Tabellen öffnen.

🟢 **FIX**

Public Routen nutzen sichere RPCs und geben nur minimale Daten zurück.

Verboten:

- direkte öffentliche Kundentabellenabfrage,
- alle aktiven Belohnungen aller Restaurants öffentlich lesbar machen,
- vollständige Kundendatensätze an anonyme Nutzer zurückgeben,
- owner_id oder interne Restaurantdaten unnötig ausgeben,
- Customer Code als Geheimnis nutzen.

---

## 8. Auth-Regeln

### 8.1 Restaurantbesitzer

Restaurantbesitzer nutzen Supabase Auth.

Zugriff ergibt sich aus:

- Supabase Auth User
- restaurant_members
- Rolle owner/admin/manager

Nicht aus `user_metadata` als Autorität.

### 8.2 Mitarbeiter

Mitarbeiter nutzen in V1 keine volle Admin-Auth.

Sie arbeiten über:

- staff_members
- PIN Hash
- Staff Session
- operative RPCs

### 8.3 Gäste

Gäste nutzen in V1 kein Supabase Auth Konto.

Sie nutzen:

- Customer Token
- QR-Link
- restaurantspezifisches Kundenportal

### 8.4 WUXUAI Admin

WUXUAI Admin ist V2/interner Bereich.

Darf nicht mit Restaurantrollen vermischt werden.

---

## 9. Rollenregeln

🟢 **FIX**

Missing Role darf niemals Owner sein.

Früherer Fehler:

```text
fehlende Rolle → owner
```

ist verboten.

Korrekt:

```text
fehlende Rolle → null / customer / nicht autorisiert
```

Privilegierte UI darf erst nach verifizierter Rolle sichtbar werden.

---

## 10. user_metadata-Regel

🟢 **FIX**

`user_metadata` ist keine vertrauenswürdige Quelle für Rechte.

Warum?

Der User kann Teile von `user_metadata` selbst ändern.

Rollenentscheidung nur über:

- restaurant_members,
- sichere serverseitige Prüfung,
- app_metadata nur vorsichtig und sekundär,
- WUXUAI Admin Rollen später über eigene sichere Struktur.

Codex darf keine neue Admin-Logik auf `user_metadata.role` aufbauen.

---

## 11. Customer Token Sicherheit

### 11.1 Grundregel

Der Zugriff auf ein Kundenkonto erfolgt über sichere Tokens.

Nicht über Telefonnummer allein.  
Nicht über Customer Code allein.

### 11.2 Customer Code

Customer Code darf sichtbar sein.

Er dient:

- Suche
- Anzeige
- Support
- Staff Hilfe

Er ist kein Geheimnis.

### 11.3 Token-Regeln

Customer Tokens:

- zufällig
- nicht erratbar
- restaurantgebunden
- widerrufbar
- rotierbar
- hashbar, wenn möglich

### 11.4 Token Storage

Im Browser kann Token gespeichert werden.

Aber:

- restaurantspezifisch,
- nicht tenantübergreifend,
- nicht für fremde Restaurants nutzbar,
- optional später mit Ablauf/Rotation.

---

## 12. Referral Token Sicherheit

Referral Tokens müssen sicher sein.

Regeln:

- zufällig
- nicht aus Kunden-ID ableiten
- nicht erratbar
- restaurantgebunden
- Hash speichern, wenn möglich

Referral Token darf nicht ermöglichen:

- fremde Kundendaten zu sehen,
- Referral mehrfach zu aktivieren,
- Self-Referral,
- A↔B Zirkel.

---

## 13. Staff PIN Sicherheit

### 13.1 PIN niemals im Klartext speichern

PIN wird gehasht.

Beispiel:

```text
pin_hash
```

Nicht:

```text
pin
```

### 13.2 Staff Session

Nach PIN-Validierung wird eine kurzlebige Staff Session erzeugt.

Operative Aktionen nutzen Staff Session.

### 13.3 Roh-PIN nicht dauerhaft übertragen

Roh-PIN soll nicht bei jeder Folgeaktion erneut übertragen werden.

### 13.4 Staff Rechte

Staff darf:

- Gast suchen,
- QR prüfen,
- Belohnung einlösen,
- operative Aktionen durchführen.

Staff darf nicht:

- Einstellungen ändern,
- Bonusregeln ändern,
- Abo sehen,
- Restaurantdaten bearbeiten,
- andere Restaurants sehen.

---

## 14. Service Role Verbot

🟢 **FIX**

Service Role Key darf niemals im Frontend sein.

Verboten:

- Service Role in `.env.local` für Vite Frontend,
- Service Role in Cloudflare Public Env,
- Service Role in GitHub,
- Service Role in Markdown,
- Service Role in Browser Logs.

Service Role nur:

- serverseitig,
- Edge Functions,
- sichere Adminprozesse,
- nie im Client.

---

## 15. API Keys und Secrets

### 15.1 Erlaubt im Frontend

- Supabase Project URL
- Publishable/Anon Key

### 15.2 Nicht erlaubt im Frontend

- Supabase Service Role
- Supabase Access Token
- Datenbank Passwort
- direkte DB URL
- Stripe Secret Key
- Stripe Webhook Secret
- private API Keys

### 15.3 Git-Regel

`.env.local` muss ignoriert bleiben.

Secrets niemals committen.

Wenn Secret versehentlich geteilt wurde:

- sofort rotieren,
- nicht weiterverwenden,
- Changelog/Notiz, falls relevant.

---

## 16. Punkte-Sicherheit

### 16.1 Server ist Wahrheit

Punkte werden serverseitig berechnet.

Frontend darf keine Punkte endgültig bestimmen.

### 16.2 Keine freie Punkte-Eingabe

Restaurantbesitzer gibt keine Punkte manuell ein.

Gast gibt keine Punkte ein.

### 16.3 Flow 04

Gast wählt Rechnungsbereich.

Server berechnet:

- Basispunkte,
- Bonus Boost,
- finale Punkte,
- Trigger für Welcome Gift/Referral.

### 16.4 Audit

Jede Punktebewegung wird protokolliert.

---

## 17. Belohnungs-Einlösung Sicherheit

### 17.1 Kunde darf nicht final einlösen

Gast darf Belohnung zeigen.

Finale Einlösung erfolgt durch Staff / Restaurant.

### 17.2 Atomare Einlösung

Serverseitig atomar:

- Status prüfen,
- Punkte prüfen,
- Row Locking,
- Punkte abziehen,
- Redemption schreiben,
- Audit schreiben.

### 17.3 Doppelte Einlösung verhindern

Status und Locks müssen doppelte Einlösung verhindern.

---

## 18. Willkommensgeschenk Sicherheit

### 18.1 Nicht sofort freischalten

Willkommensgeschenk wird nach Registrierung zugeteilt, aber gesperrt.

### 18.2 Freischaltung

Erst nach erster bezahlter Konsumation / Punktebuchung.

### 18.3 Einlösung

Erst beim nächsten Besuch.

### 18.4 Referral Vorrang

Referral-Gast bekommt kein Willkommensgeschenk.

### 18.5 Wirtschaftlichkeit

Teure Kategorien seltener.

Tageslimits vorbereitet.

---

## 19. Bonus Boost Sicherheit

### 19.1 Aktivierung erst nach echter Konsumation

Bonus Boost wird erst aktiviert, wenn eingeladener Freund Punkte sammelt.

### 19.2 Kein Self-Referral

Gast kann sich nicht selbst einladen.

### 19.3 Kein A↔B Zirkel

A lädt B ein.

B darf A nicht als neuen Freund einladen.

### 19.4 Kein Multiplikator-Stacking

Mehr Freunde verlängern Dauer.

Sie erhöhen nicht den Multiplikator.

### 19.5 Audit

Jede Aktivierung wird protokolliert.

---

## 20. Device ID Datenschutz

### 20.1 Keine echte Hardware-ID

Die Web-App kann keine echte MAC-Adresse nutzen und soll keine Hardware-Fingerprinting-Methoden verwenden.

### 20.2 Web Device ID

Zulässig:

- zufällige UUID
- localStorage / IndexedDB
- nur Anti-Abuse-Signal

### 20.3 Keine harte Sperre

Device ID darf nicht allein harte Sperre sein.

Warum?

- Browserdaten löschbar
- Familiengeräte möglich
- gemeinsam genutzte Geräte möglich

### 20.4 Nutzung

Device ID kann in Audit/Warnings helfen:

- viele Konten auf gleichem Gerät,
- viele Referrals,
- ungewöhnliche Aktivität.

---

## 21. Audit Datenschutz

Audit ist notwendig, darf aber nicht zu viel speichern.

### 21.1 Speichern

Erlaubt:

- actor_type
- actor_id
- action
- target
- points
- reward_id
- restaurant_id
- branch_id
- status changes
- technische Metadaten ohne Secrets

### 21.2 Nicht speichern

Verboten:

- PINs
- PIN Hashes
- Tokens im Klartext
- Passwörter
- Secret Keys
- komplette private Payloads
- Zahlungsdaten

### 21.3 Zweckbindung

Audit dient:

- Sicherheit
- Nachvollziehbarkeit
- Support
- Missbrauchserkennung
- Fehleranalyse

Nicht für unnötige Überwachung.

---

## 22. Storage Datenschutz

### 22.1 Public Read

Restaurantlogos und Belohnungsbilder können öffentlich lesbar sein, wenn sie im Kundenportal oder Starter Kit erscheinen.

### 22.2 Uploadrechte

Nur Owner/Admin des Restaurants darf in eigenen Restaurantordner schreiben.

Pfad:

```text
restaurant-media/{restaurant_id}/...
```

### 22.3 Dateibeschränkung

V1:

- max 5 MB
- erlaubte Typen begrenzen
- keine beliebigen Dateien

### 22.4 Kein fremder Pfad

Restaurant A darf nicht in Pfad von Restaurant B schreiben.

---

## 23. Datenschutz im Kundenportal

Das Kundenportal zeigt nur das, was der Gast braucht:

- eigenes Bonuskonto,
- eigene Punkte,
- eigene Belohnungen,
- eigene QR-Daten,
- eigenes Willkommensgeschenk,
- eigener Bonus Boost.

Nicht anzeigen:

- andere Gäste,
- interne Restaurantdaten,
- Staffdaten,
- Admininformationen,
- Auditdaten,
- technische Tokenhashes.

---

## 24. Datenschutz im Staff Portal

Staff Portal zeigt nur operative Daten.

Erlaubt:

- Gastname,
- Kundencode,
- Punkte,
- einlösbare Belohnungen,
- Willkommensgeschenkstatus,
- Bonus Boost Status falls hilfreich.

Nicht erlaubt:

- vollständige Kundendaten,
- private Historien ohne Zweck,
- andere Restaurants,
- Abo,
- Owner-Daten,
- interne Logs.

---

## 25. Datenschutz im Restaurant Portal

Restaurantbesitzer sieht Gäste seines Restaurants.

Er darf nicht sehen:

- Gäste anderer Restaurants,
- interne WUXUAI Admin Daten,
- System-Secrets,
- Tokens im Klartext,
- PIN Hashes.

Restaurantportal muss jedoch genug zeigen für:

- Kundenbindung,
- Punkte,
- Belohnungen,
- Support im eigenen Betrieb.

---

## 26. DSGVO-/Rechts-Hinweis

Dieses Dokument ersetzt keine Rechtsberatung.

Vor Production sollten separat geprüft/erstellt werden:

- Datenschutzerklärung,
- Impressum,
- AV-Vertrag / Auftragsverarbeitung,
- Nutzungsbedingungen,
- Löschkonzept,
- Auskunftsprozess,
- Datenexportprozess,
- Cookie-/Tracking-Hinweise falls nötig.

Codex darf keine endgültigen Rechtstexte erfinden.

---

## 27. Datenlöschung und Deaktivierung

V1 Mindestregel:

- Daten nicht ohne bewusste Entscheidung löschen.
- Kündigung löscht Daten nicht sofort.
- Trial-Ende löscht Daten nicht sofort.
- Deaktivierung blockiert Nutzung, nicht zwingend Daten.

V2:

- Löschfristen,
- Export,
- Kundenlöschung,
- Restaurantlöschung,
- rechtliche Prozesse.

---

## 28. Zugriff durch WUXUAI

WUXUAI Admin Zugriff muss später streng geregelt werden.

Grundregel:

WUXUAI darf nicht ohne Grund Kundendaten durchsuchen.

Zugriffe müssen:

- zweckgebunden,
- protokolliert,
- minimal,
- supportbezogen sein.

V1 kann operativ noch einfacher sein, aber Architektur muss Audit vorbereiten.

---

## 29. Fehlertexte und Sicherheit

Technische Fehler dürfen nicht an Nutzer ausgespielt werden.

Falsch:

```text
new row violates row-level security policy
```

Richtig:

```text
Das hat gerade nicht funktioniert.
Bitte versuche es erneut.
```

Technischer Fehler darf im Entwicklerlog stehen.

---

## 30. Staging und Production Datenschutz

### 30.1 Staging

Staging kann Testdaten enthalten.

Wenn echte Daten genutzt werden:

- bewusst,
- minimiert,
- nicht öffentlich,
- nicht mit Production vermischen.

### 30.2 Production

Production enthält echte Daten.

Keine Tests mit Fake-Migrationen.

Keine Debug-Dumps.

Keine Testdaten-Leaks.

---

## 31. Backup und Recovery

V1 Grundregeln:

- keine destruktiven Migrationen,
- Staging zuerst,
- vor riskanten Production-Änderungen Backup/Snapshot prüfen,
- keine manuelle Löschung ohne Dokumentation.

V2:

- Recovery Plan,
- automatische Backups,
- Datenexport,
- Löschkonzepte.

---

## 32. Security Check vor Go-Live

Vor Production prüfen:

- RLS aktiv,
- Public RPCs sicher,
- keine Kundentabellen öffentlich,
- Service Role nicht im Frontend,
- Auth Rollen sicher,
- Staff Sessions sicher,
- Customer Tokens sicher,
- Storage Policies korrekt,
- Punkte serverseitig,
- Einlösung atomar,
- Audit aktiv,
- Demo-Fallbacks entfernt.

---

## 33. Missbrauchsszenarien

### 33.1 Mehrfachregistrierung

Schutz:

- Telefonnummer eindeutig pro Restaurant,
- Device ID Warnsignal,
- Audit.

### 33.2 Fake-Referral

Schutz:

- Referral erst nach Punktebuchung aktiv,
- kein Self-Referral,
- kein A↔B,
- Telefonnummer prüfen.

### 33.3 Zu viele Punkte

Schutz:

- Rechnungsbereiche,
- keine freie Eingabe,
- Wiederholungslimit,
- Audit.

### 33.4 Doppelte Einlösung

Schutz:

- serverseitige Statusprüfung,
- Row Locking,
- Staff Session,
- Audit.

### 33.5 Fremde Restaurantdaten

Schutz:

- RLS,
- restaurant_id,
- branch_id,
- token match,
- membership check.

---

## 34. Sicherheitsprioritäten

### Kritisch

- fremde Kundendaten sichtbar,
- RLS kaputt,
- Service Role im Frontend,
- Punkte massiv manipulierbar,
- Belohnung mehrfach einlösbar,
- Auth-Bypass.

### Hoch

- Staff kann ohne Session einlösen,
- Referral aktiviert ohne Konsumation,
- Welcome Gift sofort einlösbar,
- Storage fremder Pfad beschreibbar.

### Mittel

- Device ID leicht umgehbar,
- Fehlermeldungen zu technisch,
- Demo-Daten sichtbar,
- unklare Datenschutzhinweise.

### Niedrig

- kleinere UI-Sicherheitskommunikation,
- kosmetische Datenschutztexte.

---

## 35. Was ausdrücklich verboten ist

Verboten:

- Service Role im Frontend,
- user_metadata als Rollenquelle,
- Public Select auf customers,
- Public Select auf alle active rewards,
- Customer Code als Geheimnis,
- PIN im Klartext,
- Token Hash zurückgeben,
- Punkte clientseitig vertrauen,
- Belohnung ohne Staff final einlösen,
- Willkommensgeschenk sofort freischalten,
- Referral Bonus ohne Konsumation,
- Demo-Fallback in Production,
- technische Fehlertexte für Nutzer,
- Secrets in Markdown/Git,
- Production als Testumgebung.

---

## 36. V2 Hinweise

V2 kann enthalten:

- vollständiges Datenschutz-Dashboard,
- Kunden-Datenexport,
- Kunden-Löschanfrage,
- Restaurant-Datenexport,
- WUXUAI Admin Audit UI,
- Missbrauchs-Dashboard,
- Rate Limits,
- IP-basierte Schutzsignale,
- Sentry/Monitoring,
- Security Review Prozess,
- AV-Vertrag Workflow,
- Enterprise Datenschutzfunktionen.

V1 konzentriert sich auf sichere Grundarchitektur.

---

## 37. LOCK Kriterien

Security & Privacy gilt als LOCK, wenn:

- Datenminimierung dokumentiert,
- Tenant-Isolation dokumentiert,
- RLS-Pflicht dokumentiert,
- Public RPC Regeln dokumentiert,
- Auth-Regeln dokumentiert,
- Token-Regeln dokumentiert,
- Staff Session Regeln dokumentiert,
- Audit Datenschutz dokumentiert,
- Storage Regeln dokumentiert,
- Go-Live Security Check dokumentiert,
- Verbote klar sind,
- V2 Datenschutzthemen getrennt sind.

---

## 38. Codex-Regeln

Wenn Codex an Sicherheit oder Datenschutz arbeitet:

1. Diese Datei zuerst lesen.
2. Keine Secrets ins Frontend.
3. Keine Public Kundentabellen.
4. Keine Rollen aus user_metadata.
5. RLS nicht abschalten.
6. Tokens nie im Klartext speichern, wenn Hash möglich.
7. PINs nie im Klartext speichern.
8. Audit ohne Secrets.
9. Nutzerfreundliche Fehlermeldungen.
10. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
## Ergänzung 2026-07-14: PIN- und Codeschutz

- Tages-PIN ist nur über eine berechtigte Restaurant-/Mitarbeiteransicht lesbar und nie Teil öffentlicher Kundenantworten.
- Falsche Tages-PIN-Versuche werden serverseitig begrenzt und auditiert.
- Einlösecodes werden nur als SHA-256-Hash gespeichert; der Klartext wird nur einmal an den bestätigenden Gast zurückgegeben.
- Einlösecodes sind sechs Ziffern lang, 15 Minuten gültig und nur einmal verwendbar.
- Aktivierung und Verbrauch werden auditiert und mandantenbezogen geprüft.
- Öffentliche Zugriffe erhalten keine direkten Tabellenrechte auf Code-, Versuch- oder Geschenkprotokolle.
