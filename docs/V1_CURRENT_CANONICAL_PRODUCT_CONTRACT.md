# WUXUAI Bonus V1 - Canonical Product Contract

Status: **CODE INTEGRATED / STAGING VERIFIED**
Stand: 2026-08-24
Authoritative Base: `919141181223aa414ef004a09aa3f02637f2b7fd`
Recovery Branch: `codex/v1-canonical-recovery`

Dieses Dokument beschreibt den nach Source und Tests integrierten V1-Stand.
`IMPLEMENTED` bedeutet Code und automatisierte Tests vorhanden.
`STAGING PENDING` bedeutet, dass eine neue Migration oder ein echter externer
Flow noch nicht gegen Staging verifiziert wurde. `DEFERRED` ist nicht Teil V1.

## Branding - IMPLEMENTED

- Sichtbarer Produktname: **WUXUAI Bonus**.
- Der zentrale Kundenbereich und restaurantbezogene Kundenansichten verwenden
  **Meine Vorteile**.
- `Mein WUXUAI`, `WUXUAI Restaurant Bonus` und `WUXUAI Restaurant Growth OS`
  sind keine aktiven sichtbaren Produktnamen.
- Routes, technische IDs, Datenbankobjekte und historische Migrationen werden
  nicht aus Brandinggruenden umbenannt.

## Customer Auth - IMPLEMENTED

- Kundenregistrierung verwendet Supabase Auth mit E-Mail und Passwort.
- `Passwort bestaetigen` ist Pflicht und bleibt reiner Client-Form-State.
- `confirmPassword` wird weder an Auth noch RPC, Datenbank, Audit oder Analytics
  gesendet.
- E-Mail-Bestaetigung, Callback, Anti-Enumeration-Antwort und Resend mit
  60-Sekunden-Cooldown sind implementiert.
- Restaurantkontext bleibt ueber den sicheren Return-/Membership-Flow erhalten.
- Restaurantbezogene Registrierung verwendet
  `register_restaurant_customer_legal`; Referral verwendet
  `register_referral_customer_legal`.
- Aktive Client-Aufrufe der alten Registration-RPCs: null.

## Redemption - IMPLEMENTED

- Primaerflow fuer Punkte-, Welcome- und Birthday-Einloesung ist eine
  serverzeitgebundene 15-Minuten-Live-Praesentation.
- Die normale Staff-Oberflaeche enthaelt keine sechsstellige Codepruefung.
- Neue Einloesungen erzeugen keinen sechsstelligen Primaercode.
- Historische Codeobjekte und RPC-Signaturen duerfen nur fuer
  Legacy-Kompatibilitaet bestehen bleiben.
- Der Server bleibt Autoritaet fuer Berechtigung, Ablauf, Einmalverwendung,
  Audit und Finalisierung.

## Referral / Freundschaftsbonus - IMPLEMENTED, STAGING VERIFIED

- Multiplikator ist immer 2x und kann nicht gestapelt werden.
- Default fuer neue Restaurants: 14 Tage.
- Owner-Auswahl: 7, 14, 28 oder eigener ganzzahliger Wert von 1 bis 365 Tagen.
- Einladender Gast: 100 Prozent der beim Qualifikationszeitpunkt gespeicherten
  Restaurantdauer.
- Eingeladener Freund: exakt 50 Prozent derselben Dauer, ohne Rundung auf ganze
  Tage. Sieben Tage ergeben 84 Stunden.
- Erst die erste gueltige Punktebuchung des neuen Gasts qualifiziert die
  Empfehlung.
- Weitere erfolgreiche Empfehlungen verlaengern die Laufzeit; der Multiplikator
  bleibt hoechstens 2x.
- Bestehende historische Booster werden nicht rueckwirkend umgeschrieben.
- Idempotenz gilt pro Referral, Kunde und Beguenstigtenrolle.
- Die additive Migration `20260824001000_v1_referral_owner_duration_split.sql`
  ist integriert und auf Staging angewendet.
- Die Referral-Laufzeitlogik, 50-Prozent-Aufteilung, Idempotenz, parallele
  Verlaengerung, Punkteberechnung und Tenant-Isolation wurden auf Staging
  verifiziert.
- Die additive Migration
  `20260824002000_fix_referral_settings_audit_and_boost_kpis.sql` verwendet den
  bestehenden Audit-Actor `admin` und wertet aktuelle `POINTS_ADDED`-Events aus.
- Legacy-Punkteevents bleiben kompatibel, ohne aktuelle und historische
  Darstellungen derselben Buchung doppelt zu zaehlen.
- Owner-Einstellungen, Zusatzpunkte-KPIs, Testdatenausschluss und
  Tenant-Berechtigungen wurden auf Staging verifiziert.

## Geocoding - IMPLEMENTED

- Owner geben Strasse, PLZ, Ort und Land an.
- Geocodierung erfolgt nur nach ausdruecklicher Owner-Aktion serverseitig ueber
  den festgelegten Nominatim-Endpunkt.
- Cache und anwendungsweites Rate Limit von mindestens 1,1 Sekunden bleiben
  erhalten.
- Manuelle Koordinaten sind keine Pflichtfelder.

## Staff - IMPLEMENTED

- QR-Scan ist die primaere Aktion.
- Bottom Navigation: Start, QR, Tages-PIN, Suchen, Mehr.
- Tages-KPIs stammen aus autoritativen Punkte-/Einloesungsquellen und verwenden
  die Restaurant-Zeitzone.
- Der aktuelle Staff-Vertrag wird ueber den authentifizierten `staff_user_id`-
  Kontext abgesichert; alte `staff_member_id`-Kompatibilitaetsfelder duerfen
  keine Autoritaet besitzen.

## Customer Mobile - IMPLEMENTED

- Kein kritischer `100dvh`-Lock, vollstaendiges vertikales Scrollen und Safe
  Areas bleiben erhalten.
- Filterchips bleiben horizontal erreichbar, Logos verwenden `object-fit:
  contain`.
- Der Map-Drawer wird ueber ein Body-Portal gerendert; Leaflet bleibt darunter
  und erhaelt bei offenem Drawer keine Pointer-Events.

## Reporting - IMPLEMENTED

- Tages-, Wochen-, Monats- und Jahresauswertung sowie CSV-/Druckexport sind im
  Owner-Portal verdrahtet.
- Reporting basiert auf dem unveraenderbaren Einloesungsjournal und erfindet
  keine historischen Snapshotwerte.

## Staging und Production

- Referral-Migration: `STAGING APPLIED`.
- Local/Remote Migration History: einschließlich `20260824001000` und
  `20260824002000` synchron.
- Beide Referral-Migrationen wurden kontrolliert auf Staging angewendet.
- Staging-DB-Linter nach Anwendung: 0 Fehler.
- Referral Final Staging Gate: verifiziert.
- Production: `DEFERRED / LOCKED`.
- Stripe: `DEFERRED`.
