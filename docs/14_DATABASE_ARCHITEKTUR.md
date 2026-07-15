
# 14_DATABASE_ARCHITEKTUR.md

# WUXUAI Bonus V1 – Datenbank-Architektur

Status: **LOCK**

Dieses Dokument beschreibt die verbindliche Datenbank-Architektur von WUXUAI Bonus V1.

Die Datenbank ist nicht nur ein technischer Speicher.  
Sie ist die Vertrauensschicht des gesamten SaaS-Systems.

WUXUAI Bonus verarbeitet:

- Restaurants
- Organisationen
- zukünftige Filialen
- Gäste
- Punkte
- Belohnungen
- Willkommensgeschenke
- Bonus Boost
- Mitarbeiter
- Staff Sessions
- QR-Tokens
- Audits
- Testphasen
- Abos
- Storage-Dateien

Deshalb muss die Datenbank von Beginn an mandantenfähig, sicher, updatefähig und V2-vorbereitet sein.

---

## 1. Ziel der Datenbank-Architektur

Das Ziel der Datenbank-Architektur lautet:

> Ein einfaches V1-Produkt für Einzelrestaurants ermöglichen, ohne später Organisationen, Filialen, Abos oder Smart Engines neu bauen zu müssen.

V1 verhält sich einfach:

```text
1 Restaurant
=
1 Organisation
=
1 Filiale
=
eigene Gäste
=
eigene Punkte
=
eigene Belohnungen
=
eigenes Abo
```

Technisch wird jedoch bereits vorbereitet:

```text
Organisation
└── Filiale
    └── Restaurantbetrieb
```

Damit kann V2 später mehrere Filialen zusammenführen, ohne Kundendaten, Punkte oder Belohnungen zu zerstören.

---

## 2. Grundprinzipien

### 2.1 Tenant Isolation First

Jede geschäftliche Tabelle muss mandantenfähig sein.

In V1 bleibt `restaurant_id` der wichtigste Anker.

V2 vorbereitet:

- `organization_id`
- `branch_id`

Regel:

```text
restaurant_id = V1 Kompatibilität
branch_id = zukünftige Filiallogik
organization_id = zukünftige Gruppen-/Abologik
```

### 2.2 RLS ist Pflicht

Row Level Security ist die primäre Sicherheitsgrenze.

Frontend-Filter sind hilfreich, aber niemals ausreichend.

Jede Tabelle mit Restaurantdaten muss RLS besitzen.

### 2.3 Public Zugriff nur über sichere RPCs

Öffentliche Seiten dürfen niemals direkt Tabellen lesen.

Erlaubt:

- sichere RPCs
- slug-basierte öffentliche Endpunkte
- token-basierte Kundenportale

Verboten:

- `anon select * from customers`
- öffentliche aktive Rewards/Coupons aller Restaurants
- Demo-Fallbacks in Produktion
- erste Kundenzeile eines Restaurants anzeigen

### 2.4 Audit First

Jede wichtige Änderung wird protokolliert.

Audit ist Pflicht für:

- Punktebuchung
- Belohnungseinlösung
- Willkommensgeschenk-Zuteilung
- Willkommensgeschenk-Freischaltung
- Bonus Boost Aktivierung
- Staff Aktion
- Admin Änderung
- Onboarding Abschluss
- Trial Start
- Storage-relevante Vorgänge falls sinnvoll

### 2.5 Update-safe Migrations

Migrationen dürfen bestehende V1-Flows nicht zerstören.

Regeln:

- additive Änderungen bevorzugen
- keine Tabellen löschen
- keine Spalten ohne Backfill auf `not null` setzen
- bestehende `restaurant_id`-Flows erhalten
- V2-Spalten hinzufügen, aber V1 UI nicht überfrachten

---

## 3. Umgebung

WUXUAI Bonus arbeitet mit getrennten Umgebungen.

### 3.1 Lokal

Entwicklung auf dem Mac.

Nutzen:

- UI-Entwicklung
- lokale Builds
- schnelle Tests

### 3.2 Supabase Staging

Staging ist die erste echte Datenbankumgebung.

Nutzen:

- Migrationen testen
- RLS testen
- RPC testen
- Flow 01–05 testen
- Pilotvorbereitung

### 3.3 Production

Nur für echte Restaurants.

Regeln:

- keine direkte Entwicklung auf Production
- Migrationen zuerst auf Staging
- keine Experimente mit Kundendaten
- Production wird erst nach Staging-Abnahme genutzt

