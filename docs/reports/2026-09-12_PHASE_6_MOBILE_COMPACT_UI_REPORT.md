# Phase 6B–6F – Mobile Compact UI

Datum: 2026-09-12. Arbeitsordner: `/private/tmp/wuxuai-pro-phase1-authoritative`.
Branch: `codex/v1-phase-6-compact-mobile-ui`.
Basis: `41a819e4f54e7da9a95c23c3ea10dc21e9ad17cb`.
Status: **BLOCKED / NOT READY – Customer-Home-Bildkarten implementiert; Screenshot-Matrix nicht belastbar**.

## Aktueller Fortsetzungsstand 2026-09-13

Der Image-first-Entwurf wurde ausschließlich auf Customer Home weitergeführt.
Details, Grenzen, aktuelle Prüfungen und Cleanup stehen in
`2026-09-13_PHASE_6B_CUSTOMER_HOME_IMAGE_FIRST_REPORT.md` im selben Ordner.
1529/1529 Tests, Typecheck, Lint ohne Fehler und Build PASS. Nach schnellem
Viewportwechsel lieferte die Capture-Schnittstelle teilweise skalierte oder
abgeschnittene Bilder trotz passender DOM-Maße. Diese Bilder sind verworfen;
keine visuelle Freigabe und keine Ausweitung auf weitere Screens.
Vorschaugruppe 13156 mit vier Prozessen kontrolliert beendet und nachgeprüft.
0 task-eigene Hintergrundprozesse verbleiben. Die folgenden Abschnitte bleiben
als historische Zwischenstände erhalten, nicht als aktueller Abschlussnachweis.

## Ursache und aktueller Auftrag

**Neuer Founder-Nachtrag 2026-09-12:** Image-first Mobile Cards gilt als
Zielvertrag gemaess Austria Launch Master 5.4. Dieser ersetzt die alten
zweispaltigen Vorteile-/horizontalen Kleinkarten-Vorgaben fuer Marketingkarten.
Die nachfolgend dokumentierte bisherige CSS-Referenz ist damit keine Umsetzung
des neuesten visuellen Ziels. Keine vorhandene Arbeit verworfen oder geaendert.
Informationskarten/KPI bleiben kompakt, QR/PIN sicherheitsorientiert; Catalog
bleibt Phase 8. Founder-Klarstellung zur Referenz `IMG_2794.PNG`: nur der
Aufbau der einzelnen Bildkarte wird referenziert. Karten bleiben horizontal
nach links/rechts wischbar, mit bestehenden Pfeilen und Positionsanzeige;
kein vertikaler Kartenstapel. Die vorherige gegenteilige Interpretation ist ersetzt.
Titel-/Dichtekonflikte und fehlende geeignete
Platzhalter-Assets sind offen. Der technische Browser-Capture-Blocker bleibt
unabhaengig davon offen. Siehe separaten Image-first-Nachtragsbericht.

**Aktueller Prozessstand nach diesem Dokumentationsnachtrag:** Die zuvor
beibehaltene lokale Vorschaugruppe 260 (PIDs 260/700/714/715) wurde nach
abgeschlossenem Build kontrolliert beendet; gezielte Nachkontrolle leer.
0 taskeigene Hintergrundprozesse verbleiben. Die weiter unten dokumentierte
Beibehaltung war der historische Zwischenstand vor diesem Cleanup.

Der Founder-Vertrag Phase 6B–6F einschließlich Drawer-Zusatz ersetzt die im
Phase-6A-Bericht noch offene Scope-Frage. Keine neue Produktfunktion. Nur
Darstellung, Anordnung und Bediengeometrie; keine Business-/Security-Änderung,
Migration, reale Datenänderung oder Production-Änderung. Staging erst nach
vollständig grünen automatisierten Gates und separater physischer Prüfung.

