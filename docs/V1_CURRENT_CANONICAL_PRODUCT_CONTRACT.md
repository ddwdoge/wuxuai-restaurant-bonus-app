# WUXUAI Bonus V1 - Canonical Product Contract

Status: **V1 CODE LOCK / OWNER-ONBOARDING DEVELOPMENT-TEST GATE OPEN**
Stand: 2026-08-31
Authoritative Branch: `codex/v1-canonical-recovery`
Recovery Branch: `codex/v1-canonical-recovery`

Dieses Dokument beschreibt den nach Source, Tests, Development/Test-Live-Gates
und physischen Founder-Gates verifizierten V1-Stand. Historische Reports
behalten den Status zum Zeitpunkt ihrer Erstellung; dieser Vertrag bildet den
spaeter nachgewiesenen aktuellen Stand ab. `DEFERRED` ist nicht Teil V1.

## Owner, Onboarding und Legal Company Data - FINAL LOCK

- Der Owner-Flow lautet Registrierung, E-Mail-Bestaetigung, Login, Onboarding,
  Organization, Restaurant, Primary Branch, Owner-/Admin-Zuordnung, Legal
  Operator, Unternehmensdaten und Legal Readiness.
- Die rechtliche Struktur lautet `Legal Operator / Organization -> Restaurant
  Brand -> Branch`. Rechtliche Betreiberdaten sind keine Branding-Eigenschaften
  eines Restaurants oder Standorts.
- `organizations` ist der kanonische Beziehungsknoten;
  `organization_legal_profiles` speichert die strukturierte Betreiberidentitaet.
- Rechtlicher Firmenname, Rechtsform, vertretungsberechtigte Person, FN und UID
  werden auf Betreiber-Ebene gefuehrt. FN und UID bleiben in V1 optional.
- Die Geschaeftsanschrift referenziert entweder die Restaurantadresse oder eine
  getrennte rechtliche Anschrift. Der gespeicherte Modus bleibt in Onboarding
  und Einstellungen derselbe kanonische Vertrag.
- Dokumente und Legal Readiness verwenden die Betreiberidentitaet. Restaurant-
  und Branch-Namen bleiben Marketing- beziehungsweise Standortidentitaeten.
- Unternehmensdaten, Dokumentpruefung, Veroeffentlichung und Freigabe der
  Kundenregistrierung bilden einen serverseitig autoritativen Readiness-Flow.
  Unveroeffentlichte Pflichtdokumente koennen nicht gleichzeitig als erledigte
  Veroeffentlichung dargestellt werden.
- Der Bonus-Schritt zeigt nur die kanonischen Rueckgabequoten 3, 5, 8 und 10
  Prozent. 20 EUR pro Besuch und fuenf Besuche ergeben ausschliesslich die
  feste Vorschau von 100 EUR Referenzkonsumation und sind keine
  Kundenvoraussetzung.
- Die optionale Owner-Mobiltelefonnummer ist fuer zukuenftige
  SMS-Benachrichtigungen vorbereitet. V1 aktiviert dadurch weder SMS noch eine
  Marketingeinwilligung.

## Owner Dashboard Smart Setup Assistant - CODE LOCK

- Die bestehende schwarze Karte `Heute fuer dich` zeigt genau eine Empfehlung
  aus dem zentralen Resolver `resolveOwnerDashboardRecommendation`.
- Die feste Reihenfolge lautet: Publikation/Standort, Punkteeinloesung,
  veroeffentlichtes nutzbares Angebot, Geburtstagspool, QR Center und
  Mitarbeiterzugang.
- Publikation verwendet dieselbe Legal Readiness, den aktiven Restaurantstatus
  sowie den aktiven, auffindbaren Standort mit vollstaendiger Adresse und
  gueltigen Koordinaten. Angebot und Mitarbeiterzugang bleiben Empfehlungen
  und sind keine Legal- oder Publikationsvoraussetzungen.
- Ein `PUBLISHED`, aktives und noch nicht abgelaufenes Angebot erfuellt den
  Setup-Schritt auch bei zukuenftigem Start oder einer Wochentags-/Zeitregel.
  Entwurf, deaktiviertes oder abgelaufenes Angebot erfuellen ihn nicht.