### 3.4 Plattform-Admin-RPCs

Status: **CODE LOCK / STAGING OFFEN**

Globale Restaurantdaten für das WUXUAI Admin Portal dürfen nicht direkt
über öffentliche Tabellenzugriffe geladen werden.

V1 nutzt sichere `security definer` RPCs:

```text
get_platform_restaurants()
get_platform_restaurant_detail(input_restaurant_id)
update_platform_restaurant_subscription(...)
```

Diese Funktionen prüfen serverseitig die Plattformrolle über
`current_platform_role()` / `is_platform_admin()`.

Nicht erlaubt:

- public select auf globale Restaurantlisten
- anon Zugriff auf Plattformdaten
- Restaurant Owner Zugriff auf fremde Restaurants
- Service Role im Frontend

Status- und Abo-Änderungen werden über `audit_log` protokolliert.

---

## 4. Kernschema

Die folgenden Tabellen bilden die Kernarchitektur.

### 4.1 organizations

Repräsentiert die zukünftige Organisation oder Restaurantgruppe.

V1:

```text
1 organization pro Restaurant
```

V2:

```text
1 organization mit mehreren branches
```

Wichtige Felder:

- id
- name
- owner_id
- created_at
- status

Regeln:

- Restaurants werden einer Organisation zugeordnet.
- Abrechnung kann später auf Organisationsebene laufen.
- Filialzusammenführung erfolgt später über Organisation.

---

### 4.2 branches

Repräsentiert einen Standort / eine Filiale.

V1:

```text
1 branch pro Restaurant
```

V2:

```text
mehrere branches pro organization
```

Wichtige Felder:

- id
- organization_id
- restaurant_id oder primary_restaurant relation je nach Umsetzung
- name
- address
- status
- created_at

Regeln:

- Punkte bleiben in V1 branch-local.
- Belohnungen bleiben in V1 branch-local.
- Willkommensgeschenke bleiben in V1 branch-local.
- V2 kann Organisation-weite Punkte aktivieren.

---

### 4.3 restaurants

V1-Haupttabelle für Restaurantarbeitsbereiche.

Wichtige Felder:

- id
- owner_id
- organization_id
- primary_branch_id
- name
- slug
- restaurant_type / business_type
- language
- owner_phone
- status
- onboarding_status
- created_at
- completed_at falls vorhanden

Regeln:

- `slug` wird für öffentliche QR-Routen verwendet.
- `restaurant_id` bleibt V1-Anchor.
- Neue Restaurants erzeugen automatisch Organisation und Branch.
- Onboarding Abschluss setzt `onboarding_status = completed`.

---

### 4.4 restaurant_members

Verknüpft Supabase Auth User mit Restaurantrollen.

Rollen:

- owner
- admin
- manager
- staff falls nötig, wobei operative Staff oft eigene Tabelle nutzt

Wichtige Felder:

- id
- restaurant_id
- user_id
- role
- created_at

Regeln:

- UI-Rolle darf nicht aus `user_metadata` vertraut werden.
- Restaurantzugriff wird über Membership geprüft.
- RLS nutzt Membership-Funktionen.
- Missing Role darf niemals Owner bedeuten.

---

### 4.5 restaurant_branding

Speichert White-Label-Daten.

Wichtige Felder:

- id
- restaurant_id
- logo_url
- primary_color
- secondary_color / accent_color
- button_color
- font_family optional
- created_at

Regeln:

- Logo muss proportional dargestellt werden.
- `object-fit: contain` in UI.
- Branding muss im Kundenportal, QR-PDF und Restaurantportal verwendet werden.
- Kein Restaurant darf Branding eines anderen Restaurants sehen oder ändern.

---

## 5. Onboarding Tabellen

### 5.1 restaurant_onboarding_drafts

Speichert den Zustand des Onboarding-Wizards.

Wichtige Felder:

- id
- restaurant_id
- organization_id
- branch_id
- current_step
- draft_data
- checklist
- created_at
- updated_at

Regeln:

- Autosave nach jeder Änderung.
- Kein manueller „Speichern und später fortsetzen“-Button.
- Refresh stellt letzten Schritt wieder her.
- Abschluss erzeugt kein zweites Restaurant.
- RLS: nur Owner/Admin des Restaurants darf lesen/schreiben.

---

## 6. Abo- und Trial Tabellen

### 6.1 branch_subscriptions

V1 Abologik pro Einzelstandort.

Wichtige Felder:

