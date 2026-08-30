# Legal Company Data Foundation - Staging Gate

Datum: 2026-08-30  
Branch: `codex/v1-canonical-recovery`  
Ausgangs-HEAD: `321c3b6caf3cf7880deb2f16ee5923360bbe2bad`  
Supabase Staging: `bwhvfjuwixgwduoeqaya`  
Cloudflare Staging-Version: `0ea4e93d-ae87-433a-ad95-153845115c22`  
Production: LOCKED  
Stripe: DEFERRED

## Ursache

Die additive Migration `20260829001000_optional_legal_company_data_foundation.sql`
verwendete beim Wiederverwenden der Restaurantadresse Felder auf
`public.restaurants`. Im kanonischen Schema liegen Anschrift, Postleitzahl, Ort
und Land jedoch auf `public.branches`. Der reale Staging-DB-Linter meldete daher
für `upsert_organization_legal_profile` SQLSTATE `42703`:
`record "restaurant_record" has no field "address"`.

Dieselbe Annahme war im neuen `TenantProvider` enthalten und blockierte nach
dem Deployment das Laden des Owner-Restaurantkontexts. Es handelte sich nicht
um einen RLS-, Auth- oder Supabase-Verbindungsfehler.

## Migration und Forward-Fix

- `20260829001000_optional_legal_company_data_foundation.sql`: auf Staging
  angewendet.
- `20260829001500_legal_company_branch_address_forward_fix.sql`: additiver
  Forward-Fix, auf Staging angewendet.
- `20260829002000_customer_swipe_redemption_atomic_confirmation.sql`: weiterhin
  ausschließlich lokal offen und nicht angewendet.
- Local/Remote History ist bis einschließlich `01500` synchron.
- Ein erneuter normaler Dry-Run plant ausschließlich `02000`.

`01500` ergänzt den expliziten Fremdschlüssel `address_source_branch_id`,
backfillt nur die neue Beziehung und ersetzt die defekte Funktion durch eine
Branch-gebundene Variante. Veröffentlichte Dokumente, Legal-Werte und
Businessdaten werden weder gelöscht noch überschrieben.

## Migration Safety

- Additiv / sicher: PASS.
- Destruktiver Drop von Businessdaten: NEIN.
- Bestehende Restaurants: Schema- und Portal-Regression PASS.
- Rollback-Risiko: Nach Nutzung der Operator- und Branch-Fremdschlüssel müsste
  ein Rollback zuerst abhängige Funktionen und Constraints kontrolliert auf den
  vorherigen Vertrag zurückführen und neue Operatorbeziehungen sichern. Ein
  blindes Entfernen der Tabelle oder Fremdschlüssel wäre nicht sicher.

## Security Definer und RLS

`upsert_organization_legal_profile(uuid, jsonb)` bleibt intern:

- `SECURITY DEFINER` mit `search_path = public, extensions, pg_temp`.
- Autorisierung vor Datenzugriff über `is_restaurant_admin(input_restaurant_id)`.
- Organisation wird ausschließlich aus dem autorisierten Restaurant gelesen.
- Branch muss gleichzeitig zu Restaurant und Organisation gehören.
- Kein dynamisches SQL.
- `EXECUTE` für `public`, `anon` und `authenticated` entzogen.

Anonymer Direktangriff auf Staging: HTTP `401`, SQLSTATE `42501`,
`permission denied for function upsert_organization_legal_profile`.

Owner-A-gegen-Owner-B, Staff und Customer sind durch statische/automatisierte
Verträge blockiert. Getrennte echte Staging-Sitzungen standen in diesem Lauf
nicht zur Verfügung; diese drei Punkte werden deshalb nicht als vollständiger
Live-Nachweis klassifiziert.

## Staging-Verifikation

- Migration History: PASS.
- DB-Linter Errors: 0.
- Bestehende Warnungen wurden nicht versteckt. Sie betreffen bekannte Legacy-
  und Volatilitätsverträge außerhalb dieses Scopes.
