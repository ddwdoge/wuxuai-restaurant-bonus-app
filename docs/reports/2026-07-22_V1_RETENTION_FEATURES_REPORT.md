# WUXUAI Bonus V1 – Retention-Funktionen

Datum: 2026-07-22
Branch: `codex/v1-retention-features`
Ausgangscommit: `851cb4c0a411768f772a8c9afeb3d41cb493d731`

## Gefundener Ausgangszustand

- Referral-Zuordnung, Qualifizierung nach der ersten gültigen Punktebuchung und `customer_bonus_boosts` waren bereits vorhanden.
- Der bestehende Boost unterstützte konfigurierbare Dauer und Multiplikatoren; V1 war dadurch nicht hart auf 2×/30 Tage begrenzt.
- Geburtstagsgeschenke wurden bislang automatisch 14 Tage vorher aus aktiven Willkommensgeschenken zugeteilt.
- Die bestehende Eindeutigkeitsregel verhindert mehr als ein Geburtstagsgeschenk je Kunde, Restaurant/Filiale und Kalenderjahr.
- Ein sicherer sechsstelliger Einlösecode und der atomare Redemption-Flow waren bereits vorhanden und wurden wiederverwendet.
- Es gab weder Service Worker noch Push-Subscription-Tabelle, VAPID-Konfiguration oder Push-Sender-Funktion.
- Für Punkte existiert aktuell kein serverseitiges Ablaufdatum. Daher werden nur tatsächlich befristete Reward- und Geschenkzuteilungen erinnert.

## Geänderte Bereiche

- Kundenportal: Retention-Status, Ablauf-Drawer, Push-Zustimmung, Deep-Link, Geburtstagsangabe/-auslosung und Referral-Übersicht.
- Owner-Portal: vorhandene Willkommensgeschenke können dem Geburtstags-Zufallspool zugeordnet werden; Boost-Konfiguration zeigt feste V1-Werte.
- Owner-Dashboard: erfolgreiche Empfehlungen, gewonnene Neukunden, aktive Boosts und Zusatzpunkte; Testkunden bleiben ausgeschlossen.
- PWA: Service Worker für Push-Anzeige und sicheren Navigations-Link.
- Supabase: additive Tabellen, Spalten, RPCs, Audit-Events, Cron-Erzeugung der Reminder und Edge-Sender-Funktion.
- Dokumentation: Customer-, Gast-, Boost-, Reward-, CTO-, Security- und Changelog-Dokumente.

## Ablauf-Erinnerungen

- Serverstufen: 7, 3, 1 und 0 verbleibende lokale Kalendertage in der Restaurant-Zeitzone.
- Eindeutiger Index verhindert doppelte Reminder derselben Stufe.
- Der bestehende Info-Drawer öffnet automatisch höchstens einmal pro Browser-Session.
- Ein sichtbarer Startseiten-Hinweis öffnet den Drawer später erneut.
- Push ist freiwillig; ohne Push bleibt der Drawer vollständig funktionsfähig.
- Push-Links öffnen die betroffene Punkteeinlösung und lösen keine Einlösung aus.
- Ungültige Push-Endpunkte werden deaktiviert.
- Die Sender-Funktion verlangt VAPID-Secrets und ein separates Scheduler-Secret.

## Geburtstagsgeschenk

- Freiwillige Speicherung von Tag und Monat; Änderungen sind auf einmal innerhalb von 365 Tagen begrenzt.
- Abholung ist von 3 Tagen vor bis 7 Tage nach dem Geburtstag möglich.
- Auswahl erfolgt serverseitig zufällig nur aus aktiven, nicht abgelaufenen und freigegebenen Willkommensgeschenken.
- Die vorhandene Unique-Regel und ein Zeilen-Lock sichern genau eine Auswahl pro Jahr; parallele Requests liefern dieselbe Zuteilung.
- Reload und erneutes Drücken geben das gespeicherte Geschenk zurück.
- Die weitere Einlösung verwendet unverändert den bestehenden sicheren Redemption-Code-Flow.
- Der bisherige automatische Geburtstagsjob wird deaktiviert, ohne historische Daten oder Funktionen zu löschen.