- id
- organization_id
- branch_id
- restaurant_id falls vorhanden
- status
- trial_started_at
- trial_ends_at
- current_period_start
- current_period_end
- plan
- stripe_customer_id später
- stripe_subscription_id später
- created_at
- updated_at

V1 Status:

- trialing
- active
- cancelled
- expired

Regeln:

- Registrierung startet 30 Tage Testphase.
- Keine Kreditkarte erforderlich.
- Keine rückwirkende Zahlung.
- RPC `start_restaurant_owner_trial` muss Branch Subscription sicher per `INSERT ... ON CONFLICT` erzeugen.
- `subscription_record` darf nie NULL sein.

---

## 7. Gäste und Kunden

### 7.1 customers

Speichert Gäste eines Restaurants.

Wichtige Felder:

- id
- restaurant_id
- organization_id
- branch_id
- first_name / name
- phone
- birthday optional
- customer_code
- points_balance
- stamp_balance falls noch vorhanden
- membership_level optional
- created_at
- device_id optional
- source
- referral_source optional

Regeln:

- Telefonnummer pro Restaurant eindeutig.
- Kunden gehören immer zu einem Restaurant/Branch.
- Keine öffentlichen Tabellenreads.
- Öffentliche Kundenansicht nur über sicheren Token/RPC.
- Customer Code ist nicht geheim.

---

### 7.2 customer_qr_tokens

Speichert sichere Zugriffstokens für Kundenportale.

Wichtige Felder:

- id
- restaurant_id
- customer_id
- token_hash
- created_at
- revoked_at
- expires_at optional
- last_used_at

Regeln:

- Kundenportal nutzt Token, nicht Telefonnummer.
- Token darf nicht erratbar sein.
- Token darf nicht restaurantübergreifend funktionieren.
- Token kann später rotiert werden.

---

### 7.3 customer_devices

Optional / Anti-Abuse-Signal.

Wichtige Felder:

- id
- restaurant_id
- customer_id
- device_id
- first_seen_at
- last_seen_at

Regeln:

- Device ID ist keine MAC-Adresse.
- Device ID ist nur Warnsignal.
- Keine harte Sperre nur durch Device ID.
- Verdächtige Muster können im WUXUAI Admin angezeigt werden.

---

## 8. Punkte und Loyalty

### 8.1 loyalty_settings

Speichert Bonusregeln pro Restaurant/Branch.

Wichtige Felder:

- id
- restaurant_id
- organization_id
- branch_id
- loyalty_mode falls historisch
- amount_per_point / points_per_euro
- smart_upsell_enabled
- smart_upsell_threshold
- bonus_boost_enabled
- bonus_boost_multiplier
- bonus_boost_duration_days
- bonus_boost_extension_days
- point_expiry_months
- created_at
- updated_at

Regeln:

- Restaurantbesitzer sieht nicht technische Formeln.
- Bonus Designer erzeugt sinnvolle Werte.
- Werte steuern Dynamic „So funktioniert’s“.
- Punkteberechnung erfolgt serverseitig.

---

### 8.2 bonus_amount_tiers

Speichert Rechnungsbereiche für Flow 04.

Wichtige Felder:

- id
- restaurant_id
- branch_id
- min_amount
- max_amount
- points
- sort_order
- active

V1 Standard:

- 0–10 € = 50 Punkte
- 10–20 € = 100 Punkte
- 20–30 € = 200 Punkte
- 30–40 € = 300 Punkte
- 40–50 € = 400 Punkte
- 50–75 € = 600 Punkte
- 75–100 € = 900 Punkte
- 100 €+ = 1200 Punkte

Regeln:

- Keine „bis X €“-Logik.
- Keine freie Betragseingabe.
- Kunde wählt Rechnungsbereich.
- Server berechnet Punkte.

---

### 8.3 points_transactions

Speichert alle Punktebewegungen.

Wichtige Felder:

- id
- restaurant_id
- organization_id
- branch_id
- customer_id
- staff_member_id optional
- type
- points
- base_points
- multiplier
- final_points
- reason
- amount_tier_id
- source
- created_at
- metadata

Typen:

- earn
- redeem
- adjust
- expire
- reactivate optional

Regeln:

- Jede Punktebuchung wird auditierbar gespeichert.
- Bonus Boost Werte müssen nachvollziehbar sein.
- Erste Punktebuchung kann Willkommensgeschenk freischalten.
- Erste Punktebuchung kann Referral aktivieren.

