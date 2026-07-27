# Kundenidentität V1 – Migrationsbericht

## Migration

`supabase/migrations/20260727001000_customer_identity_v1_no_sms.sql`

## Additive Änderungen

- `customers.normalized_phone`
- `customers.phone_locked_at`
- `customers.birthday_locked_at`
- `customers.identity_updated_at`
- Unique-Index `customers_restaurant_normalized_phone_unique_idx`
- Trigger `guard_customer_identity_fields`
- Tabelle `restaurant_security_settings` mit `sms_verification_enabled = false`
- minimierte Listen-, Identitäts- und Support-RPCs
- gehärtete Registrierungs-Wrapper und Grants

## Dubletten und Backfill

Vor dem Backfill prüft die Migration:

1. Jede vorhandene Telefonnummer muss normalisierbar sein.
2. Jede bestehende Kundenzeile muss eine Telefonnummer besitzen.
3. Pro Restaurant darf kein normalisierter Wert mehrfach vorkommen.

Bei einem Treffer wird die gesamte Transaktion mit einem klaren Migrationsfehler abgebrochen. Es werden keine Konten gelöscht, zusammengeführt oder übertragen. Punkte, Rewards und Memberships bleiben unverändert.

## RLS und Grants

- RLS bleibt aktiv.
- Keine öffentliche Select-Policy wird ergänzt.
- Direkte Browserrechte auf `customers` werden entzogen.
- Owner/Staff lesen minimierte Daten ausschließlich über einen tenantgeprüften Security-Definer-RPC.
- Vollständige Identitätsdaten und Änderungen erfordern Owner/Admin und werden auditiert.
- Basis-Registrierungs-RPCs und Campaign-Registrierung sind für Browserrollen entzogen; nur Legal-Wrapper bleiben öffentlich ausführbar.

## Rollback

Sicherste funktionale Rücknahme vor Production ist das Deaktivieren des neuen Frontendpfads und die Wiederherstellung der vorherigen Grants/RPC-Versionen durch eine neue additive Rollback-Migration. Historische Migrationen dürfen nicht editiert werden. Spalten und Auditdaten dürfen nicht ungeprüft gelöscht werden. Der Unique-Index darf erst nach einer fachlichen Prüfung entfernt werden, weil sonst neue Dubletten möglich wären.

## Staging

- Projekt: `wuxuai-bonus-staging`
- Migrationsliste: bisherige Migrationen lokal/remote synchron
- ausstehend: ausschließlich `20260727001000_customer_identity_v1_no_sms.sql`
- `db push --dry-run --include-all`: erfolgreich
- echte Anwendung: Nein
- Production: nicht verwendet

## Offene Prüfung

Die Bestandsdatenprüfung und SQL-Ausführung erfolgen erst bei ausdrücklicher Staging-Freigabe. Bis dahin bleibt der Status `READY_FOR_SECURITY_REVIEW` und nicht final freigegeben.
