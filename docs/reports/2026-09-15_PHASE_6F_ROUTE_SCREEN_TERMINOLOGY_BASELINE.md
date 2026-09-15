# Phase 6F – Route-/Screen- und Gastronomie-Terminologie-Baseline

Datum: 2026-09-15
Arbeitsordner: `/private/tmp/wuxuai-pro-phase1-authoritative`
Branch: `codex/v1-phase-6-compact-mobile-ui`
Ausgangs-Commit: `cc10e8b7e6dda1ca9982814cf71aa441c7122faf`
Autoritative Staging-Version: `00fe9fa5-70b2-47f9-b92b-8d2d2e6dc816` (100 %)

Status: **PHASE 6F BASELINE COMPLETE – IMPLEMENTATION NOT READY**.

## Voraussetzung

Der Founder-iPhone-Test fuer Phase 6E ist PASS. Der Owner-Drawer stellte nach
dem Schliessen der Bildschirmtastatur normale Hoehe und Position ohne
Beruehrung oder Scrollbewegung wieder her. Der Footer blieb mit geoeffneter
Tastatur durch Scrollen erreichbar; `Abbrechen` schloss ohne Speicherung.
Phase 6E ist damit auf dem unveraenderten Commit und der unveraenderten
Staging-Version **FINAL LOCK**.

## Inventurmethode

- Router: ausfuehrbarer JSX-Router in `src/app/App.tsx`.
- Screens: gerenderte Komponenten, bekannte interne View-Zustaende und bereits
  dokumentierte Phase-6C–6E-Komponentenvertraege.
- Drawer/Dialoge: direkte `AppDrawer`- und `UiDialog`-Verbraucher im aktuellen
  Quellstand.
- Terminologie: TypeScript-AST-Audit der sichtbaren JSX-Texte und Attribute,
  Abgleich mit `GENERATED_SOURCE_TO_KEY` und zusaetzlicher Volltext-Inventur
  der TypeScript-Stringliterale. Die letzte Gruppe enthaelt bewusst auch
  technische Identifier und Serverfehler und ist daher keine automatische
  Aenderungsliste.

## Router-Coverage 50/50

Klassifikation: **VS** = eigenstaendiger visueller Screen, **SS** = geteilter
Screen/Komponente, **RG** = Redirect oder Guard ohne eigenstaendige
Produktoberflaeche. Desktop-only und Out-of-scope: 0.

