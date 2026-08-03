# Staging-Plan: restaurantgesteuerte Punktevergabe

## Ziel und Umgebung

Zielprojekt: `wuxuai-bonus-staging`, Project Ref im Bericht nur maskiert.
Production, Production-Domain und Production-Datenbank sind ausgeschlossen.

## Kontrollierter Preflight am 1. August 2026

- Verknüpftes Projekt: `wuxuai-bonus-staging`
- Project Ref: `bwhv...qaya`
- Branch: `codex/restaurant-controlled-points-flow`
- Ausgangscommit: `470fd2d9ef720ec9ae326f618c80eda89b64b789`
- Remote-Migrationen sind bis einschließlich `20260730002000` synchron.
- Ausschließlich `20260731001000` und `20260801001000` fehlen remote.
- Der erneute Remote-Dry-Run listet genau diese beiden Migrationen in der
  freigegebenen Reihenfolge.
- Ein Katalogabgleich fand keine teilweise manuell angelegten Tabellen,
  Spalten oder Engine-Funktionen aus den beiden offenen Migrationen.

Anonymisierter Ausgangsbestand:

| Objekt | Zeilen |
| --- | ---: |
| Restaurants | 3 |
| Restaurant-Memberships | 3 |
| Kunden | 0 |
| Punktetransaktionen | 0 |

Punktesnapshot vor einem möglichen Write: 0 Transaktionen, Nettosumme 0,
keine positiven und keine negativen Transaktionen. Es wurden keine Namen,
E-Mail-Adressen, Token, PINs oder sonstigen personenbezogenen Daten exportiert.

Grant-Baseline: Die zwei alten `collect_bonus_points`-Signaturen sind weder für
`public`, `anon` noch `authenticated` ausführbar. `collect_bonus_points_v1` ist
für `anon` und `authenticated` freigegeben. Alle drei vorhandenen Funktionen
sind `SECURITY DEFINER` und besitzen derzeit `search_path=public`.

## Ausführungsstand am 2. August 2026

Vor dem ersten Write wurde ein manueller logischer Restorepunkt außerhalb von
Git erstellt. Schema, Daten, Migration-History, Funktionen, Grants, RLS und
Zeilenzahlen wurden gesichert. Prüfsummen, 53/53 Tabellen und die syntaktische
Lesbarkeit wurden verifiziert. Ein physischer Test-Restore war mangels
Docker/Podman nicht verfügbar.

`RESTORE FILES VERIFIED, FULL RESTORE EXECUTION NOT AVAILABLE`

Beide Migrationen wurden anschließend einzeln und erfolgreich auf Staging
angewendet. Der erste echte E2E-Test zeigte jedoch, dass eine
restaurantgesteuerte Buchung von 50 Cent serverseitig akzeptiert wird. Die
Untergrenze von 100 Cent fehlt in Engine, Preview und Confirmation. Weitere
Tests wurden gestoppt, die Fixture vollständig bereinigt und der Ausgangsbestand
verifiziert.

Details: `docs/reports/2026-08-02_RESTAURANT_CONTROLLED_POINTS_STAGING_EXECUTION_REPORT.md`

## Ablauf

1. Im Supabase-Dashboard einen aktuellen Wiederherstellungspunkt bestätigen und
   Zeitpunkt sowie verantwortliche Person intern notieren.
2. `supabase migration list` prüfen. Vor Beginn müssen alle Migrationen bis
   `20260730002000` synchron sein; offen dürfen ausschließlich
   `20260731001000` und `20260801001000` sein.
3. SQL-Diff und Dry-Run erneut prüfen. Anschließend beide Migrationen in dieser
   Reihenfolge ausschließlich auf Staging anwenden.
4. Direkt danach Funktionen, `prosecdef`, `proconfig`, Grants, Tabellen-RLS,
   Constraints, Indizes und Defaults per Katalogabfrage verifizieren.
5. Ein isoliertes Testrestaurant, zwei Testkunden, einen Staff-Zugang und eine
   eindeutige Testsession anlegen. Keine Zugangsdaten dokumentieren.
6. `customer_initiated_only`, `restaurant_controlled_only` und `both` testen;
   bei identischem Engine-Betrag müssen Basis-, Boost- und Endpunkte identisch sein.
7. Rollback auslösen bei Tenant-Leak, doppelter Buchung, falschem Boost,
   fehlerhaftem Bestands-Backfill, ungesichertem RPC oder inkonsistenter Balance.
8. Während des Tests PostgREST-/RPC-Fehler, Lock-Wartezeiten, Rate-Limits und
   Constraint-Verletzungen überwachen, ohne Token oder PIN zu protokollieren.
9. Paralleltests mit demselben QR und Idempotenzschlüssel sowie mit zwei
   unterschiedlichen Schlüsseln ausführen; exakt eine Gutschrift erwarten.
10. Auditfolge für Einstellungen, Limitblock, PIN-Ablehnung, Punktebuchung,
    Referral-Qualifizierung, Reward-Freischaltung und Gegenbuchung prüfen.

## Sichere Deaktivierung und Rollback

- Zuerst alle Testrestaurants auf `customer_initiated_only` zurücksetzen.
- EXECUTE auf die drei öffentlichen restaurantgesteuerten RPCs entziehen.
- Keine Punkte-, Referral- oder Audit-Historie löschen.
- Neue Snapshot-Spalten nicht ungeprüft entfernen; sie sind nullable und
  beeinträchtigen den Legacy-Flow nicht.
- Funktionsdefinitionen nur über eine neue additive Rollback-Migration ersetzen.
- Bereits gebuchte Punkte ausschließlich über die idempotente Gegenbuchung
  korrigieren, nie per direktem Datenbank-Update.

## Offene Gates

- additive Reparaturmigration für den Mindestbetrag von 100 Cent
- erneuter vollständiger Staging-E2E- und Parallelitätslauf
- Docker/Podman für einen vollständigen Test-Restore
- physisches iPhone Safari und installierte PWA
- Staff-Tablet-Kamera im Querformat und unter schlechtem Netz

Reparaturbericht:
`docs/reports/2026-08-02_MINIMUM_POINTS_AMOUNT_REPAIR_REPORT.md`

Status: **REPAIR VERIFIED – CONTINUE STAGING TESTS**
