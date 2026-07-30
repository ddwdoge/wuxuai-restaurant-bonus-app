# Supabase Migration 20260714002000 – Safe Fix Report

Datum: 2026-07-19  
Projekt: WUXUAI Bonus V1  
Migration: `20260714002000_daily_pin_booking_gifts_redemption_v1.sql`

## Ursache

Die Migration brach mit SQLSTATE `42883` ab, weil sie diese bereits entfernte
Funktionssignatur hart referenzierte:

```sql
public.collect_bonus_points(text, text, text, text)
```

Die Migration `20260711003000_drop_ambiguous_collect_bonus_points_legacy_signature.sql`
hat genau diesen vierparametrigen Overload zuvor entfernt. Ein `REVOKE EXECUTE ON
FUNCTION` besitzt kein `IF EXISTS` und beendet deshalb die gesamte Migration,
wenn die angegebene Signatur fehlt.

## Remote-Status und Rollback

- `npx supabase migration list` verbindet erfolgreich mit Staging.
- Lokal und remote stimmen alle Migrationen bis `20260713004000` überein.
- `20260714002000` ist remote nicht eingetragen und weiterhin ausstehend.
- Der fehlgeschlagene Push wurde vollständig zurückgerollt.
- Die neuen RPCs liefern live `PGRST202` und die neuen Tabellen `PGRST205`.
- Es wurden keine Teilobjekte aus `20260714002000` gefunden.

Geprüfte, nicht vorhandene Teilobjekte:

- RPCs `get_customer_gift_metadata`, `collect_bonus_points_v1`,
  `start_customer_redemption`
- Tabellen `points_collection_requests`, `gift_assignment_cleanup_log`,
  `birthday_gift_job_log`, `redemption_codes`,
  `redemption_activation_attempts`

## Tatsächliche collect_bonus_points-Signaturen

Auf Basis der vollständig angewendeten Migrationshistorie und direkter,
nicht schreibender Live-RPC-Aufrufe sind aktiv:

```text
public.collect_bonus_points(text, text, text)
public.collect_bonus_points(text, text, text, text, text)
```

Der fünfte Parameter des zweiten Overloads besitzt einen Defaultwert. Der
vierparametrige Overload existiert nicht mehr. Beide vorhandenen Overloads
wurden live erreicht: Der 3-Parameter-Aufruf lieferte die absichtliche
Tages-PIN-Sperre, der 5-Parameter-Aufruf erreichte die Restaurantprüfung.

`collect_bonus_points` wird weiterhin intern durch
`collect_bonus_points_v1` verwendet. Seine öffentlichen Alt-Overloads müssen
daher gesperrt, aber nicht gelöscht werden.

## Geänderte Dateien

- `supabase/migrations/20260714002000_daily_pin_booking_gifts_redemption_v1.sql`
- `tests/v1-daily-pin-gifts-redemption.test.mjs`
- `docs/reports/2026-07-19_SUPABASE_MIGRATION_20260714002000_SAFE_FIX_REPORT.md`

## Änderungen

Die drei starren `collect_bonus_points`-Widerrufe wurden durch einen
katalogbasierten `DO`-Block ersetzt. Er liest alle tatsächlich vorhandenen
Overloads aus `pg_proc` und widerruft deren Ausführung für `PUBLIC`, `anon`
und `authenticated`. Fehlende historische Overloads verursachen damit keinen
Abbruch mehr.

Zusätzlich wurde ein bestätigtes Sicherheitsrisiko geschlossen:
`ensure_today_restaurant_pin(uuid, uuid)` ist ein interner
`SECURITY DEFINER`-Helfer, der einen PIN-Datensatz zurückgibt. Ohne expliziten
Widerruf hätte PostgreSQL standardmäßig `PUBLIC EXECUTE` vergeben. Die
Migration widerruft nun die Ausführung für `PUBLIC`, `anon` und
`authenticated`.

Der statische Migrationstest prüft jetzt die robuste Overload-Suche, das
Fehlen des veralteten 4-Parameter-Widerrufs und den Schutz des internen
Tages-PIN-Helfers.

## Gesamtaudit der Migration

Alle `REVOKE`, `GRANT`, Funktionsdefinitionen, Trigger, Policies,
Constraints, Indizes und Extensions der Datei wurden geprüft.

- Keine weitere falsche starre Funktionssignatur wurde bestätigt.
- Neu definierte RPC-Signaturen werden erst nach ihrer Erstellung gewiderrufen
  beziehungsweise freigegeben.
- Bestehende Legacy-RPC-Signaturen sind durch die angewendete Historie belegt.
- Policies und Trigger werden vor Neuerstellung mit `IF EXISTS` entfernt.
- Tabellen, Spalten und Indizes verwenden, wo erforderlich, `IF NOT EXISTS`.
- `SECURITY DEFINER`-Funktionen besitzen einen fest gesetzten `search_path`.
- RLS bleibt auf allen neu angelegten internen Tabellen aktiv.
- `get_customer_gift_metadata` gibt Geschenkmetadaten, aber keine PII oder
  Token-Hashes zurück und validiert den gehashten Kundentoken serverseitig.
- Unique-Indizes sichern Willkommensgeschenk, Geburtstagsgeschenk,
  Idempotenz und aktive Einlösecodes ab.
- Die 15-Minuten-Codegültigkeit und die Cron-Ablauflogik bleiben unverändert.

Es wurde keine Fachlogik geändert und keine Tabelle öffentlich lesbar gemacht.

## Lokale Prüfungen

- `npm install`: erfolgreich, 0 Sicherheitslücken; lokale Engine-Warnung,
  weil die Shell Node 20 statt des geforderten Node 22 nutzt.
- `npm run lint`: erfolgreich, 0 Fehler; 12 bestehende Warnungen außerhalb
  dieses Migrationsfixes.
- `npm run typecheck`: erfolgreich.
- `npm test`: erfolgreich, 5 von 5 Tests bestanden.
- `npm run build`: erfolgreich.
- `git diff --check`: erfolgreich.
- Lokaler `supabase db reset`: nicht ausgeführt, weil Docker Desktop auf dem
  Rechner nicht verfügbar ist.

## Remote Dry-Run

`npx supabase db push --dry-run` war erfolgreich und meldet ausschließlich:

```text
20260714002000_daily_pin_booking_gifts_redemption_v1.sql
```

Es wurde kein echter Push und keine Änderung an Produktions- oder
Staging-Daten durchgeführt.

## Offene Risiken

- Die Migration ist noch nicht auf Staging angewendet. Erst der echte Push
  kann die vollständige Ausführung gegen den Datenbestand bestätigen.
- Wegen fehlendem Docker konnte kein lokaler kompletter Datenbank-Neuaufbau
  durchgeführt werden.
- Die 12 Lint-Warnungen sind bestehende Codequalitätswarnungen und blockieren
  diesen eng begrenzten SQL-Fix nicht.

## Sicherer nächster Befehl

Erst nach ausdrücklicher Freigabe:

```bash
npx supabase db push
```

Danach müssen Migrationseintrag, RPC-Signaturen, Grants, RLS und relevante
Staging-Flows erneut live geprüft werden.

## Status

**MIGRATION FIXED – READY FOR DB PUSH**