---

### 8.4 stamp_transactions

Historisch / optional.

V1 Fokus liegt auf Punkte- und Rechnungsbereich-System.

Wenn Stempelmodus nicht aktiv genutzt wird, darf Tabelle bestehen bleiben, aber UI nicht überfrachten.

---

## 9. Belohnungen

### 9.1 rewards

Normale Punkte-Belohnungen.

Wichtige Felder:

- id
- restaurant_id
- organization_id
- branch_id
- title
- category
- product_price
- required_points
- profitability_status
- image_url
- active
- created_at
- updated_at

Regeln:

- Restaurant gibt Produktpreis ein.
- System berechnet Punkte.
- Keine manuelle Punkte-Eingabe.
- Belohnung kann aktiviert/deaktiviert werden.
- Bearbeitung darf alte Einlösungen nicht zerstören.

---

### 9.2 customer_rewards / reward_redemptions

Speichert zugeordnete oder eingelöste Belohnungen.

Wichtige Felder:

- id
- restaurant_id
- branch_id
- customer_id
- reward_id
- status
- redeemed_at
- staff_member_id
- created_at
- metadata

Status:

- active
- locked
- unlocked
- redeemed
- expired

Regeln:

- Kunde kann nicht selbst final einlösen.
- Staff Session/PIN erforderlich.
- Einlösung atomar.
- Audit schreiben.

---

## 10. Willkommensgeschenke

### 10.1 welcome_reward_templates / welcome_reward_rules

Zentrale Standardregeln der Smart Reward Engine.

Wichtige Felder:

- id
- category
- default_value_eur
- default_probability
- daily_limit
- sort_order
- active

V1 Standardwerte:

- Kaffee bis 4 €, 25 %
- Getränk bis 4 €, 25 %
- Dessert bis 6 €, 20 %
- Vorspeise bis 6 €, 18 %
- Menü bis 16 €, 5 %
- Sushi bis 20 €, 3 %
- Hauptspeise bis 20 €, 2 %
- Eigene Belohnung bis 15 €, 2 %

Regeln:

- Quoten nicht im Frontend hardcoden.
- Restaurant bearbeitet Quoten in V1 nicht.
- Nur aktive Kategorien werden normalisiert.
- Teure Kategorien seltener.
- Tageslimits V2 vorbereitet.

---

### 10.2 restaurant_welcome_rewards

Restaurant-spezifische aktive Willkommensgeschenke.

Wichtige Felder:

- id
- restaurant_id
- organization_id
- branch_id
- template_id
- title
- category
- value_limit_eur
- image_url
- mode
- active
- created_at
- updated_at

Modi:

- value_limit
- fixed_product später

V1 Standard:
- value_limit

Regeln:

- eigenes Menü im Restaurant Portal.
- keine Punkte.
- keine normale Reward-Vermischung.

---

### 10.3 customer_welcome_gifts

Konkrete Zuteilung an Kunden.

Wichtige Felder:

- id
- restaurant_id
- branch_id
- customer_id
- welcome_reward_id
- status
- assigned_at
- unlocked_at
- redeemed_at
- source
- metadata

Status:

- locked
- unlocked
- redeemed
- expired

Regeln:

- normale Registrierung → Geschenk zuteilen locked
- erste Punktebuchung → unlock
- Einlösung erst nächster Besuch
- Referral Registrierung → kein Geschenk
- Geschenk einmalig pro Kunde/Restaurant

---

## 11. Bonus Boost und Referral

### 11.1 referrals

Speichert Einladungsbeziehungen.

Wichtige Felder:

- id
- restaurant_id
- branch_id
- referrer_customer_id
- referred_customer_id
- referral_token_hash
- status
- created_at
- registered_at
- activated_at
- metadata

Status:

- pending_registered
- activated
- cancelled
- expired

Regeln:

- kein Selbst-Referral
- kein A↔B Zirkel
- Aktivierung erst bei erster Punktebuchung
- keine doppelte Aktivierung
- Audit schreiben

---

### 11.2 customer_bonus_boosts

Speichert aktive Boosts.

Wichtige Felder:

- id
- restaurant_id
- branch_id
- customer_id
- multiplier
- active_from
- active_until
- source
- referral_id
- status
- created_at

Regeln:

- Multiplikator stapelt nicht.
- Weitere erfolgreiche Freunde verlängern Dauer.
- Standard: 2×, 30 Tage, +30 Tage pro Freund.
- Punkteberechnung nutzt aktiven Boost.

