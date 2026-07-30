# Kundenidentität V1 ohne SMS-OTP – Bericht

## Ursache

Die öffentliche Registrierung suchte Telefonnummern nur nach einer whitespace-bereinigten Zeichenfolge. Bei einem bestehenden Treffer wurden alle aktiven Kundentokens deaktiviert und ein neuer Token ausgegeben. Damit konnte die Kenntnis einer Telefonnummer auf einem unbekannten Gerät einen bestehenden restaurantbezogenen Zugang übernehmen. Zusätzlich erlaubte `update_customer_birthday` Änderungen durch einen öffentlichen Kundentoken, und Owner/Staff luden vollständige Kundenfelder direkt aus `customers`.

## Bisheriger Zustand

- Identität: faktisch `restaurant_id + phone`, aber nur unvollständig normalisiert.
- Bekannte Geräte: restaurantbezogener, kryptografisch zufälliger Token im lokalen Browser-Speicher.
- Tokenablage: nur Hash in `customer_qr_tokens`; Rohwert wird bei Erzeugung einmal zurückgegeben.
- SMS/OTP: keine Supabase-Phone-Auth und kein SMS-Provider im Registrierungsflow.
- Dublettenschutz: Unique-Index auf der nicht kanonischen `phone`-Spalte.
- Geburtstag: durch Kunden-RPC in Jahresabständen änderbar.
- Owner/Staff: gemeinsamer direkter Select auf vollständige Kundendaten.

## Umgesetzte V1-Regeln

- Zentrale Normalisierung auf ein E.164-nahes Format; österreichische lokale Formate werden nach `+43` überführt.
- Harte Eindeutigkeit über `(restaurant_id, normalized_phone)`.
- Advisory Lock und serverseitige Vorprüfung verhindern parallele Doppelregistrierungen.
- Bestehende Telefonnummer führt zu einer neutralen Blockierung; es wird kein Token rotiert und kein Konto geöffnet.
- Dasselbe Telefon kann in einem anderen Restaurant ein separates Konto besitzen.
- Telefonnummer und Geburtstag sind nach Erfassung kundenseitig unveränderbar und nur maskiert sichtbar.
- Supportkorrektur nur für Restaurantrollen `owner` und `admin`, nach Identitätsbestätigung, Prüfart und Grund.
- Telefonnummernkorrektur widerruft alle bisherigen Tokens und Geräte; keine automatische Zusammenführung oder Punkteübertragung.
- Normale Staff-/Listenansichten erhalten nur reduzierten Namen, maskierte Telefonnummer und Bonusstände.
- SMS-Verifizierung bleibt deaktiviert; keine OTP-UI, keine Providerintegration und keine Runtime-Abhängigkeit.

## Audit

Ergänzt beziehungsweise verwendet werden:

- `CUSTOMER_REGISTRATION_ATTEMPT`
- `CUSTOMER_DUPLICATE_ACCOUNT_BLOCKED`
- `CUSTOMER_LOGIN_SUCCESS`
- `CUSTOMER_LOGIN_FAILED`
- `CUSTOMER_PHONE_CHANGED_BY_SUPPORT`
- `CUSTOMER_BIRTHDATE_CHANGED_BY_SUPPORT`
- `CUSTOMER_IDENTITY_VERIFIED_BY_RESTAURANT`
- `CUSTOMER_SESSIONS_REVOKED`
- `CUSTOMER_TOKEN_ROTATED`
- `CUSTOMER_RESTAURANT_CONTEXT_CHANGED`
- `CUSTOMER_SENSITIVE_DATA_VIEWED`

Audit-Metadaten redigieren Telefon-, Geburtstags-, Token-, PIN- und Codefelder. Keine vollständigen Identitätsdaten werden in diesem Bericht dokumentiert.

## Geänderte Bereiche

- additive Supabase-Migration für Normalisierung, Eindeutigkeit, Grants, Support-RPC und SMS-Default
- Customer Portal: maskierte Nur-Lese-Identität
- Owner Portal: auditierter Supportdrawer
- Owner-/Staff-Datenzugriff: minimierter RPC statt direktem Tabellen-Select
- Registrierung und Referral: zentraler Client-Helper plus serverseitige Autorität
- Tests, Engineering Bible und Changelog

## Nicht geändert

- Tages-PIN und Punkteberechnung
- Reward-Einlösung und Einlösecodes
- QR-Restaurantkontext und Safari-BFCache-Fix
- Kundenpunkte, Rewards oder Memberships
- Plattformportal
- keine SMS-Integration

## Tests und Qualität

- neue Identitätsvertrags- und Normalisierungstests: 10
- Gesamtsuite: 194/194 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bereits bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Staging-Dry-Run: erfolgreich; geplant wird ausschließlich `20260727001000_customer_identity_v1_no_sms.sql`
- Migration auf Staging angewendet: Nein

## Offene Risiken

- Die Migration ist noch nicht auf Staging angewendet.
- Die Vorprüfung vorhandener normalisierter Telefonnummern läuft erst innerhalb der Migration. Bei einer fehlenden Telefonnummer, einer Dublette oder ungültigen Bestandsnummer bricht sie vollständig und ohne Datenänderung ab; dann ist ein separater, manueller Bereinigungsplan erforderlich.
- Echter Owner/Admin-/Manager-/Staff- und Cross-Tenant-Test gegen die migrierte Staging-Datenbank steht aus.
- Physischer Safari-/PWA-Test steht aus.

Status: READY_FOR_SECURITY_REVIEW nach grüner Gesamtsuite; kein FINAL LOCK ohne Staging-Anwendung und echten Rollenflow.
