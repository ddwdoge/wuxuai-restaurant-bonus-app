
# 19_CHANGELOG.md

## 2026-08-27 - Kunden-Abmeldung beendet zentrale Sitzung

- Den restaurantbezogenen Abmeldeweg an die zentrale Supabase-Kundensitzung
  angebunden, statt nur den lokal gespeicherten Restaurantzugang zu entfernen.
- Nach der Abmeldung wird die Kunden-Loginseite geöffnet; Reload und direktes
  erneutes Öffnen eines Restaurants stellen keine Kundendaten automatisch
  wieder her.
- Membership, Punkte, Restaurantzuordnung, RLS und Datenbankverträge bleiben
  unverändert.

## 2026-08-27 - Customer-Angebote und Belohnungen horizontal durchsuchbar

- Einen gemeinsamen barrierefreien Horizontal-Carousel-Baustein für
  `Aktuelles & Angebote` auf der Customer-Startseite und beide Reward-Tabs
  eingeführt.
- Nativen Touch-Swipe, Scroll Snap, Einzelschritt-Pfeile, Tastaturnavigation
  und kompakte Positionsanzeige ohne automatische Rotation umgesetzt.
- Einzelkarten bleiben vollbreit; leere persönliche Belohnungen behalten den
  bestehenden synchronisierten Empty State.
- Eligibility, Detailansicht, Tenant-Scope und serverseitigen
  15-Minuten-Einlöseflow unverändert gelassen.

## 2026-08-27 - Globale Staging-Supabase-Verbindung wiederhergestellt

- Einen Cloudflare-Staging-Build ohne exportierte `VITE_SUPABASE_URL` und
  `VITE_SUPABASE_ANON_KEY` als Ursache des globalen Live-Daten-Ausfalls
  nachgewiesen; dadurch wurde im Browser kein Supabase-Client erzeugt.
- Den unveränderten autoritativen App-Stand mit der bestätigten
  Staging-Konfiguration neu gebaut und ausschließlich auf Staging ausgerollt.
- Supabase Auth, PostgREST, Datenbankerreichbarkeit, Staff-Restaurantkontext und
  die öffentlichen Login-Einstiege nach dem Rollout geprüft.
- Keine Code-, Datenbank-, RLS-, Rollen- oder Tenantdatenänderung vorgenommen.

## 2026-08-26 - Starter Kit QR-Druckseiten vereinheitlicht

- Drei A6-Druckseiten im QR Center und Onboarding auf eine gemeinsame ruhige
  Gestaltung mit großen, unverzerrten QR-Codes und konsistenten Abständen
  vereinheitlicht.
- Operative Platzierungslabels aus den Gastseiten entfernt; die Staff-Seite
  kennzeichnet den internen Zweck außerhalb der QR-Fläche.
- Den kleinteiligen Referral-Bereich durch einen kompakten Hinweis ohne feste
  oder veraltete Laufzeit ersetzt.
- QR-Payloads, Routen, Rollen- und Businesslogik unverändert gelassen.

## 2026-08-26 - Angebots-Sichtbarkeit von Gültigkeit getrennt

- Veröffentlichte aktive Restaurantangebote bleiben bis zum finalen Ablauf im
  Customer-Marketingfeed sichtbar, auch vor Startdatum oder außerhalb von
  Wochentag und täglichem Zeitfenster.
- Europe/Vienna-Gültigkeitsstatus, Zeitplan und Zeitraum werden in Customer-
  und Owner-Ansicht ausdrücklich angezeigt; Owner sehen Veröffentlichung,
  Kundensichtbarkeit und aktuelle Gültigkeit getrennt.
- Customer-Karten auf 320 bis 430 Pixel mit 16:9-Bildfläche, stabiler
  Fallbackfläche, begrenzten Textzeilen und voller CTA-Breite normalisiert.
- Additive Migration
  `20260826001000_customer_offer_visibility_validity_split.sql`; Reward-,
  Einlöse-, RLS- und Tenant-Verträge bleiben unverändert.

## 2026-08-25 - Globale Post-Login-Hydration stabilisiert

- Owner-, Staff- und Customer-Passwortlogin verwenden denselben zentralen
  Session- und Autorisierungsabschluss vor der ersten Portalnavigation.
- Erfolgreiche Autorisierung invalidiert den restaurantbezogenen Tenant-Kontext
  gezielt, auch bei derselben Identitaet in einem lange geoeffneten Tab.
- Safari-BFCache und die Rueckkehr in einen sichtbaren geschuetzten Tab validieren
  Session und Portalzugriff kontrolliert neu, ohne normalen Full-Page-Reload.
- Temporaere Autorisierungs-, Tenant- und Staff-Kontextfehler behalten die
  Sitzung und bieten einen lokalen Wiederholungsversuch statt einer leeren
  Ansicht.
- Keine Migration, keine RLS-/Grant-Aenderung und keine fachliche Aenderung.

## 2026-08-25 - Restaurant-Titelbilder gegen fehlerhafte Quellen abgesichert

- Fehlerhafte oder fehlende Titelbild-Adressen im Customer-Partnerfinder zeigen
  keinen Browser-Fehlerzustand und keinen sichtbaren Alternativtext mehr.
- Gemeinsamen Bildzustand fuer Laden, gueltiges Bild, fehlendes Bild und
  Ladefehler eingefuehrt; Restaurantlogo und neutraler Lokal-Fallback folgen
  in dieser Reihenfolge.
- Hero-Abmessungen im Detail-Drawer von 320 bis 1024 Pixel stabil gehalten;
  Finder-, Karten-, Auth-, Punkte- und Rewardlogik bleiben unveraendert.

## 2026-08-25 - Customer Redeem Tabs geometrisch synchronisiert

- `Alle Belohnungen` und `Meine Belohnungen` auf eine gemeinsame, unveraenderliche
  Seiten- und Content-Grid-Struktur vereinheitlicht.
- Kurze Empty-State-Inhalte im Safari-Grid oben verankert, damit Header, Titel,
  Tabs, Punktezeile und Rechtshinweis beim Tabwechsel nicht mehr gestreckt werden.
- Karten- und Empty-State-Breite von 320 bis 1440 Pixel geometrisch verglichen;
  Bottom Navigation, Reward-Design und Einloeselogik bleiben unveraendert.

## 2026-08-25 - Rollenbewusste Portal-Anmeldung live freigegeben

- Freigegebenen Commit `a2c9904` mit bestaetigter Staging-Supabase-Konfiguration
  auf die bestehende Cloudflare-Staging-App ausgerollt.
- Reale Customer-, Staff-, Owner- und Platform-Admin-Sitzungen positiv und
  negativ gegeneinander geprueft; legitime Owner-/Platform-Admin-Mischrolle
  bleibt in beiden Portalen autorisiert.
- Falsche Portalzugriffe enden vor den Fachoberflaechen mit klarer Rollenkarte,
  bestaetigtem Ziel und sicherem Kontowechsel; die mobile Rollenkarte ist von
  320 bis 1024 Pixel ohne horizontalen Ueberlauf geprueft.

## 2026-08-25 - Rollenbewusste Portal-Anmeldung abgesichert

- Gemeinsamen serverseitigen Zugriffsvertrag fuer Customer-, Staff-, Owner- und
  Platform-Admin-Portale ergaenzt, ohne Rollen aus Metadaten, E-Mail-Mustern
  oder lokalem Browserzustand abzuleiten.
- Nach erfolgreicher Authentifizierung werden falsche Portalzugriffe mit einer
  klaren deutschen Meldung, einem bestaetigten Portalziel und sicherem
  Kontowechsel beendet.
- Customer-Datenaufrufe werden bei einem bestaetigten Rollenfehler vor dem
  Rendern des Customer-Portals verhindert; bestehende Auth-, Tenant- und
  Fachvertraege bleiben unveraendert.

## 2026-08-25 - Staff-QR als unmittelbaren operativen Drawer umgesetzt

- Primäre Bottom-Navigation `QR scannen` öffnet nun mit einem Tap einen
  fokussierten Scanner-Drawer, dessen bestehende ZXing-Kamera auf Mobilgeräten
  direkt unter dem kompakten Header sichtbar ist.
- Erkennung, sichere Kundenvorschau, Punkteformular, Tages-PIN, Fehler und
  Erfolg bleiben in einem zustandsbasierten Drawer ohne verschachtelte Modale.
- Kamera-, QR-, Punkte-, Tenant-, Staff-/Owner- und Actor-Verträge unverändert
  gelassen; Gastwechsel und nächster Gast starten dieselbe Kamera kontrolliert
  neu.

## 2026-08-25 - Staff-Kundenflow nach Vorgangspriorität geordnet

- Aktive Rückmeldung, Kundenkarte, Punktevergabe und Schnellsuche im Staff- und Betreiberzugriff verbindlich in dieser Reihenfolge angeordnet.
- Leerer Zustand führt weiterhin direkt zur Suche; bei Preview-Fehlern bleibt die Punktevergabe gesperrt und Retry oder Gastwechsel verfügbar.
- QR-, Punkte-, Tages-PIN-, Actor- und Tenantverträge unverändert gelassen und die Reihenfolge für 320 bis 1024 Pixel abgesichert.

## 2026-08-25 - Staging Staff-Login Live-Daten Diagnose

- Aktiven Cloudflare-Build, eingebettete Staging-Supabase-Konfiguration, Auth-Erreichbarkeit und öffentlichen Staff-Kontext geprüft.
- iPhone-Meldung auf einen alten, bereits geladenen Frontend-Zustand ohne Supabase-Client eingegrenzt; keine Code-, RLS-, RPC- oder Datenbankänderung erforderlich.
- Diagnose in `docs/reports/2026-08-25_STAGING_STAFF_LOGIN_LIVE_DATA_DIAGNOSIS_REPORT.md` dokumentiert.

## 2026-08-25 - Operative QR-Codes fuer physische Kameras gehaertet

- Neue-Gaeste-, Mitarbeiter- und kompatible Kassa-QRs auf eine gemeinsame
  schwarz-weisse Renderkonfiguration mit vier Modulen Ruhezone umgestellt.
- Bildschirmdarstellung auf 270 Pixel sowie PNG- und Starter-Kit-Ausgaben auf
  hochaufloesende, geglaettungsfreie Rasterpfade angehoben.
- Staff- und Gaeste-Nutzlasten programmgesteuert aus dem erzeugten QR-Raster
  dekodiert; Loginroute, Authentifizierung, Rollen und RLS bleiben unveraendert.

