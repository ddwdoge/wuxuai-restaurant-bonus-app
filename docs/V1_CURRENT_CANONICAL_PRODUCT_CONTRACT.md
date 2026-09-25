# WUXUAI Bonus V1 - Canonical Product Contract

## Aktueller Integrationsstand – 2026-09-24

Kanonischer Branch: `codex/v1-release-integration`; gepruefter Basis-HEAD
vor diesem Dokumentationsabgleich:
`4e03f9142eab853ac3130998f59f08a870bc6ba2`. Der aktuelle
Staging-Nachweis belegt Migrationen **168/168**, Platform-Admin-Billing-
Readiness als **STAGING LOCK** und die negative Checkout-/Webhook-Architektur
als **STAGING NEGATIVE BILLING RESTGATE LOCK**. Der Checkout-CORS-Vertrag fuer
den exakten Staging-Origin ist deployed; im negativen Restgate gab es 0
Stripe-/Provideraufrufe und 0 positive Aktivierungen. Der positive Stripe-
Sandbox-Checkout ist weder implementiert noch freigegeben. Migration 169 ist
lokal 169/169 vollstaendig geprueft und im LOCAL CODE LOCK. Staging bleibt
168/168; Migration 169 wurde dort nicht angewendet. Ein Staging- oder Final-
Lock besteht dafuer nicht. Die positive Pending-Registrierung auf Staging
bleibt ausdruecklich ungeprueft. `WUXUAI Digital & Trading GmbH` ist als
operative Verkaeuferin, SaaS-Vertragspartnerin und Rechnungsausstellerin
geplant (`PLANNED`), aber noch nicht gegruendet/verifiziert. WU & XU Group
GmbH ist IP-, Marken-, Domain- und Designinhaberin sowie Lizenzgeberin,
nicht Bonus-Kunden-Rechnungsausstellerin. Stripe
TEST hat auf Staging vier verifizierte Sandbox-Price-Bindungen (`VERIFIED`);
LIVE bleibt `UNBOUND`, Tax Readiness `PENDING_CONFIGURATION`. Diese technische Bindung aktiviert keinen Checkout und kein
Billing. Live Billing, AT + PRO und Production bleiben `LOCKED`/`BLOCKED`.

Der Founder berichtet ein vorhandenes Stripe-Sandbox-Konto und vier manuell
angelegte Sandbox-Produkte/Monatspreise (BASIC 59, PRO 149, Offer Add-on 19,
Customer Add-on 29 EUR). Im spaeteren read-only Phase-7C.6C1C-Gate wurden
das Kontoland AT sowie alle vier aktiven Product-/Price-Paare und die leeren
historischen Preislisten unabhaengig nachgewiesen. Es gibt vier ausgerollte
TEST-Price-Bindings, aber keine Checkout-/Webhook- oder Live-Autoritaet.

### Phase 7C.6C2B – TEST-only Provider-/Tax-Vertrag auf Staging

Providerbindung und Tax Readiness sind getrennt. Die vier nachgewiesenen
Stripe-Sandbox-Prices sind auf Staging `VERIFIED` gebunden, waehrend der
Seller `PLANNED` bleibt. Ein eigener versionierter Tax-Readiness-Vertrag haelt
fuer TEST `PENDING_CONFIGURATION`, beobachtetes Provider-Tax-Behavior
`UNSPECIFIED`, `automatic_tax_enabled=false` und Kontoland AT fest. Fehlende
Tax-Readiness ist fail-closed. Die bestehende Provider-Statusmenge
`UNBOUND / VERIFIED / RETIRED` bleibt unveraendert. Keine dieser TEST-
Revisionen erlaubt kommerzielle Aktivierung, Entitlements, Checkout, Trial,
Subscription oder Rechnung. Technische synthetische TEST-Checkouts sind erst
ein gesondert zu implementierender und freizugebender Folgepfad; LIVE bleibt
ohne Binding. Stripe Tax, Head Office, Price-Tax-Behavior und Kontodaten
bleiben unveraendert. Dies ist ein Staging-Backend-Lock, kein Tax-/Invoice-
Final-Lock und keine kommerzielle Freigabe.

Der aktuelle Detailstatus steht in `V1_CURRENT_IMPLEMENTATION_STATUS.md`, der
operative Einstieg fuer ein zweites Konto in `CODEX_SECOND_ACCOUNT_HANDOFF.md`.
Die nachfolgenden datierten Phase-Abschnitte sind historische Gate-Snapshots;
ihre damaligen LOCAL-/NOT-STAGING-Aussagen sind **nicht** der heutige Status.

### Phase 7C.6C3B0 – isolierter Staging-Negativmodus (lokaler Codevertrag)

Die zwei Checkout-/Webhook-Edge-Funktionen akzeptieren `local_only` weiterhin
unveraendert. `staging_negative_only` ist ausschliesslich serverseitig
konfigurierbar und verlangt den exakten Staging-Project-Ref, die exakte
Staging-Supabase-URL, `STAGING` sowie einen schreibfreien Service-Role-Read
fuer Seller `PLANNED`, TEST-Tax `PENDING_CONFIGURATION`, LIVE-Provider
`UNBOUND` und `commercial_activation_allowed=false`. Ein fehlender oder
abweichender Nachweis sperrt die Funktion. Der zusaetzliche Read-Vertrag liegt
in der additiven Migration 168; Migrationen 001–167 bleiben unveraendert.

Checkout kann nur den bestehenden blockierten Owner-/Tenant-RPC erreichen,
niemals einen Fake- oder Stripe-Provider. Der Staging-Webhook akzeptiert nur
einen korrekt raw-body-signierten, mit getrenntem serverseitigem Marker und
festen Request-/Correlation-/Event-IDs gebundenen synthetischen Event. Bei
fehlendem Testsecret entstehen keine Inbox- oder Auditwrites. Die technische
Inbox darf `ACTIVATION_BLOCKED` dokumentieren, aber keine Subscription,
Trial-, Entitlement- oder Businessmutation ausloesen. Dies ist **nur lokaler
Codevertrag**: Weder Migration 167 noch 168, Edge-Funktionen oder Secrets
sind durch diese Phase auf Staging angewendet beziehungsweise eingerichtet.
Der spaetere Staging-Migrationsumfang muss wegen Migration 168 separat
freigegeben werden. Stripe und Production bleiben unveraendert.

### Aktueller Founder-Vertrag und offene Grenzen

- BASIC: 59 EUR netto/Monat, 5 Angebote und 3.000 aktive eindeutige
  Kundenkonten innerhalb der jeweils zurueckliegenden 365 Tage. PRO:
  149 EUR netto/Monat, 15 Angebote und 15.000 solche Kundenkonten; nie
  unbegrenzt. Serverzeitgebundenes Intervall `[as_of - 365 Tage, as_of)`.
- Offer Add-on: +5 Angebote fuer 19 EUR netto/Monat je Einheit. Customer
  Add-on: +5.000 Kunden fuer 29 EUR netto/Monat je Einheit. Mehrere Einheiten
  sind moeglich, aber nur bestaetigter Providerstatus zaehlt. Kein Add-on-
  Trial; UI-Auswahl erteilt kein Entitlement.
- Neue Registrierung: selected_plan BASIC, PENDING_ACTIVATION, nur Setup und
  Preview; keine produktiven QR-/Live-Aktionen, keine Trial-Zeiten, aktive
  Entitlements oder Kapazitaetsfreigabe. Der erste volle BASIC-/PRO-
  Kalendermonat ist erst nach KYB, Country Release, aktueller Legal-/Preis-
  Annahme, Owner-/Tenant-Bindung, Zahlungsmittel und signiertem,
  idempotent verarbeitetem Providerereignis kostenlos. Historische Trials
  bleiben unveraendert; Legacy-Verlaengerung erzeugt keinen neuen Trial.
- AT zuerst, aber derzeit LOCKED; weitere EU-Laender vorbereitet und
  gesperrt. Die Schweiz ist nicht Bestandteil dieses EU-Launchumfangs.
  PRO bleibt LOCKED. Downgrade/Add-on-Ende loescht keine Businessdaten;
  Over-Limit blockiert nur neue kapazitaetssteigernde Aktionen. Server-
  Resolver/Enforcement, nicht UI-Werte, sind die Autoritaet.
- Capacity-Warnungen: 80 %, 90 %, 100 % und OVER_LIMIT; App-/E-Mail-
  Vertrag, ohne automatischen Kauf oder Planwechsel. Die allgemeine reale
  Mailzustellung und ihr Scheduler sind **nicht freigegeben**. Lediglich
  isolierte synthetische Staging-Mail und Einmal-Scheduler sind nachgewiesen.
- V1 verlangt keine Pflicht-MFA fuer Customer, Staff oder Owner. Platform
  Admin braucht vor Production TOTP-MFA/AAL2. Passkeys sind V2/V3, zunaechst
  optional; SMS ist nur spaeterer Fallback. Stripe, Supabase, Cloudflare,
  Git und Zoho sind mit Provider-2FA zu schuetzen.
- Stripe soll spaeter System of Record fuer Rechnungen, Zahlungen und
  Gutschriften werden; die Plattform spiegelt/reconciliert, erzeugt keine
  zweite Kundenrechnung. Finance-/Reconciliation-Dashboard ist ein Upgrade
  nach Veroeffentlichung. Steuer-/Reverse-Charge-, Checkout-, Webhook-,
  Refund- und Proration-Regeln sind noch nicht implementiert/entschieden.
  Stripe Connect wird nicht fuer Restaurant-Auszahlungen verwendet.

### Phase 7D – Founder-Zielentscheidungen, DEFERRED / NOT IMPLEMENTED

- KYB: zuerst Land waehlen, länderspezifisches Onboarding, anschliessend
  PENDING_VERIFICATION/PENDING_ACTIVATION. Setup/Demo waehrend Pending,
  produktive Nutzung erst nach Verifizierung. Digitale oder manuelle
  Firmenpruefung; manuelle Nachweise umfassen Unternehmen, Identitaet und
  Vertretungsbefugnis/Vollmacht. Platform-Admin-Pruef-/Korrektur-/Freigabe-
  funktionen und Datenschutz-/Loeschfristen fuer KYB-Dokumente sind Folgearbeit.