| # | Route | Renderziel | Klasse |
|---:|---|---|---|
| 1 | `/` | PublicHome | VS |
| 2 | `/login` | LoginPage | VS |
| 3 | `/restaurant/login` | LoginPage | SS |
| 4 | `/register` | RegisterPage | VS |
| 5 | `/auth/callback` | AuthCallbackPage | VS |
| 6 | `/auth/confirm-email` | ConfirmEmailPage | VS |
| 7 | `/auth/forgot-password` | ForgotPasswordPage | VS |
| 8 | `/auth/update-password` | UpdatePasswordPage | VS |
| 9 | `/auth/staff-invite` | StaffInvitePage | VS |
| 10 | `/staff/login` | StaffLoginPage | VS |
| 11 | `/admin` Layout | ProtectedRoute / SetupGate / AdminLayout | SS |
| 12 | `/admin` Index | AdminDashboard | VS |
| 13 | `/admin/onboarding` | RestaurantOnboarding | VS |
| 14 | `/admin/settings` | SettingsPage | VS |
| 15 | `/admin/settings/setup` | OwnerSetupOverviewPage | VS |
| 16 | `/admin/settings/program-end` | ProgramTerminationPage | VS |
| 17 | `/admin/settings/:section` | sieben Settings-Ansichten | SS |
| 18 | `/admin/branding` | BrandingPage-Weiterleitung | RG |
| 19 | `/admin/customers` | CustomersPage | VS |
| 20 | `/admin/loyalty` | LoyaltyPage | VS |
| 21 | `/admin/qr` | QrCenterPage | VS |
| 22 | `/admin/rewards` | RewardsPage | VS |
| 23 | `/admin/staff` | StaffPage | VS |
| 24 | `/admin/welcome-gifts` | WelcomeGiftsPage | VS |
| 25 | `/admin/offers` | RestaurantOffersPage | VS |
| 26 | `/admin/reports` | BonusActivityReportsPage | VS |
| 27 | `/admin/legal` | OwnerLegalSettingsPage | VS |
| 28 | `/admin/platform/*` | PlatformAdminPage, sieben interne Bereiche | VS |
| 29 | `/admin/platform/audit` | PlatformAuditPage | VS |
| 30 | `/admin/platform/health` | PlatformHealthCenterPage | VS |
| 31 | `/admin/platform/restaurants/:restaurantId` | PlatformAdminPage Detail | VS |
| 32 | `/platform-admin` | PlatformAdminPage Alias | SS |
| 33 | `/platform-admin/restaurants` | PlatformAdminPage Alias | SS |
| 34 | `/staff` | StaffIndexRoute-Zuordnungsredirect | RG |
| 35 | `/staff/:slug` | StaffTablet | VS |
| 36 | `/r/:restaurantSlug/:referralToken` | ReferralLanding | VS |
| 37 | `/customer/login` | CustomerAuthPage Login | VS |
| 38 | `/customer/register` | CustomerAuthPage Registrierung | VS |
| 39 | `/customer/auth/callback` | CustomerAuthCallbackPage | VS |
| 40 | `/customer` | CentralCustomerPage Home | VS |
| 41 | `/customer/locations` | CentralCustomerPage Meine Lokale | VS |
| 42 | `/customer/account` | CentralCustomerPage Konto | VS |
| 43 | `/customer/email/confirm` | CustomerEmailActionPage | VS |
| 44 | `/customer/email/unsubscribe` | CustomerEmailActionPage | VS |
| 45 | `/customer/restaurants` | PartnerRestaurantFinderPage | VS |
| 46 | `/customer/:slug/offers` | CustomerOffersPage | VS |
| 47 | `/legal/:slug` | LegalCenterPage | VS |
| 48 | `/customer/:slug` | CustomerRestaurantAccess / CustomerPortal | VS |
| 49 | `/w/:slug` | CustomerPortal Sammel-Kompatibilitaetsweg | SS |
| 50 | `*` | Redirect nach `/` | RG |

Ergebnis: **41 VS, 6 SS, 3 RG, 0 unklassifiziert**. Loading-, Empty-,
Error- und Unauthorized-Zustaende bleiben als verpflichtende Zustandsmatrix
jedes betroffenen Screens erfasst und werden nicht als fiktive Routen gezaehlt.

## Nicht routengebundene sichtbare Oberflaechen

- CustomerPortal: Home, Einloesen, Sammeln und Konto als interner View-State.
- StaffTablet: Home, Kundensuche/Erkennung und Punkteworkflow samt Erfolgs-,
  Fehler-, Expired- und Retry-Zustaenden.
- PlatformAdminPage: Uebersicht, Betriebe, Plaene/Funktionen, Laender,
  Operations/Health, Audit/Aktivitaeten und System.
- Owner Settings: sieben Ansichten; Owner Onboarding: sieben Schritte.
- PWA/Installation: Customer-Aktivierungsdrawer mit installierbar,
  installiert, manuell und nicht verfuegbar.
- Modale Verbraucher: 42 produktive Einbaustellen des gemeinsamen
  Drawer-Vertrags: Owner 19, Customer 11, Staff 6, Platform Admin 6.
  Dazu kommen das Owner-Profilmenue und native/semantische Popover-/Menuezustaende.

Keine dieser Oberflaechen ist unklassifiziert. Eine Inventurzuordnung ist noch
keine physische Phase-6F-Abnahme.

## Terminologie-Baseline

Das vorhandene AST-Audit findet 1.694 sichtbare statische JSX-Texte und
sichtbare Attribute. Davon sind 1.640 im vorhandenen Runtime-Katalog verwaltet
und 54 als bereits bekannte Alias-/Sonderfaelle nicht direkt katalogisiert.