- Jede CTA fuehrt direkt in den bestehenden verantwortlichen Bereich. Solange
  Setup oder objektiver Handlungsbedarf besteht, steht `Heute fuer dich`
  direkt unter dem Dashboard-Kopf. Nach vollstaendiger Einrichtung ohne offene
  Aktion wird die Karte verborgen und erfindet keine neue
  Wachstumsempfehlung.
- Nach dem Setup darf derselbe Container nur fuer objektiv feststellbare
  Aktionen wieder erscheinen. Die bestehende ungesehene Warnung zu einem
  ungewoehnlich hohen Buchungsbetrag wird dort als einzelne Aktion gezeigt;
  kritische Publikations-/Legal-Zustaende bleiben hoeher priorisiert. Es gibt
  keine parallele Warn- oder Setup-Karte.
- Nur bei einem Start ueber `Heute fuer dich` fuehrt ein bestaetigter
  erfolgreicher Abschluss automatisch zum Dashboard zurueck. Das Dashboard
  laedt den kanonischen Setup-Zustand neu und laesst den zentralen Resolver die
  naechste tatsaechlich offene Empfehlung bestimmen. Direkte Bearbeitung,
  Abbruch und fehlgeschlagene Saves bleiben im verantwortlichen Editor.
- Der kurzlebige Fortsetzungskontext lebt ausschliesslich im Router-State,
  besitzt eine feste Quellenkennung und feste Erfolgscodes, wird nach der
  Anzeige verbraucht und veraendert weder Tenant, Berechtigungen noch Datenbank.
- V1 speichert keinen erfundenen QR-Download- oder Drucknachweis. Die
  QR-Empfehlung kann nur die objektive technische QR-Bereitschaft auswerten;
  die physische Platzierung bleibt ausserhalb des autoritativen App-Zustands.
- Neue geeignete Welcome-/Starter-Gifts werden in den aktiven
  Erstellungswegen mit `birthday_pool_enabled = true` angelegt. Der Owner kann
  die Verwendung pro Geschenk mit `Fuer Geburtstagsgeschenke verwenden`
  deaktivieren. Bereits gespeicherte Entscheidungen werden nicht
  ueberschrieben; es gibt keine Bestandsmigration oder Massenaenderung.
- Birthday Eligibility, 14-Tage-Catch-up, Einmaligkeit, Einloesung, Audit und
  E-Mail bleiben unveraendert.

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

## Multi-Role Account - FINAL LOCK

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
  und der DB-Linter meldet 0 Fehler.
- Staff plus Customer mit derselben Auth-Identitaet, derselben E-Mail und
  demselben Passwort ist live verifiziert. Membership genau eins,
  Staff-Rolle erhalten, kein zweiter Auth-User, Wiedereroeffnung ohne erneuten
  Beitritt und Cross-Tenant-Blockierung sind verifiziert.

## Redemption - IMPLEMENTED

- Primaerflow fuer Punkte-, Welcome- und Birthday-Einloesung ist eine
  serverzeitgebundene 15-Minuten-Live-Praesentation.
- Die normale Staff-Oberflaeche enthaelt keine sechsstellige Codepruefung.
- Neue Einloesungen erzeugen keinen sechsstelligen Primaercode.
- Historische Codeobjekte und RPC-Signaturen duerfen nur fuer
  Legacy-Kompatibilitaet bestehen bleiben.
- Der Server bleibt Autoritaet fuer Berechtigung, Ablauf, Einmalverwendung,
  Audit und Finalisierung.

## Referral / Freundschaftsbonus - FINAL LOCK

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
- Native iPhone-Freigabe, Linkoeffnung, bestehendes Konto, Legal Consent,
  Einladung, qualifizierender Besuch, 2x fuer beide Seiten und die automatische
  Fortsetzung ohne zweiten Login sind physisch verifiziert.

## Geocoding - IMPLEMENTED

- Owner geben Strasse, PLZ, Ort und Land an.
- Die Standortseite zeigt eine durchsuchbare weltweite Laenderauswahl. Die
  Namen werden fuer DE, EN, FR, IT und ES lokalisiert; gespeichert und an den
  Geocoder uebergeben wird ausschliesslich der ISO-3166-1-Alpha-2-Code.
- Bestehende Codes wie `AT` werden als lokalisierter Name dargestellt. Bei
  fehlendem kanonischem Land gibt es keinen stillen Oesterreich-Default und
  freie Texte koennen nicht gespeichert werden.
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
- Direkter Staff-Login mit E-Mail und gemeinsamem Auth-Passwort funktioniert
  ohne QR. Der Staff-QR bleibt als sicherer Restaurant-Einstieg erhalten und
  ersetzt weder Authentifizierung noch die serverseitige Staff-Zuordnung.