Mobile: Seitenabstand 16 (unter 360 mindestens 12), Lücken 8/12–16,
Bereiche 20–24, Header 56–64, Karten 14–16 Padding/16 Radius,
Titel 24–30/18–22/16–18, Text 15–16, sekundär mindestens 12–13,
Primäraktion 48–52, Touchflächen mindestens 44, Navigation 56–64 plus Safe Area.
Diese ausdrückliche neue Layoutfreigabe ersetzt im Phase-6-Umfang ältere
abweichende mobile Maßvorgaben, nicht deren Business- oder Sicherheitsverträge.

## Route-Coverage: 50/50 klassifiziert

Quelle: tatsächliche JSX-Route-Knoten in `src/app/App.tsx` und Prüfung der
gerenderten Zielkomponenten (insbesondere BrandingPage ist eine Weiterleitung).
V = VISUAL SCREEN; S = SHARED SCREEN; G = REDIRECT/GUARD.
42 V, 5 S, 3 G; DESKTOP-ONLY 0; OUT OF SCOPE 0; UNCLASSIFIED 0.
Eine Klassifizierung ist **kein** physischer PASS. Alle Nachher-Prüfungen offen.
V zählt Route-Einstiege, nicht alle internen Tabs, Drawer und Fehlerzustände.

| Nr. | Route | Klasse | Oberfläche / Abdeckung |
| --- | --- | --- | --- |
| 1 | `/` | V | PublicHome |
| 2 | `/login` | S | LoginPage; Alias zu 3, Portalparameter mitprüfen |
| 3 | `/restaurant/login` | V | Owner-/Platform-Login nach Portalwahl |
| 4 | `/register` | V | RegisterPage |
| 5 | `/auth/callback` | V | Eigene Loading-/Success-/Invalid-Link-Oberfläche |
| 6 | `/auth/confirm-email` | V | ConfirmEmailPage |
| 7 | `/auth/forgot-password` | V | ForgotPasswordPage, Portalvarianten |
| 8 | `/auth/update-password` | V | UpdatePasswordPage, gültig/abgelaufen |
| 9 | `/auth/staff-invite` | V | StaffInvitePage, gültig/abgelaufen |
| 10 | `/staff/login` | V | StaffLoginPage |
| 11 | `/admin` Layout | S | AdminLayout; Navigation/Header gemeinsam für 12–27, Guards unverändert |
| 12 | `/admin` Index | V | AdminDashboard, BASIC/PRO, KPIs |
| 13 | `/admin/onboarding` | V | RestaurantOnboarding, alle Schritte |
| 14 | `/admin/settings` | V | SettingsPage Übersicht |
| 15 | `/admin/settings/setup` | V | OwnerSetupOverviewPage |
| 16 | `/admin/settings/program-end` | V | ProgramTerminationPage, keine Beendigung ausführen |
| 17 | `/admin/settings/:section` | V | SettingsPage: jede tatsächlich gerenderte Sektion separat prüfen |
| 18 | `/admin/branding` | G | BrandingPage → `/admin/settings/aussehen` |
| 19 | `/admin/customers` | V | CustomersPage, Listen/Detail/Identität |
| 20 | `/admin/loyalty` | V | LoyaltyPage |
| 21 | `/admin/qr` | V | QrCenterPage |
| 22 | `/admin/rewards` | V | RewardsPage |
| 23 | `/admin/staff` | V | StaffPage |
| 24 | `/admin/welcome-gifts` | V | WelcomeGiftsPage |
| 25 | `/admin/offers` | V | RestaurantOffersPage, BASIC 0/5 |
| 26 | `/admin/reports` | V | BonusActivityReportsPage |
| 27 | `/admin/legal` | V | OwnerLegalSettingsPage mit ErrorBoundary |
| 28 | `/admin/platform` | V | PlatformAdminPage Übersicht |
| 29 | `/admin/platform/audit` | V | PlatformAuditPage |
| 30 | `/admin/platform/health` | V | PlatformHealthCenterPage, KPIs/Filter/Findings |
| 31 | `/admin/platform/restaurants/:restaurantId` | V | PlatformAdminPage Betriebsdetail, Pläne/PRO/Country/Audit |
| 32 | `/platform-admin` | S | Gleiche PlatformAdminPage wie 28, eigener identischer Platform-Guard |
| 33 | `/platform-admin/restaurants` | S | Gleiche PlatformAdminPage wie 28, eigener identischer Platform-Guard |
| 34 | `/staff` | G | StaffIndexRoute → zugeordneter Pfad oder Login |
| 35 | `/staff/:slug` | V | StaffTablet, alle fünf Prozessschritte und Zustände |
| 36 | `/r/:restaurantSlug/:referralToken` | V | ReferralLanding, gültig/ungültig, keine Einladung erstellen |
| 37 | `/customer/login` | V | CustomerAuthPage login |
| 38 | `/customer/register` | V | CustomerAuthPage register |
| 39 | `/customer/auth/callback` | V | CustomerAuthCallbackPage, eigene Fehler-/Bestätigungsfläche |
| 40 | `/customer` | V | CentralCustomerPage home, Mitgliedschaften |
| 41 | `/customer/locations` | V | CentralCustomerPage locations |
| 42 | `/customer/account` | V | CentralCustomerPage account |
| 43 | `/customer/email/confirm` | V | CustomerEmailActionPage confirm |
| 44 | `/customer/email/unsubscribe` | V | CustomerEmailActionPage unsubscribe; keine echte Abmeldung auslösen |
| 45 | `/customer/restaurants` | V | PartnerRestaurantFinderPage |
| 46 | `/customer/:slug/offers` | V | CustomerOffersPage |
| 47 | `/legal/:slug` | V | LegalCenterPage |
| 48 | `/customer/:slug` | V | CustomerPortal: Home/Einlösen/Sammeln/Konto/Beitritt/Zustände |
| 49 | `/w/:slug` | S | CustomerPortalRoute mit Sammelkontext; dessen abweichenden Sammelzustand separat prüfen |
| 50 | `*` | G | Navigate `/`, replace |