- Security Advisors im Supabase Dashboard: nicht separat abrufbar, da die
  vorhandene Dashboard-Sitzung abgemeldet war. Der reale DB-Linter und der
  direkte Anon-Test sind belegt; der Dashboard-Advisor bleibt ein manuelles Gate.
- Owner Portal: PASS nach Staging-Deploy.
- Owner Legal Readiness: PASS; Unternehmensdaten, Dokumente und Veröffentlichung
  erledigt, Kundenregistrierung freigegeben.
- Owner im eigenen Staff Portal: PASS.
- Branch-Adressquelle: live read-only PASS; `Friedrich Schiller-Straße 9`,
  `2514`, `Traiskirchen`, `AT` wurde aus der auswählbaren Restaurantadresse
  übernommen und anschließend ohne Speichern verworfen.
- Customer-Portal-Regression mit echtem Customer: nicht getestet. Die aktive
  Owner-Sitzung wurde korrekt als falscher Anmeldebereich abgewiesen.
- Bestehende veröffentlichte Legal-Dokumente wurden nicht verändert.

## Nicht Durchgeführte Datenänderungen

- Kein Testwert wurde in das bestehende Restaurant geschrieben.
- Keine Dokumentversion wurde vorbereitet oder veröffentlicht.
- Kein neues Owner-Konto wurde ohne zugängliche Bestätigungs-E-Mail erzeugt.
- Kein künstlicher Staff-/Customer-Zugang wurde angelegt.
- Keine Production-, Stripe-, Push- oder Merge-Aktion.

Damit bleiben neuer Owner-Onboarding-E2E, Settings Save/Reload, getrennte
Geschäftsanschrift, Live-Dokumentidentität, Live-Refresh nach Save und echte
Staff-/Customer-/Cross-Tenant-Sitzungen offen. Diese Gates dürfen nicht durch
Änderungen am bestehenden veröffentlichten Testrestaurant simuliert werden.

## Qualität

- Tests: 1126/1126 PASS.
- Fokussierte Legal-Tests: 126/126 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler.
- Build: PASS, 2059 Module.
- `git diff --check`: PASS.
- Secret-Scan des Änderungsumfangs: PASS.
- DB-Linter Staging: PASS, 0 Errors.

## Finale Klassifikation

MIGRATION: APPLIED  
MIGRATION HISTORY: PASS  
DB LINTER: PASS  
SECURITY DEFINER: PASS  
CROSS-TENANT: BLOCKED (Contract), LIVE SESSION OFFEN  
EXISTING RESTAURANTS: PASS  
NEW OWNER ONBOARDING: NOT TESTED  
LEGAL OPERATOR != RESTAURANT: PASS (Schema), LIVE NEW OWNER OFFEN  
LEGAL OPERATOR != BRANCH: PASS (Schema), LIVE NEW OWNER OFFEN  
FN OPTIONAL: PASS (Contract)  
UID OPTIONAL: PASS (Contract)  
SAME ADDRESS: PASS (Live Read-only), SAVE/RELOAD OFFEN  
SEPARATE ADDRESS: PASS (bestehender Wert), SAVE/RELOAD OFFEN  
SETTINGS SAVE/RELOAD: NOT TESTED  
LEGAL DOCUMENT IDENTITY: PASS (Contract), LIVE GENERATION OFFEN  
READINESS: PASS (bestehender Owner)  
LIVE REFRESH: NOT TESTED  
STAFF: BLOCKED (Contract), LIVE NEGATIVE SESSION OFFEN  
CUSTOMER: BLOCKED (Contract), LIVE NEGATIVE SESSION OFFEN  
ANON: BLOCKED, HTTP 401 / SQLSTATE 42501  
TESTS: 1126/1126 PASS  
LEGAL TESTS: 126/126 PASS  
OWNER COMPANY DATA FOUNDATION FINAL LOCK: NO  
READY FOR V1 FINAL E2E: NO  
PRODUCTION: LOCKED  
STRIPE: DEFERRED

Status: NOT READY - die Migration und der bestehende Owner sind stabil, aber
die ausdrücklich verlangten neuen und negativen Real-Sitzungs-Gates fehlen.
