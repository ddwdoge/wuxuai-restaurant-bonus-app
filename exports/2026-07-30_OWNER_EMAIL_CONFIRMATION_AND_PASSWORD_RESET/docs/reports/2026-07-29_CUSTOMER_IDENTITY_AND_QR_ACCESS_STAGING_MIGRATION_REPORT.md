# Customer Identity und QR Access – Staging Migration

Datum: 2026-07-29  
Branch: `codex/v13-legal-maps-hardening`  
Commit bei Abschluss: `b544b76b45f083ab9dd951446b0c468a0b207cfa`

## Umgebung

```text
Supabase environment: Staging
Project: wuxuai-bonus-staging
Project ref: bwhv…qaya
Production: No
```

## Ausgangsstand

- Working Tree: enthält ausschließlich bereits vorhandene lokale Customer-Access- und Reportänderungen; nichts verworfen oder gestaged.
- Lokale Migrationen: 66
- Remote-Migrationen: 62
- Nur lokal: `20260727001000`, `20260728001000`, `20260728002000`, `20260729001000`
- Migrationen vollständig synchron: Nein

Der normale Repository-Push hätte vier Migrationen angewendet. Um den Auftrag nicht zu erweitern, wurde eine temporäre Projektkopie verwendet. Deren Dry-Run enthielt ausschließlich:

1. `20260727001000_customer_identity_v1_no_sms.sql`
2. `20260729001000_customer_repeat_qr_access_hardening.sql`

## Identity-Preflight

| Prüfung | Ergebnis |
| --- | --- |
| Fehlende Telefonnummern | 0 |
| Ungültige Telefonnummern | 5 |
| Normalisierte Dubletten | nicht erneut abgeschlossen; Invalid-Phone-Blocker tritt vorher ein |
| Automatische Datenänderung | Nein |
| Kontolöschung oder Zusammenführung | Nein |

Exakter Migrationsfehler:

`CUSTOMER_IDENTITY_MIGRATION_INVALID_PHONE`

Die Migration wurde transaktional zurückgerollt. Es wurden keine personenbezogenen Werte ausgegeben.

## Migrationsergebnis

- Identity-Migration Dry-Run: Erfolgreich
- Identity-Migration angewendet: Nein
- Access-Hardening Dry-Run: Erfolgreich und in korrekter Reihenfolge
- Access-Hardening angewendet: Nein, da Identity nicht aktiv ist
- Remote-Migrationshistorie verändert: Nein
- Production-Migration: Nein

## Noch nicht live verifizierbar

Wegen des Datenblockers wurden folgende migrationsabhängige Staging-Prüfungen nicht als bestanden gewertet:

- Unique Constraint auf `restaurant_id + normalized_phone`
- Customer Identity Locks
- kontrollierter Owner-/Admin-Supportpfad
- RLS- und Cross-Tenant-Endprüfung nach Migration
- aktive Membership als Portalvoraussetzung
- strukturierte Fehler `INVALID`, `REVOKED`, `MEMBERSHIP_INACTIVE`
- Repeat-QR mit echtem Staging-Testkunden
- Restaurant A → B → A
- Offline-, Timeout- und 5xx-Test gegen den migrierten Vertrag

Statisch und automatisiert bleiben bestätigt:

- kein Device-ID-only-Login
- Telefonnummer oder Geburtstag allein gewähren keinen Zugriff
- Tokenprüfung ist restaurant- und hashgebunden
- temporäre Netzwerkfehler löschen den lokalen Token nicht
- 254/254 Tests erfolgreich
- Typecheck erfolgreich
- Lint 0 Fehler, 7 bestehende Warnungen
- Build erfolgreich

## RLS, SMS und Rollback

- RLS/Security gelockert: Nein
- SMS-OTP aktiviert: Nein
- Production-Secrets verwendet: Nein
- Rollback: Der fehlgeschlagene Identity-Lauf wurde vollständig transaktional zurückgerollt; die Access-Migration wurde nicht begonnen.

## Offene Gates

1. Fünf ungültige Staging-Telefonnummern fachlich prüfen und kontrolliert korrigieren.
2. Danach fehlende, ungültige und normalisierte Dubletten erneut vollständig prüfen.
3. Beide Migrationen erneut isoliert anwenden und serverseitig testen.
4. Erst danach physisches iPhone-Safari-, Kamera-App- und getrenntes PWA-Testing.

Status: `BLOCKED_BY_DATA_CLEANUP`
