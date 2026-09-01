# Onboarding: initiales Legal-Paket vollständig veröffentlichen

Datum: 30.07.2026  
Branch: `release/v1-restaurant-bonus`  
Ausgangscommit: `0f318c2`

## Exakte Root Cause

Der bisherige Onboarding-Abschluss bestand aus zwei voneinander getrennten
Schritten:

1. `completePilotOnboarding` rief
   `generate_restaurant_legal_package(...)` auf. Diese Funktion erzeugte
   ausschließlich Legal-Entwürfe und setzte `legal_update_required_at`.
2. Direkt danach setzte das Frontend den vorhandenen Restaurantdatensatz per
   Tabellen-`UPDATE` auf `status = active` und
   `onboarding_status = completed`.

`publish_restaurant_legal_drafts(...)` wurde im Onboarding nicht aufgerufen.
Damit konnte der bestätigte Zustand „Restaurant aktiv, Legal-Dokumente nur als
Entwurf, Kundenregistrierung blockiert“ deterministisch entstehen.

Der manuelle Publish-Vertrag enthielt zusätzlich einen Widerspruch: Der RPC
bot `input_reacceptance_required` als veränderbaren Veröffentlichungswert an,
die Immutability-Triggerfunktion erlaubte den Übergang von `draft` zu
`published` aber nur, wenn dieser Wert unverändert blieb. Der neue Vertrag
erlaubt diese Metadatenentscheidung beim einzigen zulässigen Statusübergang,
während Dokumentinhalt, Hash, Version, Restaurant, Dokument und Mastertemplate
weiter unveränderlich bleiben.

## Historischer Publish-Request

Der alte Owner-UI-Catch verwarf `code`, `message`, `details` und `hint` und zeigte
nur den generischen Hinweis zur Vorschau und zum Gültigkeitsdatum. Im aktuellen
Browser stand keine authentifizierte Staging-Owner-Sitzung zur Verfügung; die
früher dokumentierten Testslugs existieren nach dem Testdaten-Reset nicht mehr.

Der konkrete historische HTTP-/PostgREST-Code und die damals betroffene
`document_version_id` können deshalb nicht seriös nachträglich behauptet werden.
Künftige Publish-Fehler werden ausschließlich mit den sicheren strukturierten
Feldern `code`, `message`, `details` und `hint` protokolliert. Dokumentinhalte,
Tokens und andere Secrets werden nicht aufgenommen.

## Korrigierter Ablauf

Die additive Migration
`20260730002000_onboarding_initial_legal_package_publication.sql` führt
`complete_restaurant_onboarding(...)` ein.

Der RPC:

1. prüft Owner-/Adminrolle und Restaurantzuordnung,
2. sperrt exakt das bestehende Restaurant per `FOR UPDATE`,
3. validiert Pflicht- und Aktivierungsdaten,
4. erzeugt beziehungsweise verwendet hash-identische Legal-Versionen,
5. validiert Teilnahmebedingungen und Datenschutzerklärung,
6. veröffentlicht alle aktuellen Drafts als Paket,
7. aktiviert erst danach das bestehende Restaurant,
8. berechnet Legal- und Registration-Readiness neu,
9. wirft bei fehlender Readiness eine Exception und rollt damit die gesamte
   RPC-Transaktion zurück,
10. schreibt ein Audit-Event ohne Dokumentinhalte.

Es gibt keinen Restaurant-`INSERT`, keinen Slug-Parameter und keine
Fallback-Aktivierung. Ein bereits vollständig abgeschlossener Zustand wird
idempotent zurückgegeben.

## Owner-Bestätigung

Schritt 7 enthält nun verpflichtend:

> Ich habe meine Unternehmens- und Bonusprogrammdaten geprüft und möchte die
> automatisch vorbereiteten Dokumente veröffentlichen.

Darunter wird ausdrücklich darauf hingewiesen, dass die automatisch erstellten
Vorlagen keine individuelle Rechtsberatung ersetzen. Ohne Bestätigung bleiben
Checkliste und Startaktion blockiert.

## Datum und Zeitzone

