# Tenant Isolation + Reward RPC Security Final Report

Datum: 2026-07-13

Status: NOT READY

## Ursache

Der vorherige Tenant-Isolation-Fix war code-seitig vorbereitet, aber der finale
Staging-Nachweis fehlte noch. Zusätzlich existierten in der SQL-Historie alte
Code+PIN-Reward-RPCs (`create_redemption_code`, `redeem_reward_with_pin`) aus
einem früheren V1-Zwischenstand. Diese dürfen nicht als paralleler öffentlicher
V1-Einlöseweg neben der PIN-losen `redeem_customer_reward` bestehen.

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`
- `docs/23_API_RPC_REGELN.md`
- `docs/24_SECURITY_PRIVACY.md`
- `docs/reports/2026-07-13_TENANT_ISOLATION_NEUER_ACCOUNT_ALTE_DATEN_FIX_REPORT.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht
vorhanden. Der Selbstkontroll-Loop ist verbindlich in `AGENTS.md` enthalten und
wurde daraus angewendet.

## Geänderte Dateien

- `supabase/migrations/20260713001000_tenant_isolation_reward_rpc_security_final.sql`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-13_TENANT_ISOLATION_REWARD_RPC_SECURITY_FINAL_REPORT.md`

Bereits vorhandene Tenant-Isolation-Änderungen aus dem vorherigen Fix wurden
geprüft, aber in diesem Schritt nicht neu umgebaut.

## Tenant Isolation Tests

Code-Prüfung:

- `TenantProvider` leert Restaurantliste, aktive Restaurant-ID und Branding beim
  User-Wechsel.
- Alte asynchrone Tenant-Loads werden über Request-ID blockiert.
- Restaurants werden serverseitig eingeschränkt geladen:
  `owner_id = aktueller User` oder explizite Mitgliedschaft.
- `setActiveRestaurantId` akzeptiert nur Restaurants aus der aktuell erlaubten
  Liste.
- Demo-Fallbacks sind auf lokale Entwicklung begrenzt.

Live-/Staging-Prüfung:

- Nicht durchgeführt.
- Grund: `SUPABASE_ACCESS_TOKEN` war in der lokalen Umgebung nicht verfügbar.
- Keine Staging-Migration und kein echter User-A/User-B-Test wurden ausgeführt.

## User A/User B Ergebnis

Nicht live geprüft.

Bewertung:

- Code-seitig vorbereitet.
- Kein FINAL LOCK, weil der geforderte echte Browser-/Staging-Wechsel nicht
  durchgeführt wurde.

## localStorage Ergebnis

Code-seitig geprüft:

- Fremde oder alte `activeRestaurantId` wird nicht übernommen, wenn sie nicht in
  der aktuellen Restaurantliste enthalten ist.

Live-Prüfung:

- Nicht durchgeführt.

## RLS Ergebnis

Nicht live geprüft.

Offen:

- authenticated User B gegen Restaurant A
- anon gegen interne Restaurantdaten
- QR/Rewards/Customers Direktzugriffe
- Tages-PIN Direktzugriff

## redeem_customer_reward Prüfungen

Die aktive RPC wurde additiv neu definiert.

Prüfungen in der Funktion:

- Kundentoken wird über `hash_public_token(input_customer_token)` geprüft.
- Token muss aktiv und nicht abgelaufen sein.
- Customer muss zu `token_record.restaurant_id` gehören.
- Reward muss zum Restaurant des Customers gehören.
- Reward muss aktiv und nicht abgelaufen sein.
- Willkommensgeschenke werden nur eingelöst, wenn eine eigene
  `customer_rewards`-Zeile für Customer, Restaurant und Reward existiert,
  `status = active` ist und `unlocked_at` gesetzt ist.
- Bereits eingelöste Willkommensgeschenke werden blockiert.
- Normale Punkteeinlösungen prüfen serverseitig ausreichende Punkte/Stempel.
- Punkte werden serverseitig abgezogen.
- Normale Punkteeinlösungen schreiben `reward_redemption_events`.
- Audit wird geschrieben.
- Alte aktive Redemption-Codes für denselben Customer/Reward werden abgelaufen.

Wichtige V1-Abgrenzung:

- Normale Punkteeinlösungen bleiben wiederholbare Katalogprodukte.
- Willkommensgeschenke bleiben einmalig.
- Es wurde keine PIN in Flow 03 eingeführt.

## anon execute Bewertung

`redeem_customer_reward(text, uuid)` bleibt für `anon` und `authenticated`
ausführbar, weil das Customer Portal ohne Login arbeiten muss.

Bewertung:

- Execute ist nur akzeptabel, weil die Funktion token- und
  restaurantgebunden prüft.
- Live-RLS-/RPC-Missbrauchstests stehen aus.

## Alte Code+PIN RPCs Status

Frontend-Prüfung:

- In `src/` wird nur `redeem_customer_reward` verwendet.
- `create_redemption_code` und `redeem_reward_with_pin` werden im Frontend nicht
  verwendet.

Migration:

- `create_redemption_code(text, uuid)` erhält keinen Execute-Grant mehr für
  `public`, `anon` oder `authenticated`.
- `redeem_reward_with_pin(text, uuid, text, text)` erhält keinen Execute-Grant
  mehr für `public`, `anon` oder `authenticated`.

Bewertung:

- Kein öffentlicher Code+PIN-Einlöseweg für V1 im aktuellen Migrationsstand.
- Staging-Anwendung der Migration steht aus.

## random() / gen_random_bytes Entscheidung

`create_redemption_code` wurde additiv neu definiert:

- Code-Erzeugung nutzt `extensions.gen_random_bytes(4)`.
- Die Funktion bleibt zusätzlich öffentlich deaktiviert.

Damit ist keine öffentlich nutzbare Einlösecode-Erzeugung mit `random()` im
neuen Migrationsstand vorgesehen.

## Geänderte Migrationen

Neu:

- `20260713001000_tenant_isolation_reward_rpc_security_final.sql`

Staging:

- Nicht angewendet.
- Grund: kein `SUPABASE_ACCESS_TOKEN` in der Umgebung.

## Build Ergebnis

Ausgeführt:

```text
npm run build
```

Ergebnis:

```text
erfolgreich
```

## Offene Risiken

KRITISCH:

- Migration wurde nicht auf Supabase Staging angewendet.
- Tenant-Isolation wurde nicht live mit User A/User B geprüft.
- RLS-Direktzugriffe wurden nicht live geprüft.
- `redeem_customer_reward` wurde nicht live mit eigenem/fremdem/eingelöstem/
  gesperrtem Reward getestet.

MITTEL:

- Alte Migrationen enthalten historisch weiterhin `random()` und frühere Grants.
  Die neue Migration überschreibt/deaktiviert sie, muss aber auf Staging
  angewendet werden, damit der Zielzustand gilt.

KLEIN:

- SQL-Syntax wurde code-seitig geprüft, aber nicht gegen eine echte Staging-DB
  ausgeführt.

## Status

NOT READY

Begründung:

Build und Code-/SQL-Audit sind erfolgreich, aber die Pflicht aus der Aufgabe
fordert explizit Live-/Staging-RLS- und User-Wechsel-Tests. Diese konnten ohne
Staging-Zugang nicht durchgeführt werden.