## 2026-08-25 - Betreiberzugriff auf eigenen Mitarbeiterbereich

- Staff-Routen fuer autoritative Owner-, Admin- und Manager-Beziehungen des
  konkret angefragten Restaurants geoeffnet; fremde Tenants und reine
  Plattformrollen bleiben gesperrt.
- Betreiberzugriff ohne Staff-Zeile, Rollenwechsel oder Staff-Impersonation
  umgesetzt und in der UI als Betreiberzugriff gekennzeichnet.
- Bestehende operative Audit-Aufrufe normalisieren den echten Betreiberakteur
  auf `admin`, behalten `auth.uid()` und dokumentieren die Restaurantrolle.

## 2026-08-25 - Staff QR auf persönlichen Mitarbeiter-Login geroutet

- Neuen restaurantbezogenen `/staff/login` mit persönlicher E-Mail und
  persönlichem Passwort ergänzt; Owner-Texte und Owner-Registrierungslogik
  werden nicht wiederverwendet.
- Aktive Staff-/Supervisor-Zuordnung für den exakten QR-Slug serverseitig
  geprüft; die spätere Betreiberzugriffsentscheidung erlaubt zusätzlich
  autoritative Owner-/Admin-/Manager-Zuordnungen für den eigenen Tenant.
  Plattformadmin, Customer, gesperrte und fremde Staff-Konten bleiben allein
  durch diese Rollen ausgeschlossen.
- Neue Staff-QRs und Starter Kits auf den Mitarbeiter-Login umgestellt und
  bestehende `/staff/:slug`-Drucke kompatibel weitergeleitet.

## 2026-08-25 - Owner-Teamverwaltung mit persönlichen Staff-Zugängen

- Bestehende `staff_members`-Architektur additiv um persönliche
  Supabase-Auth-Bindung und auditierte Account-Status erweitert.
- Owner-Oberfläche für Einladen, erneutes Senden, Sperren, Reaktivieren und
  Entfernen umgesetzt.
- Staff-Einladung über serverseitige Edge Function und explizite persönliche
  Annahme abgesichert; QR bleibt reiner Login-Einstieg.
- Staff-Routen an die aktive restaurantbezogene Mitgliedschaft gebunden und
  bestehende Tages-PIN-, Punkte- und Einlöseflows unverändert gelassen.

## 2026-08-24 - QR Center auf aktive V1-Zwecke fokussiert

- Neue-Gäste-QR und Mitarbeiter-QR als zwei primäre QR-Center-Zwecke
  festgeschrieben.
- Technisch identischen Kassa-Aufsteller aus Owner-UI und Starter Kit entfernt.
- Neue Restaurants erhalten im Onboarding zwei Druckvarianten desselben
  Gäste-QR sowie den Staff-QR; keine zusätzlichen QR-Typen werden erzeugt.
- Bestehenden `/w/:slug`-Kassa-QR für kundeninitiierte Sammelmodi
  fail-safe kompatibel gehalten und nur dort als separaten Hinweis angezeigt.
- Keine Datenbankmigration, keine historischen Datenlöschungen und keine
  Änderung der Punkte-, Tages-PIN- oder Staff-Autorisierung.

## 2026-08-24 - Platform Admin und Referral Staging Gate gehaertet

- Platform-Admin-Control-Center-Migration `20260824005000` auf Staging
  aktiviert und einen NULL-basierten Autorisierungsfehler mit der additiven
  Fail-Closed-Migration `20260824005500` behoben.
- Referral-Welcome-, Eligibility- und Monatslimit-Migration `20260824006000`
  auf Staging aktiviert.
- Mehrdeutige Telefonnummernreferenz in der Referral-Registrierung mit
  Migration `20260824006100` behoben; Staging-DB-Linter danach ohne Fehler.
- Referral-Qualifikation, Monatslimit, Welcome Gift, 100-/50-Prozent-Dauer,
  2x-Punkte und Stacking transaktional gegen Staging verifiziert.

## 2026-08-24 - Referral Customer Lifecycle UX integriert

- Serverseitigen Referral-Statusvertrag um wartende Registrierung,
  ausstehende Qualifikation, aktiv und abgelaufen erweitert.
- Referrer- und Friend-Texte getrennt sowie exakten Ablaufzeitpunkt und
  praezise Restzeit in das Kundenportal aufgenommen.
- Aktive Dauer weiterhin dynamisch aus Owner-Konfiguration und serverseitigem
  Boost-Enddatum; keine 30-/15-Tage-Laufzeit in der aktiven Customer-UI.
- Qualifikation, 100-/50-Prozent-Regel, Stacking, Punkte-Engine und
  Tenant-Sicherheit unveraendert gelassen.

## 2026-08-24 - Referral Welcome Gift, Eligibility und Monatslimit integriert

- Referral-Erstregistrierung an den bestehenden einmaligen Welcome-Gift-
  Assignment-Flow angebunden; Geschenk bleibt bis zur ersten Punktebuchung
  gesperrt.
- Einladungserstellung serverseitig an die erste positive Punktebuchung des
  Referrers im selben Restaurant gebunden.
- Restaurantbezogenes Monatslimit mit Default 5, Owner-Bereich 1 bis 100,
  lokaler Restaurant-Zeitzone und atomarem Idempotenzschutz vorbereitet.
- Customer-UI fuer gesperrt, Monatslimit und angenommen-aber-pending ergaenzt.
- Migration `20260824006000_referral_welcome_eligibility_monthly_quota.sql`
  lokal vorbereitet; Staging-Anwendung bleibt wegen Migrationsreihenfolge offen.

## 2026-08-24 - Platform Admin Restaurant Control Center Backendvertrag

- additive Migration `20260824005000_platform_admin_restaurant_control_center.sql` vorbereitet
- autoritative Restaurant-, Abo-, Nutzungs-, Referral-, Einlösungs- und Health-Aggregation ergänzt
- Nullwerte, fehlende Telemetrie und RPC-Fehler explizit getrennt
- Plattformrolle serverseitig geprüft; normale Tenant-RLS unverändert
- keine UI-Umstellung, keine Staging-Anwendung und keine Production-Aktion

## 2026-08-24 - Referral-Einladung an zentrale Kundenregistrierung angebunden

- Vereinfachtes Referral-Sonderformular entfernt und die Einladung an den
  bestehenden Customer-Auth-Flow mit E-Mail-Bestaetigung und Doppelpasswort
  angebunden.
- Streng validierten Referral-Rueckweg fuer den Auth-Callback ergaenzt.
- Additive authenticated-only RPC-Bruecke fuer atomare Referral-, Customer- und
  Membership-Zuordnung vorbereitet; bestehende Qualifizierung und Booster-
  Engine bleiben unveraendert.
- Freunde-Dauer fuer 7/14/28 Tage sichtbar als 84 Stunden, 7 Tage und 14 Tage
  vereinheitlicht.

## 2026-08-24 - Platform Admin V1 Foundation gehaertet

- Bestehende Plattform-Admin-Routen und RPCs wiederverwendet statt ein zweites
  Adminsystem aufzubauen.
- Plattformrollen im Client zentralisiert und ausschliesslich ueber den
  serververifizierten Rollen-RPC geladen.
- `platform_admins` als einzige Laufzeitautoritaet vorbereitet; direkte
  Browserrechte und direkte Helper-Ausfuehrung entzogen.
- Owner, Staff, Customer und Anon bleiben von Plattformfunktionen getrennt.
- Bestehender Plattform-Auditvertrag mit Actor, Aktion, Ziel, Vorher-/Nachher-
  Zustand und optionalem Grund bleibt erhalten.

## 2026-08-24 - Referral Final Gate und autoritative Testbasis verifiziert

- Referral-Owner-Audit auf den bestehenden Actor-Vertrag `admin` korrigiert.
- Booster-KPIs auf aktuelle `POINTS_ADDED`-Events umgestellt und sichere
  Legacy-Kompatibilitaet mit Deduplizierung beibehalten.
- Testkunden und Testevents bleiben aus operativen Booster-KPIs ausgeschlossen.
- Migration `20260824002000_fix_referral_settings_audit_and_boost_kpis.sql` auf
  Staging angewendet und Local/Remote-Historie synchronisiert.
- Die vollstaendige autoritative Testsuite im Recovery-Worktree wiederhergestellt;
  die abweichenden 48 Tests stammten aus einer unvollstaendigen Repository-Kopie.

## 2026-08-24 - Canonical V1 Recovery integriert

- Sichtbares Branding auf WUXUAI Bonus und den Kundenbereich Meine Vorteile
  vereinheitlicht, ohne Routes oder technische Datenbanknamen umzubenennen.
- Freundschaftsbonus auf Default 14 Tage, 7/14/28/Custom sowie volle
  Referrer- und exakt halbe Freundesdauer konsolidiert; 2x bleibt die Obergrenze.
- Historische Booster bleiben unverändert; neue Grants sind rollenbezogen und
  idempotent.
- Canonical Product Contract und Legacy Document Index trennen den aktuellen
  V1-Vertrag von historischen Reports und Migrationen.

## 2026-08-23 – Staff-Tages-KPIs und Schnellnavigation korrigiert

- Staff-Tages-KPIs lesen gutgeschriebene Punkte aus `points_transactions` und
  finalisierte Einlösungen aus dem unveränderbaren Aktivitätsjournal.
- Lokale Tagesgrenzen stammen aus der Restaurant-Zeitzone; Testkunden und
  Testeinlösungen bleiben aus operativen Werten ausgeschlossen.
- Erfolgreiche Punktebuchungen laden die Tagesübersicht neu, während
  Abfragefehler weiterhin nicht als echte Null-Aktivität erscheinen.
- Die Staff-Bottom-Navigation bietet fünf direkte Ziele: Start, QR scannen,
  Tages-PIN, Gast suchen und Mehr. Bestehende Handler und Businesslogik bleiben
  unverändert.
- Die kollidierende lokale Reporting-Migrationsnummer wurde vor dem
  Staging-Lauf eindeutig auf `20260823001500` korrigiert.

## 2026-08-23 – Customer-Kartendetail über Leaflet stabilisiert

- Das Restaurantdetail in der mobilen Kartenansicht verwendet den bestehenden
  Body-Portal-Drawer statt eines innerhalb der Finder-Seite fixierten Elements.
- Kartencontainer und Leaflet-Laufzeit bilden einen isolierten Stacking-Kontext,
  sodass Tiles, Marker, Popups und Controls den Drawer nicht mehr überlagern.
