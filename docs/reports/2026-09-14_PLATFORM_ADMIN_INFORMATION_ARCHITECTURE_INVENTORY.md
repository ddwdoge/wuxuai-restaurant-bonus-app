# WUXUAI® Bonus – Platform Admin Information Architecture Inventory

Datum: 2026-09-14
Phase: A – read-only Inventur
Branch: `codex/v1-phase-6-compact-mobile-ui`
Ausgangs-HEAD: `380c17735b2b2894ed4200900f135b61ba7bc152`

## Ergebnis der read-only Inventur

Alle 50 vorhandenen Platform-Admin-Funktionen sind genau einem der sieben tatsächlich belegten Verwaltungsbereiche zugeordnet. Es gibt keine leere oder nur geplante Rubrik. Die Inventur hat keine notwendige Datenbank-, RPC-, Rollen-, RLS- oder Businesslogikänderung ergeben.

Bestehende autorisierte Routen:

- `/admin/platform` – lange kombinierte Hauptseite
- `/admin/platform/restaurants/:restaurantId` – gleiche Hauptseite mit Betriebs-Deep-Link
- `/admin/platform/health` – Operations & Health Center mit URL-Filtern
- `/admin/platform/audit` – Auditansicht
- `/platform-admin` und `/platform-admin/restaurants` – bestehende Aliasrouten

Geplanter additive Route-Vertrag:

- `/admin/platform` – Übersicht
- `/admin/platform/businesses` und `/admin/platform/businesses/:restaurantId` – Betriebe
- `/admin/platform/plans` und `/admin/platform/plans/:restaurantId` – Pläne & Funktionen
- `/admin/platform/countries` – Länder
- `/admin/platform/health` – Operations & Health
- `/admin/platform/audit` – Audit & Aktivitäten
- `/admin/platform/system` und `/admin/platform/system/:restaurantId` – System
- `/admin/platform/restaurants/:restaurantId` bleibt als sicherer Legacy-Deep-Link erhalten und leitet auf den Betrieb weiter.

## Funktionszuordnung

Legende: R = read-only, W = vorhandene bestätigte Schreibaktion. Alle Funktionen erfordern die bestehende serverseitige Platform-Admin-Rolle; Schreibaktionen zusätzlich `canWritePlatformAdmin` beziehungsweise die heute bereits vorhandene engere Rollenprüfung.