## Drawer-Inventur

TypeScript-AST: **42 Verwendungsstellen**, davon **40 konkrete Instanzen** und
2 gemeinsame Wrapper. Keine weiteren eigenständigen `role="dialog"`- oder
`createPortal`-Implementierungen im TSX außer AppDrawer gefunden.
Klassen: A kurze Information/Bestätigung; B Formular; C lange Information;
D Scanner/komplexer Ablauf. Varianten einer Instanz bleiben separate QA-Zustände.
**40/40 konkrete Instanzen klassifiziert; UNCLASSIFIED DRAWERS: 0.**
Alle Einzelabnahmen einschließlich Fokus, Escape, Scrollposition, Tastatur,
Sprachen und Größen sind noch offen. Die Klasse beschreibt das Soll, nicht
bereits bewiesene Konformität des vorhandenen CSS.

| ID | Quelldatei (unter src/modules) | Instanz / Zustände | Klasse | Kritischer Pfad / Schließen im Bestand |
| --- | --- | --- | --- | --- |
| D01 | admin/AdminLayout.tsx | Mobile Navigation | C | Logout nicht ausführen |
| D02 | admin/pages/AdminDashboard.tsx | Hoher Buchungsbetrag | A | Nur Hinweis |
| D03 | admin/pages/CustomersPage.tsx | Identitätskorrektur, Laden/Fehler/Formular | B | Speichern/Identitätsnachweis unberührt |
| D04 | admin/pages/RestaurantOffersPage.tsx | Angebotseditor neu/bearbeiten | B | closeForm; nicht speichern |
| D05 | admin/pages/RestaurantOffersPage.tsx | Angebotsvorschau | C | Nur Vorschau |
| D06 | admin/pages/RestaurantOnboarding.tsx | Schrittbezogene Hilfe | C | closeHowItWorks |
| D07 | admin/pages/RewardsPage.tsx | Neue Punkteeinlösung, Wizard | B | Kein Overlay-Dismiss; closeRewardEditor |
| D08 | admin/pages/RewardsPage.tsx | Punkteeinlösung bearbeiten, Wizard | B | Wie D07 |
| D09 | admin/pages/RewardsPage.tsx | Vorschau | C | Nur Vorschau |
| D10 | admin/pages/RewardsPage.tsx | Aktivieren/deaktivieren | A | Keine Statusaktion ausführen |
| D11 | admin/pages/RewardsPage.tsx | Foto/Ausschnitt | B | Kein Overlay-Dismiss; closeQuickPhoto |
| D12 | admin/pages/SettingsPage.tsx | Logo-Arbeitsfläche | D | cancelEditor, keine Speicherung |
| D13 | admin/pages/StaffPage.tsx | Einladung | B | busy-abhängiges Overlay; keine Einladung senden |
| D14 | admin/pages/StaffPage.tsx | Sperren/reaktivieren/archivieren | A | busy-abhängiges Overlay; keine Rollenänderung |
| D15 | admin/pages/WelcomeGiftsPage.tsx | Editor neu/bearbeiten | B | Kein Overlay-Dismiss; closeEditor |
| D16 | admin/pages/WelcomeGiftsPage.tsx | Vorschau | C | Nur Vorschau |
| D17 | admin/pages/WelcomeGiftsPage.tsx | Aktivieren/deaktivieren | A | Keine Statusaktion ausführen |
| D18 | admin/pages/WelcomeGiftsPage.tsx | Foto/Ausschnitt | B | Kein Overlay-Dismiss; closeQuickPhoto |
| D19 | customer/CentralCustomerPage.tsx | Activation/Installation/Push/Complete | A | snoozeActivation; keinen Push-Consent auslösen |
| D20 | customer/CustomerOffersPage.tsx | Angebotsdetail | C | Nur lesen |
| D21 | customer/CustomerPortal.tsx | So funktioniert's / Legal / Erinnerungen | C | Pflichttext vollständig |
| D22 | customer/CustomerPortal.tsx | Punkteinformation | C | Pflichttext vollständig |
| D23 | customer/CustomerPortal.tsx | Angebotsdetail | C | Nur lesen |
| D24 | customer/CustomerPortal.tsx | Reward/Gift-Detail, Präsentation, Erfolg/Fehler/Expired/Used | C | closeRedemptionDrawer, Swipe-/Serverbestätigung unberührt |
| D25 | customer/CustomerPortal.tsx | Konto: profile, membership, qr, save, restaurant, help, logout | B/C/A | profile=B, logout=A, übrige=C; Profile verhindert Overlay-Dismiss |
| D26 | customer/PartnerRestaurantFinderPage.tsx | Restaurantdetail, Beitrittszustand | C | Kein realer Beitritt |
| D27 | customer/components/CustomerRestaurantScanner.tsx | Restaurantscanner, Kamera/Fehler | D | Kein Overlay-Dismiss; onCancel |
| D28 | customer/components/CustomerRestaurantSwitcher.tsx | Restaurantwechsel, Suche/Empty | C | Während switchingMembership kein Schließen |
| D29 | platform/PlatformAuditPage.tsx | Bereinigtes Auditdetail | C | Keine rohen Secrets dokumentieren |
| D30 | platform/PlatformCountryLaunchPanel.tsx | Country-Änderung/Readiness/Bestätigung | B | busy-abhängig; keine Aktivierung ausführen |
| D31 | platform/PlatformOperationsPanel.tsx | Operative Bestätigung nach Severity | B | Kein Overlay-Dismiss; Reason/Confirmation unverändert |
| D32 | platform/PlatformPlanEntitlementsPanel.tsx | PRO-Override beenden, UiDialog sensitive | B | busy-guard; nicht beenden |
| D33 | platform/PlatformRestaurantControlCenter.tsx | Kritische Betriebsaktion | B | Kein Overlay-Dismiss; Reason/CONFIRMED unverändert |
| D34 | reports/BonusActivityReportsPage.tsx | Einlösung stornieren | B | Grundpflicht; kein Storno ausführen |
| D35 | staff/StaffTablet.tsx | Scanner/Kamera/Code/Kunde/Betrag/PIN/Ergebnis | D/B | Scanner=D, Betrag/PIN=B; dismissScanner/Minimieren erhalten |
| D36 | staff/StaffTablet.tsx | Laufenden Vorgang abbrechen | A | Kontrollierte Bestätigung |
| D37 | staff/StaffTablet.tsx | Laufenden Vorgang ersetzen | A | Kontrollierte Bestätigung |
| D38 | staff/StaffTablet.tsx | Heutige vierstellige Tages-PIN | A | PIN nicht in Export aufnehmen |
| D39 | staff/StaffTablet.tsx | Mehr-Menü | C | Keine Abmeldung im Test |
| D40 | staff/StaffTablet.tsx | Tages-PIN außerhalb Scanner | B | Kein Overlay-Dismiss; closePinAction |