- Der Drawer sperrt Hintergrundinteraktionen, scrollt auf iOS-taugliche Weise
  intern und gibt Karteninteraktion sowie Body-Scroll nach dem Schließen frei.
- Bottom-Navigation und Safe Areas bleiben berücksichtigt; Restaurant-, Karten-,
  Punkte-, Reward- und Geschenklogik wurden nicht geändert.

## 2026-08-23 – Customer-Chips und Restaurantlogos mobil korrigiert

- Filter in „Meine Lokale“ und „Lokale entdecken“ bleiben einzeilig,
  horizontal scrollbar und erhalten rechts ausreichend Scroll-Abstand für den
  letzten vollständig sichtbaren Chip.
- Customer-spezifische Restaurantlogos verwenden durchgehend `object-fit:
  contain`, erhalten breitere Markenflächen und werden nicht mehr durch
  `overflow: hidden` abgeschnitten.
- Lokalkarten begrenzen ihre Breite, lassen lange Namen und Adressen umbrechen
  und behalten den bestehenden Safe-Area-Abstand zur Bottom-Navigation.
- Keine Business-, Datenbank-, API-, Auth-, Reward-, Punkte- oder Geschenklogik
  geändert.

## 2026-08-23 – Customer Mobile UI stabilisiert

- Customer-Shell verwendet normalen vertikalen Seitenfluss statt eines
  verschachtelten, gesperrten `100dvh`-Scrollcontainers.
- Customer Home, Rewards, Geschenke und Konto erhalten kompaktere Karten,
  Typografie und Abstände bei unveränderten Handlern und Datenverträgen.
- Zentrale Lokalkarten wechseln auf kleinen Geräten in ein lesbares 2x2-KPI-
  Raster; lange Namen, Adressen und Statuswerte dürfen umbrechen.
- Finder-Suche, Umschalter und Filter bleiben mindestens 44 Pixel hoch, nutzen
  auf 320 bis 430 Pixeln sichere Spalten und reservieren Platz für die feste
  Bottom-Navigation.
- Karten-Bottom-Sheet, Kartenfläche und Seiteninhalt berücksichtigen iOS Safe
  Areas; es wurde keine Datenbank-, RLS-, Auth- oder Bonuslogik geändert.

## 2026-08-23 – Geschäftsadresse automatisch geocodiert

- Owner geben im Standortformular nur noch Adresse, Postleitzahl, Ort und Land
  ein; Koordinaten werden nach ausdrücklichem Klick serverseitig ermittelt.
- Neue tenantgeschützte Supabase Edge Function übermittelt ausschließlich die
  Geschäftsadresse an den fest definierten Nominatim-Endpunkt.
- Zeitlich begrenzter Cache und atomarer globaler Provider-Slot verhindern
  unnötige oder schnell aufeinanderfolgende externe Requests.
- Mehrere Treffer, kein Treffer, Rate Limit und Adressänderungen besitzen klare
  deutsche UI-Zustände; alte Koordinaten gelten nach Adressänderung nicht fort.
- Legal-V0.9 bleibt unverändert; ein separates ungeprüftes Addendum dokumentiert
  Datenschutz, Drittanbieterhinweis und spätere Production-Prüfung.

## 2026-08-23 – Owner-Standortkarte stabilisiert

- Karten- und Markerstyles aus der Finder-Route in den lazy geladenen
  Kartenbaustein verschoben, damit die Owner-Markervorschau unabhängig von der
  vorherigen Navigation vollständig dargestellt wird.
- Leaflet synchronisiert seine Größe nach dem sichtbaren Render und bei echten
  Containeränderungen kontrolliert über `invalidateSize()`.
- OpenStreetMap verwendet die kanonische HTTPS-Kacheladresse; ein fehlgeschlagener
  Kachelabruf zeigt einen kompakten deutschen Fehlerzustand mit Retry.
- Keine Standort-, Finder-, Datenbank-, RLS- oder Tenantlogik geändert.

## 2026-08-09 – V1 Release-Finishing für Geschenke und Benachrichtigungen

- Willkommens- und Geburtstagsgeschenke verwenden additiv das bestehende
  15-Minuten-Präsentationsprinzip; historische Codes bleiben kompatibel.
- Geburtstagsgeschenke werden 14 Tage vorher einmalig und serverseitig aus dem
  freigegebenen Willkommensgeschenk-Pool zugeteilt.
- Private idempotente Queues für Zuteilungs-, Ablauf- und
  Punkte-Schwellen-E-Mails ergänzt; Versandfehler beeinflussen keine Buchung.
- Dashboard-Resolver führt bei fehlendem Pool direkt zur bestehenden
  Geschenkverwaltung.
- Stripe wurde nicht implementiert und bleibt ein separater letzter Sprint.

## 2026-08-05 – Kunden-E-Mail-Bestätigung prefetch-sicher vorbereitet

- konkreten Staging-Fehler als `One-time token not found` auf `GET /verify`
  identifiziert.
- Kunden- und Owner-Callback auf eine bewusste Zwei-Schritt-Bestätigung
  vorbereitet; der erste Seitenaufruf verbraucht keinen Einmal-Link mehr.
- `token_hash`, PKCE-Code und vollständiger Legacy-Hash werden zentral validiert;
  parallele Verarbeitung wird per Single Flight zusammengeführt.
- Kunden-Resend mit generischer Antwort, Cooldown und sicherem Rückkehrkontext
  ergänzt.
- Supabase-Template- und Redirect-Umstellung bewusst noch nicht aktiviert, da
  dafür zuerst der kompatible App-Build auf Staging bereitstehen muss.

## 2026-08-04 – Zentraler Kundenbereich und Angebots-E-Mail-Vertrag

- `Mein WUXUAI` mit zentraler Route und fünfteiliger Navigation ergänzt.
- bereits validierte restaurantbezogene Memberships serverseitig verknüpft;
  Punkte bleiben getrennt und werden nicht summiert.
- Finder und `Aktuelles` von Browser-Tokenaggregation auf zentralen Account-RPC
  umgestellt.
- freiwilliges, restaurantbezogenes E-Mail-Consent-/DOI-/Abmeldemodell und
  idempotentes Digest-Delivery-Log additiv vorbereitet.
- Marketingversand mangels freigegebenem Provider weiterhin deaktiviert.
- Owner-Ansicht auf aggregierte E-Mail-Kennzahlen ohne Empfängerlisten begrenzt.
- Migration nicht angewendet; kein Deployment durchgeführt.

## 2026-08-04 – Aktuelles & Angebote technisch umgesetzt

- eigenstaendiges, tenantgebundenes Angebotsmodell ohne Reward- oder
  Punktebeziehung ergaenzt
- serverseitige Fuenfergrenze mit Schutz gegen parallele Veroeffentlichung
  vorbereitet
- Owner-Verwaltung mit Entwurf, Vorschau, Veroeffentlichung, Deaktivierung,
  Duplizierung und Archivierung ergaenzt
- sicherer bestehender Owner-Bildupload wiederverwendet
- CustomerPortal, zentrale Aktuelles-Seite und Partnerlokal-Finder angebunden
- Analytics auf PII-freie Tagesaggregate begrenzt
- Migration nur im Staging-Dry-Run geprueft und nicht angewendet

## 2026-08-04 – V1-Modul Aktuelles & Angebote freigegeben

- `Aktuelles & Angebote` als eng begrenztes Informationsmodul fuer Restaurants
  in V1 dokumentiert.
- Wochen-, Monats- und Mittagsangebote, neue Gerichte, Saisonhinweise,
  Veranstaltungen und Neuigkeiten als zulaessige Beitragstypen festgelegt.
- Maximal fuenf gleichzeitig veroeffentlichte Beitraege pro Restaurant
  verbindlich festgelegt.
- Strikte Trennung von Rewards, Punkten, Geschenken, Coupons, Codes und
  Einloesungen dokumentiert.
- Kundenportal und Partnerlokal-Finder als reine Anzeigeflaechen vorgesehen;
  QR- und Kundenkontext bleiben unveraendert.
- V1-Auswertung auf personenbezugsfreie aggregierte Kennzahlen begrenzt.
- Automatisierung, Push, Segmentierung, Personalisierung, Attribution und
  A/B-Tests bleiben V2.
- Rechtliche Pruefung von Preisangaben, Verfuegbarkeit, Bildrechten,
  Produktinformationen, Allergenen und Veranstaltungsangaben vor Production
  festgehalten.
- Nur Dokumentation aktualisiert; keine Produkt-, Datenbank-, RLS- oder
  Laufzeitaenderung vorgenommen.

## 2026-08-03 – Punkte-Präsentationsfenster

- Normale Punktebelohnungen auf verbindliche Kundenbestätigung mit sofortigem,
  atomarem Punkteabzug umgestellt.
- Serverzeitgebundenes 15-Minuten-Fenster mit Live-Anzeige und idempotentem
  Abschluss ergänzt.
- Journal und Audit werden bereits bei Aktivierung geschrieben.
- Owner-/Support-Storno bucht Punkte atomar zurück; Geschenk-Codeflow bleibt
  unverändert.
- Neue Legal-Vorlage bleibt `DRAFT_LEGAL_REVIEW_REQUIRED`.

## 2026-08-03 – Dynamischer nächster Schritt im Owner-Dashboard

- Dauerhafte grüne Legal-Statuskarte durch einen zentral priorisierten
  `Nächster Schritt`-Resolver ersetzt.
- Echte Legal-Warnungen bleiben nicht schließbar und haben höchste Priorität.
- Kernschritte für Punkte-Einlösung, Punktevergabe, Willkommensgeschenk und QR
  werden aus bestehenden tenantgebundenen Statusdaten abgeleitet.
- Optionale Hinweise und die einmalige Startklar-Meldung werden pro Restaurant
  und Admin-Benutzer persistent mit RLS gespeichert.
- Ohne offene Aufgabe wird kein Hinweiscontainer und kein Leerraum gerendert.

## 2026-08-03 – Partnerlokal-Finder mit eigenen Bonusständen

- Kundenseite als `Lokale entdecken` mit Karte, Liste und sechs V1-Filtern
  vereinheitlicht.
- Öffnungsstatus einschließlich Mittagspause nach Europe/Vienna ergänzt.
- Restaurantbezogene Punkte, Besuche und Belohnungen in einem begrenzten,
  tokengeprüften Aggregat-RPC zusammengeführt und N+1-Abfragen entfernt.
- Karteninteraktion bleibt rein lesend und verändert keinen aktiven QR-Kontext.

## 2026-08-03 – Bonnummer aus dem aktiven V1-Punkteflow entfernt

