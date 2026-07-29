# Customer Repeat QR Security Recheck

Datum: 2026-07-29  
Branch: `codex/v13-legal-maps-hardening`  
Ausgangscommit: `a46125d10d8fa1b021f65b9e8b40ead6c6b533d4`  
Geprüfter Fix: `78dce25`

## Ursache und Befund

Der Wiedererkennungsfix speichert Kundenzugänge bereits restaurantbezogen und lädt den gespeicherten Token synchron vor dem ersten Portalaufruf. Der Token wird anschließend durch `get_public_customer_portal` gegen den URL-Restaurantkontext geprüft. `device_id`, Telefonnummer und Geburtstag eröffnen allein kein Konto.

Zwei Sicherheitslücken blieben lokal offen:

1. Die Entscheidung, einen gespeicherten Token zu löschen, basierte auf dem Freitext `customer token not valid`.
2. Die öffentliche Portal-RPC prüfte aktiven Token und Restaurantbindung, aber nicht ausdrücklich `customers.membership_status = 'active'`.

## Änderungen

- Strukturierter Clientvertrag für `CUSTOMER_ACCESS_TOKEN_INVALID`, `CUSTOMER_ACCESS_TOKEN_REVOKED` und `CUSTOMER_MEMBERSHIP_INACTIVE`.
- Temporäre Fehler wie Offline, Timeout, HTTP 5xx oder unbekannte Netzwerkfehler löschen keinen gespeicherten Token.
- Additive Migration `20260729001000_customer_repeat_qr_access_hardening.sql` hält die öffentliche RPC-Signatur unverändert.
- Die bisherige Portalimplementierung wird intern gekapselt und ist für `public`, `anon` und `authenticated` nicht direkt ausführbar.
- Der Wrapper verlangt Restaurantbindung, Tokenhash, aktiven/nicht abgelaufenen Token und aktive Membership.
- Kein Device-ID-Login und keine neue Device-ID-RPC.
- Dublettenprüfung bleibt vor der bestehenden Tokenausstellung; ein zweiter Registrierungsversuch erreicht die globale Tokenrotation nicht.

## Token und Datenschutz

- Diagnoseevents enthalten weder Klartexttoken noch Telefonnummer oder Geburtstag.
- Keine Tokenwerte wurden in Console, Audit, Analytics oder Exporten gefunden.
- Kundentokens bleiben restaurantbezogen in `localStorage` gespeichert.
- Bestehende QR-/Direktlink-Flows transportieren Bearer-Tokens weiterhin als Teil persönlicher Links. Diese Links müssen wie Zugangsdaten behandelt werden und dürfen nicht protokolliert oder geteilt werden.

## Safari und PWA

Statisch und automatisiert geprüft:

- synchrones Laden aus restaurantbezogenem Storage
- Reload und Fokusvalidierung
- BFCache-`pageshow`-Validierung
- Restaurant A/B getrennt
- blockierter Safari-Speicher wird nicht als Erfolg behandelt

Nicht physisch geprüft:

- Safari nach vollständigem Browser-Neustart
- Kamera-App zu bestehendem Safari-Tab
- installierte PWA
- Safari- und PWA-Speicherbereich im direkten Vergleich

Eine Safari-Registrierung wird deshalb nicht als automatisch in einer installierten PWA verfügbar behauptet.

## Qualität

- Gezielte Tests: 18/18
- Gesamttests: 254/254
- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: erfolgreich
- Migration Dry-Run: erfolgreich; vier lokale Migrationen sind auf Staging ausstehend
- Migration angewendet: Nein
- Push/Merge/Deployment: Nein

## Offene Risiken

- Die neue Access-Hardening-Migration ist noch nicht auf Staging angewendet.
- Auch `20260727001000_customer_identity_v1_no_sms.sql` ist auf Staging noch ausstehend; damit ist die serverseitige Dublettensperre dort nicht final nachgewiesen.
- Physischer Safari- und PWA-Test fehlt.

Status: CHANGES_REQUIRED

## Staging-Migrationsversuch

Am 2026-07-29 wurde ein isolierter Staging-Dry-Run mit ausschließlich Identity und QR-Access-Hardening durchgeführt. Der anschließende transaktionale Lauf stoppte in `20260727001000_customer_identity_v1_no_sms.sql` mit `CUSTOMER_IDENTITY_MIGRATION_INVALID_PHONE`. Deshalb wurde `20260729001000_customer_repeat_qr_access_hardening.sql` nicht angewendet. Es gab keine Tokenrotation, keine Datenbereinigung und keine Änderung der Remote-Migrationshistorie.

Staging bleibt bis zur kontrollierten Bereinigung der fünf bereits anonymisiert dokumentierten ungültigen Telefonnummern und einer erneuten Dublettenprüfung blockiert.

Status: BLOCKED_BY_DATA_CLEANUP
