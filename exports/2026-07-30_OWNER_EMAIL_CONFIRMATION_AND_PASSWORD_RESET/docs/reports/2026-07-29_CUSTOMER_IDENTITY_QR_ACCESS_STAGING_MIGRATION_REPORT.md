# Customer Identity und QR Access – Staging-Migrationsbericht

Datum: 2026-07-29  
Branch: `codex/v13-legal-maps-hardening`  
Commit: `a46125d10d8fa1b021f65b9e8b40ead6c6b533d4`

## Zielsystem

- Projekt: `wuxuai-bonus-staging`
- Project Ref: `bwh…qaya`
- Status: `ACTIVE_HEALTHY`
- Production verwendet: Nein

## Freigegebene Migrationen

1. `20260727001000_customer_identity_v1_no_sms.sql`
2. `20260729001000_customer_repeat_qr_access_hardening.sql`

Der normale Repository-Dry-Run hätte zusätzlich `20260728001000` und `20260728002000` angewendet. Deshalb wurde eine temporäre Kopie verwendet, deren Dry-Run ausschließlich die beiden freigegebenen Migrationen enthielt.

## Ergebnis

Der Push wurde bei der transaktionalen Datenprüfung von `20260727001000` abgebrochen.

Exakter Blocker:

`CUSTOMER_IDENTITY_MIGRATION_INVALID_PHONE`

Mindestens ein Staging-Kundendatensatz enthält eine Telefonnummer, die `public.normalize_customer_phone` nicht in das erforderliche internationale Format überführen kann.

- Fehlende Telefonnummer erkannt: Nein; diese vorgelagerte Prüfung lief durch.
- Ungültige Telefonnummer erkannt: Ja.
- Dublettenprüfung abgeschlossen: Nein; sie wurde nach dem Invalid-Phone-Blocker nicht mehr erreicht.
- Daten automatisch geändert: Nein.
- Konten gelöscht oder zusammengeführt: Nein.
- Identity-Migration angewendet: Nein.
- QR-Access-Hardening angewendet: Nein.
- Remote-Migrationshistorie verändert: Nein.

## Nächster sicherer Schritt

Die betroffenen Staging-Datensätze müssen anonymisiert identifiziert und nach einem freigegebenen Support-/Bereinigungsverfahren korrigiert werden. Danach sind die Prüfung auf normalisierte Dubletten und der isolierte Dry-Run erneut auszuführen. Erst ohne Datenblocker dürfen beide Migrationen gemeinsam angewendet werden.

Status: BLOCKED_BY_DATA_CLEANUP
