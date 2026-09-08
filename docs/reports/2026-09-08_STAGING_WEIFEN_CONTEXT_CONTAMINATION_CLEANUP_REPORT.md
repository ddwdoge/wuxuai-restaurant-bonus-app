# Staging Weifen Test Context Cleanup Report

Datum: 2026-09-08

## Ursache

Ein zuvor bekanntes globales Testkonto (`Weifen xu`) wurde im isolierten
Kassa-Testtenant erneut verwendet. Der Server ordnete den gescannten QR korrekt
dieser Identitaet zu. Es lag eine Testkontext-Kontamination und kein
QR-Identitaetsfehler vor.

## Ausgefuehrte Bereinigung

Der kanonische atomare Staging-RPC
`cleanup_platform_foreign_test_customer_relation` entfernte ausschliesslich:

- die tenant-lokale Weifen-Kundenzeile und Membership,
- eine lokale 34-Punkte-Testtransaktion,
- direkt abhaengige lokale Test-, QR-, Reward- und Auditzeilen.

## Verifikation

- lokale Weifen-Kundenzeilen: 0
- lokale Weifen-Membership: 0
- lokale 34-Punkte-Transaktion: 0
- globales Weifen-Konto: erhalten
- globaler Weifen-Auth-User: erhalten
- fremde Memberships: 4 erhalten
- fremde Punktetransaktionen: 10 erhalten
- verbleibender Tenant-Kunde: `WUXUAI Testkunde`
- Cleanup-Audit: `FOREIGN_CUSTOMER_RELATION_REMOVED`

Eine separate 32-Punkte-Buchung ist serverseitig `WUXUAI Testkunde` zugeordnet
und blieb unveraendert. Vor jeder weiteren Punkte- oder Kassa-Aktion muss der
Scanner sichtbar `WUXUAI Testkunde` anzeigen; bei jeder anderen Identitaet ist
vor der Buchung zu stoppen.

## Nicht geaendert

- Production
- globale Weifen-Identitaet
- fremde Weifen-Tenantdaten
- Produktlogik, RLS, Migrationen und Cloudflare

## Status

Staging-Bereinigung: PASS

Kassa-Flow: noch nicht fortgesetzt

Production: unveraendert