- Geplanter Einloesevertrag: Kunde startet 15-minuetige, serverseitig an
  restaurant_id gebundene Anforderung. Endgueltige Bestaetigung nur entweder
  mit restaurantgebundenem taeglich wechselndem PIN auf dem Kundengeraet
  oder durch Staff im Mitarbeiterportal; niemals rein kundenseitig.
  Parallele Bestaetigung idempotent, Ablauf nach 15 Minuten, keine
  Cross-Restaurant-Bestaetigung. Umsetzung Phase 7D bzw. teilweise V2;
  bestehende Einloeseflows dadurch nicht als bereits migriert behaupten.

## Phase 7C.6B5 – historischer LOCAL CODE LOCK vor Staging (2026-09-23)

Lokal implementiert und geprueft: Die Platform-Admin-Ansicht zeigt den
serverseitigen BASIC-/PRO-/Add-on-Katalog, den geplanten Seller, ungebundene
TEST-/LIVE-Providerpreise und den ausstehenden Aktivierungszustand. Sie
aktiviert weder Abonnements noch Zahlungen oder Entitlements.

Die additive Migration `20260923001000_platform_admin_billing_readiness_reads.sql`
stellt einen rollenbegrenzten, schreibfreien Read-RPC und eine zum
Migrationszeitpunkt versiegelte, unveraenderbare Legacy-Eligibility bereit.
Neue TRIALING-/ACTIVE-/PAID-Uebergaenge bleiben gesperrt. Nur ein nachweislich
historischer, noch laufender Trial mit vorhandenen Start-/Endwerten darf unter
den bestehenden Rollen-, Recent-Auth-, Bestaetigungs-, Idempotenz- und
Auditvertraegen verlaengert werden. Risikoreduzierende Bestandsaktionen bleiben
zulaessig; sie ermoeglichen keine Reaktivierung.

`ensure_restaurant_branch` verwendet den kanonischen Restaurant-Row-Lock und
gibt vorhandene, korrekt tenantgebundene Subscriptions ohne INSERT oder
Status-/Trial-/Perioden-/Provider-Aenderung zurueck. Nur die bereits bestehende
private, transaktionsgebundene Pending-Registrierungsautoritaet darf einen
fehlenden Datensatz als PENDING_ACTIVATION ohne Trial anlegen. Der
BEFORE-INSERT-Guard bleibt fail-closed.

Die lokalen Fresh-/Upgrade-/Repeat-, Rollen-, Parallelitaets-, Browser- und
Code-Gates sind im Phase-7C.6B5-Bericht belegt. **Historischer Zeitpunkt:**
Damals war Migration 165 noch nicht auf Staging angewendet. Der spaetere
7C.6B5B-Bericht belegt 165/165 und Staging Lock. Seller, Stripe, Production
und kommerzielle Aktivierung bleiben unfreigegeben.


## Phase 7C.6B3 – historischer Billing Catalog LOCAL CODE LOCK (2026-09-23)

Dieser Abschnitt ersetzt aktive 99-EUR-/Unlimited- und Registrierungs-Trial-
Aussagen. Historische Evidenz und bestehende Verträge bleiben unverändert.
Lokale Migration-/Rollen-/Regression-/Browser-Gates bestanden:
**PHASE 7C.6B3 CANONICAL BILLING CATALOG LOCAL CODE LOCK**.
Kein Staging-, Stripe-, Production- oder Gesamt-FINAL-LOCK.

- BASIC: 59 EUR netto/Monat, 5 Angebote, 3.000 Kundenkonten.
- PRO: 149 EUR netto/Monat, 15 Angebote, 15.000 Kundenkonten; niemals unlimited.
- Offer Add-on: 19 EUR netto/Monat je Einheit, +5 Angebote.
- Customer Add-on: 29 EUR netto/Monat je Einheit, +5.000 Kundenkonten.
- Kundenvertrag: **Aktive eindeutige Kundenkonten innerhalb der jeweils
  zurückliegenden 365 Tage.** Serverzeitgebundenes halboffenes Intervall
  `[as_of - 365 Tage, as_of)`; keine zwölf Kalendermonate. Zählweise,
  Tenant-Grain und Customer-Enforcement bleiben unverändert.
- EUR, monatlich, netto/USt. exklusiv. Keine erfundene Steuerautomatik.
- BASIC/PRO: erster vollständiger Kalendermonat kostenlos, ausschließlich ab
  künftig bestätigter Provideraktivierung nach KYB, Country Release, aktuellen
  Vertragsannahmen, Tenantbindung, Checkout, Zahlungsmethode und signiertem,
  idempotent verarbeitetem Ereignis. Nicht bei Registrierung, nicht 30 Tage.
  Monatsende wird auf den letzten gültigen Tag des Folgemonats geklemmt;
  Berechnung am servergebundenen Aktivierungszeitpunkt in UTC.
- Trial höchstens einmal pro kanonischer Organisation/Restaurant; Planwechsel
  startet keinen neuen Trial. Add-ons besitzen keinen kostenlosen Trial.
- PENDING_ACTIVATION bleibt ohne Trialdaten, Entitlements und wirksame Capacity.
  Bestehende Drei-Monats-Trials und Subscriptionperioden bleiben unberührt.
- Katalog referenziert immutable Capacity-Versionen; Preisrotation und
  Providerbindungen sind neue Revisionen, keine Änderung historischer Zeilen.
- STRIPE TEST/LIVE getrennt; unbekannte Product-/Price-IDs NULL/UNBOUND.
  Kein Checkout, Webhook, Provideraufruf oder Aktivierungspfad in dieser Phase.
- Geplanter Seller: **WUXUAI Digital & Trading GmbH**, noch zu gründen;
  Status PLANNED. **WU & XU Group GmbH** ist IP-Inhaberin/Lizenzgeberin,
  nicht Rechnungsausstellerin gegenüber Bonus-Kunden.
- Seller-Versionen unterscheiden PLANNED/TEST_READY/LIVE_READY. API-DML ist
  gesperrt; LIVE_READY erfordert Gesellschafts-, Steuer-, Bank- und
  Stripe-Verifikationsreferenzen. Es wird keinerlei solche Verifikation behauptet.
- Live Billing, echte Rechnungen, Zahlungen und Auszahlungen bleiben gesperrt.
- VAT/Reverse Charge/Stripe Tax, Refunds, Chargebacks und Proration benötigen
  spätere Entscheidungen und separate Stripe-Implementierung. Keine neuen Regeln.

Lokale additive Migration: `20260922007000_billing_catalog_reconciliation.sql`.
Migrationen 001–163, Outbox/Scheduler, Warning-Dispatcher, Commercial Audit,
Country-/TEST_ONLY-Verträge und gespeicherte Grants werden nicht geändert.

Nachweis: `docs/reports/2026-09-23_PHASE_7C_6B3_CANONICAL_BILLING_CATALOG_REPORT.md`.
Fresh 164, Upgrade 163→164, zwei Repeats, 24 parallele Read-only-Auflösungen,
Rollen-/Tenanttests und 1.953/1.953 finale Tests bestanden. Typecheck, Lint
(acht vorbestehende Warnungen) und Build bestanden. Implementierungscommit:
`4e3da2e91a9a58487276c79fa0a4a1a04e505d4e`; Staging-, Seller- und
Provider-Gates bleiben offen.

## Phase 7C.6B2 – Pending Activation LOCAL CODE LOCK (2026-09-22)

**PHASE 7C.6B2 PENDING ACTIVATION AND LIVE-GATE LOCAL CODE LOCK.** Die folgenden
Founder-Regeln sind lokal implementiert und gegen den echten lokalen Supabase-
Stack geprüft. Kein Staging-/Production-/FINAL LOCK; nicht ausgeliefert;
historische Locks und bestehende Datensätze werden dadurch nicht umgedeutet.

- Country-first: neue Registrierung ausschließlich im freigegebenen Land und
  mit serverseitigem, transaktionsgebundenem Registrierungskontext.
- Neue Betriebe: PENDING_ACTIVATION; BASIC nur als selected_plan. Keine
  Trial-/Periodenzeiten, keine Providerautorität, aktiven Entitlements oder
  wirksamen Kapazitäten. Kein owner_trial_started-Audit.
- Owner-Membership erlaubt eigene Setup-/Entwurfs-/Vorschauarbeit. Profil,
  Branding, Öffnungszeiten, Programm und unveröffentlichte Inhalte bleiben
  vorbereitbar. Bloße Seitenaufrufe und Overlay-Schließen dürfen nicht schreiben.
- Live-QR/PIN, öffentliche Freigabe, Kundenbindung, Punkte, Einlösung,
  Mitarbeiter-Einladung, Benachrichtigungen und interne Aktivierungs-Overrides
  bleiben serverseitig gesperrt. UI-Zustand ist keine Aktivierungsautorität.
- Ein späterer Trial beginnt ausschließlich nach KYB-Verifizierung,
  Länderfreigabe, aktuellen Legal-/Preisannahmen, bestätigter Owner-/Tenant-
  Bindung, erfolgreichem Stripe-Checkout mit Zahlungsmethode und signiertem,
  idempotent verarbeitetem Providerereignis. Diese Teilphase implementiert
  weder Checkout noch Provideraktivierung.
- Späterer BASIC-/PRO-Trial: ein voller Billing-Monat, ohne Add-ons.
  Bestehende Trials, Subscriptions und historische Dreimonats-Evidenz bleiben
  unverändert; außerhalb neuer Registrierung bleibt der Legacy-Creator erhalten.

Nachweise: Fresh 163, Upgrade/Repeat, Rollen-/RLS-/Parallelitätsmatrix,
1.947/1.947 Tests, Typecheck/Lint/Build und 202 lokale Browserprüfungen bestanden.
Migrationen 001–162 bytegleich. Der geprüfte Umfang ist mit
`063eb401a8d0fd389a2c47fbd3f49e2a3f40a9ca` eng committed; spätere Staging-
und Provideraktivierung benötigen eigene Freigabe. Abschlussbericht:
`docs/reports/2026-09-22_PHASE_7C_6B2_PENDING_ACTIVATION_REPORT.md`.

Historischer Status-Snapshot vom 2026-09-01: **V1 FINAL LOCK / READY FOR FOUNDER MAIN MERGE**; nicht heutiger Integrations- oder Production-Status.
Stand: 2026-09-01
Damals autoritativer Recovery-Branch: `codex/v1-canonical-recovery`

