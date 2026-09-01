# Platform Admin V1 – Loop 3B Restaurant Control Center UI

Datum: 25.08.2026  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `5be0207df8b04c7ea3e3d4de653e08795fddc2f4`

## Ursache

Die vorhandene Restaurantdetailansicht verwendete noch `get_platform_restaurant_detail` statt des bereits gehärteten Vertrags `get_platform_restaurant_control_center`. Fehlende Detailwerte wurden teilweise mit `?? 0` als echte Nullwerte dargestellt. Status-, Abo- und Trial-Aktionen wurden ohne vorgeschaltete Bestätigung ausgeführt; die manuelle Zahlungsbestätigung wirkte wie ein freigegebener Abrechnungsvertrag, obwohl der Backendvertrag sie ausdrücklich als `deferred` kennzeichnet.

## Geänderte Dateien

- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/PlatformRestaurantControlCenter.tsx`
- `src/modules/platform/platformControlCenterView.mjs`
- `src/modules/platform/platformControlCenterView.d.mts`
- `src/styles.css`
- `tests/platform-admin-control-center-ui.test.mjs`
- `docs/reports/2026-08-24_PLATFORM_ADMIN_V1_LOOP_3B_CONTROL_CENTER_UI.md`

## Umsetzung

- Bestehende Restaurantdetailroute beibehalten und auf den einen autoritativen Control-Center-RPC umgestellt.
- Operativer Header, Restaurant-/SaaS-/Setup-Status und optionaler Test-Tenant-Hinweis ergänzt.
- Konto, Vertrag, Abrechnung, Nutzung, Referral, Einlösungen, Systemgesundheit, Portale, Audit und technische Details strukturiert.
- Echte Nullwerte bleiben `0`; `unavailable` bleibt `–`; RPC-Fehler zeigt sicheren Retry-Zustand ohne Null-KPIs.
- Backend-`overall_health` wird ohne eigene Neubewertung dargestellt.
- Cron wird ausdrücklich als „Keine Telemetrie verfügbar“ angezeigt.
- Status-, Abo- und Trial-Aktionen verlangen eine Bestätigung und laden danach Liste und Control Center erneut.
- Manuelle Zahlung ist deaktiviert und als noch nicht verfügbar gekennzeichnet.
- Portal-Links weisen auf reguläre Authentifizierung hin; keine Owner- oder Staff-Identitätsübernahme wurde implementiert.
- V2-Bonusnetzwerk bleibt deaktiviert; V1-QR-Vertrag zeigt Gäste-QR und Mitarbeiter-QR aktiv, Kassa-Aufsteller inaktiv.
- Skeleton, Error/Retry und responsive Layouts ergänzt.

## Nicht geändert

- Keine Migration erstellt.
- Keine RLS-, Grant- oder RPC-Änderung.
- Keine Punkte-, Referral-, Redemption-, Customer-, Staff-, E-Mail-, Geocoding- oder QR-Businesslogik geändert.
- Keine Stripe- oder manuelle Zahlungslogik ergänzt.
- Kein Deployment und keine Production-Aktion.

## Autoritativer Vertragsbefund

Die lokale und auf Staging angewendete Migration `20260824005000_platform_admin_restaurant_control_center.sql` liefert Referral-Dauer, Verhältnis und Booster-Kennzahlen. Sie liefert jedoch nicht `loyalty_settings.referral_monthly_invite_limit`, obwohl dieses Feld durch 06000 inzwischen restaurantbezogen existiert.

Die UI erfindet deshalb keinen Wert und zeigt beim monatlichen Einladungslimit `–` mit einem klaren Vertragshinweis. Für einen vollständigen Loop-3B-PASS muss der bestehende Control-Center-Vertrag in einem separat freigegebenen additiven Forward-Fix um dieses Feld erweitert werden. Es wurde bewusst kein zweiter RPC und kein direkter Tabellenzugriff gebaut.

## Staging-Prüfung

- Autorisierte Platform-Admin-Sitzung auf `bonus.wuxuaisbi.com`: vorhanden.
- Bestehende `/platform-admin`-Seite: erreichbar.
- Staging zeigt weiterhin den vorherigen UI-Build mit altem Detailbereich und direkter manueller Zahlungsaktion.
- Die neue lokale UI wurde nicht auf Staging deployed, da keine Deployment-Freigabe Teil dieses Auftrags war.
- DB-Linter gegen das verknüpfte Staging-Projekt: 0 Fehler.
- Bestehende Backend-Security-Tests bestätigen Platform-Admin-Rollenprüfung und fail-closed Verhalten.
- Owner-, Staff-, Customer- und Anon-Negativtests wurden in diesem UI-Sprint nicht erneut mit vier echten Sitzungen live ausgeführt.

## Responsive und Bedienung

Lokale Komponentenabnahme mit repräsentativem autoritativem Payload:

| Breite | Horizontaler Overflow | Touchziele unter 44 px |
| ---: | --- | ---: |
| 390 px | Nein | 0 |
| 430 px | Nein | 0 |
| 768 px | Nein | 0 |
| 1024 px | Nein | 0 |
| 1440 px | Nein | 0 |

Der Bestätigungs-Drawer wurde bei 390 px geöffnet und besitzt Dialogsemantik, Fokusziel, Abbrechen und bestätigende Aktion.

## Qualität

- Tests: 871/871 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret Scan: PASS
- Staging DB Linter: 0 Fehler

## Ergebnis

- Restaurant Control Center UI: PASS lokal
- Konto & Vertrag: PASS
- Trial-Darstellung: PASS
- Verwechslung Restaurant-Trial/Platform-Admin-Ablauf: behoben
- Billing: Stripe deferred
- Nutzung/KPI: PASS
- Zero/Unavailable/Error: PASS
- Referral: PARTIAL – monatliches Einladungslimit fehlt im Backendvertrag
- 14/7-Vertrag: PASS
- Einlösungen: PASS
- Registration/E-Mail/Geo/Staff Health: PASS
- Cron: unavailable korrekt angezeigt
- Overall Health: PASS
- Portal-Links/Impersonation: PASS / nicht implementiert
- Status-/Subscription-/Trial-Bestätigung: PASS
- Audit/Technische Details: PASS
- Bonusnetzwerk: V2 deaktiviert
- QR Center Vertrag: PASS
- Tenant-RLS geändert: Nein
- DB-Migration: Keine

## Offene Risiken

1. Monatliches Referral-Einladungslimit fehlt im bestehenden Control-Center-RPC.
2. Neuer UI-Build ist nicht auf Staging ausgerollt und daher dort nicht live abgenommen.
3. Vier reale negative Rollen-Sitzungen wurden in diesem Sprint nicht erneut live geprüft; die serverseitigen automatisierten Security-Nachweise bleiben grün.

Status: **NOT READY**

Grund: Kein vollständiger Loop-3B-Lock ohne autoritatives monatliches Einladungslimit und echten Staging-UI-Flow.
