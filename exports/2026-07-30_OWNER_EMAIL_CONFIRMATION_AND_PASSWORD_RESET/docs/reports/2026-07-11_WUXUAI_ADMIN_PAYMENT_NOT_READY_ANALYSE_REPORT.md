# WUXUAI Admin Payment NOT-READY Analyse

Datum: 2026-07-11

Status: ANALYSE LOCK

## Hauptgrund NOT READY

Die WUXUAI Admin Trial- und Zahlungsbasis ist laut Report implementiert und der Build ist erfolgreich.

Der Status bleibt **NOT READY**, weil die neue Migration und die neuen RPCs noch nicht gegen Supabase Staging angewendet und live geprüft wurden.

Für `LOCK` fehlen:

1. Migration auf Staging anwenden.
2. Plattformrolle in Staging setzen.
3. Live-Test der Route `/platform-admin`.
4. Live-Test der Restaurantliste.
5. Live-Test der manuellen Aktionen.
6. Live-Test der Audit-Einträge.
7. RLS-/Security-Test mit echten Rollen.

## Kritische Blocker

### 1. Migration nicht auf Staging angewendet

Schweregrad: KRITISCH

Warum kritisch:

Ohne angewendete Migration existieren die neue Tabelle, Felder und RPCs in Staging nicht. Die Plattform-Admin-Seite kann dann nicht zuverlässig funktionieren.

Betroffene Datei:

- `supabase/migrations/20260711007000_platform_admin_trial_payment_basis.sql`

Betroffene Tabellen:

- `platform_admins`
- `branch_subscriptions`

Betroffene RPCs:

- `get_current_platform_role`
- `get_platform_restaurants`
- `update_platform_restaurant_subscription`

Betroffene Route:

- `/platform-admin`
- `/platform-admin/restaurants`

Betroffene Rolle:

- `platform_owner`
- `platform_admin`
- `billing_admin`
- `support`
- `security_admin`
- `viewer`

Empfohlener Fix:

`npx supabase db push --include-all` gegen Staging ausführen und prüfen, ob `20260711007000_platform_admin_trial_payment_basis.sql` angewendet wurde.

### 2. Plattformrollen nicht live geprüft

Schweregrad: KRITISCH

Warum kritisch:

Restaurant Owner dürfen niemals Plattformdaten sehen. Laut Report ist die Trennung implementiert, aber nicht mit echten Staging-Rollen geprüft.

Betroffene Dateien:

- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `src/app/App.tsx`

Betroffene Tabelle:

- `platform_admins`

Betroffene RPC:

- `get_current_platform_role`

Betroffene Route:

- `/platform-admin`

Betroffene Rollen:

- Restaurant Owner
- Plattform Admin

Empfohlener Fix:

In Staging einen echten internen Admin per `platform_admins` oder `app_metadata.role` setzen. Danach prüfen:

- Plattform Admin kann `/platform-admin` öffnen.
- Restaurant Owner wird von `/platform-admin` zurückgewiesen.
- Customer / anon hat keinen Zugriff.

### 3. Manuelle Aktionen nicht live persistiert geprüft

Schweregrad: KRITISCH

Warum kritisch:

Die wichtigsten V1-Funktionen dieser Aufgabe sind manuelle Zahlungs- und Trial-Aktionen. Laut Report laufen sie über RPC, wurden aber nicht gegen echte DB-Daten geprüft.

Betroffene Datei:

- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/platformAdminService.ts`
- `supabase/migrations/20260711007000_platform_admin_trial_payment_basis.sql`

Betroffene Tabelle:

- `branch_subscriptions`
- `restaurants`

Betroffene RPC:

- `update_platform_restaurant_subscription`

Betroffene Aktionen:

- Restaurant aktivieren
- Restaurant pausieren
- Testphase verlängern
- Zahlung auf bezahlt setzen

Empfohlener Fix:

Mit einem Staging-Restaurant jede Aktion durchführen und anschließend direkt prüfen:

- `branch_subscriptions.subscription_status`
- `branch_subscriptions.payment_status`
- `branch_subscriptions.trial_ends_at`
- `restaurants.status`

### 4. Audit nicht live geprüft

Schweregrad: KRITISCH

Warum kritisch:

Interne Admin-Aktionen müssen auditierbar sein. Der Report sagt, dass Audit geschrieben wird, aber nicht live geprüft wurde.

Betroffene Tabelle:

- `audit_log`

Betroffene RPC:

- `update_platform_restaurant_subscription`

Erwarteter Audit-Eintrag:

- `actor_type = admin`
- `action = platform_subscription_updated`
- `target_table = branch_subscriptions`

Empfohlener Fix:

Nach jeder manuellen Staging-Aktion prüfen, ob ein Audit-Eintrag mit korrektem Restaurant, Actor und Metadaten geschrieben wurde.

### 5. RLS / Security nicht live geprüft

Schweregrad: KRITISCH

Warum kritisch:

Die Seite verwaltet systemweite Plattformdaten. Statische Prüfung reicht nicht, weil RLS-, RPC- und Rollenkombinationen nur live vollständig validiert werden können.

Betroffene Tabellen:

- `platform_admins`
- `branch_subscriptions`
- `restaurants`
- `audit_log`

Betroffene RPCs:

- `get_current_platform_role`
- `get_platform_restaurants`
- `update_platform_restaurant_subscription`

Betroffene Rollen:

- anon
- authenticated ohne Plattformrolle
- Restaurant Owner
- Plattform Admin

Empfohlener Fix:

Live-RLS-Test mit mindestens vier Rollen:

1. anon
2. normaler Gast / Customer
3. Restaurant Owner
4. Plattform Admin

## Mittlere Blocker

### 1. Stripe nur vorbereitet, nicht automatisiert

Schweregrad: MITTEL

Warum mittel:

Für den Pilot ist manuelle Zahlungsverwaltung akzeptabel. Für Verkauf / SaaS-Launch ist Stripe Checkout und Webhook-Automation erforderlich.

Betroffene Dokumente:

- `docs/22_PAYMENT_STRIPE_PLAN.md`
- `docs/07_WUXUAI_ADMIN.md`

Betroffene Tabellen:

- `branch_subscriptions`

Betroffene Felder:

- `stripe_customer_id`
- `stripe_subscription_id`
- `current_period_end`

Empfohlener Fix:

Folgeblock bauen:

- Stripe Checkout
- Stripe Webhook
- Payment Event Audit
- Subscription Sync

### 2. Restaurant Portal Lock bei unbezahltem Status nicht aktiv

Schweregrad: MITTEL

Warum mittel:

Der Report sagt, dass ein harter Lock bewusst nicht aktiviert wurde, um bestehende Customer-/Restaurant-Flows nicht zu zerstören. Für den Pilot kann das akzeptabel sein. Für zahlende SaaS-Nutzung muss eine klare, getestete Sperrlogik folgen.

Betroffene Bereiche:

- Restaurant Portal
- Subscription Status
- Restaurant Setup Gate / Layout

Betroffene Dateien:

- `src/app/App.tsx`
- `src/modules/admin/AdminLayout.tsx`

Empfohlener Fix:

Separaten Lock-Block planen und testen:

- Hinweis bei abgelaufener Testphase
- keine ungewollte Zerstörung von Customer Portal
- klare Freischaltlogik

### 3. Mobile Prüfung nur statisch

Schweregrad: MITTEL

Warum mittel:

Die Seite ist mobile vorbereitet, aber echte Screenshots für 390 px / Tablet / Desktop fehlen.

Betroffene Datei:

- `src/modules/platform/PlatformAdminPage.tsx`
- `src/styles.css`

Empfohlener Fix:

Nach Staging-Migration oder mit lokalen Mockdaten Screenshots prüfen:

- 390 px
- Tablet
- Desktop

## Kleine Punkte

### 1. Interne Adminrolle muss in Staging gesetzt werden

Schweregrad: KLEIN

Warum klein:

Das ist kein Codefehler, aber ein operativer Setup-Schritt.

Betroffene Tabelle:

- `platform_admins`

Alternative:

- `app_metadata.role`

Empfohlener Fix:

Für den internen WUXUAI Nutzer einmalig Rolle setzen:

- `platform_owner` oder `platform_admin`

### 2. Status LOCK erst nach Live-Test erlaubt

Schweregrad: KLEIN

Warum klein:

Der Report ist korrekt konservativ. Das ist kein Produktfehler, sondern ein fehlender Abschluss der Validierung.

Betroffene Datei:

- `docs/reports/2026-07-11_WUXUAI_ADMIN_TRIAL_PAYMENT_BASIS_REPORT.md`

Empfohlener Fix:

Nach erfolgreicher Staging-Verifikation neuen Validierungsreport erstellen.

## Betroffene Dateien

- `supabase/migrations/20260711007000_platform_admin_trial_payment_basis.sql`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `src/app/App.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/modules/platform/PlatformAdminPage.tsx`
- `src/styles.css`
- `docs/07_WUXUAI_ADMIN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Betroffene Tabellen / RPCs

Tabellen:

- `platform_admins`
- `branch_subscriptions`
- `restaurants`
- `audit_log`

RPCs:

- `get_current_platform_role`
- `get_platform_restaurants`
- `update_platform_restaurant_subscription`

Routen:

- `/platform-admin`
- `/platform-admin/restaurants`

## Empfohlene Fix-Reihenfolge

1. Staging-Migration anwenden.
2. Plattformrolle für internen Testnutzer setzen.
3. Zugriffstest für Plattform Admin, Restaurant Owner, Customer und anon.
4. Restaurantliste live öffnen und Daten prüfen.
5. Manuelle Aktionen live ausführen:
   - Testphase verlängern
   - Zahlung bezahlt setzen
   - Restaurant pausieren
   - Restaurant aktivieren
6. DB-Persistenz direkt prüfen.
7. Audit-Einträge prüfen.
8. Mobile Screenshots prüfen.
9. Danach Status auf LOCK setzen.

## Erster Fix-Block

Der erste Fix-Block ist kein Code-Fix.

Erster Fix-Block:

```text
Staging-Migration anwenden und Plattformrolle setzen.
```

Ohne diesen Schritt können Restaurantliste, manuelle Aktionen, RLS und Audit nicht verbindlich geprüft werden.

## Status

ANALYSE LOCK
