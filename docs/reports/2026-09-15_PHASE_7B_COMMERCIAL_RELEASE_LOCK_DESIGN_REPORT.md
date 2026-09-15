# Phase 7B – Commercial Release Lock Design

Datum: 2026-09-15
Arbeitsordner: `/private/tmp/wuxuai-pro-phase1-authoritative`

```text
COMMERCIAL RELEASE LOCK DESIGN: COMPLETE
MIGRATION REQUIRED: YES
MIGRATION APPLIED: NO
PRO ACTIVATION POSSIBLE: NO CHANGE YET
AUSTRIA BASIC-ONLY GUARANTEE: NOT YET IMPLEMENTED
STATUS: PHASE 7B DESIGN COMPLETE / IMPLEMENTATION NOT AUTHORIZED
```

## Phase 7B.1A Founder-Contract-Reconciliation – lokaler Nachtrag

Der neuere Founder-Vertrag superseded die damaligen Designaussagen `keine
Policy-Writer` und `Freigabe nur durch Migration`. Der Commercial Lock bleibt
fail-closed, wird aber um einen geschuetzten, länderbezogenen Platform-Admin-
RPC ergänzt. Ebenfalls neu sind getrennte, zeitbegrenzte reale Pilot- und
interne TEST_ONLY-Berechtigungen mit Widerruf, automatischem Ablauf und
append-only Audit.

Die effektive Regel ist nun verbindlich:

```text
(country_release AND (paid_pro OR pro_trial OR real_business_pilot))
OR internal_test_only_override
```

Admin-/Feature-Overrides sind keine eigenständige Pro-Berechtigung mehr.
Country Release allein verändert keinen Basic-Betrieb. Reale Piloten brauchen
ein freigegebenes Land; TEST_ONLY vor Länderfreigabe verlangt die exakte aktive
serverseitige Test-Tenant-Markierung. Alle High-Risk-Mutatoren prüfen
Platform-Rolle, aktuelle Session, höchstens zehn Minuten alte Authentifizierung,
starke Bestätigung, Begründung und globale Idempotenz. Ein gemeinsames
Pro-Passwort existiert nicht.

Dieser Nachtrag ist lokal implementiert und gegen isolierte Fresh-, Upgrade-,
Repeat-, Rollen-, Cross-Country-, Ablauf-, Widerrufs-, Audit- und
Parallelitätstests geprüft. Die Migration ist nicht committed, nicht gepusht
und nicht auf Staging oder Production angewendet.

## Scope

Dieser Bericht ist ausschliesslich der freigegebene Sicherheits- und
Migrationsentwurf. Es wurden weder Produktcode noch Migration, Tests,
Datenbank, Stripe, Pro-Aktivierung, Staging-Deployment oder Production
veraendert. Phase 7B-Implementierung ist nicht autorisiert.

## Ausgangsbasis

- Branch: `codex/v1-phase-6-compact-mobile-ui`
- HEAD: `c6f77bb79f7433516c1c6359a98fceb3ea380453`
- Der bei Phase 7A bestaetigte Staging-Stand bleibt Version
  `b28860ca-bd47-4c9e-b5b4-450a0a06141e` zu 100 Prozent mit Phase-6F-
  Commit-Annotation.
- Vorhandene fremde Worktree-Aenderungen wurden nicht bereinigt oder
  ueberschrieben.
- Phase-7A-Kritik bleibt unveraendert: `SERVER-SIDE PRO GATE: FAIL`,
  `PRO COMMERCIAL LOCK: FAIL`, `AUSTRIA BASIC-ONLY LAUNCH PRESERVED: FAIL`.

## Bestehende Aktivierungs- und Berechtigungspfade

| Pfad | Aktuelles Verhalten | Lock-Risiko |
|---|---|---|
| Subscription `active + paid/manual` | PRO bis Periodenende wirksam | umgeht Commercial Lock |
| Subscription `trialing + not_required` | PRO bis Trial-Ende wirksam | umgeht Commercial Lock |
| `past_due` Grace | PRO bis sieben Tage wirksam | umgeht Commercial Lock |
| gekuendigte bezahlte Periode | PRO bis Periodenende wirksam | umgeht Commercial Lock |
| Platform-Plan-Override | befristetes PRO via kanonischem RPC | umgeht Commercial Lock |
| Feature-Override | Unlimited/Offer-/Reward-Notifications unabhaengig vom Plan | kann Pro-Merkmale einzeln umgehen |
| Safety Block | begrenzt Plan oder Einzelmerkmal auf Basic/aus | sicher, bleibt vorrangig |
| fehlende/ungueltige Lifecycle-Daten | Basic-Fallback | bereits fail-closed |
| UI/Direkt-URL | Owner read-only, Platform UI rollenbegrenzt | UI ist keine Autoritaet |