Der Onboarding-RPC bestimmt das Gültigkeitsdatum serverseitig als lokales
Kalenderdatum in `Europe/Vienna`. Der Owner-Legal-Center-Datepicker verwendet
dieselbe Zeitzone statt `toISOString()`. Ein UTC-Vortagsfehler beim lokalen
Tageswechsel wird dadurch verhindert.

Zukünftige Daten bleiben im manuellen Legal-Center technisch speicherbar, sind
aber bis zum Gültigkeitstag nicht readiness-wirksam. Der Onboarding-Abschluss
veröffentlicht ausschließlich mit dem aktuellen Wiener Kalendertag.

## Paket-, Dirty- und Programmende-Logik

- Drafts werden vor jeder Veröffentlichung auf Mastertemplate, Hash, Inhalt und
  Text geprüft.
- Teilnahmebedingungen und Datenschutzerklärung müssen gemeinsam vorhanden
  sein.
- Die Veröffentlichung läuft innerhalb einer RPC-Transaktion; Teilerfolg wird
  nicht zurückgegeben.
- `legal_update_required_at` wird erst nach erfolgreicher Paketveröffentlichung
  gelöscht.
- Das initiale Paket wird im Audit als solches markiert und erzeugt nach dem
  Abschluss keine falsche „Neue Version verfügbar“-Schleife.
- Spätere echte Profil- oder Bonusregeländerungen erzeugen weiterhin neue
  Drafts und verändern veröffentlichte Altversionen nicht.
- Der Programmende-Flow wird vom Abschluss-RPC weder geschrieben noch geplant.
  Die bestehende serverseitige Readiness-Prüfung bleibt Autorität.

## Security und RLS

- RPC: `complete_restaurant_onboarding(uuid, jsonb, jsonb, boolean, uuid)`
- `SECURITY DEFINER` mit festem `search_path = public, extensions`
- `EXECUTE` für `public` und `anon` widerrufen
- `EXECUTE` nur für `authenticated`
- zusätzliche serverseitige Prüfung über `is_restaurant_admin`
- kein Staff-, Kunden- oder Cross-Tenant-Zugriff
- RLS-Policies wurden nicht verändert oder gelockert

Ein anonymer Live-Aufruf des neuen Staging-RPC wurde mit HTTP 401 und
PostgreSQL-Code `42501` abgewiesen. Damit ist der Endpunkt im PostgREST-Schema
vorhanden und nicht öffentlich ausführbar.

## Staging

- Projekt: `wuxuai-bonus-staging`
- Project Ref: `bwhv…qaya`
- Dry-Run: ausschließlich Migration `20260730002000`
- Migration angewendet: Ja
- lokale/Remote-Migration registriert: Ja
- PostgREST-Schemaerkennung: Ja
- anon blockiert: Ja
- Production-Migration: Nein
- Frontend-Deployment: Nein

Ein vollständiger E2E mit neuem Owner, Dokumentvorschau, Kunden-QR und neuer
Kundenregistrierung wurde nicht durchgeführt, weil keine authentifizierte
Staging-Owner-Sitzung und kein aktives isoliertes Testrestaurant vorhanden
waren. Der neue Frontendflow ist außerdem bewusst nicht deployed worden.

## Tests und Qualität

- neue gezielte Onboarding-/Legal-Tests: 13
- Gesamt: 384 von 384 Tests erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich

Abgedeckt sind Bestätigung, RPC-Reihenfolge, Rollback bei fehlender Readiness,
Pflichtdokumente, ungültige Drafts, Owner/Tenant, Slug-Stabilität,
Idempotenz, Doppelklick, Wien-Tagesgrenzen, Dirty-State, Programmende-Abgrenzung
und sichere Fehlerdarstellung.

## Offene juristische und operative Punkte

- Pilot-Mastertemplates bleiben als „rechtliche Prüfung empfohlen“ markiert und
  ersetzen keine anwaltliche Freigabe.
- Der vollständige neue Owner-Onboarding-E2E muss nach einem kontrollierten
  Frontend-Staging-Deployment mit isolierten Testdaten durchgeführt werden.
- Der historische konkrete Publish-Fehlercode ist wegen der früheren
  Fehlerunterdrückung nicht rekonstruierbar.

## Status

`READY_FOR_VISUAL_REVIEW`

Kein Push, Merge, Production-Deployment oder Production-Migrationslauf.