## Bonus Boost

- V1-Werte sind serverseitig auf exakt 2× und 30 Tage begrenzt.
- Die vorhandene Qualifizierung nach der ersten gültigen Punktebuchung bleibt bestehen.
- Empfehlender und geworbener Kunde erhalten jeweils einen eigenen Boost.
- Weitere erfolgreiche Empfehlungen verlängern einen aktiven Boost des Empfehlenden um 30 Tage; abgelaufene Boosts beginnen neu.
- Advisory Lock und bestehende Referral-Eindeutigkeit schützen vor paralleler Doppelaktivierung.
- Die Punkteberechnung verwendet weiterhin den bestehenden zentralen Punkte-RPC; es wurde kein zweiter Multiplikatorpfad eingeführt.

## Migration und Sicherheit

- Neue additive Migration: `20260722003000_v1_retention_features.sql`.
- Keine Tabelle oder bestehende Spalte wird gelöscht.
- Keine bestehende öffentliche RPC-Signatur wird gebrochen.
- RLS wurde für neue Tabellen aktiviert; es bestehen keine direkten Anon-/Customer-Policies.
- Öffentliche Kundenaktionen erfolgen nur über tokengeprüfte `SECURITY DEFINER`-RPCs mit festem `search_path`.
- Customer Token, Tages-PIN, Einlösecode, VAPID Private Key und Scheduler-Secret werden weder im UI noch im Audit ausgegeben.
- Supabase Dry-Run war erfolgreich und listet ausschließlich die neue Migration als ausstehend.
- Migration wurde am 23.07.2026 erfolgreich auf das verknüpfte Supabase-Projekt `bwhvfjuwixgwduoeqaya` angewendet.
- Die anschließende Migrationsliste zeigt `20260722003000` lokal und remote; der erneute Dry-Run meldet die Remote-Datenbank als aktuell.
- `get_customer_retention_status(text, text)` wurde über PostgREST mit einem absichtlich ungültigen Testtoken geprüft. Die RPC antwortete fachlich mit `P0001`; `PGRST202` trat nicht auf. Damit sind Schema-Cache und `anon`-EXECUTE bestätigt.

## Tests und Qualität

- Neue Regressionstests: 6.
- Gesamttests: 82/82 erfolgreich.
- Typecheck: erfolgreich.
- Lint: 0 Fehler; 8 bereits bestehende Warnungen.
- Build: erfolgreich.
- Supabase Migration-Push: erfolgreich.
- Supabase Dry-Run nach Push: erfolgreich, keine ausstehenden Migrationen.
- Responsive Regeln sind in den vorhandenen Premium-Komponenten und Styles umgesetzt; eine echte Staging-Abnahme bei 390/430/768/1024/1440 px war ohne angewendete Migration nicht möglich.

## Offene Blocker

1. Edge Function `expiry-reminders` auf Staging deployen.
2. VAPID Public/Private Key, `VITE_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` und `EXPIRY_REMINDER_SCHEDULER_SECRET` ausschließlich als Staging-Secrets konfigurieren.
3. Einen authentisierten täglichen Scheduler für die Sender-Funktion konfigurieren und Push erlaubt/abgelehnt/ungültig live prüfen.
4. RLS, Europe/Vienna-Grenzen, Geburtstag, parallele Auslosung, Referral-Qualifizierung, Boost-Verlängerung und Punkteverdopplung mit isolierten Staging-Testkunden vollständig testen.
5. Responsive Screenshots und Console-/Network-Prüfung mit echten Retention-Daten nachholen.

## Status

**PARTIALLY_IMPLEMENTED**

Der Code ist lokal vollständig vorbereitet, getestet und buildfähig; die additive Migration ist remote angewendet. Ein Status `READY_FOR_REVIEW` ist erst nach Push-Infrastruktur und echten End-to-End-Tests vertretbar.