Dieses Dokument beschreibt den nach Source, Tests, Development/Test-Live-Gates
und physischen Founder-Gates verifizierten V1-Stand. Historische Reports
behalten den Status zum Zeitpunkt ihrer Erstellung; dieser Vertrag bildet den
spaeter nachgewiesenen aktuellen Stand ab. `DEFERRED` ist nicht Teil V1.

Founder-Zielscope, Austria-Launch-Reihenfolge und Post-V1-Strategie stehen
kanonisch in `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`. Dieses Dokument bleibt
die technische Produktvertrags- und Evidenzquelle. Bei abweichendem Status gilt:
neuer Zielvertrag bedeutet nicht automatisch implementierten Ist-Stand.

**Founder-Roadmap 2026-09-12:** Der Austria-Launch-Master (Abschnitte 9 und
15–20) verlangt technische Fertigstellung von Basic, Pro und einem von Pro
getrennten Catalog Add-on, aber kommerziell zunaechst nur Austria Basic.
Phase 6 Mobile bleibt vor Phase 7 Pro, Phase 8 Catalog, Phase 9 Stripe Test Mode
und Phase 10 Launch. Das ist ein Zielvertrag, kein neuer Ist- oder Final-Lock-
Nachweis. Die folgenden bestehenden Fach-/Security-Locks werden nicht
umgeschrieben; noch fehlende Pro-/Catalog-/Stripe-Faehigkeiten bleiben offen.

## Phase 7B.3A – Pro Control Center Read Contract (LOCAL ONLY)

Die additive Migration `20260915002000_pro_commercial_control_center_reads.sql`
bereitet ausschliesslich das geschuetzte Read-Modell fuer das spaetere
Platform-Admin Pro Control Center vor. Fuenf getrennte RPCs liefern
Laenderstatus, paginierte Berechtigungen, reale Betriebe, exakt markierte
TEST_ONLY-Betriebe und die unveraenderbare Commercial-Audit-Historie. Nur
`platform_owner` und `platform_admin` werden serverseitig zugelassen.
Die Reads schreiben keine Daten, geben keine Auth-/Stripe-Secrets aus und
veraendern weder Commercial Lock noch gespeicherte Subscriptions. AT + PRO
bleibt `LOCKED`. Die Migration ist lokal getestet und nicht auf Staging
angewendet; eine Control-Center-UI ist weiterhin nicht implementiert.

## Owner, Onboarding und Legal Company Data - FINAL LOCK

- Das aktuelle Owner-Onboarding und seine kontextbezogene Hilfe sind physisch
  durch den Founder geprueft und fuer V1 als `FINAL LOCK` bestaetigt.
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
- Der Mitarbeiter-Schritt verwendet die bestehende tenantgebundene
  Autorisierung des Mitarbeiterbereichs. Ein kanonischer Betreiberzugriff des
  aktuellen Owners oder mindestens ein aktiver Staff-Zugang erfuellt ihn. Eine
  separate Staff-Einladung bleibt optional; der Owner wird weder in Staff
  umgewandelt noch durch eine Staff-Zeile oder zweite Membership dupliziert.
  Ohne Betreiberzugriff duerfen rohe Legacy-Zeilen, Einladungen sowie
  gesperrte oder archivierte Zugaenge keinen vollstaendigen Setup-Zustand
  erzeugen.
- Neue geeignete Welcome-/Starter-Gifts werden in den aktiven
  Erstellungswegen mit `birthday_pool_enabled = true` angelegt. Der Owner kann
  die Verwendung pro Geschenk mit `Fuer Geburtstagsgeschenke verwenden`
  deaktivieren. Bereits gespeicherte Entscheidungen werden nicht
  ueberschrieben; es gibt keine Bestandsmigration oder Massenaenderung.
- Birthday Eligibility, 14-Tage-Catch-up, Einmaligkeit, Einloesung, Audit und
  E-Mail bleiben unveraendert.

## Owner Settings Setup-Uebersicht - CODE LOCK

- `Einstellungen -> Setup & Einrichtung` bleibt jederzeit erreichbar, auch
  wenn alle sechs Bereiche eingerichtet sind und `Heute fuer dich` deshalb
  nicht mehr erscheint.
- Die persistente Uebersicht und der automatische Dashboard-Assistent verwenden
  dieselbe zentrale Statusaufloesung fuer Restaurant/Standort,
  Punkteeinloesungen, Angebote, Geburtstagspool, QR Center und
  Mitarbeiterzugang. Es gibt keine manuelle Erledigt-Markierung und keinen
  separat gespeicherten Fortschritt.
- Publikation, geplante nutzbare Angebote, objektive QR-Bereitschaft,
  Birthday-Pool und Owner-/Staff-Betreiberzugriff behalten ihre bestehenden
  autoritativen Vertraege. Ein Owner mit kanonischem Betreiberzugriff erfuellt
  den Mitarbeiter-Schritt ohne separate Staff-Einladung.
- Jede Zeile fuehrt in den bestehenden verantwortlichen Editor. Nur bei einem
  Start aus `Setup & Einrichtung` kehrt ein bestaetigter erfolgreicher Save zur
  Uebersicht zurueck und laedt den Status neu. `Heute fuer dich` kehrt weiterhin
  zum Dashboard zurueck; normale Settings-Navigation bleibt unveraendert.
- Der getrennte Fortsetzungskontext lebt nur im validierten Router-State. Er
  startet weder Onboarding noch Trial neu, speichert keine Setup-Flags und
  erweitert keine Berechtigung.

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
- Beginnt eine noch nicht angemeldete Person die Owner-Registrierung mit einer
  bereits vorhandenen E-Mail, bleibt die Antwort vor der Authentifizierung
  rollen- und anti-enumerationsneutral. Die Person authentifiziert sich mit dem
  bestehenden Passwort; danach wird der sichere Pending-Owner-Intent mit
  derselben `auth.users.id` fortgesetzt. Ein bestaetigtes Konto braucht keine
  zweite Bestaetigung. Ein noch unbestaetigtes Konto nutzt den bestehenden
  Resend-/Cooldown-/Callback-Weg. Im Pending Intent wird kein Passwort
  gespeichert.
- Der bestehende Passwortweg bleibt direkt im Restaurant-Registrierungsformular.
  Nach neutraler Kontoerkennung wird das Feld `Bestehendes Passwort` sichtbar
  hervorgehoben und fokussiert; es gibt weder einen zusaetzlichen Login-CTA
  noch eine automatische Weiterleitung auf eine separate Loginseite.
- Customer und Staff bleiben beim Hinzufuegen des Owner-Bereichs erhalten.
  Aktiver Staff blockiert die Owner-Registrierung nicht. Die bestehende
  Owner-Provisionierung bleibt authentifiziert, tenantgebunden, atomar und fuer
  bereits vorhandenes Restaurant, Membership und Trial idempotent.
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

**Lokale 7D.3B-Fortentwicklung, nicht deployed:** Auf dem isolierten Branch
`codex/v1-7d-redemption-confirmation` liegt Migration 171 für ein dediziertes
Edge-Mutationstor und zwei gesicherte Bestätigungswege. Kundenswipe setzt
zuerst die separate sechsstellige Redemption-PIN voraus; alternativ
bestätigt Staff/Owner den 15-Minuten-Antrag direkt. Der alte Self-Swipe ist
im lokalen Migrationsvertrag fail-closed. Staging bleibt auf dem zuvor
bestätigten Stand 168/168; Migrationen 169–171 sind nicht dort angewendet.
Dies ist keine Aussage über bereits aktive Staging- oder Production-Flows.

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

### Country Launch Gate - Staging FINAL LOCK (2026-09-11)

- Founder-approved registration/onboarding extension: the server-owned
  `country_launch_policy` is the launch-country source of truth. Initial Staging
  configuration: AT enabled; DE, CH, FR, IT and ES prepared but disabled.
- Missing, malformed, unknown and disabled business/legal countries fail closed.
  UI language and Customer location do not grant or restrict launch eligibility.
- New organization, restaurant, branch, trial/subscription and onboarding/legal
  writes pass country guards. Private transaction-bound registration/onboarding
  context cannot be supplied through browser DML or a caller-controlled setting.
- Existing completed businesses are identified by a protected admission registry;
  rollout does not update their business records. Existing Owner resume is a
  read-only lookup, not a country-less new-registration route.
- Platform Admin country changes require separate platform authority, a reason,
  exact `CONFIRMED:<country code>`, an idempotency key and immutable audit evidence.
  Browser table writes and private legacy delegates remain inaccessible.
- Staging readiness completion (`20260911005000`): server-provided currencies,
  technical registration and public market readiness are separate. Public launch
  requires all eight protected readiness checks, valid evidence and legal-version
  references. Missing or expired evidence blocks activation, including direct
  RPC requests. AT remains technically enabled; no public market is declared live.
  The initial 48 readiness records are honestly `not_configured`; they are not
  legal, tax or Stripe approvals. Evidence configuration needs separately reviewed
  server-side evidence, not browser table writes. Country history is read-only.
  Country cards and confirmation copy support DE/EN/FR/IT/ES/ZH/KO.
- The worldwide location vocabulary below remains available for geographic data.
  It is not a promise of launch availability: new business registration and
  changed business/legal countries must additionally pass the server launch gate.
- The isolated TEST_ONLY Owner onboarding completed exactly once with operating
  and legal/business country `AT`. The immutable Country audit contains one
  allowed onboarding event; no blocked country was enabled or admitted.
- Country and PRO Phase 1 evidence remains reported separately. The same physical
  TEST_ONLY flow confirms the server-resolved BASIC plan, offer limit 5, disabled
  offer/reward notifications and no active or future PRO override. Both scopes
  have Staging FINAL LOCK; Production remains unchanged.

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
- Der allgemeine Mitarbeiterbereich bleibt fuer serverseitig zugeordnete
  Owner, Admins, Manager und Staff des eigenen Restaurants zugaenglich. Die
  Einloese-Queue besitzt eine davon getrennte, engere serverseitige
  Berechtigung: Nur `STAFF` oder `OWNER` fuer exakt den aktuellen Restaurant-
  Slug duerfen Queue-Inhalte und Aktionen sehen. Admin-/Manager-Portalzugang
  allein berechtigt nicht zur Queue. Beim Slug-Wechsel wird eine alte
  Portal- oder Queue-Freigabe niemals fuer den neuen Tenant wiederverwendet.
