# Audit-Protokoll und sicherer Testmodus

Status: V1 Basis auf Staging

## Architektur

WUXUAI verwendet weiterhin die bestehende Tabelle `audit_log`. Es gibt kein paralleles Audit-System. Die Tabelle wurde additiv um normalisierte Ereignisfelder, Gastbezug, Anfrage-ID, Testkennzeichnung und bereinigte Fehlerdaten erweitert.

Kerntabellen erzeugen serverseitig Audit-Ereignisse über Trigger. Bereits vorhandene Audit-Schreibvorgänge werden vor dem Speichern normalisiert. Sicherheitskritische PIN-Fehler werden in den V1-RPC-Wrappern abgefangen, dauerhaft protokolliert und als strukturierte Fehlerantwort zurückgegeben.

## Ereignisse

V1 unterstützt insbesondere:

- `CUSTOMER_REGISTERED`
- `CUSTOMER_JOINED_RESTAURANT`
- `WELCOME_REWARD_CREATED`
- `POINTS_COLLECTION_STARTED`
- `DAILY_PIN_ACCEPTED`
- `DAILY_PIN_REJECTED`
- `POINTS_ADDED`
- `POINTS_ADD_FAILED`
- `REWARD_UNLOCKED`
- `REDEMPTION_CODE_CREATED`
- `REWARD_REDEEMED`
- `REWARD_REDEMPTION_FAILED`
- `REWARD_REDEMPTION_BLOCKED`
- `COUPON_REDEEMED`
- `REFERRAL_CREATED`
- `REFERRAL_ACTIVATED`
- `POINTS_EXPIRED`
- `REWARD_EXPIRED`
- `AUTHORIZATION_DENIED`
- `RLS_DENIED`
- `API_ERROR`

## Gespeicherte Felder

Audit-Einträge enthalten Zeitpunkt, Restaurant, optionalen Gast, Akteur, Ereignis, Status, Quelle, Entität, Anfrage-ID, Testkennzeichnung, Test-Sitzungs-ID, sichere Metadaten sowie bereinigte Fehlerangaben.

## Verbotene sensible Daten

Nicht gespeichert werden:

- Telefonnummern
- Kundentoken oder Referral-Token
- Tages-PIN
- Passwort oder Autorisierungsdaten
- Sitzungs-Token
- vollständiger Einlösecode oder Code-Hash
- Service-Role-Schlüssel und andere Secrets

Die Funktion `audit_safe_metadata` entfernt sensible Schlüssel rekursiv. Fehlertexte werden gekürzt und bereinigt. Die Plattformansicht zeigt keine Klarnamen oder Telefonnummern von Gästen.

## Testkunden

`customers.is_test_customer` kennzeichnet kontrollierte Testgäste. Eine Testkennzeichnung benötigt eine Test-Sitzungs-ID, zum Beispiel `E2E-2026-07-20-001`. Nur berechtigte interne Plattformrollen können die Kennzeichnung über `set_platform_customer_test_mode` ändern.

Testgäste verwenden dieselben Registrierungs-, Punkte-, Geschenk-, Referral- und Einlöseflows wie echte Gäste. Es gibt keine Demo- oder Sonderbuchungslogik.

## Ausschluss aus Kennzahlen

Restaurant-Dashboard-Kennzahlen für neue Mitglieder, aktive Gäste, Punkte, Einlösungen und Bonus Boost schließen markierte Testgäste aus. Audit-Ereignisse der Testgäste bleiben vollständig sichtbar und können über „Nur Testereignisse“ gefiltert werden.

Die produktiven Restaurant-KPIs werden serverseitig über
`get_restaurant_dashboard_kpis` aggregiert. Die Funktion prüft die
Restaurantmitgliedschaft, verwendet die Restaurant-Zeitzone und filtert
`is_test_customer = false` in sämtlichen kundenbezogenen Quellen. `Heute
aktiv` zählt eindeutige Gäste mit final erfolgreicher Loyalty-Aktion.
`Einlösungen heute` zählt ausschließlich finale Geschenk-, Punkte- und
Coupon-Einlösungen anhand stabiler Quell-IDs.

## Rollen und Berechtigungen

- Gäste und `anon` können Audit-Daten weder direkt schreiben noch lesen.
- Restaurant-Administratoren können nur Audit-Daten des eigenen Restaurants lesen.
- Die globale Plattformansicht nutzt ausschließlich `get_platform_audit_events`.
- Die Plattform-RPC prüft die interne Plattformrolle und ist für `anon` gesperrt.
- Audit-Hilfsfunktionen sind nicht direkt für Clientrollen ausführbar.

## Plattformansicht

Die interne Route `/admin/platform/audit` bietet Filter für Zeitraum, Restaurant, Gast-ID, Ereignis, Status, Quelle, Akteur, Testereignisse und Fehler. Details öffnen im gemeinsamen barrierefreien Drawer.

## Beispiel-Testablauf

1. Gast über den normalen QR-Flow registrieren.
2. Gast als Testkunde markieren und eine eindeutige Test-Sitzungs-ID setzen.
3. Willkommensgeschenk prüfen.
4. Punktebuchung mit falscher Tages-PIN auslösen.
5. Punktebuchung mit richtiger Tages-PIN auslösen.
6. Freischaltung und Punktestand prüfen.
7. Einlösecode erzeugen und einlösen.
8. denselben Code erneut verwenden und Blockierung prüfen.
9. Auditansicht nach Test-Sitzungs-ID filtern.
10. Restaurant-KPIs vor und nach dem Test vergleichen.

## Bekannte Einschränkungen

- Ein vollständiger Testkundenlauf benötigt eine angemeldete Plattformrolle und einen eigens markierten Staging-Testgast. Nach der KPI-Migration ist dieser Lauf erneut mit Vorher-/Nachher-Werten auszuführen.
- Datenbankseitige RLS-Fehler können nicht in jedem Fall in derselben fehlgeschlagenen Transaktion protokolliert werden; Zugriffe bleiben dennoch durch RLS blockiert.
- V1 besitzt keine automatische Bereinigung alter Audit-Daten. Eine Aufbewahrungsrichtlinie folgt vor öffentlichem Produktivbetrieb.