- Bonnummer-Eingabe aus Staff UI und Servicevertrag entfernt.
- Oeffentlichen restaurantgesteuerten Confirm-RPC auf fuenf Parameter reduziert.
- Historischen sechsparametrigen Vertrag fuer Browserrollen gesperrt.
- Bonnummer-Eindeutigkeitsindex entfernt, ohne historische Werte oder Spalten zu
  loeschen.
- Reverse-Fingerprint an Tenant, Operation, Originaltransaktion,
  serverautorisierte Rolle und normalisierte Begruendung gebunden.

## 2026-08-01 – Gemeinsame serverseitige Punkte-Engine

- Customer- und restaurantgesteuerte Buchungen auf eine gemeinsame Berechnung umgestellt.
- Aktiven Referral-Boost einschließlich Snapshot und Ablauf serverseitig integriert.
- Erstbuchungsqualifizierung atomar und genau einmal nach erfolgreicher Buchung umgesetzt.
- Preview bleibt zustandslos; Confirmation rechnet unter Lock erneut.
- Legacy-Direktfunktionen für Browserrollen gesperrt und Parallel-Retry nach QR-Lock abgesichert.

## 2026-07-31 – Owner-konfigurierbare Punkte-Sammel-Modi

- Kurzlebigen Single-Use-Kunden-QR und atomare restaurantgesteuerte Punktebuchung ergänzt.
- Bestandsrestaurants rückwärtskompatibel auf den bisherigen Sammelweg gesetzt.
- Owner-Einstellung für Modus und Maximalbetrag ergänzt.

## 2026-07-30 – Ungültige Supabase-Refresh-Tokens kontrolliert bereinigen

- Strukturierte Fehler für fehlende, bereits verwendete, widerrufene,
  abgelaufene oder anderweitig ungültige Refresh-Tokens beenden die lokale
  Auth-Sitzung genau einmal.
- Der projektbezogene Supabase-Auth-Storage wird nach lokalem Sign-out gezielt
  entfernt und geschützte Ansichten leiten kontrolliert zum Restaurant-Login.
- Temporäre Netzwerk-, Timeout- und Serverfehler löschen keine gültige lokale
  Sitzung.
- Ein Single-Flight-Controller verhindert parallele Refresh-Anfragen und
  wiederholte 400-Schleifen; öffentliche Seiten starten keinen Refresh.
- React Strict Mode erzeugt durch Effekt-Cleanup weder doppelte Listener noch
  parallele Refresh-Intervalle.
- Der normale App-Client bleibt ein Singleton. Der getrennte Recovery-Client
  bleibt absichtlich tabgebunden, besitzt eigenen Storage und keinen
  Auto-Refresh.

## 2026-07-30 – Initiales Legal-Paket transaktional mit Onboarding veröffentlichen

- Schritt 7 verlangt nun die ausdrückliche Owner-Bestätigung zur Veröffentlichung der automatisch vorbereiteten Dokumente.
- Der neue owner- und tenantgeschützte RPC `complete_restaurant_onboarding` veröffentlicht das vollständige Legal-Paket und aktiviert erst danach das bestehende Restaurant.
- Fehlende Pflichtdokumente, ungültige Drafts oder fehlende Registration-Readiness rollen den Abschluss vollständig zurück.
- Der bestehende Restaurant-Slug bleibt unverändert; es gibt keinen Restaurant-Insert und keine Fallback-Aktivierung.
- Gültigkeitsdaten verwenden das lokale Kalenderdatum in `Europe/Vienna`.
- Initiale Veröffentlichung räumt den Dirty-State auf; spätere echte Änderungen erzeugen weiterhin neue unveränderliche Drafts.
- Migration `20260730002000_onboarding_initial_legal_package_publication.sql` wurde nach erfolgreichem Dry-Run auf `wuxuai-bonus-staging` angewendet.
- RLS blieb unverändert; der neue RPC ist für `anon` gesperrt.

## 2026-07-30 – Kontextbezogene Hilfe im Restaurant-Onboarding

- Der Onboarding-Hilfedrawer zeigt fuer jeden der sieben Schritte einen
  eigenen kurzen Hilfetext.
- Titel und Hilfebutton verwenden die klare Bezeichnung
  `Hilfe zu diesem Schritt` beziehungsweise `Hilfe`.
- Jede Hilfe beschraenkt sich auf die aktuelle Entscheidung und enthaelt eine
  kleine Zeit- oder Tippzeile.
- Die allgemeine Zusammenfassung spaeterer Onboarding-Inhalte wurde entfernt;
  Businesslogik, Navigation und Datenbank bleiben unveraendert.

## 2026-07-30 – Restaurantfokussierte V1 wiederhergestellt

- Die validierte restaurantfokussierte Baseline `b9b2647` ist der offizielle
  V1-Ausgangspunkt auf `release/v1-restaurant-bonus`.
- Die branchenneutrale Phase 1/2 ist auf `future/v2-business-neutral` und mit
  dem Tag `v2-business-neutral-snapshot-2026-07-30` vollstaendig archiviert.
- V1 wird als `WUXUAI Restaurant Bonus` fertiggestellt; Branchenprofile,
  neutrale Produktsprache und Bonusprogramm-Assistent bleiben V2.
- Alle vorhandenen Sicherheits-, Legal-, Identity-, QR-, Audit- und
  Onboarding-Migrationen bleiben erhalten; es gibt keinen Schema-Rollback.
- Decision Record:
  `docs/product/DECISION_2026-07-30_V1_RESTAURANT_FIRST_V2_DEFERRED.md`

## 2026-07-29 – Automatisiertes Legal-Paket im Restaurant-Onboarding

- Das siebenstufige Onboarding bleibt erhalten und ergänzt Schritt 1 um
  kompakte rechtliche Unternehmensstammdaten ohne juristische Freitexte.
- Zentrale versionierte Mastervorlagen erzeugen tenantgebunden Impressum,
  Teilnahmebedingungen, Datenschutz, Bonusregeln und Kassenabgrenzung.
- Pilotrestaurants dürfen gekennzeichnete Testvorlagen automatisch als
  Entwurf erzeugen; die Veröffentlichung verlangt eine ausdrückliche
  Owner-Bestätigung. Production verlangt zentral geprüfte Mastervorlagen.
- Das Owner Legal Center zeigt eine kompakte Dokumentübersicht mit
  verständlichen Statusbezeichnungen und progressiver Detailbearbeitung.
- Das Dashboard zeigt einen serverseitig berechneten grünen, gelben oder roten
  Legal-Status mit Ursache, Aktualisierungszeitpunkt und direktem Zugang.
- Dokumentdetails enthalten Version, Erstellungs- und Veröffentlichungszeit,
  Gültigkeit, Acceptance-Anzahl, verantwortlichen Owner und Mastertemplate.
- Bestehende Kundenbestätigungen bleiben historisch unverändert; eine erneute
  Zustimmung wird niemals still aktiviert.
- Programmende ist ein eigener bestätigter Owner-Flow.
- Änderungen relevanter Bonuskonfigurationen markieren eine neue
  Dokumentversion als erforderlich, ohne veröffentlichte Altversionen zu
  überschreiben.

## 2026-07-29 – Legal Readiness für Kundenregistrierung

- Teilnahmebedingungen und Datenschutzerklärung gelten öffentlich nur, wenn
  beide Versionen veröffentlicht und am aktuellen Datum bereits gültig sind.
- Der interne Legal-Template-Helper ist nicht mehr anonym oder über normale
  Browserrollen ausführbar.
- Das Owner Legal Center zeigt Version, Veröffentlichungsstatus, Gültigkeitsdatum
  und die tatsächliche Bereitschaft der Kundenregistrierung je Pflichtdokument.
- Staging-Testtexte bleiben ausdrücklich als `DRAFT_LEGAL_REVIEW_REQUIRED`
  gekennzeichnet und sind keine anwaltlich freigegebenen Production-Texte.

## 2026-07-29 – Öffentliche Seiten ohne vorschnellen Auth-Refresh

- Öffentliche Routen initialisieren keine persistierte Supabase-Session mehr
  und lösen deshalb keinen unnötigen Refresh-Request aus.
- Automatische Token-Aktualisierung startet ausschließlich auf geschützten
  Owner-, Staff- und Plattform-Routen.
- Fehler beim Laden einer geschützten Session werden kontrolliert als
  ausgeloggter Zustand behandelt, ohne technische Fehlermeldung in der UI.
- Anmeldung und dauerhaft gespeicherte Sessions bleiben für geschützte Routen
  erhalten; Datenbank, RLS und Auth-Verträge wurden nicht geändert.

## 2026-07-29 – Einlösequote als feste Auswahl

- Restaurant-Einstellungen und Reward-Dialog verwenden eine native Auswahl mit
  exakt 1 % bis 10 % statt einer freien Zahleneingabe.
- Der Standardwert für neue Einstellungen ist 3 %.
- Konsumation, benötigte Punkte und wirtschaftliche Einordnung reagieren sofort
  auf die Auswahl.
- Legacy-Werte außerhalb des gültigen Bereichs bleiben sichtbar und müssen vom
  Owner bewusst ersetzt werden; historische Einlösungen bleiben unverändert.
- Die Datenbankmigration erweitert den zulässigen Bereich ohne Backfill oder
  Überschreiben bestehender Werte.

# WUXUAI Bonus V1 – Changelog

## 2026-08-19 - Offers-Audit-400 auf Staging behoben

- reproduzierbaren `save_restaurant_offer`-Fehler auf den unzulässigen Audit-Akteurstyp `restaurant_user` eingegrenzt
- additive Forward-Migration stellt alle vier Offers-Schreib-RPCs auf den bestehenden Typ `admin` um
- Offers-Schema, RLS, Grants, Fünfergrenze und Mandantentrennung unverändert beibehalten
- Staging auf 92/92 Migrationen synchronisiert; DB-Linter 0 Fehler und CRUD-Smoke vollständig mit explizitem Rollback bestanden
- Loading-, Empty- und Error-Zustand der Owner-Seite sprachlich eindeutig getrennt
- keine Marketing-Mail-, Reward-, Punkte-, Production- oder Stripe-Änderung

Status: **LOCK**

## 29.07.2026 - Customer Identity Security-Verifikation auf Staging

- Fremde Restauranttokens werden nach einem leeren Token-Lookup unmittelbar
  als ungültig abgelehnt, bevor Membership-Status geprüft werden.
