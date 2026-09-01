# WUXUAI Bonus V1 – Globaler Customer-Restaurant-Schnellwechsel

Datum: 2026-08-27  
Branch: `codex/v1-canonical-recovery`  
Production: `LOCKED`  
Stripe: `DEFERRED`

## Ursache

Der Restaurantwechsel war nur über `Konto → Restaurants` erreichbar. Der
gemeinsame Restaurant-Header zeigte zwar den aktiven Tenant, bot aber keinen
direkten Wechsel. Die vorhandene Account-Membership- und Öffnungslogik war
bereits serverseitig abgesichert und musste nicht dupliziert werden.

## Autoritative Verträge

- `get_customer_account()` liefert die aktiven Restaurant-Memberships des
  authentifizierten zentralen Kundenkontos mit Restaurant, Ort und getrenntem
  Punktestand.
- `open_customer_account_membership(uuid)` prüft die gewählte Membership gegen
  das angemeldete Konto und öffnet ausschließlich den zugehörigen
  restaurantbezogenen Zugang.
- QR und manueller Wechsel enden beide im vorhandenen
  `CustomerRestaurantAccess` und im kanonischen Pfad `/customer/:slug`.
- Local Storage, Browserhistorie, E-Mail und Auth-Metadaten werden nicht zur
  Bildung der Restaurantliste oder zur Autorisierung einer Auswahl verwendet.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/CustomerRestaurantAccess.tsx`
- `src/modules/customer/components/PremiumCustomerUi.tsx`
- `src/modules/customer/components/CustomerRestaurantSwitcher.tsx`
- `src/modules/customer/components/customer-restaurant-switcher.css`
- `src/modules/customer/customerRestaurantSwitcher.mjs`
- `src/modules/customer/customerRestaurantSwitcher.d.mts`
- `src/modules/customer/customer-premium.css`
- `tests/customer-restaurant-quick-switcher.test.mjs`
- `tests/customer-restaurant-switcher-fixture.html`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

Weitere bereits vorhandene Änderungen an kompakten Customer-Karten wurden
nicht zurückgesetzt und gehören nicht zur Businesslogik dieses Auftrags.

## Was wurde geändert

- Logo, Restaurantname und Chevron sind ein gemeinsames 44-Pixel-Auswahlziel;
  die Informationstaste bleibt unabhängig.
- Der Premium-Drawer zeigt das aktuelle Restaurant zuerst, danach ausschließlich
  weitere aktive eigene Memberships. Null Punkte bleiben sichtbar.
- Ab mehr als fünf Memberships filtert eine lokale Suche nur die bereits
  autoritativ geladenen Restaurants.
- Auswahl desselben Restaurants schließt nur den Drawer.
- Bei anderer Auswahl validiert der bestehende Server-RPC zuerst die
  Membership. Währenddessen erscheint `Restaurant wird gewechselt…`.
- Fehler behalten den alten Kontext und zeigen
  `Restaurant konnte nicht gewechselt werden.` mit Wiederholungsaktion.
- Der Route-Guard entfernt den alten Portalbaum sofort und rendert den neuen
  erst, wenn der neue URL-Slug serverseitig geöffnet wurde. Damit wechseln
  Header, Punkte, Rewards, Geschenke, Angebote, Referral, 2×-Status,
  Einlösungen und Restaurantinfo als ein zusammenhängender Kontext.
- Die bestehende Account-Restaurantliste und Discovery bleiben erhalten.

## Was wurde nicht geändert

- Keine Punkte-, Reward-, Gift-, Offer-, Referral-, Boost- oder
  Einlösegeschäftslogik.
- Keine Auth-, RLS-, Grant-, RPC- oder Datenbankänderung.
- Kein neuer clientseitiger Restaurantzustand und kein Browser-Reload.
- Keine Production-, Staging- oder Stripe-Aktion.

## Sicherheit

- Eigene Membership-Liste: automatisierter Vertragscheck `PASS`.
- Fremde oder inaktive Membership: nicht auswählbar; serverseitiger Open-RPC
  bleibt zusätzlich maßgeblich.
- Anon: bestehender authentifizierter Customer-Route-Guard bleibt maßgeblich.
- QR und manueller Wechsel: gleicher kanonischer Zugriffspfad `PASS`.
- Tenant-Mischzustand bei Route, Reload und Back/Forward: durch sluggebundenes
  Render-Gate blockiert.
- RLS wurde nicht gelockert oder verändert.

## UI-Prüfung

Lokaler Chromium-Geometrie- und Screenshot-Test mit langem Restaurantnamen und
20 Memberships:

| Breite | Ergebnis |
| --- | --- |
| 320 px | PASS |
| 375 px | PASS |
| 390 px | PASS |
| 414 px | PASS |
| 430 px | PASS |
| 768 px | PASS |
| 1024 px | PASS |
| 1440 px | PASS |

- Globaler horizontaler Overflow: `NO`
- Interne Scrollliste bei 20 Restaurants: `PASS`
- Restaurantname gekürzt, Chevron und Info sichtbar: `PASS`
- Selector und Schließen jeweils mindestens 44 px: `PASS`

Desktop geprüft: Ja  
Tablet geprüft: Ja  
Mobile geprüft: Ja

## Qualität

- Gezielte Switch-/Account-/QR-Regression: `58/58 PASS`
- Vollständige autoritative Suite: `1031/1031 PASS`
- Typecheck: `PASS`
- Lint: `PASS`, 0 Fehler; 7 bereits bestehende Warnungen außerhalb des Scopes
- Production Build: `PASS`
- `git diff --check`: `PASS`
- Secret Scan: `PASS`; nur erwartete Bezeichner und dokumentierte
  `service_role`-Verträge, keine Schlüsselwerte

## Migration und Staging

- Migration erstellt: Nein
- Migration auf Staging angewendet: Nicht erforderlich
- Staging-Deployment: Nein, nicht beauftragt
- Echter Staging-Flow: Nein

## Risiken

- Der vollständige echte QR-/manuelle Wechsel mit mehreren realen
  Staging-Memberships wurde in diesem Auftrag nicht physisch durchgeführt.
- Deshalb gilt gemäß Selbstkontroll-Loop maximal `CODE LOCK`, nicht
  `FINAL LOCK`.

## Prüf-ZIP

`exports/2026-08-27_CUSTOMER_GLOBAL_RESTAURANT_QUICK_SWITCHER_FULL_APP.zip`

Das Archiv enthält den vollständigen aktuellen App-Stand einschließlich
uncommitteter fachlicher Änderungen, jedoch keine `.git`-Daten, Abhängigkeiten,
echten Environment-Dateien, Build-Ausgaben, alten Exporte, Dumps oder Secrets.
Die dokumentierende `.env.example` ist enthalten.

Status: **CODE LOCK**
