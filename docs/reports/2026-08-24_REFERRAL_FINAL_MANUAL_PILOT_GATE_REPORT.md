# WUXUAI Bonus - Referral Final Manual Pilot Gate

Datum: 24.08.2026  
Umgebung: Supabase Staging `bwhv...qaya`  
Production: LOCKED  
Stripe: DEFERRED

## Dauerpruefung

Das Pilotrestaurant `Kaffee Konditorei baeckerei` hatte vor diesem Gate eine
Referral-Dauer von 30 Tagen. Die Loyalty-Settings-Zeile wurde am 23.08.2026
angelegt. Fuer den Wert existierte kein
`REFERRAL_BONUS_SETTINGS_UPDATED`-Audit. Die 14-Tage-Defaultmigration wurde
erst danach am 24.08.2026 angewendet. Der Wert war daher Legacy und keine
nachweisbare Owner-Custom-Konfiguration.

Gemaess Pilotregel wurde ausschliesslich dieses Restaurant ueber den
bestehenden, autorisierten Owner-RPC auf 14 Tage gesetzt. Das Monatslimit blieb
5. Der neue Audit-Eintrag dokumentiert 30 -> 14 mit dem zugeordneten Owner als
Akteur. Andere bestehende 30-Tage-Konfigurationen und historische Booster
wurden nicht geaendert.

## Default fuer neue Restaurants

- aktiver Datenbankdefault: 14 Tage
- nach der Defaultmigration angelegte Loyalty-Settings auf Staging: 14 Tage
- erwartete neue Aufteilung: Referrer 14 Tage, Freund 7 Tage

Ergebnis: PASS.

## Historischer Referral-Datensatz

Der bereits vorhandene Testpaar-Datensatz wurde vor dem aktuellen manuellen
Pilot-Gate qualifiziert:

- Referral: aktiviert
- gespeicherte Konfiguration: 30 Tage
- Referrer-Grant: 30 Tage
- Freund-Grant: 15 Tage
- Multiplikator: 2x
- Welcome Gift des eingeladenen Gasts: 0

Dieser historische Datensatz bleibt unveraendert. Er beweist die alte 30/15-
Aufteilung, aber nicht den neuen Referral-Welcome-Flow und nicht die neue
14/7-Pilotkonfiguration.

Der Owner-KPI-RPC meldet fuer den bestehenden historischen Datensatz eine
erfolgreiche Empfehlung, je einen Referrer- und Freund-Grant und zwei aktuell
geboostete Gaeste. Zusatzpunkte sind 0, weil die qualifizierende Buchung vor
Aktivierung des Boosts mit Multiplikator 1 erfolgte und danach noch keine neue
2x-Buchung vorliegt.

## Nicht abgeschlossene manuelle Gates

Folgende Schritte konnten ohne neue Test-E-Mail, Zugriff auf deren Mailbox und
ein physisches iPhone nicht ausgefuehrt werden:

- normale Neuregistrierung mit echter E-Mail-Bestaetigung
- neuer Referral A -> B unter der aktuellen 14/7-Konfiguration
- Waiting-, Pending-, Active- und Expiry-Darstellung auf iPhone Safari
- gleichzeitige Anzeige von Welcome Gift und aktivem 2x-Boost
- sichtbare Invite-Lock-/Unlock- und Monatslimit-UX
- sechste reale Einladung im neuen Pilotlauf
- Owner-UI-Abgleich des neuen, persistenten Pilotlaufs

Automatisierte DB-E2E-Tests aus dem vorherigen Gate decken diese Regeln
technisch ab, ersetzen aber den geforderten physischen Pilotlauf nicht.

## Gate-Ergebnis

- 30-Tage-Konfiguration: LEGACY
- aktuelle Pilotkonfiguration: 14 Tage
- neuer Restaurantdefault 14: PASS
- Referral V1 Final Lock: NO
- bereit fuer die manuelle Durchfuehrung: YES
- bereit fuer Platform Admin Loop 3B: NO

## Qualitaet

- Tests: 855/855 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- Staging DB Linter: 0 Fehler
- lokale/Remote-Migrationshistorie bis `20260824006100`: synchron
- `git diff --check`: PASS

Status: **CODE LOCK - MANUAL IPHONE AND EMAIL PILOT REQUIRED**