- Betreiberaktionen behalten `auth.uid()` als Akteur und werden im Audit als
  Admin-Aktion mit der konkreten Restaurantrolle gekennzeichnet.
- Direkter Staff-Login mit E-Mail und gemeinsamem Auth-Passwort funktioniert
  ohne QR. Der Staff-QR bleibt als sicherer Restaurant-Einstieg erhalten und
  ersetzt weder Authentifizierung noch die serverseitige Staff-Zuordnung.
- Owner steuern Staff-Zugaenge. Staff-Selbstregistrierung und willkuerliche
  Restaurantuebernahme bleiben blockiert.

## Aktiver Customer-Restaurantkontext - FINAL LOCK

**Phase 7D.4B (lokaler Soll-Vertrag; Staging-Migration 172 offen):** Ein
Customer-Seitenaufruf und Reload sind reine Reads. Eine vorhandene Membership
wird nicht erneut geöffnet; ein gültiger, nicht widerrufener Browser-QR-Token
wird wiederverwendet. Fehlt ein solcher Token, zeigt die UI nur eine
ausdrückliche Wiederherstellung. Diese verlangt eine kürzlich serverseitig
bestätigte Auth-Session, widerruft atomar alle bisherigen aktiven Tokens und
gibt genau einen neuen Rohwert einmalig an den aktuellen Browser zurück; in
der Datenbank liegt nur der Hash. Pro Membership darf höchstens ein Token
nicht widerrufen sein. Historische Mehrfach-Tokens werden deterministisch
nach Gültigkeit, `created_at` und Token-ID bereinigt, nie gelöscht. Login-
und Kontext-Audits entstehen nur bei tatsächlicher Anmeldung beziehungsweise
bewusstem Restaurantwechsel; Summary-/Read-RPCs schreiben nicht. Dies ist
noch kein Staging- oder Final-Lock und ändert den bisherigen Staging-Stand
nicht rückwirkend.

- Es gibt genau einen kanonischen aktiven Restaurantkontext je Customer-
  Sitzung. Beitritt oder bewusster Restaurantwechsel aktualisiert diesen
  Kontext servervalidiert.
- Header, Punkte, Rewards, Offers, persoenliche Geschenke, Referral/2x und
  Restaurantdetails lesen denselben aktiven Kontext. Kein Modul fuehrt einen
  parallelen Restaurant-Switch oder einen eigenen Tenantzustand ein.
- Ein Restaurantwechsel verschiebt keine Membership, Punkte, Geschenke,
  Benefits oder Referral-Beziehung in einen anderen Tenant.

## Punkte sammeln - FINAL LOCK

- Die Gaestesuche dient ausschliesslich der Suche und Anzeige. Sie autorisiert
  niemals eine Punktebuchung. Eine Punktevergabe setzt den gueltigen,
  persoenlichen und zeitlich begrenzten Customer-Punkte-QR voraus und wird erst
  nach der anschliessenden Tages-PIN-Bestaetigung abgeschlossen.
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
- Punkteeinloesungen, bildtragende Willkommensgeschenke und Angebote verwenden
  in Owner- und Customer-Flächen denselben stabilen 16:9-Medienvertrag mit
  `object-fit: contain`, identischer Bild-URL und Fokusposition sowie
  gespeichertem Zoom mit vollständiger Render-Skalierung. Mobile `3:2`-,
  `cover`- und verkürzte Crop-Zoom-Overrides sind nicht Teil des Vertrags.
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

Die folgenden Release-Zahlen dokumentieren den verifizierten technischen
Snapshot vor der Founder-Entscheidung vom 2026-09-10. **SUPERSEDED fuer die
aktuelle Launch-Readiness:** Sie duerfen nicht als Nachweis verstanden werden,
dass die Gates des Austria Launch Master Contract bereits geschlossen sind.

- Die verbindliche Domain-Zuordnung lautet:
  - `wuxuaisbi.com`: zentrale WUXUAI SaaS-Plattform.
  - `bonus.wuxuaisbi.com`: WUXUAI Bonus Landingpage und Marketing.
  - `app.bonus.wuxuaisbi.com`: WUXUAI Bonus Production-Anwendung.
  - `book.wuxuaisbi.com`: WUXUAI Book Website.
- `staging-app.bonus.wuxuaisbi.com` ist die WUXUAI Bonus Staging-Anwendung.
- Supabase Auth, Edge-Function-CORS, Staff-Einladungslinks und transaktionale
  App-Links verwenden je Umgebung ausschliesslich den zugehoerigen App-Origin.
- Landingpage und Production-Anwendung duerfen niemals dieselbe Cloudflare-Route
  oder denselben Worker verwenden.
- Local/Remote Migration History ist bis einschließlich `20260831001000`
  synchron; der Post-Dry-Run meldet keine offenen Migrationen.
- Development/Test-DB-Linter: 0 Fehler.
- Referral, Multi-Role, Birthday Catch-up, Multi-Gift, Discovery Direct Join,
  Point Anomaly, QR/Starter Kit und E-Mail-Bestaetigung/Resend sind durch
  spaetere Live-/Founder-Evidenz geschlossen.
- Open P0: 0.
- Open P1: 0.
- Offene verpflichtende V1-Produkt-Release-Blocker: 0.
- Offene physische Founder-Gates: 0.
- V1 Final Lock: `YES`.
- Ready for Founder Main Merge: `YES`.
- Production: `LOCKED` bis zur ausdruecklichen Founder-Release-Freigabe.
- Stripe war in diesem technischen Snapshot `DEFERRED`. Fuer die aktuelle
  Launch-Reihenfolge ist Stripe Staging/Billing seit 2026-09-12 Phase 9;
  die fruehere Nummerierung Gate 6 ist SUPERSEDED. Stripe Live bleibt
  separat freigabepflichtig.

## Commercial Contract – historischer Altvertrag (für Neuregistrierung ersetzt)

- Trial: 3 Kalendermonate kostenlos.
- Basispaket: `WUXUAI Bonus V1` fuer 59 EUR pro Monat exkl. USt.
- Abrechnung: monatlich; automatische Abrechnung noch nicht aktiv.
- Zahlungsmittel: aktuell nicht erforderlich.
- Damalige Trials verwendeten eine kalenderbasierte Dreimonatsfrist. Bestehende
  Vertragsdaten werden nicht rueckwirkend umgeschrieben.
- Die zentrale Produktkonfiguration enthaelt einen leeren Add-on-Katalog als
  Erweiterungspunkt. Unfertige Zusatzpakete sind fuer Owner nicht sichtbar.
- Der damalige technische Stand hatte Stripe `DEFERRED`. **SUPERSEDED fuer die
  Launch-Reihenfolge:** Stripe Staging/Billing ist ein notwendiger Gate vor
  Production. Es gibt weiterhin keinen Fake-Checkout und keine vorgetaeuschte
  automatische Umwandlung in ein bezahltes Abo.

## Onboarding-Hilfe und Welcome-Gift-Verteilungsfreeze - FINAL LOCK

- Alle sieben Onboarding-Schritte verwenden dieselbe kontextbezogene
  Hilfestruktur: `Was richtest du ein?`, `Warum ist das wichtig?` und
  `Worauf solltest du achten?`. Der kompakte Drawer bleibt visuell sekundaer
  zum jeweiligen Formular und nutzt den vorhandenen mobilen Hilfe-Button.
- Die Owner-Hilfe zur automatischen Geschenkverteilung bleibt
  algorithmusneutral. Sie zeigt keine individuellen Prozentsaetze, keine
  Aussage zu Gleich- oder Gewichtungsverteilung, keine erwarteten Zuteilungen
  und keine daraus abgeleitete Kostenrechnung.
- Restaurants konfigurieren keine Quote, Gewichtung oder Systemverteilung.
- Die bestehende serverseitige wertorientierte Kategoriengewichtung,
  gewichtete Zufallsauswahl und Normalisierung sind nach dem historischen
  Founder-Audit `FINAL LOCK` und bleiben unveraendert. Die unangewendete Migration
  `20260901001000_welcome_gift_system_rule_snapshot.sql` gehoert nicht zu V1
  und ist `DEFERRED`.
- Welcome Assignment, Birthday Assignment, Duplicate Protection, Eligibility,
  RLS, Tenant Isolation, Redemption, Audit und Customer Rewards bleiben
  unveraendert.
- **SUPERSEDED (2026-09-10):** Die fruehere Ausschliesslichkeitsregel fuer eine
  nur deutschsprachige V1 wird durch den Austria Launch Master Contract ersetzt.
  Deutsch bleibt verpflichtende Launch-Sprache; die bestehende Architektur fuer
  `de`, `en`, `fr`, `it`, `es`, `zh` und `ko` bleibt erhalten.

## FOUNDER PHASE 7 PLAN – NOT IMPLEMENTED

```text
PHASE 7A AUDIT: COMPLETE
PHASE 7 IMPLEMENTATION: NOT AUTHORIZED
STATUS: NOT READY
```

Dieser Abschnitt dokumentiert den verbindlichen Zielvertrag fuer Phase 7. Er
ist kein Ist-Nachweis, keine Freischaltung und kein neuer Final Lock. Phase 7B
darf erst nach einer gesonderten Founder-Freigabe beginnen.

- Oesterreich startet ausschliesslich mit Basic. Pro wird technisch
  fertiggestellt, bleibt aber kommerziell und serverseitig gesperrt.
- Pro darf weder durch Datum, Trial-Ablauf, Dreimonatsfrist, Subscription-Status
  noch durch eine normale Admin-Aktion automatisch oder vorzeitig verfuegbar
  werden. Eine spaetere Freigabe braucht eine ausdrueckliche
  Founder-Entscheidung und einen unabhaengigen serverseitigen Release-Lock.
- Catalog ist kein Bestandteil von Pro. Catalog folgt separat in Phase 8 als
  Add-on.
- Stripe-Live-Produkte, -Preise, Subscription Items, Webhooks und Customer
  Portal bleiben in Phase 7 unveraendert.
- Normales Punktesammeln, Einloesen und Kundenzahlen duerfen nicht durch harte
  Usage-Limits gestoppt werden. Spaetere Kosten- und Mehrwertgrenzen muessen
  ueber konfigurierbare Entitlements und messbare Usage-Signale erfolgen.
- Es gibt keine allgemeine, fest im Code verdrahtete Regel `Pro = 5x`.
- Phase 6 und alle vorherigen Final Locks bleiben unveraendert.

