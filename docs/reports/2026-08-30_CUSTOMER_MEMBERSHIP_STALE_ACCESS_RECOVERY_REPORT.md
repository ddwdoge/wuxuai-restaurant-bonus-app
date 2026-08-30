# Customer Membership Stale Access Recovery

Datum: 2026-08-30  
Umgebung: WUXUAI Bonus Development/Test  
Supabase: `bwhvfjuwixgwduoeqaya`

## Ursache

Das aktive Staff+Customer-Konto besaß noch keine Mitgliedschaft beim Zielrestaurant.
Im selben Browser war jedoch ein restaurantbezogener Kundenzugang eines früheren
Kontos gespeichert. `CustomerRestaurantAccess` übergab diesen Token automatisch an
`join_customer_account_restaurant`. Der RPC blockierte die fremde Bindung korrekt
mit `CUSTOMER_MEMBERSHIP_ALREADY_LINKED`; das Frontend übersetzte diesen Zustand nur
in die generische Meldung "Der Beitritt konnte gerade nicht abgeschlossen werden."

Eine aggregierte Development/Test-Prüfung bestätigte:

- ein aktives Staff+Customer-Konto im geprüften Restaurantkontext,
- keine bestehende Zielrestaurant-Mitgliedschaft,
- keinen restaurantbezogenen Kunden mit derselben Telefonnummer,
- keine Verknüpfung zu einem anderen Account über die Telefonnummer.

Der Join-RPC wurde zusätzlich mit demselben Auth-Kontext und ohne Browser-Token in
einem vollständig zurückgerollten Diagnoseblock ausgeführt. Ergebnis:
`DIAGNOSTIC_JOIN_WOULD_SUCCEED`. Es wurden dabei keine Kundendaten oder
Mitgliedschaften gespeichert.

## Geänderte Dateien

- `src/modules/customer/customerAccountService.ts`
- `tests/central-customer-login-context.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-30_CUSTOMER_MEMBERSHIP_STALE_ACCESS_RECOVERY_REPORT.md`

## Was wurde geändert

Bei `CUSTOMER_ACCESS_TOKEN_INVALID` oder `CUSTOMER_MEMBERSHIP_ALREADY_LINKED`
entfernt der Client ausschließlich den betroffenen lokalen Restaurantzugang und
wiederholt den bestehenden servervalidierten Join genau einmal ohne diesen Token.

## Was wurde nicht geändert

- keine Join-, Membership-, Legal- oder Telefonregel
- keine RLS- oder RPC-Grant-Änderung
- keine Punkte-, Reward-, Referral- oder Staff-Logik
- keine Datenbankmigration
- kein Deployment
- keine Production-Aktion

## Prüfung

- fokussierter Test: 13/13 PASS
- Gesamttests: 1149/1149 PASS
- Typecheck: PASS
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: PASS mit nicht geheimen Build-Validierungswerten
- `git diff --check`: PASS

## Risiken

Der korrigierte Frontend-Flow ist noch nicht auf den Development/Test-Worker
bereitgestellt. Ein echter erneuter Beitritt und ein physischer iPhone-Gate sind
daher noch offen. Der serverseitige Sicherheitsvertrag bleibt unverändert.

Status: CODE LOCK / LIVE RETEST OFFEN