Fuer die Wortfamilie `Restaurant` ergeben sich:

- **142 sichtbare Vorkommen in 30 TSX-Dateien**;
- **224 eindeutige, bereits katalogisierte Runtime-Quelltexte** mit
  Restaurant-Wortfamilie;
- **661 TypeScript-Stringvorkommen / 431 eindeutige Quellen in 72 Dateien**
  im erweiterten Audit. Diese groessere Zahl umfasst technische
  `restaurant_id`-/Service-/Fehler-/Vertragskontexte und darf nicht pauschal
  ersetzt werden.

Kontextklassifikation fuer die Umsetzung:

| Kontext | Zielwort | Behandlung |
|---|---|---|
| Public/Auth formell | Gastronomiebetrieb | sichtbare Systemtexte und ARIA lokalisieren |
| Owner und Platform Admin | Betrieb | sichtbare Systemtexte und ARIA lokalisieren |
| Customer Suche/Auswahl/Besuch | Lokal | sichtbare Systemtexte und ARIA lokalisieren |
| Speiseangebot | Speisekarte | nur wenn tatsaechlich Menu/Catalog gemeint |
| Person | Inhaber/in oder Betreiber/in | rollen- und satzbezogen |
| Branche | Gastronomie | allgemeine Branchenbeschreibung |
| Staff-Prozess | Betrieb/Standort | nach konkretem Arbeitskontext |
| individueller Name/Text | unveraendert | `data-i18n-skip`-/Runtime-Vertrag erhalten |
| technische Identifier/API/RPC/Route | unveraendert | kein API-/DB-/Security-Vertrag anfassen |
| Legal-Dokumenttext | unveraendert | nur als Legal-Review-Finding dokumentieren |

### Legal-Review-Grenze

Mindestens zehn katalogisierte Quellen im `legal`-Namespace verwenden die
Restaurant-Wortfamilie; weitere Owner-Legal-Oberflaechen referenzieren
Restaurantadresse, Kassensystem und Auditprotokoll. Diese Texte werden in
Phase 6F nicht pauschal umgeschrieben. Vor einer Aenderung ist zu unterscheiden,
ob es reine UI-Navigation oder rechtlich freigegebener Dokumentinhalt ist.
Aktueller Befund: **LEGAL REVIEW REQUIRED; LEGAL TEXT CHANGED: NO**.

## Priorisierte Findings

- **P1:** keines aus der statischen Baseline nachgewiesen.
- **P2:** generische Public-/Auth-Texte verwenden weiterhin `Restaurant`,
  obwohl die Zielgruppe alle Gastronomiebetriebe umfasst.
- **P2:** Owner-/Platform-Admin-Systemtexte verwenden vielfach `Restaurant`
  statt des freigegebenen Oberflaechenbegriffs `Betrieb`.
- **P2:** Customer-Suche, Auswahl, QR- und Statussystemtexte verwenden teils
  `Restaurant` statt `Lokal`.
- **P2:** der Runtime-Katalog enthaelt 224 kontextabhaengig zu pruefende
  Quellen; deshalb ist eine globale String-Ersetzung ausdruecklich unsicher.
- **P2/Legal Review:** rechtlich relevante Vorkommen bleiben unveraendert und
  muessen vor Production fachlich/rechtlich freigegeben werden.

## Unveraenderte Grenzen

Bis zu dieser Baseline wurde kein Produktcode, CSS, API, RPC, Auth-, Rollen-,
RLS-, Business- oder Datenbankvertrag fuer Phase 6F geaendert. Keine Migration,
keine Datenaktion, kein Build, kein Deployment und keine Production-Aenderung.
Bestehende Final Locks bleiben unangetastet.

Naechster sicherer Schritt: kleine rollenbezogene I18n-Fixbloecke mit exakten
Keys und Regressionstests; zuerst Public/Auth, danach Customer, Staff,
Owner/Platform Admin. Legal-Dokumenttexte bleiben ausserhalb der Aenderung.