Phase-7A-Istbefund: Das vorhandene Modell kennt Basic/Pro, zentrale
Entitlements, serverseitige Feature-Gates, zeitlich begrenzte Admin-Overrides
und Subscription-Lifecycle. Es besitzt jedoch keinen unabhaengigen
Founder-/Commercial-Release-Lock. Ein gueltiger PRO-Admin-Override oder ein
gueltiger PRO-Subscription-/Trial-Zustand kann Pro derzeit serverseitig wirksam
machen. Deshalb bleiben die verbindlichen Ergebnisse:

```text
SERVER-SIDE PRO GATE: FAIL
PRO COMMERCIAL LOCK: FAIL
AUSTRIA BASIC-ONLY LAUNCH PRESERVED: FAIL
```

Verbindliche Reihenfolge nach einer gesonderten Founder-Freigabe:

1. **Phase 7B – Commercial Lock und Resolver-Vertrag:** unabhaengigen,
   fail-closed Founder-Release-Lock definieren; Resolver, Admin-RPCs,
   Subscription-Lifecycle und Bypass-Vertraege darauf ausrichten.
2. **Phase 7C – Pro-Feature-Vollstaendigkeit:** begrenzte Angebotskapazität gemäß aktuellem Capacity-Katalog,
   Angebots- und Reward-Benachrichtigungen sowie Consent- und Plananzeigen
   gegen denselben serverseitigen Vertrag schliessen.
3. **Phase 7D – Usage und Sicherheitsnachweis:** konfigurierbare Messung fuer
   spaetere Kosten-/Mehrwertgrenzen ergaenzen, ohne Punkte, Einloesungen oder
   Kundenzahlen hart zu stoppen; Rollen-, Direkt-URL-, RPC/API-, RLS- und
   Cross-Tenant-Matrix pruefen.
4. **Phase 7E – Staging-Abnahme:** alle automatischen Gates, ausschliesslich
   Staging-Deployment, physische Rollen-/Direkt-URL-/Sieben-Sprachen-Pruefung,
   Build-/Commit-/Version-Paritaet und finalen Evidenzexport abschliessen.

### Phase 7B Commercial Release Lock – DESIGN COMPLETE / NOT IMPLEMENTED

```text
COMMERCIAL RELEASE LOCK DESIGN: COMPLETE
MIGRATION REQUIRED: YES
MIGRATION APPLIED: NO
PRO ACTIVATION POSSIBLE: NO CHANGE YET
AUSTRIA BASIC-ONLY GUARANTEE: NOT YET IMPLEMENTED
STATUS: PHASE 7B DESIGN COMPLETE / IMPLEMENTATION NOT AUTHORIZED
```

Der freigegebene Designvertrag setzt einen zentralen, serverseitigen und
laendergebundenen Commercial-Release-Lock vor jede wirksame Pro-Berechtigung.
Fuer Oesterreich startet die Policy explizit gesperrt. Eine fehlende,
mehrdeutige oder ungueltige Policy wird wie `LOCKED` behandelt.

Der Lock muss bei der spaeteren Implementierung sowohl den effektiven Plan als
auch alle Pro-Einzelmerkmale begrenzen. Im gesperrten Zustand gilt unabhaengig
von Subscription, Trial, Past-due-/Kuendigungsperiode, Admin-Plan-Override und
Feature-Override:

- effektiver Plan hoechstens Basic;
- maximal der Basic-Grenzwert fuer aktive Angebote, niemals `unbegrenzt`;
- Angebots- und Reward-Benachrichtigungen aus;
- Basic-Kernfunktionen, Punkte, Einloesungen und Kundenzahlen unveraendert.

Die spaetere additive Migration darf vorhandene Subscription- und Override-
Daten nicht umschreiben oder loeschen. Gespeicherte Pro-Zustaende bleiben als
Historie erhalten, werden aber vom Resolver serverseitig auf Basic begrenzt.
Neue oder erweiternde Pro-Schreibvorgaenge muessen bei gesperrter Policy auch
fuer Platform-Rollen abgewiesen werden; das kontrollierte Beenden oder
Reduzieren vorhandener Overrides bleibt erlaubt.

Die Release-Policy erhaelt keinen Browser- oder Platform-Admin-Mutator. Eine
spaetere Freigabe erfolgt ausschliesslich durch eine gesondert gepruefte,
Founder-autorisierte Migration mit Entscheidungsreferenz. `publicly_available`,
UI-Zustand, URL, Locale, Subscription und Stripe sind keine Release-Autoritaet.

Vorgesehene additive Migration, noch nicht erstellt:
`20260915001000_pro_commercial_release_lock.sql`. Sie umfasst eine private
laender-/plangebundene Release-Policy mit initial `AT + PRO = LOCKED`, einen
fail-closed internen Policy-Resolver, die Neudefinition des kanonischen
Entitlement-Resolvers, Schreib-Guards fuer PRO-erweiternde Subscription- und
Override-Aenderungen, die Sperre des Aktivierungs-RPC bei geschlossenem Lock,
minimale Grants/RLS und die zugehoerigen Rollen-, Cross-Tenant- und Bypass-
Vertraege. Migration, Tests und Produktcode sind in diesem Design-Gate nicht
implementiert oder angewendet.

### Phase 7B.1 Commercial Release Lock – LOCAL IMPLEMENTED / STAGING NOT APPLIED

Dieser Abschnitt superseded ausschliesslich die vorstehende Aussage, die
Migration sei noch nicht erstellt. Der Designvertrag bleibt unveraendert.

- Die additive Forward-Migration
  `20260915001000_pro_commercial_release_lock.sql` ist lokal erstellt.
- `AT + PRO` wird in einer privaten, RLS-geschuetzten Release-Policy initial
  als `LOCKED` angelegt. Es existiert kein Browser-, Service-Role- oder
  Platform-Admin-Mutator fuer diese Policy.
- Fehlende, ungueltige oder nicht eindeutig aus dem Primary-Branch-Tenant
  aufloesbare Policy faellt geschlossen auf Basic zurueck.
- Der kanonische Resolver begrenzt gespeicherte PRO-Subscriptions, Trials,
  Admin-Overrides und Feature-Overrides effektiv auf Basic. Gespeicherte
  Subscription- und Override-Zeilen werden nicht umgeschrieben oder geloescht.
- Unlimited, Angebotsbenachrichtigungen und Reward-Benachrichtigungen bleiben
  bei geschlossenem Lock serverseitig gesperrt. Punkte, Einloesungen,
  Kundenzahlen und alle Basic-Funktionen bleiben ausserhalb des Locks.
- Subscription- und Override-Trigger blockieren neue Pro-Erhoehungen. Der
  Pro-Aktivierungs-RPC prueft den Lock vor Mutation und vor Idempotency-Replay;
  auch Platform-Rollen koennen ihn nicht umgehen. Reduktion und Terminierung
  vorhandener Overrides bleiben erlaubt.
- Fresh-, Upgrade-, RLS-, Cross-Tenant-, Rollen-, Direkt-RPC-,
  Subscription-, Trial-, Admin-/Feature-Override- und Parallelitaetstests sind
  gegen zwei isolierte lokale PostgreSQL-Testdatenbanken bestanden.
- Die Migration ist nicht auf Staging oder Production angewendet. Es gab kein
  Deployment, keine Pro-Freischaltung und keine realen Datenveraenderungen.

```text
COMMERCIAL RELEASE LOCK IMPLEMENTED: PASS
FAIL-CLOSED: PASS
AT + PRO DEFAULT: LOCKED
SUBSCRIPTION BYPASS: BLOCKED
TRIAL BYPASS: BLOCKED
ADMIN OVERRIDE BYPASS: BLOCKED
FEATURE OVERRIDE BYPASS: BLOCKED
RPC/API BYPASS: BLOCKED
PLATFORM ADMIN MUTATOR: NONE
SAVED PRO STATE PRESERVED: PASS
EFFECTIVE PLAN WHILE LOCKED: BASIC
UNLIMITED BEHAVIOR LOCKED: PASS
PRO NOTIFICATIONS LOCKED: PASS
BASIC FLOWS PRESERVED: PASS
MIGRATION CREATED: YES
LOCAL MIGRATION TEST: PASS
MIGRATION APPLIED TO STAGING: NO
STAGING DEPLOYMENT: NO
PRODUCTION CHANGED: NO
STATUS: PHASE 7B.1 LOCAL IMPLEMENTATION COMPLETE / NOT READY FOR STAGING
```

## Founder Phase 7 Pro Product, Pricing, Release and Pilot Contract

Status: **FOUNDER CONTRACT LOCK / PHASE 7B.1A LOCAL RECONCILIATION**

Dieser Vertrag ersetzt fuer Phase 7 insbesondere den frueheren Pro-Zielpreis
von 99 EUR, pauschale Unlimited-Zusagen, das vollstaendige Verbot eines
Platform-Admin-Laendermutators und die Beschraenkung kostenloser Pro-Zugaenge
auf TEST_ONLY-Betriebe.

### Preise und Pakete

- Basic: 59 EUR netto pro Monat zuzueglich gesetzlicher Umsatzsteuer.
- Pro: 149 EUR netto pro Monat zuzueglich gesetzlicher Umsatzsteuer.
- Catalog ist weder in Basic noch in Pro enthalten und folgt als separates
  Add-on mit eigenem Stripe Subscription Item, demselben Konto und derselben
  Subscription. Eine erneute Kundenregistrierung ist nicht erforderlich.
- Premium/Business bleibt ein spaeteres eigenstaendiges Paket ohne festgelegten
  Preis oder Umfang.
- Stripe-Produkte, -Preise und -Subscription-Items bleiben bis zu einer
  gesonderten Founder-Freigabe unveraendert.

Basic bleibt ein vollstaendiges nutzbares Bonusprogramm. Normale Kundenzahlen,
Punktebuchungen, Besuche und Einloesungen werden nicht durch harte monatliche
Usage-Limits blockiert und Basic wird nicht absichtlich unbrauchbar gemacht.
Der kommerzielle Erstverkauf in Oesterreich startet ausschliesslich mit Basic.