Betroffene kanonische Stellen:

- `supabase/migrations/20260905004000_pro_package_entitlements.sql`
- `supabase/migrations/20260910001000_pro_entitlement_lifecycle.sql`
- `supabase/migrations/20260910002000_pro_lifecycle_null_guards.sql`
- `supabase/migrations/20260911001000_pro_override_window_and_termination.sql`
- `supabase/migrations/20260911002000_subscription_browser_write_lock.sql`
- `supabase/migrations/20260911003000_subscription_admin_request_contract.sql`
- `src/modules/platform/PlatformPlanEntitlementsPanel.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/modules/admin/pages/RestaurantOffersPage.tsx`
- `src/modules/offers/restaurantOfferService.ts`

## Verbindlicher Lock-Entwurf

### 1. Autoritative Policy

Die spaetere additive Migration ergaenzt eine private Tabelle mit genau einem
Datensatz je Markt und Plan, konzeptionell:

```text
commercial_plan_release_policy
- country_code            text, Teil des Primary Key
- plan_key                text, Teil des Primary Key
- release_state           LOCKED | RELEASED
- revision                positive Ganzzahl
- founder_decision_ref    nur bei RELEASED verpflichtend
- released_at             nur bei RELEASED verpflichtend
- created_at / updated_at serverseitig
```

Initialer Datensatz:

```text
country_code = AT
plan_key = PRO
release_state = LOCKED
revision = 1
```

Die Constraint koppelt `RELEASED` zwingend an eine nichtleere
Founder-Entscheidungsreferenz und einen Release-Zeitpunkt. `LOCKED` besitzt
keine vorgetaeuschte Freigabereferenz. Der Primary Key verhindert
mehrdeutige Policies.

### 2. Schreibautoritaet

- RLS aktiv; keine Tabellenrechte fuer `public`, `anon`, `authenticated` oder
  `service_role`.
- Kein Browser-, Platform-Admin-, Billing-Admin-, Owner-, Staff- oder
  Customer-RPC darf die Policy veraendern.
- Die Anwendung liest die Policy nur ueber einen internen
  `SECURITY DEFINER`-Resolver mit festem `search_path`; dessen direkte
  Ausfuehrung ist allen Browserrollen entzogen.
- Eine spaetere Freigabe ist eine eigene, reviewed und Founder-autorisierte
  Migration. Sie liegt ausserhalb dieser Freigabe.
- `publicly_available`, Stripe, Subscription, Admin-Override, URL, Locale und
  Clientzustand sind niemals Release-Autoritaet.

### 3. Marktbindung

Der Markt wird ausschliesslich aus der kanonischen Primary-Branch-Beziehung
und deren gespeichertem Business-Country ermittelt. Kein Request-Parameter,
keine URL, Browsersprache, Customer-Position oder Client-Payload darf das Land
setzen. Restaurant, Branch und Organization muessen weiterhin derselben
Tenant-Kette angehoeren.

### 4. Fail-closed-Regel

PRO gilt nur, wenn der exakte Datensatz fuer `country_code + PRO` vorhanden,
eindeutig, constraint-gueltig und `RELEASED` ist. Alle folgenden Faelle werden
als `LOCKED` behandelt:

- Policy fehlt;
- Restaurant, Primary Branch, Business-Country oder Tenant-Bindung fehlt;
- Land- oder Planwert ist unbekannt;
- State oder Revision ist ungueltig;
- Policy kann nicht gelesen oder eindeutig aufgeloest werden.

Es gibt keinen Zeitautomatismus und kein implizites Release nach Trial,
Dreimonatsfrist oder Kalenderdatum.

### 5. Resolver-Reihenfolge

Der bestehende Lifecycle darf als Provenienzberechnung erhalten bleiben. Die
wirksame Ausgabe wird anschliessend zwingend begrenzt:

```text
1. Tenant + Primary Branch + Business-Country serverseitig aufloesen
2. BASIC-Katalogwert laden; fehlt er -> sichere statische Basic-Untergrenze
3. Commercial Policy fuer country + PRO fail-closed aufloesen
4. bestehenden Candidate aus Safety, Override und Subscription bestimmen
5. Safety Blocks anwenden
6. wenn PRO nicht RELEASED:
   - effective plan = BASIC
   - unlimited = false
   - offer limit <= BASIC offer limit
   - offer notifications = false
   - reward notifications = false
7. versionierte Antwort mit Policy-State und Grundcode liefern
```

Vorgesehene Reason Codes:

- `PRO_COMMERCIAL_RELEASE_LOCKED`
- `PRO_COMMERCIAL_POLICY_MISSING`
- `PRO_COMMERCIAL_POLICY_INVALID`
- `PRO_COMMERCIAL_COUNTRY_UNRESOLVED`

Die Antwort darf nur nicht-sensitive Policy-Daten wie Markt, Plan, State,
Revision und Reason Code enthalten, keine internen Entscheidungsdetails.

### 6. Einzelmerkmale zwingend mitbegrenzen

Nur den effektiven `plan_key` auf BASIC zu setzen reicht nicht. Bei gesperrtem
PRO werden auch Feature-Overrides geklemmt:

- `offer_limit_unlimited` immer `false`;
- effektives Offer-Limit niemals groesser als das Basic-Limit; kleinere
  bestehende Supportbegrenzungen duerfen erhalten bleiben;
- `offer_notifications` immer `false`;
- `reward_notifications` immer `false`;
- Gift Cards, POS und Catalog bleiben unveraendert `false` bzw. ausserhalb Pro.

Punkte, Einloesungen, Kundenzahlen, Rewards, Gifts, Referral, Staff und andere
Basic-Kernablaeufe werden nicht an die neue Policy gekoppelt.

### 7. Schreib- und API-Guards

Die Migration muss zusaetzlich zum Resolver folgende Servergrenzen schaffen:

- `set_platform_restaurant_plan_override` weist neue PRO-Aktivierungen bei
  geschlossenem Lock vor jeder Mutation und vor erfolgreicher Replay-Antwort
  mit `PRO_COMMERCIAL_RELEASE_LOCKED` ab.
- Das Beenden oder Reduzieren eines vorhandenen Overrides bleibt erlaubt.
- Ein Trigger auf `branch_subscriptions` verhindert neue Aenderungen des
  `plan_key` auf PRO, solange der relevante Markt gesperrt ist.
- Ein Trigger auf `branch_entitlement_overrides` verhindert neue oder
  erweiternde PRO-Plan-/Featurewerte bei gesperrtem Markt. Rein reduzierende
  Aenderungen und Terminierung bleiben erlaubt.
- Alte generische Writer bleiben revoked. Neue Policy-Writer werden nicht
  erstellt.
- Bestehende gespeicherte PRO-Zustaende werden weder geloescht noch
  umgeschrieben; der Resolver macht sie sofort unwirksam.

Diese doppelte Grenze verhindert Bypaesse ueber Direkt-DML, RPC, API,
Subscription-Lifecycle oder einzelne Feature-Overrides.

## Additive Migration – dokumentiert, nicht erstellt

Vorgesehener Dateiname:

```text
supabase/migrations/20260915001000_pro_commercial_release_lock.sql
```

Vorgesehener Inhalt in dieser Reihenfolge:

1. private Policy-Tabelle, Constraints, RLS und minimale Grants;
2. initiale `AT + PRO = LOCKED`-Zeile, ohne Bestandsdaten zu veraendern;
3. interner fail-closed Policy-Resolver;
4. additive Neudefinition des kanonischen Entitlement-Resolvers;
5. Subscription- und Override-Elevation-Guards;
6. fail-closed Neudefinition des Pro-Aktivierungs-RPC;
7. bestehende Termination-RPC unveraendert nutzbar halten;
8. PostgREST-Schema-Reload;
9. keine Stripe-, Catalog-, Usage- oder Business-Datenmigration.

Rollback-/Forward-Fix-Vertrag: Bei einem Fehler zuerst EXECUTE auf betroffene
neue oder neu definierte Aktivierungspfade entziehen und einen additiven
Forward Fix erstellen. Policy- und Audit-Evidenz nicht loeschen; keine
Rueckkehr zum entsperrten Resolver.

## Pflicht-Testmatrix fuer eine spaetere Implementierung

### Resolver und Lifecycle

1. AT/PRO-Policy fehlt -> BASIC und alle Pro-Merkmale aus.
2. AT/PRO ist LOCKED -> BASIC trotz bezahlter aktiver PRO-Subscription.
3. LOCKED -> BASIC trotz trialing PRO.
4. LOCKED -> BASIC trotz Past-due-Grace oder bezahlter Kuendigungsperiode.
5. LOCKED -> BASIC trotz gueltigem Admin-Plan-Override.
6. LOCKED -> Basic-Clamp trotz Unlimited-/Notification-Feature-Override.
7. Unbekanntes Land, fehlende Primary Branch oder gebrochene Tenant-Bindung
   -> fail-closed.
8. Safety Blocks bleiben vorrangig und koennen nichts freischalten.