- Owner steuern Staff-Zugaenge. Staff-Selbstregistrierung und willkuerliche
  Restaurantuebernahme bleiben blockiert.

## Aktiver Customer-Restaurantkontext - FINAL LOCK

- Es gibt genau einen kanonischen aktiven Restaurantkontext je Customer-
  Sitzung. Beitritt oder bewusster Restaurantwechsel aktualisiert diesen
  Kontext servervalidiert.
- Header, Punkte, Rewards, Offers, persoenliche Geschenke, Referral/2x und
  Restaurantdetails lesen denselben aktiven Kontext. Kein Modul fuehrt einen
  parallelen Restaurant-Switch oder einen eigenen Tenantzustand ein.
- Ein Restaurantwechsel verschiebt keine Membership, Punkte, Geschenke,
  Benefits oder Referral-Beziehung in einen anderen Tenant.

## Punkte sammeln - FINAL LOCK

- Buchungsbetrag: mindestens 1 EUR; Standardmaximum 300 EUR; Owner-
  Konfiguration 1 bis 1.000 EUR.
- Pro Customer, Restaurant und lokalem Kalendertag sind hoechstens zwei
  erfolgreiche Punktebuchungen erlaubt. Fehlgeschlagene PIN-Eingaben und
  abgebrochene Vorgaenge verbrauchen keinen erfolgreichen Tagesplatz.
- Der persoenliche Customer-Punkte-QR ist einmalig und fuenf Minuten gueltig.
  Fremdtenant, Ablauf, Widerruf und Replay werden serverseitig blockiert.
- Die Tages-PIN ist serverkontrolliert. Nach fuenf falschen Versuchen ist der
  Customer fuer dieses Restaurant bis zum naechsten lokalen Tag gesperrt.
- Zusaetzlich gilt fuer den Actor maximal 30 Buchungsversuche in fuenf Minuten.
- Punkteberechnung, Idempotenz, Rapid-Repeat-Schutz, Tenantpruefung und Audit
  sind serverseitig autoritativ. Browserrollen duerfen das Punktejournal nicht
  direkt per DML veraendern.

## Welcome Gift - FINAL LOCK

- Eine aktive Customer-Membership erhaelt ueber den kanonischen Assignment-
  Flow hoechstens ein Welcome Gift aus dem aktiven Starter-Gift-Pool.
- Wiederholte Registrierung, Hydration oder Anmeldung erzeugt kein Duplikat.
- Zuweisung erzeugt keinen Besuch und keine Punkte. Eligibility und
  Freischaltung folgen dem bestehenden serverseitigen Vertrag.
- Die Einloesung verwendet dieselbe 15-Minuten-Live-Praesentation wie andere
  persoenliche Geschenke. Serverpruefung, Einmalverwendung und Audit bleiben
  autoritativ.

## Point Anomaly Monitoring - FINAL LOCK

- Das bestehende harte Limit von zwei erfolgreichen Punktebuchungen je Gast,
  Restaurant und lokalem Kalendertag bleibt unveraendert.
- Es gibt kein Staff-Tageslimit, keine Staff-Buchungsanzahlwarnung, kein
  Staff-Tagesbetragslimit und kein Restaurant-Tageslimit.
- Einziger V1-Anomaliehinweis ist eine erfolgreiche einzelne Punktebuchung ab
  80 Prozent des restaurantbezogenen konfigurierten Maximalbetrags.
- Das Owner-Dashboard liest dafuer ausschließlich das bestehende tenantgebundene
  Audit Event `HIGH_POINTS_AMOUNT_REVIEW` und zeigt Betrag, Punkte, Gast,
  kanonischen Actor, Restaurant und eine gekuerzte Buchungsreferenz.
- Owner-/Admin-/Manager-Aktionen bleiben im Audit Betreiberaktionen; es wird
  keine Staff-Identitaet erzeugt. Staff-Aktionen bleiben Staff-Aktionen.
- Der Hinweis ist rein informativ. Er veraendert keine Punkte, Einloesungen,
  Kunden- oder Staff-Zugaenge und fuehrt weder automatische Rueckbuchung noch
  automatische Sperre aus.