- Der kontrollierte Owner-Supportpfad verwendet den bestehenden erlaubten
  Audit-Akteurtyp `admin` und bleibt tenantgebunden.
- Keine RPC-Signatur und keine RLS-Policy wurde gelockert.
- Beide Fehler wurden durch rollback-sichere Live-Verhaltenstests auf Staging
  nachgewiesen und nach der additiven Migration erneut erfolgreich geprüft.

## 28.07.2026 - Wiedererkennung nach erneutem Restaurant-QR

- Kundenzugänge werden vor dem ersten Portal-Request synchron und getrennt je
  Restaurant-Slug aus einem versionierten lokalen Zugangsspeicher gelesen.
- Bestehende Legacy-Tokens werden in den neuen restaurantbezogenen Schlüssel
  übernommen; Restaurant A und Restaurant B überschreiben sich nicht.
- Eine Registrierung gilt im Browser erst nach verifiziertem Speichern des
  Zugangs als abgeschlossen. Bei blockiertem Safari-Speicher wird nur das
  Speichern wiederholt und kein zweites Kundenkonto angelegt.
- URL-Tokens werden nach erfolgreicher Servervalidierung und lokaler
  Persistierung aus der Browseradresse entfernt.
- Fokus, Sichtbarkeitswechsel und Safari-BFCache lösen eine erneute
  serverseitige Zugangsprüfung aus.
- Keine Punkte-, Reward-, Tages-PIN-, RLS- oder Datenbanklogik wurde geändert.

## 27.07.2026 - Optionale Einwilligungen und Restaurant-Neuscan

- Der Registrierungsabschluss verlangt nur noch gültige Pflichtfelder,
  Teilnahmebedingungen und Datenschutzbestätigung.
- Freiwillige Geburtstags- und Marketingeinwilligungen dürfen deaktiviert
  bleiben und erzeugen dadurch keinen aktiven Marketingstatus.
- Der Sammel-Flow bietet einen echten kamerabasierten Restaurant-QR-Scanner.
- Ein neuer Scan übernimmt ausschließlich den neuen Restaurant-Slug und keine
  Token oder Query-Daten aus dem gescannten Link.
- Ungültige und fremde QR-Codes aktivieren keinen alten Restaurantkontext;
  Abbrechen führt bewusst zum neutralen Gast-Bonus-Einstieg.
- Keine Datenbank-, RLS-, Punkte- oder Rewardlogik wurde geändert.

## 24.07.2026 - Legal- und Karten-Hardening

- Leaflet, React Leaflet und Marker Cluster hinter einen echten dynamischen
  Kartenimport verschoben und in einen separat cachebaren Maps-Chunk gelegt.
- Listenansicht bleibt bei einem Kartenimportfehler nutzbar.
- Legal-Hilfslogik vollständig nach TypeScript migriert; manuelle Declaration
  entfernt.
- Öffentlichen Legal-Center-Pfad read-only gemacht und fehlende Konfiguration
  als kontrollierten Status modelliert.
- Registrierungen bleiben ohne verfügbare Pflichtdokumente blockiert, während
  bestehende Bonuskonten bei einem temporären Legal-Fehler weiter nutzbar sind.
- Kundendatenexport auf Nachweismetadaten statt Legal-Dokumentvolltexte
  begrenzt.
- Identische, unreferenzierte Dokumentduplikate entfernt und minimierten
  Consent-Nachweis ohne vollständige IP-Adresse dokumentiert.

## 23.07.2026 - Partnerrestaurant-Finder mit OpenStreetMap

- CTO-Ausnahme für eine optionale, rein lesende Partnerrestaurantsuche ergänzt.
- Leaflet und OpenStreetMap als einzige interne Kartenlösung gewählt.
- Bestehende primäre Standortzeile additiv um öffentliche Standortfelder
  erweitert; Altbestände bleiben standardmäßig unsichtbar.
- Minimalen öffentlichen Partner-RPC und restaurantgebundene
  Kundenmitgliedschafts-RPC vorbereitet.
- Keine Google Maps Platform API und kein API-Key erforderlich.
- Google Maps wird ausschließlich als externer Navigationslink verwendet.
- QR-, Punkte- und Redemption-Kontext bleiben unverändert restaurantgebunden.

## 20.07.2026 - Premium-Kundenportal Staging-E2E

- Registrierten Kundenflow mit echter Staging-Punktebuchung und
  Punkteeinlösung geprüft.
- Staff-Fehlermapping übernimmt strukturierte Supabase-Fehler, damit ein
  bereits verwendeter Einlösecode korrekt bezeichnet wird.
- Verbleibende Blocker für aktiven Code-Status und Dashboard-Kundenkennzahlen
  dokumentiert; keine Datenbank- oder Produktlogik geändert.

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

## 1.0 2026-07-19 - Restaurant Portal Logout

Status: **CODE LOCK / LIVE-FLOW OFFEN**

Das Restaurant Portal besitzt jetzt einen klaren Logout für Owner und Manager.

Geändert:

- Desktop-Profilmenü mit „Abmelden“
- mobiler Logout am Ende des Navigations-Drawers
- `supabase.auth.signOut()` mit lokalem Session-Cleanup
- sofortiger Reset von Restaurant-, Branding- und Rollenstatus
- Restaurant-Login unter `/restaurant/login`
- geschützte Routen leiten ausgeloggte Nutzer zum Restaurant-Login
- verständliche Meldung, wenn die Online-Abmeldung nicht bestätigt werden kann

Offen:

- authentifizierter Live-Test mit echtem Owner
- authentifizierter Live-Test mit echtem Manager
- Kontowechseltest mit zwei echten Restaurantkonten

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

### Build-Reihenfolge korrigiert

- `wrangler.jsonc` führt bei direkten Wrangler-Aufrufen zuerst den Vite-Build aus
- Cloudflare Workers Builds ist auf `npm run build` vor `npm run deploy` festgelegt
- `dist/` bleibt ein generiertes, nicht versioniertes Build-Artefakt
- Ursache des Cloudflare-Fehlers `assets.directory does not exist` dokumentiert
- Deploy- und Preview-Skripte erzeugen `dist/` zusätzlich selbstständig

---

## 2026-07-19 – Desktop-Header des Restaurant-Portals vereinheitlicht

- Desktop-Status ab `1024 px` als klare Badge mit Statuspunkt dargestellt
- Restaurantauswahl und Profilbereich auf eine einheitliche Höhe gebracht
- Profil um Initial, Anzeigename/E-Mail-Kurzform und Restaurantrolle ergänzt
- lange Restaurantnamen und Profiltexte gegen horizontalen Überlauf abgesichert
- Restaurantwechsel, Profilmenü und Logout-Logik unverändert beibehalten
- Mobile-Status, Hamburger und Drawer unter `1024 px` unverändert gelassen
- keine Datenbank-, RPC- oder Businesslogik geändert

---

## 2026-07-19 – Kartenbearbeitung auf gemeinsamen Drawer umgestellt

- gemeinsame `AppDrawer`-Komponente mit Dialogsemantik eingeführt
- Bearbeitung gespeicherter Punkteeinlösungen aus dem Inline-Scrollbereich in
  den Drawer verschoben
- Bearbeitung von Willkommensgeschenken aus dem Inline-Scrollbereich in den
  Drawer verschoben
- aktive Ursprungskarte während der Bearbeitung markiert
- Desktop-, Tablet- und Mobile-Breiten sowie sticky Aktionsbereich ergänzt
- Escape, Overlay, Schließen-Button, Fokus-Trap und Fokus-Rückgabe umgesetzt
- Informations-KPIs und bestehende Navigationskarten unverändert gelassen
- keine Datenbank-, RPC-, Routen- oder Businesslogik geändert

---

## 2026-07-20 – Kundenportal auf Premium Design Standard migriert

- technische Kunden-Drawer auf den gemeinsamen `AppDrawer` vereinheitlicht
- isolierte Premium-Tokens und wiederverwendbare Kundenkomponenten eingeführt
- mobile Navigation mit Start, Einlösen, Sammeln und Konto ergänzt
- Startansicht mit Bonus Boost, dominanter Punktekarte und Punkteeinlösungs-
  Vorschau neu strukturiert
- Punkteeinlösungen, Geschenke, Einlösebestätigung und Einlösecode visuell
  vereinheitlicht
- Punkte-sammeln-Flow, maskierte Tages-PIN sowie Erfolgs- und Fehlerzustände
  modernisiert
- Restaurant-QR-Einstieg und Freunde-Einladung in dieselbe Premium-Shell
  überführt
- Emoji-Icons in der Kundenoberfläche durch Lucide-Icons ersetzt
- keine Datenbank-, RPC-, RLS-, Auth-, Punkte-, PIN-, QR-, Referral- oder
  Einlöselogik geändert
# 2026-07-20 - Audit-Protokoll und sicherer Testmodus

- bestehendes `audit_log` um normalisierte Ereignisse, Status, Quelle, Entität, Anfrage-ID und sichere Testkennzeichnung erweitert
- kontrollierte Testkunden mit verpflichtender Test-Sitzungs-ID ergänzt
- Testkunden aus produktiven Restaurant-Dashboard- und Bonus-Boost-KPIs ausgeschlossen
- persistente Auditierung falscher Tages-PINs und blockierter Punktebuchungen ergänzt
- sensible Metadaten wie Token, PIN, Passwörter, Sitzungen und Codes serverseitig entfernt
- Plattform-Auditseite unter `/admin/platform/audit` mit Filtern und sicherem Detail-Drawer ergänzt
- Audit-RLS verschärft; `anon` und Kunden erhalten keinen direkten Audit-Zugriff
- Migrationen `20260720001000` und `20260720002000` auf Staging angewendet

## 2026-07-20 – Premium-KPI- und Einlösestatus-Korrektur

- lokal gespeicherte Einlösecodes werden vor Wiederanzeige serverseitig geprüft
- `redemption_started` bleibt als aktiver Vorzeigestatus erhalten
- verbrauchte und abgelaufene Codes werden aus der Kundenansicht entfernt
- Restaurant-Dashboard um Kunden gesamt, neue Kunden heute/diese Woche und heute aktiv ergänzt
- Einlösungen heute umfasst finale Willkommens-/Geburtstagsgeschenke, Punkteangebote und Coupons
- KPI-Zeitgrenzen serverseitig an Restaurant-Zeitzone gebunden
- markierte Testkunden aus allen produktiven KPI-Quellen ausgeschlossen
- Migration `20260720003000` auf Staging angewendet

## 2026-07-22 – V1 Retention-Funktionen vorbereitet

