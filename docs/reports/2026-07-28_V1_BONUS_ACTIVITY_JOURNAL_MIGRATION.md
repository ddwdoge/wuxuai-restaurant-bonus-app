# V1 Bonus-Aktivitätsjournal - Migrationsbericht

Migration: `20260728001000_v1_bonus_activity_journal.sql`

## Änderungen

- additive Tabelle `redemption_activity_journal`
- globale, nicht wiederverwendbare WUXUAI-Aktivitätsnummer
- eindeutiger Schlüssel `source_type + source_id`
- Append-only-Schutztrigger
- begründeter, auditierter Protokollstorno
- serverseitige Owner-/Admin-Rollenprüfung
- Report-RPC mit `Europe/Vienna`
- bestehender `get_reward_accounting_export` auf Journalquelle umgestellt
- bestehender `consume_redemption_code` um idempotenten Journal-Write ergänzt

## Legacy-Backfill

Bestehende eingelöste Redemption-Codes werden nur aus bereits gespeicherten
Werten übernommen. Der damalige Titel wird ausschließlich aus der damaligen
Code-Metadatei gelesen. Es gibt keinen Join auf aktuelle Reward-Stammdaten.

Legacy-Coupons enthalten keine sicheren Titel- oder Punktesnapshots und werden
mit `missing_source_data` gekennzeichnet. Fehlende Werte bleiben leer.

## Sicherheit

- RLS aktiviert
- keine direkten Browser-Schreibrechte
- Report und Storno ausschließlich über Security-Definer-RPCs
- Owner/Administrator serverseitig geprüft
- Branch muss zum gleichen Restaurant gehören
- Staff/Manager erhalten keinen Report-RPC-Zugriff
- kein Public-/Anon-Zugriff auf Journal oder Reports

## Dry-Run

`npx supabase db push --dry-run` war erfolgreich und würde in Reihenfolge
anwenden:

1. `20260727001000_customer_identity_v1_no_sms.sql`
2. `20260728001000_v1_bonus_activity_journal.sql`

Die Journalmigration wurde nicht auf Staging angewendet, weil die vorherige
Customer-Identity-Migration noch aussteht und nicht ungeprüft mit angewendet
werden darf.

## Sichere Deaktivierung und Rollback

Vor Production kann die UI durch Entfernen des Navigationslinks deaktiviert
werden. Ein vollständiger Schema-Rollback darf historische Journalzeilen nicht
ungeprüft löschen. Stattdessen zuerst:

1. neue Journalwrites kontrolliert stoppen,
2. Export und Aufbewahrung der vorhandenen Journalzeilen sichern,
3. alten Consume-RPC aus der unmittelbar vorherigen Migration wiederherstellen,
4. Report-RPC-Grants entziehen,
5. Tabelle erst nach Legal-, Datenschutz- und Datenaufbewahrungsfreigabe ändern.

Keine automatische Löschung und kein Production-Rollback wurden ausgeführt.

Status: `MIGRATION_NOT_APPLIED`.