Pro ist das Wachstums- und Marketingpaket fuer Reichweite, Angebote,
Rueckgewinnung, Bonus Boost und Empfehlungen, Marketingautomatisierung,
Marketing-/Kundenanalyse, Wochen-/Monats-/Jahresdiagramme sowie messbare
Aufrufe, Klicks und Einloesungen. Es gibt keine allgemeine Unlimited-Zusage
und keine fest kodierte Regel `PRO = 5x`. Spaetere Kapazitaeten werden pro
Feature konfigurierbar und erst anhand realer Nutzung festgelegt. Die
Bereinigung der bestehenden Unlimited-Darstellung und der weitere
Pro-Feature-Ausbau gehoeren nicht zu Phase 7B.1A.

### Drei getrennte Freigabeebenen

1. Technischer Pro-Status: Funktionen duerfen technisch existieren, ohne
   kommerziell freigegeben zu sein.
2. Laenderfreigabe: Jedes Land besitzt eine eigene Pro-Policy. Standard ist
   `LOCKED`; eine Aenderung eines Landes veraendert kein anderes Land.
3. Betriebsberechtigung: Ein konkreter Betrieb benoetigt zusaetzlich eine
   gueltige bezahlte Pro-Subscription, einen regulaeren Pro-Trial, einen echten
   kostenlosen Pro-Pilotzugang oder einen internen TEST_ONLY-Zugang.

Die verbindliche effektive Regel lautet:

```text
effective_pro =
(
  valid_country_release
  AND
  (
    valid_paid_pro_subscription
    OR valid_pro_trial
    OR valid_real_business_pilot
  )
)
OR valid_internal_test_only_override
```

Eine fehlende, ungueltige oder abgelaufene Policy beziehungsweise
Betriebsberechtigung ergibt Basic. Subscription, Trial, Stripe, alter Admin-/
Feature-Override, URL, Locale und Frontend-Zustand koennen den Laender-Lock
nicht umgehen. Eine Laenderfreigabe allein aktualisiert keinen Basic-Betrieb
automatisch auf Pro.

### Geschuetzte Platform-Admin-Aktionen

- Pro darf pro Land ausschliesslich ueber einen `SECURITY DEFINER`-RPC
  freigegeben oder erneut gesperrt werden. Fuer AT lautet die eindeutige
  Freigabebestaetigung `PRO AT FREIGEBEN`; die Sperrung verwendet
  `PRO AT SPERREN`.
- Der Server prueft erneut `platform_owner` oder `platform_admin`, eine
  aktuelle Session und eine hoechstens zehn Minuten alte Authentifizierung.
  Es wird kein gemeinsames oder separates Pro-Passwort gespeichert.
- Begruendung und Request-ID sind Pflicht. Advisory Lock, Row Lock und globale
  Idempotenz verhindern parallele Doppelmutationen.
- Public und anon besitzen kein EXECUTE-Recht. Authenticated erhaelt nur den
  RPC-Aufruf; die serverseitige Rollenpruefung bleibt autoritativ. Direkte
  Browser-DML auf Policy, Berechtigungen oder Audit ist entzogen.
- Jede Freigabe und Sperrung speichert Akteur, Rolle, Zeitpunkt, Land, Plan,
  Grund sowie Vorher-/Nachher-Zustand in einem unveraenderbaren Audit.

### Echter Pilot und interne TEST_ONLY-Ausnahme

- Ein echter Pilot ist betriebs- und organisationsgebunden, kostenlos,
  zeitlich begrenzt, begruendet, bestaetigt, widerrufbar und auditiert. Er
  erzeugt keine Rechnung, keine Stripe-Subscription, keine automatische
  Verlaengerung und keine automatische kostenpflichtige Umwandlung. Er gilt
  nur bei freigegebenem Betriebsland.
- Nach Ablauf oder Widerruf faellt der effektive Plan auf Basic. Kunden,
  Punkte, Besuche, Ledger, historische Pro-Daten und die Berechtigungshistorie
  bleiben erhalten.
- Ein interner TEST_ONLY-Zugang ist ein eigener zeitlich begrenzter Vertrag.
  Er darf vor Laenderfreigabe nur gelten, wenn Restaurant, Organisation,
  Owner und Name mit einer aktiven serverseitigen TEST_ONLY-Markierung exakt
  uebereinstimmen. Ein echter Pilot darf keine TEST_ONLY-Markierung tragen.

```text
FOUNDER PRO PRICING LOCK: 59 EUR BASIC / 149 EUR PRO
COUNTRY RELEASE MODEL: APPROVED
PLATFORM ADMIN COUNTRY MUTATOR: LOCALLY IMPLEMENTED
REAL BUSINESS PILOT ACCESS: LOCALLY IMPLEMENTED
TEST_ONLY PRE-RELEASE ACCESS: LOCALLY IMPLEMENTED
CATALOG INCLUDED IN PRO: NO
MIGRATION CREATED: YES
MIGRATION APPLIED: NO
STRIPE CHANGED: NO
PRO RELEASED IN AUSTRIA: NO
PRODUCTION CHANGED: NO
STATUS: PHASE 7B.1A LOCAL CONTRACT RECONCILIATION / NOT READY FOR STAGING
```

### Phase 7B.2 Commercial Release Lock – BACKEND STAGING GATE PASS

Die additive Migration `20260915001000_pro_commercial_release_lock.sql` ist
auf dem verknuepften Staging-Projekt `bwhvfjuwixgwduoeqaya` angewendet. Die
lokale und die Remote-Migrationshistorie stimmen ueberein; der anschliessende
Dry-Run ist leer und der DB-Lint meldet keine Fehler.

Alle sechs vorbereiteten PRO-Laenderpolicies stehen auf `LOCKED`, insbesondere
`AT + PRO`. Es gibt keine freigegebene Policy, keinen Pilot-/TEST_ONLY-Grant
und keinen Commercial-PRO-Auditeintrag. Ein gespeicherter PRO-Subscription-
Zustand bleibt erhalten, ergibt bei geschlossenem Laender-Lock aber Basic;
Staging hat keinen effektiv aufgeloesten PRO-Betrieb.

RLS, Tabellen-ACLs, interne Resolver-Grants, Subscription-/Override-Guards,
append-only Audit, Recent Authentication und die exakten Platform-Admin-Rollen
sind auf Staging geprueft. Anon, rollenlose authentifizierte Aufrufe, direkte
URL-/RPC-Aufrufe und service-role-Aufrufe des internen Resolvers bleiben
gesperrt. Kein Laender-, Pilot- oder TEST_ONLY-Mutator wurde auf Staging
ausgefuehrt. Stripe, Produktcode, App-Deployment und Production blieben
unveraendert.

```text
PHASE 7B.2 BACKEND STAGING GATE: PASS
AT + PRO: LOCKED
RELEASED PRO COUNTRIES: 0
ACTIVE PILOT/TEST_ONLY GRANTS: 0
EFFECTIVE PRO BUSINESSES: 0
MIGRATION APPLIED TO STAGING: YES
STAGING MUTATORS EXECUTED: NO
STRIPE CHANGED: NO
PRODUCTION CHANGED: NO
STATUS: STAGING BACKEND LOCK / PHASE 7C NOT STARTED
```

## Founder Phase 7C Basic-/Pro-/Capacity-Vertrag

Status: **FOUNDER CONTRACT LOCK / PHASE 7C.2 LOCAL IMPLEMENTATION AUTHORIZED**

Dieser Abschnitt ersetzt fuer den Capacity-Umfang alle aelteren Unlimited-,
99-EUR- und abweichenden Usage-Annahmen. Historische Migrationen und Daten
bleiben unveraendert als Evidenz erhalten. Der neue Vertrag ist zunaechst ein
lokaler Ziel- und Implementierungsvertrag und keine Staging-, Stripe-, Country-
oder Production-Freigabe.

### Pakete, Preise und Add-ons

- BASIC: 59 EUR netto pro Monat, 5 kapazitaetsrelevante Angebote und 3.000
  aktive eindeutige Kundenkonten im rollierenden 365-Tage-Zeitraum.
- PRO: 149 EUR netto pro Monat, 15 kapazitaetsrelevante Angebote und 15.000
  aktive eindeutige Kundenkonten im rollierenden 365-Tage-Zeitraum.
- PRO ist niemals unlimited. Catalog ist nicht automatisch in PRO enthalten;
  bestehende allgemeine Reports werden nicht automatisch PRO-only.
- Offer Capacity Add-on: 19 EUR netto pro Monat und Einheit; jede Einheit
  erhoeht die Angebotskapazitaet um 5.
- Customer Capacity Add-on: 29 EUR netto pro Monat und Einheit; jede Einheit
  erhoeht die Kundenkapazitaet um 5.000.
- Preise werden versioniert in Minor Units mit expliziter Waehrung und
  Steuerbehandlung gespeichert. Es werden in Phase 7C.2 keine Stripe Price IDs
  erzeugt. Reale historische 99-EUR-Vertraege duerfen nicht still geaendert
  werden.

### Aktives Kundenkonto

Ein Customer Account zaehlt fuer einen Restaurant-Tenant genau einmal, wenn im
serverzeitgebundenen halboffenen Fenster `[as_of - 365 Tage, as_of)` mindestens
eine gueltige, serverseitig bestaetigte qualifizierende Aktivitaet besteht:

- eine erfolgreiche, nicht aufgehobene Punktegutschrift; oder
- eine abgeschlossene, nicht aufgehobene Punkte-, Reward-, Welcome-, Birthday-
  oder sonstige Geschenkeinloesung.

Nicht qualifizierend sind Registrierung, Membership, Login, Seitenaufruf,
blosse QR-Anzeige, abgelehnte, stornierte oder vollstaendig aufgehobene
Buchungen sowie nicht isolierte synthetische Testaktionen. Mehrere Aktivitaeten
desselben Kunden zaehlen einmal. Tenant, Customer und Zeitpunkt werden nur aus
kanonischen Serverdaten aufgeloest; Clientzeit ist keine Autoritaet.

Bei erreichtem Kundenlimit bleiben Registrierung und Anmeldung moeglich.
Bestehende aktive Kunden duerfen weiter sammeln und einloesen. Nur die erste
qualifizierende Aktivitaet eines bisher nicht kapazitaetsrelevanten Kunden wird
serverseitig unmittelbar vor der Buchung blockiert, wenn sie das Limit
ueberschreiten wuerde. Es gibt keine Daten-, Punkte- oder Membership-Loeschung
und keine automatische Kundendeaktivierung. Parallele Erstaktivierungen muessen
tenantbezogen serialisiert werden.