- Ablauf-Erinnerungen für 7, 3, 1 und 0 verbleibende Tage mit einmaligem Auto-Drawer pro Session ergänzt
- freiwillige Web-Push-Registrierung, Service Worker und sichere Edge-Sender-Funktion vorbereitet
- Push-Deep-Links öffnen die passende Punkteeinlösung ohne automatische Einlösung
- freiwillige Geburtstagseingabe aus Tag und Monat sowie einmalige serverseitige Geburtstagsauslosung im Zeitraum -3/+7 Tage ergänzt
- bestehender Willkommensgeschenk-Pool um eine explizite Geburtstagsfreigabe erweitert
- alte automatische Geburtstagszuteilung zugunsten der kundenausgelösten, idempotenten Auslosung deaktiviert
- Bonus Boost auf feste V1-Werte 2×/30 Tage für beide Beteiligten vereinheitlicht; aktive Empfehlenden-Boosts verlängern sich um 30 Tage
- neue Bonus-Boost-KPIs schließen markierte Testkunden aus
- additive Migration `20260722003000_v1_retention_features.sql` am 23.07.2026 auf das verknüpfte Supabase-Projekt angewendet und per Migrationsliste, leerem Dry-Run sowie erreichbarer PostgREST-RPC verifiziert

## 2026-07-23 – P0 QR-Restaurantkontext korrigiert

- Kundenportal-Routen werden bei Wechsel von Restaurant-Slug oder Sammelmodus mit
  einem neuen, URL-basierten Schlüssel aufgebaut
- aktueller URL-Slug ist die einzige Quelle für Restaurantladen und Punktebuchung
- ein URL-Kundentoken hat Vorrang vor Registrierungs- und lokalem Token-State
- ungültige QR-URLs können nicht mehr auf zuvor angezeigte Restaurantdaten
  zurückfallen
- Regressionstests für QR-Wechsel, Token-Priorität, slug-getrennten Cache,
  Punkte-RPC-Bindung und ungültigen QR-Kontext ergänzt
- keine Datenbank-, RPC-, RLS-, Tages-PIN- oder Punkteberechnungslogik geändert

## 2026-07-23 – QR-Kontext-Restbugs für Staging behoben

- aktive Einlösungen nach Restaurant, gehashtem Kundenzugang und
  Einlösungs-ID in `sessionStorage` getrennt
- Wechsel A → B zeigt und pollt keinen Einlösezustand von A; Rückkehr zu A
  restauriert nur nach positiver Serverprüfung
- URL-Tokenwechsel erzeugt zusätzlich eine neue Kundenportal-Instanz
- Loader-Fehler entfernt Restaurant, Branding, Einstellungen, Kunde, Rewards
  und aktiven UI-Einlösestatus vollständig
- leere und syntaktisch ungültige Slugs lösen keine Portal-, Kunden-,
  Restore- oder Polling-Aufrufe aus
- Retry-Aktion im neutralen Portal-Fehlerzustand mit mindestens 44 px
  Touchhöhe ergänzt
- sechs echte Speicher-/Service-Verhaltenstests sowie bestehende statische
  Regressionstests ausgeführt; Gesamtsuite 96/96
- keine Migration, RPC-, RLS-, Punkte-, PIN- oder Einlöse-Geschäftslogik
  geändert
- fehlende Punkterückbuchung bei abgelaufenem reserviertem Einlösecode als
  separater offener Produktentscheid dokumentiert

## 2026-07-24 – Legal-Compliance-Layer für Rechtsprüfung vorbereitet

- öffentliches restaurantbezogenes Legal Center mit Teilnahmebedingungen, Datenschutz, Impressum, Speicherhinweisen, Barrierefreiheit und Beschwerdekontakt ergänzt
- unveränderliche Dokumentversionen, Annahmen, getrennte Einwilligungen, Consent-Ereignisse und Datenschutzanfragen additiv modelliert
- Registrierung verlangt Teilnahmebedingungen und Datenschutzhinweis; Marketing und Geburtstagsverarbeitung bleiben freiwillig und standardmäßig aus
- Marketingversand ohne kanalspezifische Einwilligung serverseitig blockiert
- Owner-Bereich um Rechtstexte, Bereitschaftscheckliste, Programmende, offene Datenschutzanfragen und technischen Einlösungs-CSV erweitert
- Punkte als restaurantbezogenes Nicht-Geld-Produkt erklärt; keine Auszahlung oder Übertragung ergänzt
- Aufbewahrung nur als konfigurierbarer Dry-Run vorbereitet; keine Daten gelöscht
- Migration `20260724001000` im Staging-Dry-Run als einzige ausstehende Migration bestätigt und nicht angewendet

## 2026-07-26 – Direkter Owner-Fotoupload für Belohnungen

- großer Bildbereich in Punkteeinlösungs- und Willkommensgeschenk-Formularen öffnet direkt die native Bildauswahl
- gemeinsame Owner-Komponente mit Tastaturbedienung, lokaler Vorschau, Lade- und Fehlerzustand ergänzt
- bestehender Bucket `restaurant-media` und vorhandene tenantgebundene Storage-Policies werden weiterverwendet
- Upload erfolgt erst beim Speichern; bei einem nachfolgenden Speicherfehler wird nur das neu hochgeladene Objekt bereinigt und das alte Bild bleibt erhalten
- sichere, restaurantbezogene Objektpfade verwenden UUIDs statt Original-Dateinamen
- additive Migration `20260726001000_owner_reward_image_webp.sql` ergänzt WebP im bestehenden Bucket; am 26.07.2026 auf `wuxuai-bonus-staging` angewendet und per Migrationsliste synchron bestätigt
- keine Customer-, Staff-, Plattform-, Reward-, Punkte-, RLS- oder Auth-Logik geändert

## 2026-07-26 – Einheitlicher Reward-Bildausschnitt

- Owner-Bearbeitung um Zoom, Fokusposition, Ziehen, Tastatursteuerung und Zurücksetzen ergänzt
- Bildausschnitt wird als normalisierte Metadaten gemeinsam mit Reward oder Willkommensgeschenk gespeichert
- Owner-Karten, Owner-Vorschau und Kundenportal verwenden dieselbe 16:9-Bildkomponente
- bestehende Bilder bleiben mit zentriertem Standardausschnitt kompatibel
- additive Migration `20260726002000_reward_image_crop_metadata.sql` im Staging-Dry-Run als einzige ausstehende Migration bestätigt, auf `wuxuai-bonus-staging` angewendet und per Migrationsliste sowie generiertem Remote-Schema verifiziert
- keine RLS-, Auth-, Punkte-, Einlöse- oder Tenant-Logik verändert

## 2026-07-26 – Öffentliche Einstiegsseiten vereinheitlicht

- Startseite, Restaurant-Login, Restaurant-Registrierung und Gast-Bonus-Information auf eine gemeinsame Premium-Shell umgestellt
- gemeinsame öffentliche Komponenten für Hero, Inhaltskarte, Formularfeld, Hauptbutton und Einstiegskarte ergänzt
- alte seitenbezogene Public-Styles aus der globalen Stylesammlung entfernt und in ein portalbegrenztes Stylesheet überführt
- sichtbare Labels, Autofill, Live-Regionen, Tastaturbedienung und mindestens 44 px große Touchziele vereinheitlicht
- Responsive-Abnahme bei 320, 375, 390, 430, 768, 1024 und 1440 px ohne horizontalen Overflow durchgeführt
- keine Auth-, Registrierungs-, Routing-, Supabase-, Datenbank-, RLS- oder Portal-Logik verändert

## 2026-07-27 – Mobiler QR- und Registrierungsablauf stabilisiert

- ein temporär fehlgeschlagener öffentlicher Portalaufruf wird einmal kontrolliert wiederholt, bevor der endgültige Fehlerzustand erscheint
- URL-Slug und Kundenzugang bleiben während des Retries unverändert; ein Route-Wechsel bricht den alten Wiederholungsversuch vor dem nächsten Request ab
- ungültige Restaurants und ungültige Kundenzugänge werden nicht automatisch wiederholt
- Registrierungsformular erzwingt auf der weißen Karte dunklen Primär- und Sekundärtext
- Pflicht- und freiwillige Checkboxen starten sichtbar leer; bestehende serverseitige Consent-Defaults bleiben `false`
- das bestehende native Geburtstagsfeld und seine freiwillige Verarbeitung bleiben unverändert
- `Fertig` wird erst bei gültigem Vornamen, gültiger Telefonnummer und beiden Pflichtbestätigungen aktiv
- freiwillige Einwilligungen sind mobil kompakt einklappbar; Abschlussaktionen bleiben oberhalb der Safe Area erreichbar
- keine Datenbank-, RPC-, RLS-, QR-, Tages-PIN- oder Punktelogik geändert

## 2026-07-27 – Aktiver Restaurantkontext strikt an QR-URL gebunden

- `/customer/:slug` und `/w/:slug` werden zentral aus dem aktuellen URL-Pfad validiert; ohne gültigen Restaurantpfad wird kein Customer Portal initialisiert
- QR-Wechsel A → B erzeugt eine neue Portalinstanz und verwirft Restaurant-, Branding-, Reward-, Bonstufen- und Ladezustand von A
- Kundenzugänge bleiben ausschließlich restaurantbezogen gespeichert; ein globaler aktiver Restaurantkontext wird weder in Local Storage noch Session Storage geschrieben
- Safari-BFCache wird über `pageshow` erkannt und initialisiert das Portal erneut aus der aktuell sichtbaren URL
- ein kontrollierter Retry verwendet weiterhin nur den beim aktuellen Scan validierten Slug und Kundenzugang
- `/customer` zeigt ohne QR-Kontext den Hinweis „Scanne den QR-Code im Restaurant, um dein Bonusprogramm zu öffnen.“
- der Service Worker besitzt keinen Fetch-Handler und hält deshalb keine Restaurant- oder Portalantworten im PWA-Cache
- keine Datenbank-, RPC-, RLS-, Punkte-, Tages-PIN-, Geburtstags- oder Portalrollenlogik geändert

## 2026-07-27 – Kundenidentität V1 ohne SMS-OTP gehärtet

