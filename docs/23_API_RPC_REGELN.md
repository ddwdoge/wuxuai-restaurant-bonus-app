
# 23_API_RPC_REGELN.md

# WUXUAI Bonus V1 – API- und RPC-Regeln

Status: **LOCK**

Dieses Dokument beschreibt die verbindlichen API- und RPC-Regeln für WUXUAI Bonus V1.

WUXUAI Bonus nutzt Supabase, PostgreSQL, RLS und RPCs.  
Die API- und RPC-Schicht ist nicht nur technische Verbindung zwischen Frontend und Datenbank.  
Sie ist die **Sicherheits-, Validierungs- und Geschäftslogikschicht** des Systems.

Alles, was Punkte, Belohnungen, Willkommensgeschenke, Bonus Boost, Staff Sessions, Kundentokens, Trial-Start oder öffentliche Kundenrouten betrifft, darf nicht nur im Frontend entschieden werden.

---

## 1. Zweck dieses Dokuments

Dieses Dokument legt fest:

- welche Logik über RPC laufen muss,
- welche Logik niemals nur im Frontend liegen darf,
- wie öffentliche Routen abgesichert werden,
- wie Staff Sessions geprüft werden,
- wie Punkte serverseitig berechnet werden,
- wie Belohnungen sicher eingelöst werden,
- wie Willkommensgeschenke korrekt zugeteilt und freigeschaltet werden,
- wie Bonus Boost aktiviert wird,
- wie Trial-Start funktioniert,
- wie RLS, Grants und SECURITY DEFINER sauber verwendet werden,
- welche Fehler Codex niemals wiederholen darf.

Codex muss diese Datei lesen, bevor API-, RPC-, Supabase- oder Datenbanklogik geändert wird.

---

## 2. Grundprinzip

🟢 **FIX**

Frontend zeigt die Oberfläche.

Backend / RPC entscheidet die Wahrheit.

Das bedeutet:

Frontend darf:
- Formulare anzeigen,
- QR scannen,
- Tokens übergeben,
- Erfolg anzeigen,
- Fehlermeldungen menschenfreundlich anzeigen,
- lokale Vorschauen erzeugen.

Frontend darf nicht:
- Punkte endgültig berechnen,
- Belohnungen endgültig einlösen,
- Bonus Boost aktivieren,
- Willkommensgeschenke freischalten,
- Restaurantzugehörigkeit ungeprüft annehmen,
- Staff-Rechte simulieren,
- Subscription-Status nur clientseitig setzen.

---

## 3. Public API Grundregel

🟢 **FIX**

Öffentliche Kundenrouten dürfen keine Tabellen direkt lesen.

Öffentliche Routen verwenden sichere RPCs.

Beispiele öffentlicher Routen:

```text
/customer/:restaurantSlug
/r/:restaurantSlug/:referralToken
/w/:restaurantSlug
```

Diese Routen dürfen nicht direkt:

```text
select * from customers
select * from rewards
select * from restaurants
```

verwenden, wenn dadurch Mandantendaten offengelegt werden.

---

## 4. Warum direkte Public Selects verboten sind

Direkte Public Selects führen leicht zu Datenlecks.

Beispielproblem:

```text
anon darf alle active rewards sehen
```

Dann könnte ein Konkurrent alle aktiven Belohnungen aller Restaurants auslesen.

Oder:

```text
anon darf customers nach phone matchen
```

Dann entstehen PII-Leaks.

Deshalb gilt:

```text
Public Zugriff = slug/token-basierte RPC
```

Nicht:

```text
Public Zugriff = direkte Tabellenfreigabe
```

---

## 5. RLS und RPC Zusammenspiel

RLS ist Pflicht.

RPCs sind zusätzliche Geschäftslogik.

### 5.1 RLS

RLS schützt Zeilen.

Beispiel:

- Restaurant A sieht nur Restaurant A.
- Restaurant B sieht nur Restaurant B.
- Kunde sieht nur eigenes Kundenportal über Token/RPC.
- Staff greift nicht direkt breit auf Tabellen zu.

### 5.2 RPC

RPC prüft Prozesse.

Beispiel:

- Darf dieser Gast Punkte sammeln?
- Ist dieser Token gültig?
- Ist diese Belohnung freigeschaltet?
- Ist diese Staff Session gültig?
- Ist Referral noch pending?
- Muss Bonus Boost aktiviert werden?
- Muss Willkommensgeschenk freigeschaltet werden?