### Rollen, RPC und API

9. `anon`, Customer, Staff, Owner und Manager koennen Policy weder lesen noch
   schreiben und keinen Aktivierungs-RPC ausfuehren.
10. `platform_admin`, `platform_owner` und `billing_admin` koennen den
    geschlossenen Lock nicht ueber Aktivierungs-RPC oder Direkt-DML umgehen.
11. Eine alte Idempotency-Wiederholung meldet bei geschlossenem Lock keinen
    wirksamen Aktivierungserfolg.
12. Termination/Reduktion vorhandener Overrides bleibt moeglich und auditiert.
13. `service_role` besitzt keinen Policy-Write-Pfad; Edge Functions koennen den
    Lock nicht veraendern.

### Cross-Tenant und Direkt-URL

14. Restaurant A kann Policy oder Entitlements von B nicht beeinflussen.
15. Land/Locale/URL-Parameter koennen die gespeicherte AT-Zuordnung nicht
    ueberschreiben.
16. Eine spaetere Freigabe eines anderen Landes entsperrt AT nicht.
17. Owner-Direkt-URL und gefaelschter Clientzustand bleiben wirkungslos.

### Regressionen

18. Basic-Offer-Limit 5 bleibt serverseitig aktiv.
19. Punkte sammeln, Einloesen, Customer Count, Rewards, Gifts, Referral,
    Staff, Auth und Legal bleiben unveraendert.
20. Catalog, Stripe und Usage-Limits werden nicht eingefuehrt.
21. Bestehende PRO-Subscription-/Override-Zeilen bleiben bytegleich gespeichert,
    sind aber nicht effektiv.
22. Alle sieben Sprachen rendern den Locked-/Basic-Zustand ohne rohe Codes.
23. Focused Security Contracts, SQL-Rollback-Tests, Full Tests, Typecheck,
    Lint, Build, Secret Scan und `git diff --check` bestehen.

## Entscheidungsgrenzen

Der Entwurf trifft keine kommerzielle Freigabeentscheidung. Ein spaeterer
Founder-Auftrag muss gesondert entscheiden:

- Implementierung und Erstellung der Migration;
- Anwendung zuerst auf Staging;
- physische Staging-Sicherheitsmatrix;
- erst danach ein moeglicher Release-State-Wechsel.

Der Release-State bleibt in diesem Design und in jeder nicht gesondert
autorisierten Implementierung `LOCKED`.

## Geaenderte Dateien

- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/reports/2026-09-15_PHASE_7B_COMMERCIAL_RELEASE_LOCK_DESIGN_REPORT.md`
- `exports/2026-09-15_PHASE_7B_COMMERCIAL_RELEASE_LOCK_DESIGN.zip`

## Nicht geaendert

- Produktcode und UI
- Migrationsdateien und Datenbank
- Entitlement-, Subscription-, Trial-, Override- oder Security-Runtime
- Stripe und Catalog
- reale Daten, Staging-Deployment und Production
- Phase-1–6-Final-Locks

## Abschluss

- Aufgabe: Phase 7B Commercial Release Lock Design
- Build: Ja; 2126 Module transformiert
- Migration: erforderlich, aber nicht erstellt und nicht angewendet
- Flow-Test: Nein; Design-Gate ohne Runtime-Aenderung
- RLS/Security: Design und statische Ausgangsbasis geprüft; neue Matrix noch nicht implementiert
- Alte Logik geprüft: Ja
- Report: `docs/reports/2026-09-15_PHASE_7B_COMMERCIAL_RELEASE_LOCK_DESIGN_REPORT.md`
- Prüf-ZIP: `exports/2026-09-15_PHASE_7B_COMMERCIAL_RELEASE_LOCK_DESIGN.zip`
- Offene Risiken: Der aktuelle Runtime-Stand kann PRO weiterhin aktivieren.
- Status: NOT READY

Automatische Baseline-Gates:

```text
Focused Pro/Country/Contract Tests: 71/71 PASS
Full Tests: 1811/1811 PASS
Typecheck: PASS
Lint: PASS (0 Fehler, 8 bestehende Warnungen)
Build: PASS
```

```text
COMMERCIAL RELEASE LOCK DESIGN: COMPLETE
MIGRATION REQUIRED: YES
MIGRATION CREATED: NO
MIGRATION APPLIED: NO
PHASE 7B IMPLEMENTATION: NOT AUTHORIZED
AUSTRIA BASIC-ONLY GUARANTEE: NOT YET IMPLEMENTED
STATUS: PHASE 7B DESIGN COMPLETE / IMPLEMENTATION NOT AUTHORIZED
```