Wrapper: `customer/components/PremiumCustomerUi.tsx` ConfirmationDialog
(aktuell kein eigener Aufrufer) und `shared/ui/UiDialog.tsx` (D32).
Health-Center-Finding und Filter sind Inline-Flächen, keine AppDrawer-Instanzen.
PRO-Aktivierung, Legal-/Kassa-Flächen, Staff-Erfolg/Fehler und persönlicher
Punkte-QR können ebenfalls inline erscheinen; sie gehören trotzdem zur
Screen-/Zustandsmatrix und werden nicht als fehlende Drawer nachgebaut.

## Geänderte Dateien und Referenzimplementierung

- `src/modules/customer/CustomerPortal.tsx`: ausschließlich Home-Klasse und
  Reihenfolge der bestehenden vollständigen Bereiche Vorteile/Angebote.
- `src/modules/customer/components/PremiumCustomerUi.tsx`: CSS-Import.
- `src/modules/customer/customer-compact.css`: gekapselte mobile Home-Dichte,
  umbrechende Namen, Punkte in einer Zeile, horizontale Reward-/Offer-Karten,
  320-Fallback und lesbare Navigation. Keine versteckten Inhalte.
- `tests/customer-home-full-offer-carousel.test.mjs`: AST-Auswahl des
  Angebotsblocks statt Annahme seiner bisherigen Position. Bestehende
  Vollkatalog-Assertions unverändert.