| # | Menübereich | Funktion / aktuelle Komponente | Datenvertrag | Aktion | URL-/Filterzustand | Audit/Bestätigung und Mobile-Ist |
|---:|---|---|---|---|---|---|
| 1 | Übersicht | globale KPI-Karten, `PlatformAdminPage` | `get_platform_restaurants` | R | Filter nur lokaler State | Karten anklickbar; aktuell Scrollsprung in lange Seite |
| 2 | Übersicht | Scheduler-Telemetrie, `PlatformOperationalTelemetry` | `get_platform_operational_telemetry` | R | keiner | kompakte Karte |
| 3 | Übersicht | E-Mail-Telemetrie, `PlatformOperationalTelemetry` | `get_platform_operational_telemetry` | R | keiner | kompakte Karte |
| 4 | Übersicht | Registrierungs-Telemetrie, `PlatformOperationalTelemetry` | `get_platform_operational_telemetry` | R | keiner | kompakte Karte |
| 5 | Übersicht | direkte Links zu Health und Audit, Header | Router | R | eindeutige Routen | keine Schreibaktion beim Navigieren |
| 6 | Betriebe | Restaurantliste, Suche und Statusfilter, `PlatformAdminPage` | `get_platform_restaurants` | R | aktuell lokaler State | lange Liste, Mobile-Zeilen vorhanden |
| 7 | Betriebe | Restaurantauswahl und Detail-Deep-Link | Router + `get_platform_restaurant_control_center` | R | `restaurantId` im Pfad | Browser-Historie bereits vorhanden |
| 8 | Betriebe | Identität, Betreiber und Statusbadges, `PlatformRestaurantControlCenter` | Control-Center-RPC | R | über Restaurantpfad | TEST_ONLY-Status nur aus Serverantwort |
| 9 | Betriebe | Nutzungskennzahlen | Control-Center-RPC | R | über Restaurantpfad | kompakte Karten |
| 10 | Betriebe | Konto-, Testphasen- und Setupstatus | Control-Center-RPC | R | über Restaurantpfad | aktuell in langer Detailspalte |
| 11 | Betriebe | Referral-/2×-Bonusstatus | Control-Center-RPC | R | über Restaurantpfad | keine Konfigurationsaktion |
| 12 | Betriebe | Einlösungskennzahlen | Control-Center-RPC | R | über Restaurantpfad | 15-Minuten-Vertrag nur angezeigt |
| 13 | Betriebe | restaurantbezogene Systemgesundheit | Control-Center-RPC | R | über Restaurantpfad | keine Reparaturaktion |
| 14 | Betriebe | Portal- und QR-Links | bestehende geschützte Portalrouten | R | externe neue Tabs | keine Identitätsübernahme |
| 15 | Pläne & Funktionen | Abrechnungs-/Tarifsnapshot | Control-Center-RPC | R | über Restaurantpfad | Stripe bleibt nicht aktiviert |
| 16 | Pläne & Funktionen | Abo aktivieren/pausieren/Testphase verlängern | `update_platform_restaurant_subscription_confirmed` | W | über Restaurantpfad | Grund, `CONFIRMED`, Idempotenz, Drawer |
| 17 | Pläne & Funktionen | effektiver Plan und Limits, `PlatformPlanEntitlementsPanel` | `get_restaurant_entitlements` | R | über Restaurantpfad | BASIC/PRO und Quelle sichtbar |
| 18 | Pläne & Funktionen | PRO-Override aktivieren | `set_platform_restaurant_plan_override` | W | über Restaurantpfad | Start, Ablauf, Grund, `CONFIRMED`, Idempotenz |
| 19 | Pläne & Funktionen | PRO-Override beenden | `end_platform_restaurant_plan_override` | W | über Restaurantpfad | Grund, `CONFIRMED`, Dialog |
| 20 | Länder | Länderstatus, Währung, Aktivierungsstatus, `PlatformCountryLaunchPanel` | `get_platform_country_launch_status` | R | aktuell keine Unterroute | sieben vorhandene Länderansichten |
| 21 | Länder | Readiness-Prüfungen und Dokumentreferenzen | gleicher RPC | R | keiner | nicht erfüllte Voraussetzungen sichtbar |
| 22 | Länder | Markt aktivieren oder Registrierungen sperren | `set_platform_country_launch_status` | W | Land im lokalen Drawer-State | Reason, landesspezifische Bestätigung, Idempotenz |
| 23 | Länder | Länder-Änderungsverlauf | gleicher Read-RPC | R | pro Länderkarte | Akteur, Zeit, Grund, vorher/nachher |
| 24 | Operations & Health | Snapshot-Zeit und Datenfrische, `PlatformHealthCenterPage` | `get_platform_health_center` | R | bestehende Route | keine automatische Echtzeitbehauptung |
| 25 | Operations & Health | Schweregrad-KPI-Karten | Health-RPC | R | `severity`/`health` in Query | Zahlen stammen aus demselben Snapshot |
| 26 | Operations & Health | Suche und sechs Filter | Health-RPC | R | Query-Parameter | Reload/Back/Forward-fähig |
| 27 | Operations & Health | Finding-/Healthy-Liste und Empty State | Health-RPC | R | Query-Parameter | strukturierte Mobile-Zeilen |
| 28 | Operations & Health | Finding-Detail | Health-RPC | R | `finding` in Query | Betrieb/Standort/Bereich/Zeit sichtbar |
| 29 | Operations & Health | Ziel-Link aus Finding | vorhandener `target.route` | R | Deep-Link | keine automatische Reparatur |
| 30 | Audit & Aktivitäten | Auditfilter, `PlatformAuditPage` | `get_platform_audit_events` + Restaurantliste | R | aktuell Formular-State, nicht Query | max. 200, keine sensiblen Credentials |
| 31 | Audit & Aktivitäten | Audit-Ereignistabelle | Audit-RPC | R | über Filter | Mobile aktuell horizontale Tabellenhülle |
| 32 | Audit & Aktivitäten | Auditdetail mit bereinigten Metadaten | Audit-RPC | R | ausgewählte Zeile lokal | Auswahl per Pointer/Tastatur |
| 33 | Audit & Aktivitäten | Restaurant-Audit-Auszug | Control-Center-RPC | R | über Restaurantpfad | unveränderbarer, bereinigter Auszug |
| 34 | System | technische Control-Center-Details | Control-Center-RPC | R | über Restaurantpfad | standardmäßig eingeklappt |
| 35 | System | Support-&-Verwaltung Übersicht, `PlatformOperationsPanel` | `get_platform_restaurant_operations` | R | Tab aktuell lokaler State | Bestände/Status/Betreiber |
| 36 | System | Betreiber-E-Mail- und Zuordnungssupport | Operations-RPC + `platform-support-auth` | W | lokaler Tab | Grund/Referenz, bestätigter Drawer |
| 37 | System | Mitarbeiter-Support | Operations-RPC / execute RPC / auth function | W | lokaler Tab | Einladung, Sperre, Reaktivierung, Widerruf bestätigt |
| 38 | System | Gäste-Support und TEST_ONLY-Markierung | Operations-RPC + `set_platform_customer_test_mode` | W | lokaler Tab | serverseitige Zielprüfung/Audit bleibt erhalten |
| 39 | System | Punktejournale | Operations-RPC | R | lokaler Tab | letzte 100, Quelle/Akteur |
| 40 | System | Geschenke, Einlösungen und offene Präsentation | Operations-RPC | R/W | lokaler Tab | nur abgelaufenen Zustand bestätigt schließen |
| 41 | System | E-Mail-Warteschlange | Operations-RPC | R/W | lokaler Tab | nur FAILED erneut einplanen, bestätigt |
| 42 | System | QR-Diagnose | Operations-RPC | R/W | lokaler Tab | keine Hashes/Codes; Ungültigmachen bestätigt |
| 43 | System | PIN-Diagnose | Operations-RPC | R | lokaler Tab | niemals PIN-Werte |
| 44 | System | Sicherheitskennzeichnungen | Operations-RPC | R/W | lokaler Tab | Prüfung markieren/abschließen, bestätigt |
| 45 | System | Abrechnungsabgrenzung | Operations-RPC | R | lokaler Tab | manuelle Zahlungswerte serverseitig gesperrt |
| 46 | System | Restaurant-/Veröffentlichungsaktionen | `execute_platform_admin_operation` | W | lokaler Tab | Reason/Confirmation je Schweregrad |
| 47 | System | kontrollierte Punktekorrektur | `execute_platform_admin_operation` | W | lokaler Tab | ±500, Ziel/Grund/starke Bestätigung |
| 48 | System | Tenant-Sperre/-Entsperrung | `execute_platform_admin_operation` | W | lokaler Tab | CRITICAL, Restaurantname als starke Bestätigung |
| 49 | System | Sprache, Rechtsraum und Dokumentstände, `PlatformLegalI18nPanel` | `get_platform_restaurant_legal_i18n_status` | R | über Restaurantpfad | Rechtsraum bleibt von UI-Sprache getrennt |
| 50 | System | Kassa-Diagnose, TEST_ONLY-Preflight/Bereinigung und fremde Testzuordnung, `PlatformKassaCompliancePanel` | `get_platform_kassa_compliance_status`, zwei Preflight-, Markierungs- und Cleanup-RPCs | R/W | über Restaurantpfad | starke, zielgebundene Bestätigungen und Auditpflicht |

