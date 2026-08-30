# WUXUAI Bonus V1 - Canonical Product Contract

Status: **CODE INTEGRATED / AUTH MIGRATION STAGING APPLIED / LIVE GATES PENDING**
Stand: 2026-08-30
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
- Customer- und Owner-Callbacks verarbeiten gueltige Supabase-TokenHash-,
  PKCE- und Legacy-Sessiondaten automatisch, zeigen einen eindeutigen
  Erfolgszustand und leiten danach rollengerecht weiter. Abgelaufene oder
  ungueltige Links erhalten einen Resend-/Login-Weg ohne rohe Providerfehler.
- Restaurantkontext bleibt ueber den sicheren Return-/Membership-Flow erhalten.
- Restaurantbezogene Registrierung verwendet
  `register_restaurant_customer_legal`; Referral verwendet
  `register_referral_customer_legal`.
- Aktive Client-Aufrufe der alten Registration-RPCs: null.

## Multi-Role Account - CODE INTEGRATED, STAGING APPLIED, LIVE PENDING

- Eine bestaetigte Supabase-Auth-Identitaet repraesentiert eine Person und kann
  unabhaengige Customer-, Owner-/Admin-, Staff- und Plattformbeziehungen tragen.
- Rollen und Tenantzugriffe bleiben additive, serververifizierte Beziehungen;
  weder E-Mail noch `user_metadata` sind Rollenautoritaet.
- Bestehende angemeldete Benutzer aktivieren einen weiteren Customer- oder
  Owner-Bereich ohne zweiten Auth-Benutzer, neues Passwort oder erneute
  E-Mail-Bestaetigung.
- Staff-Einladungen duerfen bestehende Customer-, Plattform- oder
  fremdrestaurantbezogene Owner-Beziehungen nicht global blockieren. Eine
  Owner-/Admin-/Manager-Beziehung im selben Restaurant bleibt ein Konflikt;
  der bestehende operative Betreiberzugriff wird nicht in Staff-Impersonation
  umgewandelt.
- Bereichswechsel zeigt nur autoritativ bestaetigte Zugriffe. Jeder Zugriff
  bleibt restaurant-, organization- beziehungsweise plattformbezogen.
- Die additive Migration
  `20260830002000_multi_role_account_foundation.sql` ist auf dem verknuepften
  Development/Test-Supabase-Projekt `bwhvfjuwixgwduoeqaya` angewendet. Local/
  Remote Migration History sind synchron, der anschliessende Dry-Run ist leer
  und der DB-Linter meldet 0 Fehler. Reale Mehrfachrollen-Sitzungen und
  Cross-Tenant-Negativproben bleiben ein separates Live-Gate.

## Redemption - IMPLEMENTED

- Primaerflow fuer Punkte-, Welcome- und Birthday-Einloesung ist eine
  serverzeitgebundene 15-Minuten-Live-Praesentation.
- Die normale Staff-Oberflaeche enthaelt keine sechsstellige Codepruefung.
- Neue Einloesungen erzeugen keinen sechsstelligen Primaercode.
- Historische Codeobjekte und RPC-Signaturen duerfen nur fuer
  Legacy-Kompatibilitaet bestehen bleiben.
- Der Server bleibt Autoritaet fuer Berechtigung, Ablauf, Einmalverwendung,
  Audit und Finalisierung.

## Referral / Freundschaftsbonus - CODE INTEGRATED, STAGING VERIFIED

- Multiplikator ist immer 2x und kann nicht gestapelt werden.
- Default fuer neue Restaurants: 14 Tage.
- Owner-Auswahl: 7, 14, 28 oder eigener ganzzahliger Wert von 1 bis 365 Tagen.
- Einladender Gast: 100 Prozent der beim Qualifikationszeitpunkt gespeicherten
  Restaurantdauer.
- Eingeladener Freund: exakt 50 Prozent derselben Dauer, ohne Rundung auf ganze
  Tage. Sieben Tage ergeben 84 Stunden.
- Erst die erste gueltige Punktebuchung des neuen Gasts qualifiziert die
  Empfehlung.
- Der Referrer darf erst nach seiner eigenen ersten positiven Punktebuchung im
  selben Restaurant neue Einladungen erzeugen.
- Referral-Registrierung weist ueber denselben bestehenden Assignment-Flow wie
  direkte Registrierung hoechstens ein gesperrtes Willkommensgeschenk zu.
- Default sind 5 neue Einladungen pro Gast, Restaurant und lokalem
  Kalendermonat; Owner duerfen 1 bis 100 konfigurieren.
- Erneutes Teilen desselben Links ist idempotent und verbraucht keinen neuen
  Monatsplatz. Historische Einladungen werden nicht rueckwirkend gezaehlt.
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
- Die additiven Migrationen
  `20260824006000_referral_welcome_eligibility_monthly_quota.sql` und
  `20260824006100_referral_registration_phone_ambiguity_fix.sql` sind auf
  Staging angewendet. Der DB-Linter meldet danach 0 Fehler.
- Derselbe offene Status-RPC liefert den serverseitigen Customer-Lebenszyklus
  `waiting_registration`, `pending_qualification`, `active` oder `expired`
  sowie Beguenstigtenrolle und Boost-Zeitfenster. Die UI erfindet keinen Status
  aus Browserdaten.
