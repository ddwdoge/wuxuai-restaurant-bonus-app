# Platform Admin V1 – Loop 3C

## Auftrag

Den fehlenden monatlichen Referral-Grenzwert im bestehenden Restaurant Control
Center ergänzen und die Loop-3B-Oberfläche kontrolliert auf Staging verifizieren.
Production bleibt gesperrt, Stripe zurückgestellt.

## Ursache

`public.loyalty_settings.referral_monthly_invite_limit` war bereits die
autoritative restaurantbezogene Quelle. Die Spalte ist `NOT NULL`, besitzt den
Default 5 und erlaubt 1 bis 100. Der bestehende RPC
`get_platform_restaurant_control_center(uuid)` las den Settings-Datensatz zwar,
nahm dieses Feld aber nicht in seinen Referral-JSON-Vertrag auf.

## Umsetzung

- Forward-Migration
  `20260825001000_platform_admin_referral_limit_contract.sql`
- unveränderte RPC-Signatur und Platform-Admin-Autorisierung
- direkte Ausgabe des Limits ohne erfundenen Fehler-Fallback
- UI-Zeile „Einladungen pro Kunde / Monat“
- fehlende Settings erscheinen als „Keine Daten verfügbar“ und `–`

## Sicherheit

Die RPC bleibt `SECURITY DEFINER` mit `search_path = public, pg_temp`, prüft
`public.is_platform_admin()` und gewährt `EXECUTE` nur an `authenticated`.
Owner, Staff, Customer und Anon erhalten keine zusätzliche Berechtigung. RLS
und bestehende Referral-Logik werden nicht geändert.

## Prüfstand

### Lokal

- gezielte Control-Center- und Limit-Vertragstests: 15/15 PASS
- vollständige autoritative Suite: 876/876 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS

### Staging-Datenbank

- bestätigtes Projekt: `bwhv…qaya`
- Dry-Run: ausschließlich `20260825001000` pending
- Migration angewendet: Ja
- lokale/Remote-Historie danach synchron: Ja
- DB-Linter: 0 Fehler

### Live-Frontend

Der authentifizierte Login mit dem bestehenden Platform-Admin-Konto funktioniert.
Die aktuelle Domain zeigt weiterhin die alte Restaurant-Detailansicht; der neue
Loop-3B-Control-Center ist dort noch nicht ausgeliefert. Das reguläre
Cloudflare-Deployment konnte nicht durchgeführt werden, weil die gespeicherte
Wrangler-Anmeldung abgelaufen war. Der gestartete OAuth-Flow wurde nicht innerhalb
des Zeitfensters bestätigt und lief kontrolliert aus.

Es wurde kein Production-Deployment, kein alternativer Worker und keine
unsichere Token-Konfiguration verwendet. Deshalb sind Live-RPC-Binding,
Rollen-Negativtests und Responsive QA der neuen Oberfläche noch offen.

## Offene Aktion

Cloudflare erneut autorisieren und anschließend den freigegebenen, mit der
Staging-`.env.local` gebauten Frontendstand über den bestehenden Staging-Workflow
veröffentlichen. Danach müssen Control Center, dynamischer Wert 5 → 3 → Restore,
Rollen und 390–1440 px live geprüft werden.

## Status

NOT READY – Datenbank-Gate PASS, Frontend-Deployment und Live-UI-Gate durch
abgelaufene Cloudflare-Authentifizierung blockiert.
