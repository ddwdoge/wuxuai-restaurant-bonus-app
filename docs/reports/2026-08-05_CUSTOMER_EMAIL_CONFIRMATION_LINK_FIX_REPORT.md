# WUXUAI Bonus – Kunden-E-Mail-Bestätigung

Datum: 05.08.2026  
Branch: `dev`  
Ausgangscommit: `25ce8edbb8e1a26a51f03ad4c3e2755332910092`  
Supabase: `wuxuai-bonus-staging` (`bwhv...qaya`)

## Ursache

Der konkrete Auth-Vorgang wurde in den Supabase-Staging-Logs gefunden:

| Feld | Ergebnis |
| --- | --- |
| Zeitpunkt | 05.08.2026, 12:16:35 UTC |
| Endpoint | `GET /verify` |
| HTTP-Status | `403` |
| Fehler | `One-time token not found` |
| UI-Meldung | `Email link is invalid or has expired` |
| Flow | Signup-E-Mail-Bestätigung über das Confirm-signup-Template |
| Redirect | Kunden-Callback auf `bonus.wuxuaisbi.com`, Restaurantpfad anonymisiert |
| Auth-User-ID | im betroffenen Logdatensatz nicht enthalten; nicht erfunden |

Im sichtbaren Zeitraum zwischen dem unmittelbar vorherigen Signup und dem
Fehler ist kein erfolgreicher `/verify`-Verbrauch dokumentiert. Für diesen
einzelnen Vorfall ist ein Link-Prefetch daher nicht nachgewiesen. Der Befund
passt zu einem älteren, bereits ersetzten oder anderweitig nicht mehr gültigen
Einmal-Link.

Das aktive Confirm-signup-Template verwendet direkt:

```html
<a href="{{ .ConfirmationURL }}">Confirm email address</a>
```

Damit liegt der Supabase-Einmal-Link bereits im ersten E-Mail-Link. Dieser
Vertrag ist zusätzlich strukturell anfällig für Link-Scanner und Prefetching.
Der bisherige Kunden-Callback verarbeitete PKCE-Code oder Session-Hash außerdem
automatisch beim Mount. Ein lokales `useRef` schützte weder Reload, zweiten Tab,
BFCache noch eine neue Komponenteninstanz.

## Geänderte Dateien

- `src/modules/auth/emailConfirmationFlow.mjs`
- `src/modules/auth/emailConfirmationFlow.d.mts`
- `src/modules/auth/emailConfirmationService.ts`
- `src/modules/auth/AuthCallbackPage.tsx`
- `src/modules/auth/ownerAuthFlow.mjs`
- `src/modules/auth/ownerAuthService.ts`
- `src/modules/customer/CustomerAuthPage.tsx`
- `src/modules/customer/CustomerAuthCallbackPage.tsx`
- `src/modules/customer/central-customer.css`
- `tests/customer-email-confirmation.test.mjs`
- `tests/central-customer-login-context.test.mjs`
- `tests/owner-email-confirmation-password-reset.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Umsetzung

- Ein zentraler Parser akzeptiert den neuen `token_hash`-Vertrag, vorhandene
  PKCE-Codes und vollständige Legacy-Session-Hashes.
- Falscher Typ, fehlender Hash, unvollständiger Hash und Callbackfehler werden
  vor der Verifikation blockiert.
- `verifyOtp({ token_hash, type: "email" })` ist der neue bevorzugte Vertrag.
- Die Verifikation startet nur nach Klick auf `E-Mail jetzt bestätigen`.
- Sensitive Callbackparameter werden nach dem Einlesen sofort aus der sichtbaren
  URL entfernt.
- Ein gemeinsamer Single-Flight-Guard führt parallele identische Aufrufe nur
  einmal aus und liefert dasselbe Ergebnis an wartende Aufrufer.
- Kundenkonto und Membership werden weiterhin ausschließlich über die bestehende
  idempotente `ensure_authenticated_customer_account`-Logik vorbereitet.
- Der sichere, validierte Rückkehrpfad wird als Kundenauth-Metadatum erhalten;
  ein fremder oder externer Pfad wird weiterhin auf `/customer` reduziert.
- Der Fehlerzustand bietet `Neue Bestätigungs-E-Mail senden`, einen 60-Sekunden-
  Cooldown, eine generische nicht enumerierende Antwort, `Zur Kundenanmeldung`
  und den Hinweis, immer den neuesten Link zu verwenden.
- Owner- und Customer-Callback unterstützen denselben Templatevertrag, ohne
  Customer-, Owner- oder Tenant-Rechte zu vermischen.

## Supabase-Konfiguration

Live geprüft:

- Site URL: `https://bonus.wuxuaisbi.com`
- Redirects aktuell: Root-Domain und die breite Regel
  `https://bonus.wuxuaisbi.com/**`
- Confirm-signup-Template: `{{ .ConfirmationURL }}`

Nach Bereitstellung des kompatiblen App-Builds ist koordiniert umzustellen:

```html
<a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=email">
  E-Mail-Adresse bestätigen
</a>
```

Der Hash wird bei einem HTTP-Prefetch nicht an den Server übertragen. Erst die
WUXUAI-Seite liest ihn lokal und der ausdrückliche Nutzerklick ruft `verifyOtp`
auf.

Danach sind mindestens diese exakten Redirects einzutragen:

- `https://bonus.wuxuaisbi.com/auth/callback`
- `https://bonus.wuxuaisbi.com/auth/update-password`
- `https://bonus.wuxuaisbi.com/customer/auth/callback`

Die breite Domain-Wildcard darf erst entfernt werden, wenn der neue Build aktiv
ist und Owner- sowie Customer-Signup mit den exakten Routen verifiziert wurden.
Eine vorzeitige Template- oder Allow-List-Änderung würde den derzeit laufenden
App-Build beschädigen und wurde deshalb nicht vorgenommen.

## Tests

- gezielte Customer-/Owner-Auth-Tests: erfolgreich
- vollständige Testsuite: `649/649` erfolgreich
- Typecheck: erfolgreich
- Lint: `0` Fehler, `8` bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- lokaler Callback-GET: keine automatische Verifikation
- lokaler bewusster Klick mit ungültigem Testhash: genau ein kontrollierter
  Fehlerzustand, Resend und Login erreichbar
- Tokens, Sessionwerte und vollständige E-Mail-Adressen: nicht protokolliert

## Was nicht geändert wurde

- keine Migration
- keine RLS-, Policy-, Grant- oder RPC-Änderung
- keine Punkte-, Reward-, Membership- oder Tenant-Logik geändert
- kein Push, Merge oder Production-Deployment
- kein Supabase-Template vor dem kompatiblen App-Rollout geändert

## Staging-Ergebnis und Risiken

Der Fehler ist im Code behoben und lokal verifiziert. Ein vollständiger
Staging-E2E mit neuer Kundenadresse ist noch offen, weil der kompatible Build,
das Confirm-signup-Template und die exakten Redirects in einer koordinierten
Reihenfolge veröffentlicht werden müssen. Die vorhandene öffentliche Domain
ist nicht als getrennte, gefahrlos umschaltbare Preview-Umgebung konfiguriert.

Physischer Mobile-Safari-Test, echter Mail-Empfang, neuester/alter Link nach
Resend, Logout/Login und Membership-Zählung bleiben Staging-Gates.

## Status

`CHANGES_REQUIRED`

Code-Status: `CODE LOCK`  
Staging-/Final-Status: `NOT READY`