- Der Development/Test-Live-Nachweis umfasst 100 EUR ohne Warnung, 240 EUR mit
  Betreiberattribution `Restaurantinhaber` und 250 EUR mit Attribution
  `Mitarbeiter`. Punkte und Staff-Zugang blieben erhalten.

## Birthday Gift Catch-up - FINAL LOCK

- Das inklusive Eligibility-Fenster reicht vom lokalen Restauranttag bis zum
  Geburtstag innerhalb der naechsten 14 lokalen Kalendertage.
- Die kanonische Account-Membership-Aktivierung und der taegliche Birthday-Job
  verwenden denselben internen, tenantgebundenen Assignment-Helper.
- Eine Aktivierung 14, 10, 4 oder 1 Tag vor dem Geburtstag sowie am Geburtstag
  selbst teilt sofort genau ein Geschenk zu. Ab 15 Tagen besteht noch keine
  Berechtigung; ein bereits vergangener Geburtstag wird nicht nachgeholt.
- Die Auswahl bleibt auf aktive Starter-Gifts mit
  `birthday_pool_enabled = true` im berechtigten Restaurant-/Branch-Pool
  begrenzt. Restaurant-Zeitzone,
  29.-Februar-Regel, Audit und bestehende Birthday-E-Mail-Queue bleiben
  erhalten.
- Ein Unique Index, ein transaktionaler Advisory Lock und dieselbe
  serverseitige Existenzpruefung verhindern Duplikate pro Customer,
  Restaurant und Geburtstagsjahr.
- Migration `20260831001000_birthday_gift_14_day_catch_up.sql` ist auf
  Development/Test angewendet. Migration History ist synchron, der Post-Dry-Run
  leer und der DB-Linter meldet 0 Fehler.
- Eligibility-Fenster, sofortige Membership-Pruefung, Jahres-Deduplizierung,
  Restaurant-Lokalzeit, 29.-Februar-Regel, Audit und E-Mail-Queue sind live
  verifiziert.

## Customer Home Multi-Gift Carousel - FINAL LOCK

- Customer Home verwendet die bestehende kanonische Portal-Reward-Antwort und
  zeigt alle aktuell sichtbaren, nicht eingelösten und nicht abgelaufenen
  persönlichen Geschenkzuweisungen des aktiven Restaurants.
- Geburtstagsgeschenke stehen deterministisch vor Willkommensgeschenken;
  weitere Geschenktypen folgen nach Gültigkeit und stabiler Zuweisungs-ID.
- Zwei oder mehr Geschenke verwenden den bestehenden horizontalen Premium-
  Carousel mit nativem Swipe, Scroll Snap, Einzelschritt-Pfeilen und echter
  Positionsanzeige. Eine einzelne Karte bleibt vollbreit.
- Carousel-Navigation startet oder verbraucht keine Einlösung. Assignment,
  Birthday-Catch-up, 15-Minuten-Präsentation, Audit, E-Mail, Punkte und Visits
  bleiben unverändert.
- Der reale Development/Test-Fall mit gleichzeitigem Welcome- und
  Birthday-Geschenk sowie der physische iPhone-Swipe sind Founder-verifiziert.

## Customer Discovery Direct Join - FINAL LOCK

- Nichtmitglieder sehen in den Restaurantdetails den primaeren Beitritts-CTA
  und den sekundaeren Routen-CTA vollstaendig und touchgerecht.
- Beitritt verlangt ausdruecklichen Legal Consent, ist servervalidiert und
  idempotent und erzeugt genau eine tenantkorrekte Membership.
- Das beigetretene Restaurant wird aktiver Customer-Kontext und erscheint ohne
  manuellen Refresh auf der Startseite.
- Der Beitritt erzeugt weder Besuch noch Punkte oder Referral und veraendert
  Welcome-, Offer- und Reward-Eligibility nicht ausserhalb des bestehenden
  Vertrags.
- Der vollstaendige Flow und die CTA-Sichtbarkeit sind auf physischem iPhone
  durch den Founder bestaetigt.

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
- Das Starter Kit besteht aus drei kanonischen A6-Seiten mit 105 x 148 mm,
  rein weissem Papiergrund, identischer Brand-Stage, unveraenderter QR-
  Geometrie, Quiet Zone und Print-Safe-Area. Seite 3 bleibt ohne Text-/QR-
  Kollision.
- QR-Center-Vorschau und PDF verwenden dasselbe Seitenmodell und dieselbe
  kanonische Skalierung. Die mobile Vorschau darf als Carousel responsiv
  dargestellt werden, aber niemals PDF-Masse oder Druckgeometrie veraendern.