- Aktive Referrer sehen die volle, eingeladene Freunde die halbe konfigurierte
  Dauer; mehrere Grants zeigen das kombinierte serverseitige Enddatum bei
  unveraendert maximal 2x.
- Der Referral-Link kann ueber die native Web-Share-Schnittstelle geteilt
  werden. Wo sie fehlt, bleibt die Zwischenablage der primaere Fallback; QR und
  sekundaeres Linkoeffnen bleiben erhalten. Geteilt wird ausschliesslich die
  bestehende kanonische oeffentliche Referral-URL.

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
- Owner, Admins und Manager duerfen den operativen Mitarbeiterbereich nur fuer
  eigene, autoritativ zugeordnete Restaurants verwenden. Ihre Rolle bleibt
  unveraendert; es wird keine Staff-Identitaet erzeugt oder imitiert.
- Betreiberaktionen behalten `auth.uid()` als Akteur und werden im Audit als
  Admin-Aktion mit der konkreten Restaurantrolle gekennzeichnet.

## QR Center und Starter Kit - IMPLEMENTED

- Der Neue-Gaeste-QR `/customer/:slug` ist der einzige aktive oeffentliche
  Registrierungs-QR. Unterschiedliche Druckorte und Papierformate verwenden
  dieselbe URL und erzeugen keinen technischen QR-Typ.
- Der Mitarbeiter-QR `/staff/login?restaurant=:slug` ist der getrennte interne
  Einstieg. Bestehende `/staff/:slug`-Drucke bleiben als sichere Weiterleitung
  kompatibel. Die Route verlangt eine persönliche Authentifizierung sowie eine
  aktive, exakt zum Restaurant passende Staff-Zuordnung oder eine autoritative
  Owner-/Admin-/Manager-Zuordnung; der QR selbst erteilt keine Berechtigung.
  Eine Plattformrolle allein ist kein Staff- oder Betreiberersatz.
- Der fruehere Kassa-Aufsteller ist als doppelte Druckvariante entfernt.
- `/w/:slug` bleibt fuer bestehende kundeninitiierte Sammelwege kompatibel und
  wird im QR Center nur bei `customer_initiated_only` oder `both` angezeigt.
- Das Onboarding erzeugt fuer neue Restaurants nur Gaeste- und Staff-QR-Assets.
  Der Gaeste-QR darf im Starter Kit mehrfach gestaltet, aber nicht als neuer
  Token oder neuer QR-Zweck erzeugt werden.
- Historische Daten, Routen und Reportingbezeichnungen bleiben unveraendert.

## Customer Mobile - IMPLEMENTED

- Kein kritischer `100dvh`-Lock, vollstaendiges vertikales Scrollen und Safe
  Areas bleiben erhalten.
- Filterchips bleiben horizontal erreichbar, Logos verwenden `object-fit:
  contain`.
- Der Map-Drawer wird ueber ein Body-Portal gerendert; Leaflet bleibt darunter
  und erhaelt bei offenem Drawer keine Pointer-Events.

## Aktuelles & Angebote - IMPLEMENTED

- `PUBLISHED` plus `is_active = true` bedeutet bis zum finalen Ablaufdatum:
  sichtbar als restaurantbezogener Marketinginhalt.
- Startdatum, Wochentage und tägliche Zeitfenster definieren die aktuelle
  Gültigkeit nach `Europe/Vienna`; sie filtern den Beitrag nicht aus dem Feed.
- Bevorstehende Beiträge bleiben mit `Gültig ab` sichtbar. Abgelaufene,
  deaktivierte, archivierte und fremde Beiträge bleiben verborgen.
- Sichtbarkeit verändert keine Reward-, Punkte-, Claim- oder Einlöselogik.

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
- Referral Welcome/Eligibility/Monatslimit: `STAGING VERIFIED`.
- Der physische Referral-Pilot mit echter E-Mail-Bestaetigung und iPhone Safari
  bleibt ein offenes manuelles Release-Gate.
- Native Referral-Freigabe, automatische Callback-Fortsetzung und Multi-Role-
  Aktivierung sind noch nicht deployed oder physisch/live verifiziert.
- Production: `DEFERRED / LOCKED`.
- Stripe: `DEFERRED`.

## Commercial Contract - APPROVED

- Trial: 3 Kalendermonate kostenlos.
- Basispaket: `WUXUAI Bonus V1` fuer 59 EUR pro Monat exkl. USt.
- Abrechnung: monatlich; automatische Abrechnung noch nicht aktiv.
- Zahlungsmittel: aktuell nicht erforderlich.
- Neue Trials verwenden eine kalenderbasierte Dreimonatsfrist. Bestehende
  Vertragsdaten werden nicht rueckwirkend umgeschrieben.
- Die zentrale Produktkonfiguration enthaelt einen leeren Add-on-Katalog als
  Erweiterungspunkt. Unfertige Zusatzpakete sind fuer Owner nicht sichtbar.
- Stripe bleibt `DEFERRED`; es gibt keinen Fake-Checkout und keine vorgetaeuschte
  automatische Umwandlung in ein bezahltes Abo.
