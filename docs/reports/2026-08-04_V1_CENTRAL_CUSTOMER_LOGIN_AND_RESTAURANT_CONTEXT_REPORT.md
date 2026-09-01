# V1 Zentrales Kundenkonto und Restaurantkontext

Datum: 2026-08-04  
Branch: `dev`  
Ausgangscommit: `6233fa6be5d378a965f62d5d80b1aa4100e5c5c5`

## Ursache und Ziel

Der bestehende Kundenflow kannte sichere, aber getrennte Restauranttokens. Die
neue Produktentscheidung verlangt zusätzlich ein zentrales WUXUAI-Konto mit
Supabase Auth, mehreren strikt restaurantbezogenen Memberships und einem
Restaurantkontext, der nach QR, Login und E-Mail-Bestätigung erhalten bleibt.
Ein global gemischter Angebotsfeed ist in V1 ausdrücklich ausgeschlossen.

## Umsetzung

- Zentrale Anmeldung und Registrierung verwenden Supabase Auth mit E-Mail,
  Passwort und E-Mail-Bestätigung. WUXUAI speichert kein eigenes Passwort.
- Vorname, normalisierte Telefonnummer und optionaler Geburtstag werden erst
  nach bestätigter Auth-Sitzung in der bestehenden Tabelle
  `customer_accounts` angelegt.
- `/customer/:slug` und `/w/:slug` behalten den sicheren Rückkehrpfad durch
  Login und Bestätigung. Externe Redirect-Ziele werden verworfen.
- Ohne Sitzung zeigt der QR-Einstieg Anmeldung und Registrierung. Mit Sitzung
  wird die Membership geprüft; ein fehlender Beitritt braucht eine ausdrückliche
  Legal-Bestätigung.
- Eine bestehende restaurantbezogene Kundenzeile wird nur nach serverseitiger
  Prüfung ihres geheimen Restauranttokens verknüpft. Telefonnummer,
  Geburtstag oder Gerätekennung reichen niemals aus.
- Membership-Beitritte sind über Account und Restaurant gesperrt und durch
  Unique Constraints idempotent. Bestehende Legal-, Welcome-Gift- und
  Audit-Logik wird wiederverwendet.
- Punkte, Besuche, Rewards, Geschenke und Angebotsbadges werden je Membership
  und `restaurant_id` geladen. Es gibt keine restaurantübergreifende
  Punktesumme.
- Die zentrale Navigation lautet ausschließlich `Start`, `Meine Lokale`,
  `Entdecken`, `Konto`. Vollständige Angebote liegen nur unter
  `/customer/:slug/offers`.
- Angebots-E-Mail-Versand bleibt serverseitig deaktiviert und ist nicht Teil
  der Kundenanmeldung.

## Datenbank und Sicherheit

Neue additive Migration:
`20260804003000_central_customer_login_restaurant_context.sql`.

Sie erweitert die bereits vorbereitete Tabelle `customer_accounts`, statt eine
zweite globale Identität einzuführen. Neue `SECURITY DEFINER`-RPCs besitzen
feste `search_path`-Werte, prüfen `auth.uid()` und bestätigte E-Mail-Adressen
und sind nur für `authenticated` ausführbar. Direkte Browserrechte auf
Account-, Membership-, Token- und E-Mail-Tabellen bleiben entzogen; RLS wird
nicht deaktiviert. Klartexttokens werden nur an den berechtigten Client
zurückgegeben und ausschließlich restaurantbezogen lokal gespeichert. Logs,
Audit und Analytics erhalten keine Tokens oder Passwörter.

Der Staging-Dry-Run war erfolgreich und plant in dieser Reihenfolge:

1. `20260804002000_central_customer_account_offer_emails.sql`
2. `20260804003000_central_customer_login_restaurant_context.sql`

Keine Migration wurde angewendet. Production wurde nicht berührt.

## Prüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler
- Tests: 633/633 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Supabase `db push --dry-run`: erfolgreich, zwei offene Migrationen
- Responsive: 390, 430, 768, 1024 und 1440 Pixel lokal geprüft
- Horizontaler Overflow: 0
- Touchflächen der geprüften Customer-Auth- und QR-Aktionen: mindestens 44 px
- Lokale Browserfehler nach finaler Korrektur: 0
- Unerwartete lokale Netzwerkfehler nach finaler Korrektur: 0
- Registrierungsformular bei 390/430 px vollständig scrollbar und Safe-Area-fähig

## Nicht geändert

- bestehende Punkte-, Tages-PIN-, Reward-, Gift- und Redemption-Logik
- Owner-, Staff- und Plattformportal
- Service-Role-Nutzung im Browser
- Production-Daten und Production-Migrationen
- Angebots-E-Mail-Providerstatus

## Offene Risiken und Gates

- Die beiden Migrationen sind noch nicht auf Staging angewendet.
- Registrierung, E-Mail-Zustellung, Callback, Beitritt A/B, Double-Click,
  Logout/Login und Cross-Tenant-Zugriffe müssen nach Anwendung mit isolierten
  Staging-Konten vollständig live geprüft werden.
- Supabase Redirect-URLs müssen die Staging- und spätere Production-Callback-URL
  ausdrücklich erlauben.
- Physischer Mobile-Safari- und installierter PWA-Test sind offen.
- Bestehende Legacy-Kunden ohne gültigen lokalen Restauranttoken werden nicht
  unsicher automatisch verknüpft und benötigen den dokumentierten Supportflow.

## Status

`CODE LOCK`

Der Quellstand ist bereit für visuelle Prüfung und anschließend für einen
kontrollierten Staging-E2E. Ein `FINAL LOCK` ist vor Migration und echtem
Staging-Flow ausdrücklich nicht zulässig.