### Angebotszaehlung

Kapazitaetsrelevant sind aktive veroeffentlichte sowie veroeffentlichte,
zukuenftig geplante Angebote. Entwuerfe, deaktivierte, archivierte und
abgelaufene Angebote zaehlen nicht. Ein geplantes veroeffentlichtes Angebot
reserviert Kapazitaet bereits beim Planen beziehungsweise Veroeffentlichen.
Publish, Planung, Reaktivierung und jeder Statuswechsel in einen
kapazitaetsrelevanten Zustand werden spaeter serverseitig und
parallelitaetssicher geprueft. Phase 7C.2 stellt nur die zentrale Read-Schicht
bereit; produktives Enforcement folgt in 7C.3.

### Zentrale Berechnung und Over-Limit

```text
effective_offer_limit = base_offer_limit + offer_addon_units * 5
effective_customer_limit = base_customer_limit + customer_addon_units * 5000
```

Add-on-Einheiten zaehlen nur bei gueltigem aktivem Entitlement. `NULL`,
Infinity, hohe Ersatzwerte und Sonderzweige bedeuten niemals unlimited. Bei
Downgrade, Add-on-Ende, Payment Failure oder Chargeback bleiben Daten,
Angebote, Kundenkonten und Punkte erhalten. Nutzung oberhalb des reduzierten
Limits ist `OVER_LIMIT`; weitere kapazitaetssteigernde Aktionen bleiben bis
zur Nutzungsreduktion oder Kapazitaetserhoehung gesperrt.

Kuendigung zum Periodenende behaelt Kapazitaet bis zum bezahlten Endzeitpunkt.
`past_due` besitzt sieben Kalendertage Grace Period. Danach ist das Add-on
unwirksam. Chargeback macht die betroffene Add-on-Kapazitaet sofort unwirksam
und verlangt manuelle Pruefung. Eine spaetere erfolgreiche Zahlung darf
Kapazitaet idempotent reaktivieren; doppelte, verspaetete und out-of-order
Providerereignisse duerfen keinen falschen Zustand erzeugen. Stripe selbst ist
nicht Teil von Phase 7C.2.

### Warnungen

Verbindliche Schwellen sind 80, 90 und 100 Prozent. Eine ausdruecklich
gekennzeichnete Sieben-Tage-Prognose ist erst nach mindestens 28 vollstaendigen
Tagen auswertbarer Nutzung zulaessig. Grundlage ist der Durchschnitt neuer
qualifizierender Kunden der letzten 28 vollstaendigen Tage unter
deterministischer Beruecksichtigung bekannter Herausfaelle aus dem rollierenden
365-Tage-Fenster. Ohne ausreichende Daten gibt es keine Prognose. Spaetere
In-App- und E-Mail-Warnungen muessen tenantisoliert, dedupliziert,
rate-limitiert, auditiert und siebensprachig sein; die Rechtsgrundlage wird im
Legal-Gate bestaetigt.

### Authority, Altlasten und Release

- `NULL = unlimited` verliert jede effektive Capacity-Autoritaet. Es gibt
  keinen Unlimited-Bestandsschutz; bestehende Uebernutzung wird Over-Limit.
- Historische Override-Zeilen bleiben Auditnachweis, erhalten aber keine
  eigenstaendige effektive Plan- oder Capacity-Autoritaet. Der freie alte
  Platform-Plan-Override-Mutator wird nicht mehr neu genutzt und spaeter
  stillgelegt.
- Zulaessige PRO-Autoritaet bleibt: gueltige Subscription bei freigegebenem
  Land, zeitlich begrenzter Real-Business-Pilot bei freigegebenem Land oder
  exakter TEST_ONLY-Vertrag. Der Commercial Release Lock bleibt zwingend.
- Trial, alter Admin-/Feature-Override, URL, Locale und UI-State umgehen den
  Country Lock nicht. Pilot und TEST_ONLY sind ebenfalls niemals unlimited.
- BASIC und PRO werden gemeinsam fertiggestellt; Stripe folgt nach dem
  Capacity-Modell. AT und alle anderen Laender bleiben bis zu ihren separaten
  Legal-, Billing-, Country- und Production-Gates LOCKED.

Customer Tiers, neue Analytics-Diagramme, Stripe Checkout/Webhooks,
Legal-Country-Packs, Capacity Owner UI sowie Warnungsoberflaechen sind nicht
Teil der Phase-7C.2-Daten- und Read-Schicht.

## Phase 7C.3 Angebots-Capacity-Enforcement

Status: **PHASE 7C.3B STAGING BACKEND LOCK**

Der verbindliche Angebotsvertrag wird durch die additive Migration
`20260921002000_offer_capacity_enforcement.sql` serverseitig durchgesetzt.
Ein Angebot belegt genau dann Kapazitaet, wenn es `PUBLISHED`, aktiv und nach
Serverzeit noch nicht abgelaufen ist. `valid_from` schraenkt die Zaehlung nicht
ein: zukuenftig geplante, bereits veroeffentlichte Angebote reservieren ihren
Slot sofort. Entwuerfe, deaktivierte, archivierte und abgelaufene Angebote
belegen keinen Slot.

Nur der Uebergang aus einem nicht zaehlenden Zustand in den zaehlenden Zustand
benoetigt freie Kapazitaet. Bereits zaehlende Angebote duerfen auch im
Over-Limit-Zustand bearbeitet werden. Deaktivierung, Archivierung, Ablauf und
Loeschung eines Entwurfs bleiben kapazitaetsreduzierend beziehungsweise
kapazitaetsneutral erlaubt. Reaktivierung, Wiederveroeffentlichung und das
Verlaengern eines abgelaufenen veroeffentlichten Angebots benoetigen einen
freien Slot.

`resolve_restaurant_capacity_internal` ist die einzige Limitautoritaet. Der
Schreibtrigger serialisiert slotverbrauchende Uebergaenge tenantbezogen in der
Transaktion. Der stabile Fehlercode lautet `OFFER_CAPACITY_REACHED`; Details
enthalten nur sichere Capacity-Werte. Mandantenwechsel eines Angebots ist
gesperrt. Browserrollen besitzen weiterhin keine direkte Offer-DML-Autoritaet.

Die Owner-Angebotsseite liest Nutzung und effektives Limit ausschliesslich aus
`get_restaurant_capacity`. Der alte Unlimited-/Override-Wert wird dort nicht
mehr als Capacity-Autoritaet verwendet. Serverseitige Plan-Geltungsdaten
bleiben separat read-only sichtbar. Die Fehlermeldung ist fuer
DE/EN/FR/IT/ES/ZH/KO fest definiert; es gibt noch keinen Kauf- oder
Checkout-Pfad.

Lokal bestaetigt sind Fresh-Replay, Upgrade 153 auf 154,
Wiederholungsanwendung, 5/10/15/20-Slot-Matrix, Multirow-Rollback,
Cross-Tenant-Schutz sowie 96 parallele Veroeffentlichungsversuche mit exakt
5/10/15/20 Erfolgen. Migration 154 ist auf dem eindeutig verifizierten
Staging-Projekt `bwhvfjuwixgwduoeqaya` exakt einmal angewendet; die
Migrationshistorie steht synchron bei 154/154 und der Repeat-Dry-Run ist leer.

Das physische read-only Staging-Gate bestaetigt die aktive BEFORE-INSERT-/
UPDATE-Triggerbindung, RLS, Rollen-ACLs, fixe `search_path`-Werte, den zentralen
Resolver und unveraenderte Business-Fingerprints. Es wurden keine Angebote,
Grants, Add-on-Einheiten, Country Policies oder Subscriptiondaten veraendert.
AT + PRO bleibt LOCKED. Es gab kein App-Deployment und keinen Stripe- oder
Production-Zugriff. Customer-Capacity-Enforcement, Warnungen, Kaufpfade und
Billing sind nicht Teil von Phase 7C.3B.

## Phase 7C.4 Customer-Capacity-Enforcement

Status: **PHASE 7C.4B CUSTOMER CAPACITY STAGING BACKEND LOCK**

Die additive Migration `20260921003000_customer_capacity_enforcement.sql`
setzt den in Phase 7C.2 beschlossenen Kundenvertrag lokal serverseitig durch.
Ein Kundenkonto zaehlt pro Restaurant genau einmal, wenn im halboffenen
Serverzeitfenster `[as_of - 365 Tage, as_of)` mindestens eine erfolgreiche,
nicht aufgehobene positive Punktegutschrift aus einem kanonischen Restaurant-
oder Customer-Pfad oder eine aktive, nicht stornierte und nicht synthetische
abgeschlossene Einloesung vorliegt. Die zentrale Identitaetsmenge verwendet
`customer_account_memberships.account_id` und faellt ohne Account-Zuordnung
auf `customer_id` zurueck.

Registrierung, Membership, Login und Ansichten verbrauchen keinen Slot. Bei
erreichtem Limit wird ausschliesslich die erste qualifizierende Aktivitaet
einer noch nicht aktiven Identitaet mit `CUSTOMER_CAPACITY_REACHED`
abgewiesen. Bereits aktive Kunden duerfen auch im Over-Limit-Zustand weiter
sammeln und einloesen. Es werden keine Kunden-, Membership-, Punkte- oder
Einloesungsdaten geloescht oder deaktiviert.

Die autoritativen Ledger `points_transactions` und
`redemption_activity_journal` besitzen transaktionale Trigger. Ein
tenantbezogener Advisory Lock serialisiert konkurrierende Erstaktivierungen;
Limit und Nutzung stammen allein aus `resolve_restaurant_capacity_internal`.
Interne Helper und Triggerfunktionen sind fuer `anon`, `authenticated` und
`service_role` nicht direkt ausfuehrbar. Der Owner-Read-Vertrag meldet beide
aktiven Enforcement-Dimensionen ohne Kundenidentitaeten oder andere PII.

Lokal bestaetigt sind Fresh-Replay bis 155, historischer Replay bis 154,
Upgrade 154 auf 155, zweimalige Wiederanwendung, BASIC 3.000/3.001, BASIC mit
Add-on 8.000/8.001, PRO 15.000/15.001 und PRO mit zwei Add-ons
25.000/25.001. Die halboffenen Zeitgrenzen, Plan-/Add-on-Wechsel,
Payment-Failure, Country Gate, TEST_ONLY, Tenant-Isolation, Rollen- und
Direkt-DML-Vertraege sind gruen. Bei 96 parallelen Erstaktivierungen auf einer
synthetischen Fuenfergrenze waren exakt fuenf erfolgreich; 24 parallele
Aktivitaeten derselben letzten Identitaet waren alle erfolgreich und zaehlten
zusammen nur einmal. Alle synthetischen Daten wurden entfernt.