## Navigations- und Datenvertrag

- Das gemeinsame Layout darf ausschließlich Präsentation und Routing ergänzen.
- Die Hauptseite lädt nur Übersichtsdaten; betriebsbezogene Unterseiten verwenden die vorhandene Restaurantliste und genau einen Control-Center-Abruf für das gewählte Restaurant.
- Health und Audit behalten ihre bestehenden Servicefunktionen und Deep Links.
- Vorhandene Schreibkomponenten werden nicht neu implementiert, sondern unverändert in ihren zugeordneten Bereich eingehängt.
- Navigation, Reload, Filterwechsel und KPI-Klick lösen keine Schreib-RPCs aus.
- Mobile nutzt einen `Admin-Menü`-Drawer; Desktop eine kompakte Sidebar. Keine Platform-Admin-Bottom-Navigation.
- Der bestehende gemeinsame Drawer wird verwendet, aber nicht verändert.

## Festgestellte Ist-Risiken vor Umsetzung

- Die kombinierte Hauptseite lädt und rendert alle Bereiche gleichzeitig.
- Auditfilter sind bisher nicht in der URL; der bestehende Filtervertrag darf deshalb in diesem Auftrag nicht ohne fachliche Änderung erweitert werden. Die neue Navigation bewahrt zunächst das aktuelle Verhalten.
- Mehrere bestehende Detailtexte außerhalb von Health/Country/Plan sind historisch nur deutsch. Die Navigationslabels selbst können vollständig sieben-sprachig ergänzt werden; eine Übersetzung aller fachlichen Alttexte wäre ein separater Inhaltsauftrag und darf nicht als Navigationsrefaktor versteckt werden.
- `src/shared/i18n/catalog.mjs` und `src/shared/components/AppDrawer.tsx` enthalten bereits fremde/uncommitted Staff-Arbeiten. Sie werden nicht editiert oder in einen Navigation-Commit aufgenommen.

## Phase-A-Status

Der neue mobile Platform-Admin-Menü-Drawer ist die autorisierte zusätzliche
Navigationsinstanz zur bestehenden Phase-6-Drawer-Inventur. Die 40 bereits
klassifizierten Produkt-Drawer und die zwei gemeinsamen Wrapper bleiben
unverändert; die Gesamtzahl der JSX-Drawer-Verwendungen steigt damit
nachvollziehbar von 42 auf 43. Der neue Drawer enthält ausschließlich Links,
löst keine Schreibaktion aus und verwendet den bestehenden `AppDrawer`-Vertrag.

PLATFORM ADMIN INVENTORY: 50/50
UNCLASSIFIED FUNCTIONS: 0/50
MENU SECTIONS MAPPED: 7/7
EMPTY PLACEHOLDER SECTIONS: 0
DATABASE/RPC/ROLE CHANGE REQUIRED: NO

Status: **PHASE A INVENTORY COMPLETE**
