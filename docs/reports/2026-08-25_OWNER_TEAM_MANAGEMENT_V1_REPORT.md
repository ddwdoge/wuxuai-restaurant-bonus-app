# Owner Team Management V1 Report

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `4213e41c5b9605bde07b803afcdc6bcdeca8c732`

## Ursache

Die vorhandene Owner-Route `/admin/staff` war nur ein Platzhalter. Das
bestehende `staff_members`-Modell kannte Legacy-PIN-Datensätze, aber keine
persönliche Supabase-Auth-Bindung, keinen Einladungsstatus und keine sicheren
Owner-Aktionen. Der Staff-QR verwies bereits korrekt auf den geschützten
Login-Einstieg und wurde beibehalten.

## Bestehende Architektur

- Owner-Teamseite: `/admin/staff`
- Staff Portal: `/staff/:slug`
- Teamdaten: `staff_members`
- Restaurantrollen: `restaurant_members`
- Authentifizierung: zentrale Supabase-Auth-Sitzung
- Tages-PIN und Punkteengine: bestehende RPCs, unverändert
- Punkteattribution: bestehendes `points_transactions.staff_user_id = auth.uid()`
- Audit: bestehendes `audit_log`

## Umsetzung

- `staff_members` additiv um Auth-ID, normalisierte E-Mail, Status sowie
  Einladungs-, Annahme-, Sperr- und Archivzeitpunkte erweitert.
- Restaurantrollen um `staff` und `supervisor` ergänzt; aktive Staff-Rollen
  werden von `is_restaurant_member` nur zusammen mit einer aktiven, passenden
  Staff-Bindung anerkannt.
- Direkte Browser-Schreibwege für Staff-Datensätze und Staff-Rollenzuweisungen
  entfernt. Owner/Admin-Aktionen laufen über kleine tenantgebundene RPCs.
- Owner UI zeigt Name, E-Mail, Status, Rolle, Einladungs-/Annahmezeit,
  letzten Login, letzte Aktivität und vorhandene Punkteaktionsaggregate.
- Einladen, erneut senden, sperren, reaktivieren und auditierbar archivieren
  umgesetzt. Historische Aktionen werden nicht gelöscht.
- `owner-staff-invite` kapselt Supabase Auth Admin ausschließlich serverseitig.
  Neue oder vorhandene reine Staff-Identitäten werden exakt per E-Mail gebunden.
- Ein vorhandenes Owner-, Platform-Admin- oder Customer-Konto wird nicht als
  Staff-Konto wiederverwendet. Eine reine Staff-Identität kann später nur durch
  eine weitere ausdrückliche Restaurantbindung einem zweiten Tenant zugeordnet
  werden.
- Aktivierung erfolgt erst nach authentifizierter Linkannahme und persönlicher
  Passwortsetzung über `accept_my_restaurant_staff_invitation`.

## Security-Vertrag

- Owner/Admin: Verwaltung nur im eigenen Restaurant.
- Manager, Staff, Customer und Anon: keine Teamverwaltung.
- Kein Rollenbezug aus User- oder App-Metadaten.
- Staff-QR: nur URL zum Login, kein Token und keine Rolle.
- Kein gemeinsames Passwort und kein Passwortversand.
- Service Role: nur Edge Function, nicht im Browserbundle.
- Suspend/Archive: Zugriff fail-closed; Audit und Punktehistorie bleiben.
- Audit-Ereignisse: `STAFF_INVITED`, `STAFF_INVITE_RESENT`,
  `STAFF_ACTIVATED`, `STAFF_SUSPENDED`, `STAFF_REACTIVATED`,
  `STAFF_MEMBERSHIP_REMOVED`.

## Geänderte Bereiche

- Owner Team UI und Services
- Staff Invite Auth-Seite und separater Session-Client
- Restaurantrollen-Auflösung und `/staff`-Einstieg
- additive Staff-Migration und Invite Edge Function
- responsive Styles, Engineering Bible und Tests

## Was nicht geändert wurde

- Punkteberechnung
- Tages-PIN
- Customer Auth
- Referral
- Redemption und Reporting
- Platform-Admin-Vertrag
- Billing oder Stripe
- Production-Datenbank und Production-Deployment

## Qualität

- Tests: 889/889 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret Scan: PASS
- Migration History: bis `20260825001000` lokal/remote synchron
- Staging Dry Run: PASS, nur `20260825002000_owner_staff_account_management.sql`
- Lokaler DB-Linter: nicht verfügbar, da Docker/Podman fehlt

## Mobile und Live

- Responsive-Vertrag 390/430/768/1024/1440: durch flexible CSS- und
  Komponententests abgedeckt; echter Browser-Live-Test nach Staging-Deployment
  noch offen.
- Migration auf Staging: nicht angewendet.
- Edge Function auf Staging: nicht deployed.
- Canonical Staff-only Testkonto: nicht erstellt; eine ausdrücklich benannte
  Staging-Test-E-Mail ist erforderlich.
- Realer Staff Login, Owner-/Platform-Negativtest und Cross-Tenant-Livetest:
  offen.

## Risiken

- Supabase Invite-/Magic-Link-Zustellung und der Annahme-RPC müssen nach
  Anwendung der Migration mit einer realen Staff-Test-E-Mail geprüft werden.
- Ohne Staging-Migration und Edge-Deployment ist die neue Owner UI nicht live
  funktionsfähig.
- DB-Linter muss nach Staging-Anwendung gegen den realen Schema-Stand 0 Fehler
  liefern.

## Status

`CODE LOCK` – lokale Implementierung und Regression sind vollständig grün;
Staging-Aktivierung und reale Staff-only Sicherheitsabnahme fehlen.