- `tests/phase6-mobile-reference.test.mjs`: fünf zusätzliche Strukturprüfungen
  für Inventar, Scoping, vollständige Inhalte und CSS-Mindestwerte. Kein Ersatz
  für Browsermessungen.
- `scripts/scan-phase6-evidence.mjs`: reproduzierbarer read-only Scan der
  expliziten Dateiliste oder eines Prüf-ZIPs; Trefferwerte werden nie ausgegeben.
- Dieser Report. Phase-6A-Evidenz unverändert erhalten.

Keine Service-, API-, Auth-, RLS-, Rollen-, Points-, Eligibility-, Referral-,
Legal-, Plan-, Health- oder Migrationsänderungen. Kein Deployment oder Push.

## Prüfstand (Zwischenstand)

- Fokussierte Customer-/Referenztests: 69/69 PASS; initial 3 Positionsselektor-Fehler,
  anschließend unveränderte Fachassertions mit AST-Selektion grün.
- Country-/PRO-/Password-/Phase-4-/Phase-5-/Security-Vertragsprüfungen:
  141/141 PASS. Dies ist eine lokale automatisierte Vertragsprüfung, keine
  neue physische Rollenmatrix gegen Staging.
- Vollständige Testsuite: 1529/1529 PASS, 0 Fail/Skipped/Cancelled.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler / 9 unveränderte bekannte Warnungen.
- Build: PASS, bekannte Warnung zu Chunk-Größen über 500 kB.
- git diff --check: PASS.
- Secret Scan: 8 explizite Quell-/Test-/Berichtsdateien, 0 Treffer. ZIP mit
  denselben Regeln separat geprüft: 8 Dateien, 0 Treffer; ZIP-Integrität PASS.
  Private Keys, JWTs, Provider-Credentials,
  Passwortzuweisungen, Recovery-URLs und Connection-Strings eingeschlossen.