RLS allein reicht für Businessprozesse nicht.

---

## 6. SECURITY DEFINER Regeln

Wenn eine RPC als `SECURITY DEFINER` geschrieben wird, gelten strenge Regeln.

### 6.1 search_path setzen

Pflicht:

```sql
set search_path = public, extensions
```

oder explizit sichere Variante passend zur Migration.

Warum?

Sonst können Funktionen unbeabsichtigt falsche Tabellen/Funktionen auflösen.

### 6.2 Extensions explizit referenzieren

Bei Extension-Funktionen:

```sql
extensions.crypt
extensions.gen_salt
extensions.digest
extensions.gen_random_bytes
```

Nicht unqualifiziert nutzen, wenn search_path Probleme entstehen können.

### 6.3 Grants bewusst setzen

Nie auf Default verlassen.

Regel:

1. `REVOKE EXECUTE FROM PUBLIC`
2. gezielt `GRANT EXECUTE`

Beispiele:

- öffentliche Registrierung: `anon` erlaubt, aber nur sichere RPC
- Staff-Aktion: nur `authenticated`
- interne Admin-Aktion: nur sichere Rollen / serverseitig

### 6.4 Keine geheimen Daten zurückgeben

SECURITY DEFINER RPCs dürfen niemals zurückgeben:

- PIN Hash
- Token Hash
- Service Secrets
- private Kundendaten ohne Notwendigkeit
- vollständige Kundendatensätze an anon
- owner_id in Public Payloads, wenn nicht nötig

---

## 7. Pflicht-RPCs und Verantwortlichkeiten

Die folgenden RPCs oder Funktionsgruppen sind zentrale Systemprozesse.

### 7.1 start_restaurant_owner_trial

Zweck:

- neuen Restaurant Owner mit Trial starten
- Restaurant erzeugen
- Organisation/Branch erzeugen
- Membership owner setzen
- branch_subscriptions erzeugen
- Audit schreiben

Pflichten:

- auth.uid() verwenden
- keine user_metadata Rolle vertrauen
- branch_subscriptions per Insert/Upsert sicherstellen
- subscription_record darf nicht NULL sein
- keine doppelten Restaurants durch normalen Flow
- 30 Tage Trial setzen
- keine Kreditkarte verlangen
- Audit schreiben

### 7.2 register_restaurant_customer

Zweck:

- neuen Gast über Restaurant QR registrieren
- Restaurant per Slug erkennen
- Kundendaten minimal speichern
- Kundentoken ausgeben
- Willkommensgeschenk zuteilen, aber gesperrt

Pflichten:

- keine Passwortlogik
- keine SMS/WhatsApp
- phone pro Restaurant prüfen
- keine vollständigen Kundendaten bei bestehender Telefonnummer an anon zurückgeben
- Token sicher erzeugen
- Willkommensgeschenk nur bei normaler Registrierung
- Referral Vorrang beachten, falls Route/Service gemeinsam genutzt wird
- Audit schreiben

### 7.3 register_referral_customer / referral registration

Zweck:

- eingeladenen Freund registrieren
- Referral-Beziehung speichern
- kein Willkommensgeschenk zuteilen
- Bonus Boost noch nicht aktivieren

Pflichten:

- Referral Token prüfen
- Self-Referral blockieren
- A↔B Zirkel blockieren
- gleiche Telefonnummer-Regel prüfen
- Referral Status pending setzen
- kein Welcome Gift
- Audit schreiben

### 7.4 get_public_customer_portal

Zweck:

- Kundenportal sicher laden
- Restaurant per Slug erkennen
- Customer Token prüfen
- sichere Kundendaten zurückgeben

Pflichten:

- keine Direkt-Tabelle für anon
- Token Hash prüfen
- restaurant_id match prüfen
- nur notwendige Felder zurückgeben
- Belohnungen gefiltert zurückgeben
- Willkommensgeschenk-Status korrekt zurückgeben
- Bonus Boost korrekt zurückgeben
- keine fremden Kundendaten

### 7.5 collect_bonus_points

Zweck:

- Punkte sammeln über Bonus QR
- Rechnungsbereich validieren
- Punkte serverseitig berechnen
- Bonus Boost anwenden
- erste Punktebuchung verarbeiten
- Willkommensgeschenk freischalten
- Referral aktivieren
- Audit schreiben

Pflichten:

- kein freier Betrag
- keine Punkte aus Frontend übernehmen
- amount tier serverseitig prüfen
- Customer Token prüfen
- Restaurant/Branch prüfen
- Repeat Limit prüfen
- Basispunkte berechnen
- aktiven Bonus Boost prüfen
- finale Punkte berechnen
- points_transactions schreiben
- Willkommensgeschenk freischalten, wenn normale Registrierung
- Referral aktivieren, wenn Referral pending
- Bonus Boost für beide setzen
- Audit schreiben

### 7.6 redeem_reward_with_staff_session

Zweck:

- Punkte-Belohnung oder Willkommensgeschenk sicher einlösen
- Staff Session prüfen
- Einlösung atomar durchführen

Pflichten:

- Staff Session gültig
- Restaurant passt
- Kunde passt
- Reward/Gift passt
- aktiv
- freigeschaltet
- nicht bereits eingelöst
- nicht abgelaufen
- bei Punkte-Belohnung genug Punkte
- Row Locking
- Punkteabzug falls nötig
- Redemption schreiben
- Audit schreiben

### 7.7 resolve_customer_qr_token

Zweck:

- Staff kann Kunden über QR finden

Pflichten:

- Token prüfen
- Restaurant match
- nur Staff/Restaurant-Kontext
- keine fremden Daten

### 7.8 validate_staff_pin / create_staff_session

Zweck:

- PIN prüfen
- kurzlebige Staff Session erzeugen

Pflichten:

- PIN Hash vergleichen
- Rate Limit / Lockout vorbereitet
- kein Roh-PIN speichern
- Token hash speichern
- Ablaufzeit setzen
- Staff aktiv prüfen
- Restaurant match
- Audit optional

---

## 8. Öffentliche Payload Regeln

Public RPCs dürfen nur sichere Felder liefern.

### 8.1 Restaurant Public Payload

Erlaubt:

- Restaurantname
- Slug
- Logo URL
- Farben
- öffentliche Öffnungszeiten falls nötig
- öffentliche Bonusinformationen

Nicht erlauben:

- owner_id
- interne IDs, falls nicht nötig
- Billingdaten
- private Telefonnummern
- interne Statusdetails
- vollständige Restaurantzeile

### 8.2 Customer Public Payload

Erlaubt:

- Vorname
- Punkte
- QR Token Anzeige / public code falls nötig
- Belohnungsstatus
- Bonus Boost Status
- Willkommensgeschenk-Status

Nicht erlauben:

- interne Token Hashes
- vollständige Kundenzeile
- andere Kunden
- Auditdaten
- private Systemmetadaten

---

## 9. Fehlerbehandlung

RPCs dürfen technische Fehler intern auslösen, aber Frontend zeigt freundliche deutsche Texte.

### 9.1 Nicht anzeigen

Nicht anzeigen:

```text
new row violates row-level security policy
function does not exist
invalid input syntax
duplicate key value violates unique constraint
permission denied for table
```

### 9.2 Anzeigen

Beispiele:

```text
Das hat gerade nicht funktioniert.
Bitte versuche es erneut.
```

```text
Diese Belohnung wurde bereits eingelöst.
```

```text
Du hast gerade erst Punkte gesammelt.
Bitte warte kurz.
```

```text
Bitte melde dich erneut an.
```

### 9.3 Logging

Technische Details dürfen in Konsole / Logs / Audit für Entwickler sichtbar sein, aber nicht im Nutzertext.

---

## 10. Idempotenz und doppelte Aktionen

Viele Aktionen können doppelt ausgelöst werden:

- Nutzer klickt doppelt
- Netzwerk wiederholt Request
- Browser lädt neu
- Staff klickt zweimal
- Webhook kommt doppelt

RPCs müssen idempotent oder eindeutig geschützt sein.

### 10.1 Punkte sammeln

V1 nutzt Wiederholungssperre.

Später:

- idempotency_key
- bill_id
- signed receipt

### 10.2 Belohnung einlösen

Muss doppelte Einlösung durch Row Locking und Statusprüfung verhindern.

### 10.3 Referral aktivieren

Referral darf nur einmal aktiviert werden.

### 10.4 Stripe Webhooks

Später: Event ID speichern, doppelte Webhooks ignorieren.

---

## 11. Row Locking

Bei kritischen Schreibaktionen muss Row Locking genutzt werden.

Pflichtfälle:

- Punktebalance ändern
- Belohnung einlösen
- Referral aktivieren
- Bonus Boost verlängern
- Willkommensgeschenk freischalten
- Staff Session validieren falls nötig

Ziel:

Keine Race Conditions.