Migration 155 wurde mit Implementierungscommit
`013b843265a8269a62e55a23d5bc44025e36b8b5` eng auf den kanonischen
Integrationsbranch gepusht und exakt einmal auf das verifizierte
Staging-Projekt `bwhvfjuwixgwduoeqaya` angewendet. Die Remote-Historie steht
synchron bei 155/155; der Repeat-Dry-Run ist leer und der Remote-DB-Lint
fehlerfrei.

Das anschliessende read-only Staging-Gate bestaetigte beide aktiven
Ledgertrigger, RLS, Rollen-ACLs, feste `search_path`-Werte, den zentralen
Resolver und unveraenderte Business-Fingerprints. 16 Restaurants besitzen
zusammen neun aktive Kundenidentitaeten, maximal acht pro Restaurant; kein
Restaurant ist over-limit. Es wurden keine Kundenaktivitaeten,
Registrierungen, Memberships, Punktebuchungen, Einloesungen, Grants,
Add-on-Einheiten oder Capacity-Blockereignisse erzeugt. AT + PRO bleibt
LOCKED. Es gab kein App-Deployment und keinen Stripe- oder Production-Zugriff.
Owner-UI, Warnungen, Kaufpfade und Billing bleiben getrennte Folgephasen.

## Phase 7C.5 Owner Capacity UI und Warning Dispatcher

Status: **PHASE 7C.5C CAPACITY UI/WARNING STAGING LOCK**

Die Owner-Route `/admin/settings/tarif-kapazitaet` zeigt Tarif, Land und
Commercial-Lock sowie Angebots- und Kundenkapazitaet aus genau einem
autorisierten Server-Snapshot. Basislimit, aktive Add-on-Einheiten,
Add-on-Kapazitaet, effektives Limit, Nutzung, Restkapazitaet und
`as_of` stammen aus `get_restaurant_capacity`; die UI berechnet oder
hardcodiert keine Produktlimits oder Preise. Der bestehende interne Resolver
bleibt die einzige Capacity-Autoritaet.

Migration `20260921004000_owner_capacity_read_contract.sql` erweitert nur den
bereits vorhandenen read-only Owner-Vertrag um die serverseitigen Zustaende
`AVAILABLE`, `WARNING_80`, `WARNING_90`, `AT_LIMIT` und `OVER_LIMIT`, die
autoritativen Add-on-Katalogwerte sowie Commercial-Release-Metadaten. Sie
erstellt weder Tabellen noch Trigger, Dispatcher, Billing- oder
Produktdaten-Schreibpfade. Owner und Platform Admin bleiben autorisiert;
Staff, Customer und Anonymous erhalten keinen Aufrufzugang.

Die Aktion „Kapazitaet erhoehen“ ist bis zur Stripe-Freigabe eine reine
Informationsansicht. Oeffnen, X, Escape und Abbrechen schreiben nichts und
simulieren weder Kauf noch Tarifwechsel. Bestehende Daten bleiben im
At-Limit- und Over-Limit-Zustand sichtbar; die serverseitige Blockierung wird
nicht im Client nachgebaut.

### Verbindlicher Founder-Warnvertrag

Capacity-Warnungen gelten getrennt fuer `offer` und `customer`. Die Stufen
sind 80 Prozent, 90 Prozent, 100 Prozent und `OVER_LIMIT`. Limits und Nutzung
stammen ausschliesslich aus `resolve_restaurant_capacity_internal`; der
Dispatcher berechnet keine Produktlimits selbst.

Eine Sieben-Tage-Prognose ist nur mit 28 lueckenlosen, vollstaendigen
taeglichen Nutzungssnapshots zulaessig. Es gilt:

```text
daily_net_growth = (current_usage - usage_28_complete_days_ago) / 28
projected_usage_7d = current_usage + max(0, daily_net_growth * 7)
```

Der prognostizierte Wert wird fuer den Schwellenvergleich konservativ auf die
naechste ganze Einheit aufgerundet. Bei weniger als 28 Tagen, einer Luecke,
ungueltiger Datenbasis oder ungueltigem Resolverzustand wird keine
Ersatzprognose erzeugt.

Die Evaluation erfolgt nach einer erfolgreichen kapazitaetsrelevanten
Serveraktion und taeglich um 08:00 Uhr in der Restaurant-Zeitzone. Eine
fehlende oder ungueltige Zeitzone faellt auf `Europe/Vienna` zurueck. Das
Oeffnen der Owner-Seite bleibt read-only.

Der logische Deduplizierungsschluessel besteht aus `restaurant_id`,
`capacity_type`, `warning_level` und `warning_episode_id`. App und E-Mail
werden als getrennte Zustellzustaende gefuehrt. Eine Prognose und das spaetere
tatsaechliche Erreichen derselben Stufe verwenden dieselbe Episode. Eine
hoehere Stufe darf sofort eine neue Episode ausloesen.

80 Prozent, 90 Prozent und Prognosewarnungen werden einmal je Warnperiode
zugestellt. 100 Prozent und `OVER_LIMIT` werden sofort und danach hoechstens
alle sieben Tage erinnert; es gibt keine taegliche E-Mail-Wiederholung.
E-Mails werden zwischen 22:00 und 07:00 lokaler Zeit zurueckgehalten und ab
08:00 versandt. Empfaenger sind ausschliesslich aktive, verifizierte Owner.

Eine Warnstufe wird erneut scharf, wenn die Nutzung sieben vollstaendige Tage
unter der Stufe bleibt oder eine Tarif-/Add-on-Erhoehung das wirksame Limit
erhoeht und die Nutzung dadurch unter die Stufe faellt. Ein Owner-Acknowledge
beendet nur die sichtbare App-Benachrichtigung und loest kein Rearm aus.

Der Dispatcher loescht oder veraendert keine Angebote, Kunden, Punkte oder
Ledger-Eintraege. Er bucht kein Add-on, aendert keinen Tarif, aktiviert keinen
Grant und fuehrt keine Abbuchung aus. Enforcement bleibt ausschliesslich bei
den bestehenden serverseitigen Capacity-Vertraegen.

### Phase 7C.5C Staging-Gate

Die additiven Migrationen `20260921004000_owner_capacity_read_contract.sql`
und `20260921005000_capacity_warning_dispatch.sql` sind auf dem verifizierten
Staging-Projekt `bwhvfjuwixgwduoeqaya` angewendet. Die Remote-Historie steht
bei 157/157; Repeat-Dry-Run, DB-Lint, RLS, ACLs, feste `search_path`-Werte,
Trigger- und Cron-Bindung sind geprueft.

Der Staging-Mailtransport ist technisch fail-closed: Die fuer den bestehenden
Transactional-Mail-Dispatcher erforderlichen SMTP- und Scheduler-Secrets sind
nicht konfiguriert. Es existiert kein Test-Sink und es wurde keine externe
E-Mail versendet. Migration und anschliessende read-only Pruefungen erzeugten
keine Snapshot-, Warning-, Delivery- oder Auditzeile. Vorher-/Nachher-
Fingerprints der Business-, Commercial-, Notification- und Mailbestaende sind
identisch.

Der App-Stand aus Commit `8d01d4ee7775c2c03f636ed110ae3f0990299392`
ist ausschliesslich auf den Staging-Worker ausgerollt. Deployment-ID:
`f44d9d91-98d3-4b22-a3b5-f998fe8cfe0e`; aktives Hauptasset:
`assets/index-CKU1QE4b.js`. Lokales und ausgeliefertes HTML sowie Hauptasset
sind bytegleich.

Der physische Owner-Resttest wurde mit einer legitimen, vom Founder manuell
hergestellten Safari-Owner-Sitzung bestanden. BASIC, AT weiterhin nicht
freigegeben, 4/5 Angebote, 0/3.000 aktive Kunden, keine Add-ons, der
365-Tage-Zeitraum und der Warn-Leerzustand wurden auf Staging angezeigt. Der
reine Informations-Drawer wurde ueber Schliessen, X und Escape beendet;
DE/EN/FR/IT/ES/ZH/KO wurden physisch geprueft und Deutsch wiederhergestellt.
Nachher blieben alle Warning-Systemtabellen leer, Mail 19/19 PENDING, Grants
0 und Add-on-Entitlements 0. Damit gilt Phase 7C.5C als Staging Lock, jedoch
nicht als FINAL LOCK fuer reale externe E-Mail-Zustellung oder Production.
AT + PRO, Production und Stripe bleiben unveraendert beziehungsweise LOCKED.

## Phase 7C.5E Historical Staging Outbox und Production Clean Start

Production wird ausschliesslich aus dem vollstaendigen, geprueften
Migrationsverlauf und einer getrennten Production-Konfiguration aufgebaut.
Die Staging-Datenbank wird weder geklont noch als Backup in Production
wiederhergestellt. Restaurants, Kunden, Memberships, Punkte, Angebote,
Einloesungen, Grants, Outbox-Zeilen, Test-Audits und TEST_ONLY-Daten werden
nicht aus Staging uebernommen.

Zulaessige Production-Initialdaten sind ausschliesslich Plan- und
Capacity-Katalog, zunaechst LOCKED gesetzte Country Policies, notwendige
Rollen- und Systemkonfiguration, Mailvorlagen sowie technisch erforderliche
Referenzdaten. Production-Secrets werden getrennt eingerichtet. Stripe und
der allgemeine Mail-Scheduler bleiben bis zu ihren eigenen Founder-Gates aus.

Historische Staging-Customer-Outbox-Zeilen duerfen nur nach exakter
Fingerprint-, ID-, Status-, Attempt- und Lease-Pruefung ohne Versand als
`SKIPPED` mit dem festen Quarantaenegrund
`HISTORICAL_STAGING_TEST_DATA` markiert werden. Die Zeilen werden nicht
geloescht, der Versuchszahler wird nicht erhoeht und ein unveraenderbarer
Auditnachweis bindet Anzahl, Vorher-Fingerprint, Ziel-IDs, Serverzeit und
ausfuehrende Datenbank-/Auth-Identitaet.
