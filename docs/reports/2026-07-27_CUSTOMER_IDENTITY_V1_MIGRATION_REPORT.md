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
- Project-Ref (maskiert): `bwh…qaya`
- Projektstatus: `ACTIVE_HEALTHY`
- Migrationsliste: bisherige Migrationen lokal/remote synchron
- ausstehend: ausschließlich `20260727001000_customer_identity_v1_no_sms.sql`
- `db push --dry-run`: erfolgreich; geplant wurde ausschließlich diese Migration
- echte Anwendung: Nein
- Production: nicht verwendet

## Anonymisierter Bestandsdaten-Preflight

Der Preflight wurde ausschließlich gegen `wuxuai-bonus-staging` ausgeführt. Die Prüf-SQL lief in einer isolierten Migrationstransaktion und wurde durch einen absichtlichen Sentinel-Fehler vollständig zurückgerollt. Es wurden weder Kundendaten noch die Migrationshistorie verändert.

| Prüfung | Ergebnis |
| --- | ---: |
| Kunden ohne Telefonnummer | 0 |
| Kunden mit nicht normalisierbarer Telefonnummer | 5 |
| Dublettengruppen unter aktuell gültig normalisierbaren Telefonnummern, je Restaurant | 0 |

Es wurden keine Telefonnummern, Namen, Customer-Tokens oder Datensatz-IDs ausgegeben oder gespeichert. Temporäre Prüfdateien wurden nach der Auswertung vollständig entfernt.

## Blocker und nächste Aktion

Die fünf ungültigen Telefonnummern blockieren den vorgesehenen Backfill und den `NOT NULL`-/Unique-Schutz. Die Migration wurde deshalb nicht angewendet und nicht erzwungen. Es wurden keine Datensätze gelöscht und keine Konten zusammengeführt.

Erforderlicher nächster Schritt:

1. Die fünf betroffenen Staging-Datensätze fachlich und manuell prüfen.
2. Telefonnummern nur nach bestätigter Zuordnung korrigieren; keine automatische Ersetzung, Löschung oder Kontenzusammenführung.
3. Den vollständigen Preflight erneut ausführen.
4. Nach der Korrektur erneut auf fehlende, ungültige und normalisierte Dubletten prüfen, da korrigierte Werte neue Kollisionen sichtbar machen können.
5. Erst bei drei blockierfreien Prüfungen die Migration anwenden und anschließend RLS, Unique Constraint, Rollen-Updates, Cross-Tenant-Schutz sowie Registrierung/Duplicate-Flow live prüfen.

## Nicht ausgeführte Folgeprüfungen

Da die Migration nicht angewendet wurde, wurden die migrationsabhängigen Prüfungen bewusst nicht als erfolgreich gewertet:

- RLS-/Grant-Endprüfung nach Migration
- Unique Constraint live
- Customer-Update blockiert
- Support-Update erlaubt
- Cross-Tenant blockiert
- Registrierung ohne SMS live
- Duplicate-Account-Flow live

## Abschluss

`20260727001000_customer_identity_v1_no_sms.sql` ist lokal vorhanden und remote weiterhin ausstehend. Production wurde nicht angesprochen.

Status: `BLOCKED_BY_DATA_CLEANUP`