---

## 12. Audit-Regeln für RPCs

Jede kritische RPC schreibt Audit.

Audit enthält:

- restaurant_id
- organization_id falls vorhanden
- branch_id
- actor_type
- actor_id
- action
- target_table
- target_id
- metadata
- created_at

### 12.1 Keine sensiblen Daten

Audit darf nicht speichern:

- PIN
- PIN Hash
- Token im Klartext
- Secret Keys
- Passwortdaten
- vollständige private Payloads

### 12.2 Gute Audit-Metadaten

Erlaubt:

- amount_tier
- base_points
- multiplier
- final_points
- reward_id
- welcome_gift_id
- referral_id
- source
- device_id
- status change

---

## 13. Tenant-Isolation

Jede RPC muss Tenant-Isolation aktiv prüfen.

Nicht annehmen, dass Slug allein reicht.

Prüfen:

- restaurant_id
- branch_id
- organization_id, wenn relevant
- customer_id gehört zu restaurant_id
- reward_id gehört zu restaurant_id
- staff_member_id gehört zu restaurant_id
- token gehört zu restaurant_id

Wenn nicht:

Fehler.

---

## 14. Branch- und Organisation-Kompatibilität

V1 arbeitet mit restaurant_id.

V2 vorbereitet mit branch_id und organization_id.

RPCs müssen bei neuen Inserts nach Möglichkeit setzen:

- restaurant_id
- branch_id
- organization_id

Wenn Branch/Org noch nicht im Frontend vorhanden sind, muss DB/Trigger ergänzen.

Keine neue RPC darf nur restaurant_id schreiben, wenn branch_id Pflicht ist.

---

## 15. Token-Regeln

### 15.1 Customer Token

- zufällig
- nicht erratbar
- hash speichern, wenn möglich
- restaurantgebunden
- rotierbar
- widerrufbar

### 15.2 Referral Token

- zufällig
- nicht erratbar
- hash speichern
- restaurantgebunden
- nicht aus Kunden-ID ableiten

### 15.3 Staff Session Token

- zufällig
- hash speichern
- kurzlebig
- widerrufbar
- restaurant/staff gebunden

### 15.4 Nie im Klartext speichern

Tokens im Klartext nur beim Erzeugen zurückgeben, wenn nötig.

Danach nur Hash.

---

## 16. Rate Limits und Schutz

V1 Schutzmechanismen:

- Telefonnummer eindeutig pro Restaurant
- Device ID als Warnsignal
- Wiederholungssperre bei Punktebuchung
- Staff PIN Session
- Referral-Regeln
- Audit

V2:

- serverseitige Rate Limits
- IP-basierte Prüfung
- Admin-Warnungen
- Abuse Dashboard

Codex darf V1 nicht mit harter Device-ID-Sperre überbauen.

---

## 17. Auth und Rollen

### 17.1 Restaurant Owner/Admin

Zugriff über:

- Supabase Auth User
- restaurant_members
- Rolle owner/admin/manager

Nicht über user_metadata als Autorität.

### 17.2 Staff

Operativer Zugriff über staff_members und staff_sessions.

### 17.3 Customer

Kein Supabase Auth in V1.

Kunden nutzen tokenisiertes Kundenportal.

### 17.4 WUXUAI Admin

V2 eigener Rollenbereich.

Nicht mit Restaurantrollen vermischen.

---

## 18. API-Namenskonventionen

RPC-Namen sollen klar und sprechend sein.

Beispiele:

- `register_restaurant_customer`
- `get_public_customer_portal`
- `collect_bonus_points`
- `redeem_reward_with_staff_session`
- `start_restaurant_owner_trial`
- `resolve_customer_qr_token`

Vermeiden:

- generische Namen wie `do_action`
- technisch unklare Namen
- englische UI-Begriffe als sichtbarer Text

Datenbank-/Funktionsnamen können Englisch bleiben.

UI bleibt Deutsch.

---

## 19. API-Versionierung

V1 kann ohne explizite API-Version starten.

Aber bei späteren externen Integrationen:

- POS-QR
- Partner
- Enterprise
- Mobile App

muss Versionierung vorbereitet werden.

Beispiel:

```text
/api/v1/...
```

oder RPC-Namensversionierung, wenn nötig.

V1 intern noch nicht zwingend.

---

## 20. Performance-Regeln

RPCs für Kundenrouten müssen schnell sein.

Kundenportal darf nicht:

- alle Kunden laden
- alle Rewards aller Restaurants laden
- große Admin-Daten laden
- Staff-Daten laden

Staff Suche darf nicht dauerhaft komplette Kundenliste laden, wenn Daten wachsen.

V2:

- serverseitige Suche
- Pagination
- Limits
- Indizes

---

## 21. Indizes für RPCs

Wichtige Felder brauchen Indizes:

- restaurant_id
- slug
- phone
- customer_id
- token_hash
- referral_token_hash
- staff_session token_hash
- active_until
- status
- created_at
- branch_id
- organization_id

Codex muss bei neuen RPCs prüfen, ob passende Indizes nötig sind.

---

## 22. Storage API Regeln

Uploads laufen über Supabase Storage.

Regeln:

- Bucket `restaurant-media`
- Pfad enthält restaurant_id
- Owner/Admin darf schreiben
- Public Read für Kundenbilder/Logos möglich
- Max 5 MB
- erlaubte MIME Types prüfen
- Fehler freundlich anzeigen

Uploads für Kunden dürfen nicht in fremde Restaurantpfade schreiben.

---

## 23. Stripe API Regeln

Stripe ist V2/Go-Live.

Regeln:

- keine Secret Keys im Frontend
- Checkout serverseitig/Edge Function
- Webhooks serverseitig
- Signaturprüfung
- Idempotenz
- Status in branch_subscriptions synchronisieren
- Staging Test Keys getrennt von Live Keys

---

## 24. Was ausdrücklich verboten ist

Verboten:

- Punkte im Frontend als Wahrheit berechnen
- Belohnungseinlösung ohne RPC
- Public Tabellenreads auf Kunden
- Customer Code als Geheimnis
- user_metadata Rollen vertrauen
- Service Role im Browser
- RPC ohne search_path bei SECURITY DEFINER
- EXECUTE Grants unbewusst offen lassen
- vollständige Kundendatensätze an anon zurückgeben
- Token Hashes zurückgeben
- Staff PIN im Klartext speichern
- Aktionen durch generische API ersetzen
- V2 POS-API ungefragt bauen
- englische UI-Fehlertexte

---

## 25. V2 Hinweise

V2 kann API/RPC erweitern für:

- POS-QR
- signierte Rechnungsbeträge
- externe POS-Partner
- WUXUAI Admin API
- Stripe Webhooks
- Multi-Branch APIs
- Wochenplan APIs
- Notification APIs
- Analytics APIs
- Feature Flag APIs

V1 bleibt intern und Supabase-basiert.

---

## 26. LOCK Kriterien

API/RPC Schicht gilt als LOCK, wenn:

- public Routen nur sichere RPCs nutzen
- keine Public Datenlecks
- Punkte serverseitig berechnet werden
- Einlösung atomar ist
- Staff Session geprüft wird
- Tokens sicher sind
- Referral-Regeln serverseitig sind
- Willkommensgeschenke serverseitig sind
- RLS aktiv ist
- Grants bewusst gesetzt sind
- Audit geschrieben wird
- Build und Staging Tests erfolgreich sind

---

## 27. Codex-Regeln

Wenn Codex an API/RPC arbeitet:

1. Diese Datei zuerst lesen.
2. Keine Tabellen öffentlich öffnen.
3. Keine Punkte clientseitig vertrauen.
4. RPCs mit Tenant-Prüfung bauen.
5. SECURITY DEFINER sicher schreiben.
6. Grants bewusst setzen.
7. RLS prüfen.
8. Audit schreiben.
9. Staging testen.
10. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
## Ergänzung 2026-07-14: Aktive V1-RPCs

- `collect_bonus_points_v1`: Tages-PIN, Zwei-Buchungen-Limit und Idempotency-ID.
- `apply_staff_daily_pin_loyalty_action_v1`: derselbe Schutz im Mitarbeiterweg.
- `start_customer_redemption`: verbindliche Kundenbestätigung, atomare Reservierung und sechsstelliger Code.
- `consume_redemption_code`: serverseitige einmalige Mitarbeiterbestätigung ohne PIN.
- `issue_birthday_gifts`: serverseitige, idempotente Geburtstagsvergabe.
- `expire_redemption_codes`: serverseitige Deaktivierung abgelaufener Codes.

Die älteren öffentlichen RPCs `redeem_customer_reward`, `create_redemption_code`, `redeem_reward_with_pin` und die alten nicht-idempotenten Punktebuchungssignaturen sind für `anon` und `authenticated` gesperrt.