- österreichische Telefonnummern werden zentral normalisiert und pro Restaurant eindeutig abgesichert
- bekannte Telefonnummern erzeugen bei erneuter öffentlicher Registrierung weder ein zweites Konto noch einen neuen Zugang
- unbekannte Geräte erhalten eine neutrale Supportmeldung; bekannte Geräte verwenden weiterhin ihren restaurantbezogenen Token
- Kunden können Telefonnummer und Geburtstag nach der Erfassung nicht selbst ändern
- kontrollierter Owner/Admin-Supportpfad mit Identitätsprüfung, Änderungsgrund, Audit und Token-/Gerätewiderruf ergänzt
- Owner- und Staff-Kundenlisten auf maskierte, minimierte Felder umgestellt
- SMS-Verifizierung nur als deaktivierte spätere Konfiguration vorbereitet; keine OTP- oder Provider-Abhängigkeit ergänzt
- Migration `20260727001000_customer_identity_v1_no_sms.sql` im Staging-Dry-Run als einzige ausstehende Migration bestätigt und nicht angewendet
## 2026-07-28 - V1 Bonus-Aktivitätsprotokoll

- Append-only Journal für final bestätigte Einlösungen vorbereitet.
- Unveränderbare Reward-, Punkte-, Mengen-, Rollen- und Zeit-Snapshots ergänzt.
- Legacy-Einlösungen ohne sichere Snapshotwerte werden sichtbar gekennzeichnet.
- Owner-Bereich `Berichte` mit Monats-, Jahres- und Journalansicht ergänzt.
- CSV-Detailprotokoll und druckbare Zusammenfassung ergänzt.
- Testkunden sind standardmäßig ausgeschlossen; Zeiträume verwenden `Europe/Vienna`.
- Bestehender Export-RPC bleibt kompatibel und liest aus dem Journal.
- Sichtbare Kassen-/Steuerbezeichnungen wurden durch klare Bonusprogramm-Begriffe ersetzt.
- Keine RKSV-, Kassen-, Steuer- oder Buchhaltungsfunktion eingeführt.

## 2026-07-28 - Dauer des Freundschaftsbonus konfigurierbar

- Owner-Bereich `Bonusprogramm` um eine eigene Einstellung für den Freundschaftsbonus ergänzt.
- Standard bleibt 2× für 30 Tage; Dauer-Presets 7/14/30/60/90 sowie eigene Werte von 1 bis 365 Tagen ergänzt.
- Owner/Admin-RPC ist restaurantbezogen und auditiert Änderungen als `REFERRAL_BONUS_SETTINGS_UPDATED`.
- Manager, Mitarbeiter, Kunden, anonyme Aufrufe und fremde Restaurants können die Einstellung nicht ändern.
- Neue Empfehlungen verwenden die aktuell gespeicherte Dauer; laufende Bonuszeiträume bleiben unverändert.
- Keine Änderung an Reward-, Tages-PIN-, Einlösecode-, Customer-Identity- oder Legal-Logik.

## 2026-07-30 - Mittagspause und einheitliche Pflichtfelder

- Öffnungszeiten im Onboarding und in den Restaurant-Einstellungen unterstützen optional zwei Öffnungsblöcke mit einer Mittagspause.
- Die bestehende `opening_hours`-JSON-Struktur wurde rückwärtskompatibel erweitert; eine Datenbankmigration war nicht erforderlich.
- Überlappende oder unvollständige Zeitfenster werden vor dem Fortfahren beziehungsweise Speichern blockiert.
- Das Kundenportal zeigt beide Öffnungsblöcke und während der Pause den Zeitpunkt der Wiederöffnung in `Europe/Vienna` an.
- Eine gemeinsame Formularbeschriftung kennzeichnet Pflichtfelder sichtbar mit `*`, ergänzt Screenreader-Text und vereinheitlicht optionale Felder.
- Zentrale V1-Formulare enthalten einen einheitlichen Pflichtfeldhinweis sowie `required` und `aria-required`, wo das Feld fachlich verpflichtend ist.
- Keine Migration, RLS-, Auth-, Punkte-, Reward-, PIN- oder Tenant-Logik geändert.

## 2026-07-30 - Automatischer Mittagspausenvorschlag

- `Mittagspause hinzufügen` berechnet aus einer mindestens achtstündigen Tagesöffnung automatisch zwei sinnvolle Öffnungsblöcke.
- Restauranttypische Zeiten wie 11:00–22:00 ergeben 14:00–17:00 Pause; 10:00–20:00 ergibt 14:00–16:30.
- Vor und nach der Pause bleiben mindestens 90 Minuten Öffnungszeit; Blockgrenzen und Pausengrenzen müssen exakt zusammenpassen.
- Kurze Öffnungstage bleiben unverändert und zeigen einen verständlichen Hinweis statt ungültiger Zeitfelder.
- Gespeicherte oder manuell angepasste Pausen werden nicht still neu berechnet.
- Beim Entfernen der Pause wird das Ende des zweiten Blocks wieder als Ende der durchgehenden Tagesöffnung verwendet.
- Mobile Zeitfelder stehen bei 390 und 430 px untereinander; keine Migration oder Businesslogik außerhalb der Öffnungszeiten geändert.

## 2026-07-30 - Legal Center gegen fehlende aktive Dokumentinhalte gehärtet

- Der Owner-Legal-Datenvertrag erlaubt bei vorbereiteten Dokumenthüllen ausdrücklich `content = null`, solange keine veröffentlichte Version existiert.
- Punktegültigkeit wird nur aus dem Inhalt einer aktiven Teilnahmebedingungen-Version angezeigt; Entwürfe und fehlende Werte erzeugen keinen erfundenen Standard.
- Neue Restaurants sehen verständliche Einrichtungs- beziehungsweise Veröffentlichungszustände statt eines White Screens.
- Loader-Fehler und fehlende Berechtigung werden neutral behandelt und können kontrolliert erneut geladen werden.
- Eine lokale Error Boundary schützt die geschützte Owner-Legal-Route vor unerwarteten Renderfehlern.
- Keine Migration, RLS-, Legal-Template-, Onboarding-, Bonus- oder Tenant-Logik geändert.
## 2026-08-04 – Zentraler Kundenlogin und Restaurantkontext vorbereitet

- `customer_accounts` additiv an bestätigte Supabase-Auth-Nutzer gebunden
- Kundenlogin, Kundenregistrierung und eigener Bestätigungs-Callback ergänzt
- QR-Slug bleibt über Anmeldung und Bestätigung erhalten
- Restaurantbeitritt mit Legal-Prüfung, ausdrücklicher Zustimmung, Tenant-Lock
  und bestehender Willkommenslogik umgesetzt
- zentrale Navigation auf Start, Meine Lokale, Entdecken und Konto reduziert
- global gemischten Angebotsfeed entfernt; Angebote nur im Restaurantkontext
- keine Migration angewendet und kein Versand aktiviert

## 2026-08-11 – V1-Transaktionsmail-Dispatcher technisch vorbereitet

- bestehende private Geburtstag-/Reminder-/Punkteschwellen-Outbox um
  Verarbeitungs-Lease, persistente Fehlerzeit und begrenzte exponentielle
  Wiederholungen erweitert
- serverseitige Edge Function für die drei vorhandenen V1-Transaktionsmails
  ergänzt; kein paralleles Queue- oder Marketingsystem eingeführt
- kontrollierte deutsche Templates mit HTTPS-Restaurant-Rückkehr und ohne
  Kundentokens oder sichtbare interne IDs ergänzt
- SMTP-, Scheduler- und Absenderwerte bleiben ausschließlich manuell zu
  setzende Edge-Function-Secrets
- zentrale Kundenkonto-, Restaurantkontext-, Geschenk-/Benachrichtigungs- und
  Dispatcher-Reparaturmigration auf Staging angewendet; Remote-Stand synchron
- Dispatcher mangels verfügbarer SMTP- und Scheduler-Secrets nicht deployt
- Stripe weiterhin ausdrücklich zurückgestellt

## 2026-08-11 – Passwortbestätigung in der Owner-Registrierung

- `/register` um das Pflichtfeld „Passwort bestätigen“ ergänzt
- Abweichung erst nach Feldnutzung oder Submit verständlich angezeigt
- Submit bei fehlender, ungültiger oder abweichender Passwortbestätigung blockiert
- Bestätigungswert bleibt ausschließlich lokaler Formularzustand und wird weder
  gespeichert noch an Supabase oder den Owner-Registrierungsservice übergeben
- Signup-, Trial-, Restaurant-, Onboarding-, E-Mail- und Legal-Flows unverändert

## 2026-08-21 – Kundenregistrierung und E-Mail-Bestätigung gehärtet

- Kundenregistrierung um die Pflichtangabe „Passwort bestätigen“ ergänzt; der
  Bestätigungswert bleibt ausschließlich lokaler Formularzustand.
- Signup-Antworten unterscheiden jetzt eine tatsächlich angeforderte
  Bestätigungs-E-Mail von Supabase-Anti-Enumeration-Antworten für bestehende
  Adressen.
- Erfolg wird nur angezeigt, wenn Supabase einen neuen unbestätigten Nutzer mit
  versendeter Bestätigung meldet.
- Kontrolliertes erneutes Senden mit Rate-Limit-Rückmeldung und 60-Sekunden-
  Sperre ergänzt.
- Customer-Callback, Restaurant-Rückkehr, optionale Geburtstagsangabe und
  bestehende Owner-Registrierung bleiben unverändert.

## 2026-08-23 – Gäste-Suche bei Restaurantwechsel stabilisiert

- Suchzustand der Owner-Gästeliste ist jetzt an das aktive Restaurant gebunden
  und wird bei einem Tenantwechsel zuverlässig zurückgesetzt.
- Gästeliste und optionale Berechtigung für Identitätskorrekturen laden
  unabhängig, damit ein Supportfehler keine vorhandenen Gäste ausblendet.
- Loading-, Empty- und Error-Zustände sind getrennt; fehlgeschlagene Requests
  besitzen einen kontrollierten Retry.
- Der bestehende minimierte, restaurantgebundene Gäste-RPC bleibt unverändert.

## 2026-08-23 – V1-Einlösung und Einlösungsberichte vereinheitlicht

- Die normale Staff-Oberfläche enthält keine sechsstellige Codeprüfung mehr;
  historische Code-Daten und Kompatibilitäts-RPCs bleiben unverändert erhalten.
- Punkte-, Willkommens- und Geburtstagsbelohnungen verwenden in der Kunden-UX
  den gemeinsamen serverzeitgesteuerten 15-Minuten-Präsentationsflow.
- Das unveränderliche Aktivitätsjournal erhält additive Start-, Finalisierungs-
  und optionale Referenzwert-Snapshots; fehlende historische Geldwerte werden
  nicht rekonstruiert.
