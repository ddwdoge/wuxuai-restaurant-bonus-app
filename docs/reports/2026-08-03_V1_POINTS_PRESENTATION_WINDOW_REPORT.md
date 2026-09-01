# WUXUAI Bonus V1 – Punkte-Präsentationsfenster

Datum: 2026-08-03  
Branch: `dev`  
Ausgangscommit: `f24eb7f195d9d196ade6997b638ed614e7741202`  
Status: **CODE LOCK**

## Ursache und Produktentscheidung

Normale Punktebelohnungen verwendeten bisher denselben sechsstelligen
Mitarbeiter-Codeflow wie Willkommens- und Geburtstagsgeschenke. Die verbindliche
Produktentscheidung ersetzt diesen Ablauf für Punktebelohnungen durch eine
ausdrückliche Kundenbestätigung mit anschließendem, serverzeitgebundenem
15-Minuten-Präsentationsfenster. Geschenkflows bleiben unverändert.

## Umsetzung

- Punkte werden beim bestätigten Start serverseitig und atomar abgezogen.
- Journal, Audit, Reward-Event und Präsentationsstatus entstehen in derselben RPC-Transaktion.
- Statusfolge: `REDEEMED_ACTIVE` zu `REDEEMED_COMPLETED`.
- `activated_at`, `expires_at`, Ablaufprüfung und rotierender visueller Sicherheitswert stammen vom Server.
- Retry und Doppelklick sind je Restaurant, Kunde und Bestätigungs-ID idempotent.
- Ein fachlicher Lock je Restaurant, Kunde und Reward verhindert parallele Doppelstarts.
- Reload, weitere Tabs und Browserwechsel laden ausschließlich den servervalidierten Vorgang.
- Das aktive Fenster zeigt Restaurant, Rewardbild, Rewardname, Punkte, Serverzeit,
  Ablaufzeit, Countdown, Animation, Sicherheitswert und Einlösungsnummer.
- Nach Ablauf wird der aktive Bildschirm durch den Dankeszustand ersetzt; der
  eingelöste Reward ist nicht mehr als verfügbar markiert.
- Nur Owner oder Plattform-Support können mit mindestens zehn Zeichen Begründung
  stornieren. Punkte-/Stempelrückgabe, Gegenbuchung, Audit und Journalstatus sind atomar.
- Historische Codevorgänge behalten das bestehende reine Protokollstorno.
- Willkommens- und Geburtstagsgeschenke behalten den sechsstelligen Staff-Code.

## Datenbank und Sicherheit

Neue Migrationen:

- `20260803007000_points_redemption_presentation_window.sql`
- `20260803008000_points_presentation_legal_template.sql`

Die Präsentationstabelle hat RLS; `public`, `anon` und `authenticated` besitzen
keine direkten Tabellenrechte. Browserrollen erhalten nur die eng begrenzten
Start-/Status-RPCs. Interne Abschluss-, Payload-, Visual-Code- und Stornohelper
sind nicht direkt ausführbar. Alle neuen `SECURITY DEFINER`-Funktionen besitzen
einen festen `search_path`; Token-, Tenant-, Kunden- und Reward-Zuordnung werden
serverseitig geprüft.

## Legal

Das eingefrorene Legal-Paket V0.9 bleibt unverändert. Der neue Inhalt liegt als
separates Addendum unter
`docs/legal/addenda/2026-08-03_POINTS_PRESENTATION_WINDOW_V1_0_DRAFT.md` und ist
ausdrücklich `DRAFT_LEGAL_REVIEW_REQUIRED`. Die additive Mastertemplate-Migration
überschreibt keine veröffentlichten Restaurantdokumente. Vor Production sind
anwaltliche Prüfung und kontrollierte Veröffentlichung erforderlich.

## Dokumentation

Aktualisiert:

- `docs/02_PRODUKTREGELN.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/product/DECISION_2026-08-03_V1_POINTS_PRESENTATION_WINDOW.md`
- `docs/legal/addenda/2026-08-03_POINTS_PRESENTATION_WINDOW_V1_0_DRAFT.md`

## Tests und Qualität

- Neue Tests: 12
- Gesamttests: 582/582 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Supabase Dry-Run: erfolgreich
- Responsive-Vertrag: 390-Pixel-Regeln, Touchflächen und Reduced Motion statisch geprüft

## Staging

Die verknüpfte Remote-Datenbank wurde read-only über `npx supabase migration list`
geprüft. Der Dry-Run war erfolgreich. Vor den neuen Migrationen sind jedoch auch
`20260803004000`, `20260803005000` und `20260803006000` noch nicht remote
registriert. Ein `db push` würde deshalb fünf fachlich getrennte Migrationen
gemeinsam anwenden. Ohne gesonderte Freigabe wurde nichts angewendet.

Die Funktion konnte daher nicht gegen Staging und nicht als echter lokaler
Datenbankflow getestet werden. Docker/Podman ist lokal nicht verfügbar. Es wurde
kein Production-Deployment ausgeführt.

## Bestehende Änderungen

Im Working Tree lagen vor Beginn bereits freigegebene, uncommittete Änderungen
am Owner-Dashboard-Next-Step. Diese Dateien wurden nicht verworfen oder
zurückgebaut und sind nicht Bestandteil der fachlichen Bewertung dieses Reports.

## Offene Risiken

- SQL-Ausführung und RPC-Verhalten müssen nach kontrollierter Anwendung der
  ausstehenden Migrationskette auf Staging live geprüft werden.
- Doppelklick, parallele Tabs, Ablauf, Owner-Storno und atomare Rückbuchung müssen
  mit isolierten Staging-Testdaten verifiziert werden.
- Mobile Safari und installierte PWA benötigen eine physische Sichtprüfung des
  Countdowns, Wake Locks und der Animation.
- Das Legal-Addendum benötigt anwaltliche Prüfung vor Production.

## Status

**CODE LOCK** – Implementierung, Dokumentation, statische Security-Prüfung,
Tests und Build sind abgeschlossen. Kein `FINAL LOCK`, weil Migration und echter
Flow noch nicht auf Staging geprüft wurden.