- Migrationshistorie in diesem Turn live read-only: 149 lokal / 149 Staging,
  0 offen, 0 Abweichungen. Keine Migrationsdatei geändert.
- Neue physische Nachher-Belege: keine. Lokale Vorschau benötigt manuelle
  Customer-Anmeldung; keine Zugangsdaten angefordert oder eingegeben.
- 390-Punktekarte/Seitenhöhe: noch NICHT GEMESSEN; nicht aus CSS errechnen.
- Desktop/Tablet/Mobile: Baseline vorhanden; Nachher noch offen.
- iPhone/Keyboard/Safari/physischer QR-Scan: Founder-Mitwirkung angefragt.
- Weitere Rollenblöcke erst nach belastbarer Customer-Home-Referenzprüfung.
- Phase-1–5-Implementierungen erhalten; keine erneute finale Live-Zertifizierung.

Reproduktion: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`
(nur mit geprüfter öffentlicher Staging-Konfiguration), `git diff --check`.
Customer-Scope: `node --test tests/customer-home-*.test.mjs
tests/customer-premium-design.test.mjs tests/customer-horizontal-discovery-carousel.test.mjs
tests/customer-mobile-responsive-stabilization.test.mjs tests/customer-swipe-redemption-atomic.test.mjs
tests/customer-activation-setup.test.mjs tests/phase6-mobile-reference.test.mjs`.

## Fortsetzbarer Checkpoint und Export

Keine weiteren Rollen geändert, kein Deployment. Die lokal vorgenommene
Customer-Home-Referenz ist ein **ungeprüfter visueller Entwurf**, kein Mobile Lock.
Der Browserzugang zu `http://127.0.0.1:5176/customer/login` benötigt eine manuelle
Anmeldung. Die Staging-Sitzung wurde weder ausgeloggt noch übertragen. Keine
Credentials angefordert, ausgelesen, eingegeben oder in Dateien übernommen.

Nächster Schritt: Vorschau wieder starten, Founder meldet dasselbe Testkonto
manuell an; erst danach tatsächliche 320/390/768-Messungen und gültige Bilder.
Dann verbleibendes Customer, Staff, Owner, Public/Auth, Platform und globale
Zustände mit der jeweils geforderten Rollenblock-Abnahme fortsetzen.

Prüf-ZIP: `exports/2026-09-12_PHASE_6_MOBILE_COMPACT_UI_CHECKPOINT.zip`.
Enthält ausschließlich die acht explizit gescannten Quell-/Test-/Berichtsdateien.
Kein fertiges Before/After-Evidenzpaket. Vorhandene Phase-6A-Screenshots bleiben
lokal unangetastet und werden nicht pauschal als gültige neue Evidenz exportiert.
Keine Dependencies, Env-Dateien, Logs, Caches, Build-Ausgaben oder alten ZIPs.

Taskeigene Vorschau: Launcher 5291, npm 5650, Vite 5679, esbuild 5685;
gemeinsame Prozessgruppe 5291, ausschließlich für diese lokale Prüfung.
Der erste Startversuch endete wegen Sandbox `listen EPERM`; der anschließend
freigegebene lokale Start funktionierte. Kein Browserwerkzeugfehler.
Alle Prüfprozesse beendet; Vorschaugruppe beim Checkpoint kontrolliert mit
SIGTERM beendet. Anschließende gezielte Prozessabfrage: keine dieser vier
PIDs mehr vorhanden. TASK-OWNED BACKGROUND PROCESSES STARTED: 4;
STOPPED: 4; STILL RUNNING: 0. RETAINED PROCESS PURPOSE: NONE.
RAM CLEANUP: PASS. UNRELATED NODE PROCESSES CHANGED: NO.