- Der Owner-Bericht unterstützt Heute, Gestern, Wochen-, Monats-, Jahres- und
  benutzerdefinierte Zeiträume mit serverseitiger Aggregation und begrenzten
  Detailzeilen.
- CSV und Druckansicht enthalten keine direkten Kundendaten; Testvorgänge sind
  immer ausgeschlossen und Zeitgrenzen folgen der Restaurant-Zeitzone.

## 2026-08-23 – Geschlossenen Live-Einlösungs-Drawer respektieren

- Eine bewusst gestartete Einlösung öffnet den Präsentations-Drawer weiterhin
  einmalig.
- Nach dem Schließen aktualisieren Hydration, Polling und Abschluss nur noch den
  serverseitigen Status und öffnen den Drawer nicht erneut.
- Eine aktive Einlösung bleibt mit Titel, Restzeit und manueller Aktion als
  kompakter Hinweis im normalen Seitenfluss erreichbar.
- Einlöse-, Punkte-, Reporting-, Sicherheits- und Datenbanklogik bleiben
  unverändert.

## 2026-08-23 – Kunden-QR als primäre Staff-Aktion

- Die Staff-Startseite zeigt den bestehenden Kunden-QR-Scanner direkt nach der
  Begrüßung als wichtigste Serviceaktion.
- Die Tages-PIN bleibt vollständig erhalten, wird aber in einer kompakten
  weißen Karte mit vier gleich großen Ziffernfeldern sekundär dargestellt.
- Heute-KPIs und Gast-Suche folgen in klarer Reihenfolge; die bestehende
  dreiteilige Bottom-Navigation bleibt ohne Routing-Umbau bestehen.
- Ein synchroner UI-Guard verhindert mehrfaches Öffnen der Kamera durch schnelle
  Mehrfachklicks.
- Keine Scanner-, Punkte-, PIN-, Reporting-, Berechtigungs- oder Datenbanklogik
  geändert.

## 2026-08-24 – Owner-Login und Restaurantzugang getrennt behandelt

- Erfolgreiche Supabase-Sessions werden vor der Dashboard-Navigation direkt in
  den Auth-Provider übernommen, damit kein veralteter Guard-Zustand entsteht.
- Restaurantrollen werden ausschließlich aus der autoritativen
  Restaurant-Mitgliedschaft abgeleitet, nicht aus Auth-Metadaten.
- Temporäre Restaurant-Lookup-Fehler und fehlende Restaurantzuordnungen zeigen
  einen sicheren Retry-/Supportzustand, ohne die gültige Auth-Session zu löschen
  oder zur Login-Seite zurückzuleiten.
- Platform-Admin-, Customer-, Staff-, Trial- und Onboarding-Verträge bleiben
  unverändert.

## 2026-08-25 – Platform Admin Referral-Limit vervollständigt

- Der bestehende Restaurant-Control-Center-RPC liefert das autoritative,
  restaurantbezogene monatliche Einladungslimit.
- Die Platform-Admin-Oberfläche zeigt den echten Wert und unterscheidet ihn von
  fehlenden Daten; Abfragefehler werden nicht als Standardwert 5 dargestellt.
- Rollenprüfung, Grants, Tenant-RLS und Referral-Geschäftslogik bleiben
  unverändert.

## 2026-08-25 – Owner- und Staff-Betriebszugriff auf Staging verifiziert

- Owner, Admin und Manager können den Mitarbeiterbereich ausschließlich für
  das eigene Restaurant im klar gekennzeichneten Betreiberzugriff öffnen.
- Aktive persönliche Staff-Konten können die minimierte Gästeliste ihres
  Restaurants laden; gesperrte oder fremde Staff-Zugänge bleiben blockiert.
- Punkteaktionen werden im Audit getrennt der echten Administration oder dem
  echten Staff-Mitglied zugeordnet, ohne Staff-Impersonation.
- Ein neuer Punkte-QR löscht vor der serverseitigen Vorschau jede alte sichtbare
  Kundenauswahl und zeigt die kurzlebige QR-Referenz nicht im Suchfeld an.
- Migrationen `20260825005000` und `20260825006000` sind auf Staging angewendet;
  Remote-Historie und lokaler Stand sind synchron, der DB-Linter meldet null
  Fehler.
- Production bleibt gesperrt; physische Owner-/Staff-QR-Scans auf einem echten
  iPhone bleiben ein separates manuelles Gate.

## 2026-08-25 – Mobilen Kunden-QR-Scanner für iPhone Safari gehärtet

- Der Staff-Scanner verwendet für die QR-Decodierung jetzt den bereits im
  Kundenportal bewährten ZXing-Reader statt ausschließlich der nicht
  verlässlich verfügbaren nativen `BarcodeDetector`-Schnittstelle.
- Staff und Betreiberzugriff teilen weiterhin dieselbe Scannerkomponente; die
  Rückkamera, der vollständige Videoframe und ein Single-Scan-Schutz bleiben
  für beide Rollen identisch.
- Der kurzlebige persönliche Punkte-QR verwendet den zentralen kontrastreichen
  QR-Standard mit 270 Pixeln und vier Modulen Ruhezone.
- QR-Inhalt, fünfminütige Gültigkeit, serverseitige Restaurantbindung,
  Einmalverwendung, Tages-PIN und Punkteberechnung bleiben unverändert.
- Fremde, ungültige oder abgelaufene QR-Referenzen erzeugen eine sichere
  verständliche Meldung, ohne interne RPC-Daten oder Tokens anzuzeigen.
- Im Staff-Kundenbereich steht der ausgewählte beziehungsweise erkannte Gast
  jetzt vor Schnellsuche und Punkteformular; ohne Auswahl bleibt der
  Punktebereich inaktiv.
- Manuelle Suche und QR-Scan verwenden dieselbe Kundenkarte und denselben
  Gastwechsel. Der aktive Freundschaftsbonus erscheint dort, sobald ihn die
  bestehende serverseitige Punkte-Vorschau bestätigt.

## 2026-08-26 – Alte Deployment-Chunks ohne White Screen abgefangen

- Cloudflare liefert für fehlende Dateien unter `/assets/*` eine echte
  `404`-Antwort statt der HTML-SPA-Seite.
- Hash-basierte Vite-Assets werden ein Jahr unveränderlich gecacht; HTML- und
  SPA-Dokumente bleiben revalidierungspflichtig.
- `vite:preloadError` und bekannte Dynamic-Import-Fehler lösen genau einen
  kontrollierten Reload aus.
- Ein kurzlebiger, buildbezogener Session-Guard verhindert Reload-Schleifen
  und zeigt bei wiederholtem Fehler eine verständliche Aktualisierungsseite.
- BFCache-Wiederherstellungen vergleichen den geladenen Entry-Build mit dem
  aktuellen Dokument, ohne bei normalen Netzwerkfehlern blind neu zu laden.
- Der bestehende Auth-Refresh- und lokale Logout-Cleanup blieb unverändert.
- Der echte Staging-Alt-Tab-Test wechselte ohne manuellen Refresh vom nicht
  mehr vorhandenen Lazy-Chunk auf den aktuellen Build; Production blieb
  gesperrt.
# 2026-08-26 - Starter Kit Premium QR Print Cleanup

- QR-Center und Onboarding erzeugen dieselbe dreiseitige Starter-Kit-Familie
  fuer zwei Gaesteseiten und den internen Mitarbeiterbereich.
- Operative Platzierungslabels wurden aus den QR-Druckseiten entfernt; die
  QR-Rahmen enthalten nur den unveraenderten QR auf weissem Hintergrund.
- Der bisherige kleinteilige Referral-Block und die feste 30-Tage-Aussage
  wurden durch einen kompakten, laufzeitneutralen Hinweis ersetzt.
- QR-Groesse, Ruhezone, Typografie und Footer-Lesbarkeit wurden fuer A6
  verbessert, ohne QR-Payload, Route oder Bonuslogik zu veraendern.
## 2026-08-27 - Customer Premium Cards kompakt vereinheitlicht

- Angebote, Punkteeinlösungen und persönliche Geschenke verwenden eine gemeinsame
  kompakte Customer-Kartenklasse und zentrale Geometrie-Tokens.
- Mobile Carousel-Karten belegen 83 Prozent der Contentbreite und zeigen bei
  13 Pixel Abstand 12 bis 15 Prozent der nächsten Karte.
- Offer-Metadaten wurden ohne Informationsverlust verdichtet; Beschreibung und
  Titel bleiben auf jeweils maximal zwei Zeilen begrenzt.
- Die Punkteeinlösungen der Customer-Startseite verwenden statt des mobilen
  Zwei-Spalten-Rasters den bestehenden horizontalen Discovery-Baustein.
- Offer-Sichtbarkeit, Reward-/Gift-Eligibility, Punkte und Einlösung blieben
  unverändert.

## 2026-08-27 - Globalen Customer-Restaurantwechsel ergänzt

- Logo, Restaurantname und Chevron im gemeinsamen Customer-Header öffnen einen
  kompakten Restaurant-Switcher; die Informationstaste bleibt unabhängig.
- Der Switcher lädt ausschließlich aktive Memberships aus dem autoritativen
  zentralen Kundenkonto und zeigt Restaurantpunktestände einschließlich null.
- Manuelle Auswahl und Restaurant-QR verwenden denselben servervalidierten
  Restaurantzugang und denselben kanonischen URL-Kontext.
- Ein atomarer Route-Guard entfernt alten Portalinhalt vor dem Wechsel und
  verhindert gemischte Punkte-, Reward-, Gift-, Offer- oder Referral-Zustände.
- Die mobile Darstellung wurde mit langen Namen und 20 Restaurants von 320 bis
  1440 Pixel ohne horizontalen Seiten-Overflow geprüft.

## 2026-08-27 - Adaptive Restaurantlogo-Darstellung ergänzt

- Eine gemeinsame Smart LogoStage ersetzt unterschiedliche feste Logo-Rahmen
  in Owner-, Customer-, Staff-, Onboarding- und QR-Starter-Kit-Oberflächen.
- Auto-Fit behandelt quadratische, breite und hohe Logos proportional; defekte
  oder fehlende Dateien wechseln auf den kanonischen Restaurant-Fallback.
- Der Owner kann Zoom und Position nicht-destruktiv anpassen und die Wirkung in
  vier realen Kontexten prüfen.
- Die additive Migration `20260827001000_restaurant_logo_presentation.sql`
  speichert nur Fit-Modus, Skalierung und normalisierte Position.
- Punkte-, Rewards-, Referral-, Auth-, Tenant- und QR-Payload-Logik blieben
  unverändert.