---

## 12. Mitarbeiter und Staff Sessions

### 12.1 staff_members

Restaurantmitarbeiter.

Wichtige Felder:

- id
- restaurant_id
- branch_id
- name
- pin_hash
- role
- active
- created_at

Regeln:

- PIN niemals im Klartext speichern.
- PIN Hash.
- Staff kann nur operative Aktionen.
- Staff sieht keine Admin-Einstellungen.

---

### 12.2 staff_sessions

Kurzlebige Mitarbeitersessions.

Wichtige Felder:

- id
- restaurant_id
- staff_member_id
- token_hash
- expires_at
- revoked_at
- created_at

Regeln:

- Roh-PIN nicht bei jeder Aktion verwenden.
- Session token kurzlebig.
- Staff Aktionen prüfen Session.
- Session kann ablaufen oder widerrufen werden.

---

## 13. Audit

### 13.1 audit_log

Zentrale Protokolltabelle.

Wichtige Felder:

- id
- restaurant_id
- organization_id
- branch_id
- actor_type
- actor_id
- action
- target_table
- target_id
- metadata
- created_at

Actor Typen:

- admin
- staff
- customer
- system
- wuxuai_admin später

Regeln:

- Jede wichtige Änderung protokollieren.
- Keine sensiblen Daten wie PIN Hash in Audit-Metadaten speichern.
- Audit ist append-only.
- Korrekturen werden als neue Aktionen geschrieben.

---

## 14. Storage

### 14.1 Bucket

Bucket:

```text
restaurant-media
```

### 14.2 Public Read

Bilder, Logos und PDF-Material können öffentlich lesbar sein, wenn sie im Kundenportal oder Starter Kit erscheinen.

### 14.3 Upload Policies

Nur authentifizierte Owner/Admins des Restaurants dürfen schreiben.

Pfade:

```text
restaurant-media/{restaurant_id}/branding/...
restaurant-media/{restaurant_id}/rewards/...
restaurant-media/{restaurant_id}/welcome-gifts/...
restaurant-media/{restaurant_id}/offers/... (historisch/später)
```

### 14.4 Dateigröße

V1 Standard:

- max 5 MB
- image/png
- image/jpeg
- image/svg+xml
- application/pdf

### 14.5 Logo-Regeln

Logo darf nicht:
- verzerrt
- beschnitten
- in Quadrat gezwungen
werden.

---

## 15. RPC Regeln

### 15.1 Grundregel

Businesskritische öffentliche oder geschützte Aktionen laufen über RPC.

Beispiele:

- register_restaurant_customer
- get_public_customer_portal
- collect_bonus_points
- redeem_reward_with_staff_session
- start_restaurant_owner_trial
- referral activation

### 15.2 SECURITY DEFINER

Wenn `SECURITY DEFINER` genutzt wird:

Pflicht:

- expliziter `search_path`
- keine unsicheren dynamischen SQL-Fragmente
- RLS-Logik bewusst prüfen
- EXECUTE Grants bewusst setzen
- PUBLIC/anon nicht unbegrenzt berechtigen

### 15.3 Grants

Regel:

- zuerst REVOKE unsichere Defaults
- dann gezielt GRANT
- public nur für wirklich öffentliche RPCs
- authenticated für geschützte RPCs

### 15.4 Extension Funktionen

Postgres Extension-Funktionen sicher referenzieren.

Beispiele:
- `extensions.crypt`
- `extensions.gen_salt`
- `extensions.digest`
- `extensions.gen_random_bytes`

---

## 16. RLS Regeln

### 16.1 Tabellen

Jede restaurantbezogene Tabelle benötigt RLS.

### 16.2 Owner/Admin Zugriff

Owner/Admin Zugriff über:

- owner_id
- restaurant_members
- sichere Helper-Funktionen

### 16.3 Staff Zugriff

Staff Zugriff primär über RPC/Staff Session, nicht direkte Tabellenrechte.

### 16.4 Customer Zugriff

Kunden greifen nicht direkt auf Tabellen zu.

Kunden nutzen Public RPC mit Token.

### 16.5 Keine aktiven globalen Public Policies

Verboten:

```text
anon darf alle active rewards sehen
anon darf alle active campaigns sehen
anon darf alle active coupons sehen
```

Public Access immer slug-/token-basiert.

---

## 17. Indizes

Wichtige Indizes müssen existieren oder vorbereitet werden für:

- restaurant_id
- branch_id
- organization_id
- customer_id
- phone pro restaurant
- slug
- customer token hash
- referral token hash
- active_until bei Bonus Boost
- status Felder
- created_at für Dashboard-Auswertungen

Ziel:

- schnelle Kundenansicht
- schnelle Staff Suche
- schnelle Dashboard KPI
- sichere Tokenprüfung

---

## 18. Migration Regeln

### 18.1 Keine destruktiven Änderungen

Keine Tabellen löschen, wenn Daten existieren.

### 18.2 Backfill vor Not Null

Wenn neue Spalte Pflicht wird:

1. Spalte nullable hinzufügen
2. Backfill
3. Constraints setzen
4. Trigger für neue Inserts

### 18.3 Alte Flows nicht brechen

Neue Organisation/Branch-Spalten dürfen bestehende `restaurant_id`-Flows nicht zerstören.

### 18.4 Migrationen in Staging prüfen

Vor Production:

```text
npx supabase db push --include-all
```

gegen Staging.

### 18.5 Jede Migration dokumentieren

Bericht:
- was wurde geändert
- warum
- RLS/Policies
- RPC Änderungen
- Risiken

---

## 19. Multi-Branch Vorbereitung

V1 UI bleibt Einzelstandort.

Datenbank vorbereitet:

- organizations
- branches
- organization_id
- branch_id
- branch_subscriptions

Regeln:

- V1 Punkte branch-local
- V1 Rewards branch-local
- V1 Gäste branch-local
- V1 Abos branch/organization single mapping

V2:
- Branch Merge
- Organisationen
- zentrale Rechnung
- filialübergreifende Punkte optional

---

## 20. Was ausdrücklich verboten ist

Verboten:

- Service Role im Frontend
- user_metadata als Autorität
- Demo-Fallback in Produktion
- public Tabellenzugriff auf Kundendaten
- Punkte clientseitig vertrauen
- Belohnungen ohne RPC einlösen
- Willkommensgeschenke sofort freischalten
- Referral ohne Punktebuchung aktivieren
- `restaurant_id` ignorieren
- branch_id ohne Backfill hinzufügen
- RLS deaktivieren
- Migrationen direkt auf Production testen
- technische Fehlertexte an Nutzer ausgeben

---

## 21. V2 Hinweise

V2 Datenbank vorbereitet für:

- Multi-Branch
- Organisationweite Punkte
- Wochenplan Belohnungen
- Tageslimits
- Reward-Versionierung
- WUXUAI Admin Portal
- Feature Flags
- POS-QR
- signierte Rechnungsbeträge
- Zahlungsintegration Stripe
- mehrsprachige Inhalte
- weitere Branchen

---

## 22. LOCK Kriterien

Datenbank-Architektur gilt als LOCK, wenn:

- V1 Einzelrestaurant funktioniert
- Organisation/Branch vorbereitet
- RLS auf kritischen Tabellen aktiv
- Public Zugriff über RPC
- Staff Sessions sicher
- Customer Tokens sicher
- Punkte serverseitig
- Reward Einlösung atomar
- Welcome Gift Regeln abbildbar
- Bonus Boost abbildbar
- Audit vollständig
- Storage Policies korrekt
- Migrationen auf Staging laufen
- keine kritischen SQL/RLS/RPC Fehler

---

## 23. Codex-Regeln

Wenn Codex an der Datenbank arbeitet:

1. Diese Datei zuerst lesen.
2. Keine Tabellen löschen.
3. Keine Public Selects auf Kundendaten.
4. Keine Service Role im Frontend.
5. RLS immer prüfen.
6. RPC Grants bewusst setzen.
7. Migrationen Staging-testen.
8. V1 Flows nicht brechen.
9. Branch/Organization kompatibel halten.
10. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
## Ergänzung 2026-07-14: V1-Sicherheitsobjekte

Neue additive Objekte:

- `points_collection_requests`: idempotente Punktebuchungsanfragen.
- `customer_rewards.gift_type`: Trennung `welcome`, `birthday`, `legacy`.
- `birthday_gift_job_log`: nachvollziehbare tägliche Geburtstagsvergabe.
- `redemption_codes`: gemeinsame gehashte Einlösecodes für Geschenke und Punkteeinlösungen.
- `redemption_activation_attempts`: Rate Limit für Codeaktivierungen.

Eindeutige Indizes verhindern doppelte Willkommensgeschenke und doppelte Geburtstagsgeschenke pro Kalenderjahr.