## Risiken und Fortsetzung

Keine Layoutabnahme aus Sourcecode ableiten. Testkonto und identischer
Baseline-Zustand müssen im lokalen Browser erreichbar sein. Screenshots mit
falscher Größe, Ladezwischenstand oder abgeschnittenem Capture verwerfen.
QR und sensible PIN-/Codeflächen dürfen nicht ungeprüft im Export landen.
Echte Hardwareprüfungen sind nicht durch einen verkleinerten Desktop ersetzt.

Status: **BLOCKED / NOT READY**. Kein QR-, Tastatur-, Sprach-, Drawer- oder
Responsive-PASS ohne die ausstehenden tatsächlichen Prüfungen.

## Fortsetzung nach manueller Anmeldung – 2026-09-12

Dieser Abschnitt ersetzt den vorherigen Anmeldeblocker, nicht die historischen
Testergebnisse oder die noch offenen Rollen-/Drawer-Gates.

### Read-only Flow und Datenvergleich

1. Zentrale Customer-Startseite geöffnet: Anmeldung aktiv; vier Mitgliedschaften
   laut Übersicht. Keine E-Mail-Adresse, Passwörter oder Sitzungstokens ausgelesen.
2. Bestehenden Button `Bonus öffnen` beim Referenzrestaurant verwendet.
   `/customer/wu-und-xu-group-gmbh` lädt den restaurantbezogenen Kundenbereich.
3. Sichtbarer aktueller Zustand: 758 Punkte, ein Angebot, vier Punkte-Rewards,
   keine persönlichen Geschenke, aktiver 2× Boost. Keine Punktebuchung,
   Einlösung, Einladung, Registrierung oder neue Mitgliedschaft ausgeführt.

Der Phase-6A-Zustand hatte 0 Punkte, ein Angebot, vier Punkte-Rewards,
zwei persönliche Geschenke und inaktiven Boost. Deshalb sind die ursprüngliche
Seitenhöhe 3.028 px und das Ziel 2.650 px mit dieser Sitzung nicht direkt
vergleichbar. Der abweichende Zustand wird nicht künstlich hergestellt und nicht
als gleichwertiger Vorher-/Nachher-Nachweis ausgegeben. Personenname und
Kontaktinformationen werden nicht in den Export übernommen.

### Technischer Capture-Blocker

- Dokumentierte Browser-Viewport-Vorgabe: 390 × 844. Read-only DOM meldet
  stattdessen `innerWidth=433`, `innerHeight=938`, Dokumentbreite 433 und
  Dokumenthöhe 2214. Diese Werte sind **keine 390-px-Messung**.
- Die zugehörige Screenshot-Funktion liefert doppelte/leere Bildbereiche;
  nach kontrolliertem Reset und erneutem Einstellen dasselbe Größenproblem
  und eine fast leere Aufnahme. Beide Aufnahmen verworfen, nicht exportiert.
- Der dokumentierte Tastaturversuch `Meta+0` setzte den effektiven Maßstab
  nicht zurück. Eine zusätzliche native App-Steuerung wurde vom Werkzeug
  verweigert; diese Grenze wurde nicht umgangen.
- Nach Entfernen der temporären Viewport-Vorgabe liefert die alternative
  CUA-Screenshot-Funktion eine vollständig gerenderte aktuelle Fensteransicht.
  Das bestätigt die Erreichbarkeit, aber nicht die verlangte mobile Matrix.
  Keine personenbezogene Rohaufnahme in den Prüf-Export übernommen.
- DOM-Prüfung: `html` und `body` jeweils CSS `zoom: 1`, `transform: none`.
  Keine CSS-Skalierung oder Layoutänderung zur Umgehung des Browserfehlers.
  Die genaue Ursache des effektiven Browsermaßstabs ist nicht abschließend
  bewiesen; Browser-Zoom/Viewport-Integration muss korrigiert werden.