- Mobile Preview, alle drei A6-Seiten und physischer iPhone-Gate sind durch den
  Founder bestaetigt.
- Historische Daten, Routen und Reportingbezeichnungen bleiben unveraendert.

## Customer Mobile - IMPLEMENTED

- Kein kritischer `100dvh`-Lock, vollstaendiges vertikales Scrollen und Safe
  Areas bleiben erhalten.
- Filterchips bleiben horizontal erreichbar, Logos verwenden `object-fit:
  contain`.
- Der Punktehinweis ist auf der Customer-Startseite ueber einen fokussierten
  Infobutton in der Punktekarte und den gemeinsamen barrierefreien Drawer
  erreichbar. Der fruehere dauerhaft sichtbare Hinweisblock zwischen
  Punktekarte und Angeboten ist entfernt; sein rechtlicher Wortlaut und die
  dynamische Gueltigkeitsinformation bleiben erhalten.
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
- Ein gueltiger vorheriger Preis ueber dem aktuellen Preis erzeugt eine rein
  abgeleitete ganzzahlige Rabattdarstellung. Es gibt kein Prozent-Eingabefeld
  und keine persistierte Prozentquelle.
- Kundenkarten, Angebotsdetail, Restaurantdetails und Owner-Vorschau zeigen
  denselben Rabatt, Streichpreis und aktuellen Preis. Ungueltige oder fehlende
  Vergleichspreise bleiben ohne Rabattdarstellung.
- Der Rabatt wird ausschliesslich als
  `round(((vorheriger_preis - aktueller_preis) / vorheriger_preis) * 100)`
  berechnet. Beispiel: 14,52 EUR auf 5,00 EUR ergibt 66 Prozent. Es gibt weder
  ein Prozent-Eingabefeld noch einen persistierten Prozentwert.

## Auth Recovery und E-Mail - FINAL LOCK

- Customer, Staff und Owner verwenden dieselbe Supabase-Auth-Identitaet und
  damit dasselbe Passwort. Es gibt keine separaten Rollenpasswoerter.
- Passwort-Reset, Callback und neues Passwort funktionieren rollenunabhaengig;
  der anschliessende Portalzugriff bleibt serverseitig rollen- und
  tenantgeprueft.
- E-Mail-Bestaetigung und Resend sind mit Anti-Enumeration-Antwort, Cooldown und
  klarer Recovery fuer abgelaufene oder bereits verwendete Links verifiziert.

## Security und Legal Readiness - FINAL LOCK

- RLS bleibt auf sensiblen Tabellen aktiv. Cross-Tenant-Lesen, -Schreiben und
  Rolleneskalation sind blockiert.
- Rollen stammen aus kanonischen serverseitigen Beziehungen, niemals aus
  `user_metadata`, URL, E-Mail oder Frontendzustand.
- Browsercode enthaelt keine Service Role. Tokens, PINs, Hashes und sensible
  Kundendaten werden nicht in Git, Public Payloads oder Auditmetadaten
  offengelegt.
- `SECURITY DEFINER`-Funktionen verwenden festen `search_path`, minimale Grants
  und explizite Actor-, Rollen- und Tenantpruefungen.
- Customer-Registrierung bleibt bis zur gueltigen Veroeffentlichung der
  Pflichtdokumente blockiert; Dokumenthistorie und Audit werden nicht
  umgangen oder automatisch akzeptiert.

## Reporting - IMPLEMENTED

- Tages-, Wochen-, Monats- und Jahresauswertung sowie CSV-/Druckexport sind im
  Owner-Portal verdrahtet.
- Reporting basiert auf dem unveraenderbaren Einloesungsjournal und erfindet
  keine historischen Snapshotwerte.

## Staging und Production

- Local/Remote Migration History ist bis einschließlich `20260831001000`
  synchron; der Post-Dry-Run meldet keine offenen Migrationen.
- Development/Test-DB-Linter: 0 Fehler.
- Referral, Multi-Role, Birthday Catch-up, Multi-Gift, Discovery Direct Join,
  Point Anomaly, QR/Starter Kit und E-Mail-Bestaetigung/Resend sind durch
  spaetere Live-/Founder-Evidenz geschlossen.
- Offene verpflichtende V1-Produkt- oder physische Founder-Gates: 0.
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