- Der Product-Design-Audit-Skill verlangt gültige Screenshots und erlaubt bei
  fehlender erforderlicher Capture-Evidenz keinen visuellen PASS. Die
  320/390/768-Nachher-Evidenz und weitere Rollenblöcke bleiben deshalb offen.

### Umfang, Gates und Übergabe

In dieser Fortsetzung nur Bericht und neues Prüf-ZIP geändert. Bestehende
Anwendungs-, CSS-, Test-, Service- und Migrationsdateien unverändert erhalten.
Branch weiterhin `codex/v1-phase-6-compact-mobile-ui`, HEAD weiterhin
`41a819e4f54e7da9a95c23c3ea10dc21e9ad17cb`. Kein Commit/Push, keine Migration,
kein Deployment, keine Production-Änderung. Keine neue Live-RLS- oder
Migrationshistorienprüfung; 149/149 bleibt der vorherige belegte Prüfstand.
Keine aktuelle Sprach-/QR-/Drawer-/Security-Freigabe aus dieser Einzelansicht.

Build erneut PASS mit ausschließlich geprüfter öffentlicher Staging-Konfiguration;
TypeScript-Kompilierung im Build PASS, bekannte Chunk-Warnung über 500 kB.
`git diff --check` PASS. Secret Scan der acht expliziten Paketdateien PASS,
0 Treffer. Frühere 1529/1529 Tests werden nicht als neuer Testlauf bezeichnet.
Linter, vollständige Tests und Live-RLS-Matrix in diesem reinen Capture-Schritt
nicht erneut ausgeführt. Desktop/Tablet/mobile Größenmatrix nicht abgenommen.

Neuer Prüf-Export: `exports/2026-09-12_PHASE_6_CUSTOMER_VIEWPORT_CHECKPOINT.zip`.
Enthält die sechs vorhandenen Phase-6-Quell-/Test-/Scannerdateien sowie diesen
Bericht und den Phase-6A-Bericht. Keine Bilder mit personenbezogenen Daten,
keine abgelehnten Screenshots, Credentials, Env-Dateien, Logs, Dependencies,
Build-Artefakte oder alten ZIPs. Die historischen Exporte bleiben erhalten.

Der Build-Prozess ist beendet. Die bereits vorher gestartete Vorschau bleibt
ausschließlich für die unmittelbar folgende manuelle Browser-Zoom-Korrektur
und erneute Capture-Prüfung verfügbar: PIDs 260/700/714/715, Prozessgruppe 260.
In dieser Fortsetzung keine neuen dauerhaften Hintergrundprozesse gestartet.
Gezielte Prozessprüfung bestätigt genau diese vier bekannten Vorschauprozesse;
keine fremden Prozesse verändert. Stop nach erneuter PID-/Gruppenprüfung:
`kill -TERM -- -260`. Kein laufender Build, keine Migration, kein Deployment.
TASK-OWNED BACKGROUND PROCESSES STARTED: 0 (dieser Fortsetzungsschritt);
STOPPED: 0; STILL RUNNING: 4 (übernommene benötigte Vorschau).
RETAINED PROCESS PURPOSE: lokale Vorschau für unmittelbar folgende Browser-QA.
RAM CLEANUP: PASS – nur die benötigte Vorschau beibehalten.
UNRELATED NODE PROCESSES CHANGED: NO.

Nächster Schritt: effektive Browser-Seitenvergrößerung auf 100 % bringen,
anschließend tatsächliche CSS-Viewport-Maße gegen 320/390/768 prüfen und gültige
Aufnahmen über die funktionierende Capture-Schnittstelle sichern. Der geänderte
Customer-Datenzustand bleibt dabei ausdrücklich getrennt von Phase 6A.

Status: **BLOCKED / NOT READY – erforderliche Viewport-/Screenshot-Evidenz fehlt**.
