# Owner Legal Center: Null-Reference bei Punktegültigkeit

Datum: 30.07.2026  
Branch: `release/v1-restaurant-bonus`

## Exakte Root Cause

Der Fehler entstand in `OwnerLegalSettingsPage` durch den Ausdruck
`terms?.content.points_validity_months`. Die optionale Verkettung schützte nur
das gefundene Dokument `terms`, nicht dessen `content`.

Das tatsächlich null gesetzte Objekt war deshalb nicht `loyalty_settings`,
sondern `content` der vorhandenen Dokumenthülle vom Typ
`participation_terms`.

## Betroffene Query und Datenfluss

`loadRestaurantLegalSetup` ruft den authentifizierten RPC
`get_restaurant_legal_setup(input_restaurant_id uuid)` auf. Es wird keine
`.single()`- oder `.maybeSingle()`-Abfrage verwendet.

Der serverseitige Ablauf ist:

1. Bei einer neuen Restaurantzeile erzeugt `handle_new_restaurant_member`
   bereits restaurantbezogene `loyalty_settings`.
2. Das automatisierte Legal-Onboarding erzeugt aus Mastertemplates zunächst
   unveränderliche Entwurfsversionen.
3. `get_restaurant_legal_setup` listet die Dokumenthüllen auf, verbindet für
   `content` aber ausschließlich eine aktuell veröffentlichte und bereits
   gültige Version.
4. Existiert nur ein Entwurf, bleibt der linke Join auf die aktive Version leer.
   Der RPC liefert dann korrekt eine Dokumenthülle mit `content: null` und den
   Entwurf separat in `draft_content`.
5. Der bisherige TypeScript-Typ behauptete fälschlich
   `content: Record<string, unknown>` und verdeckte damit den möglichen
   Laufzeitzustand.

## Repositoryweite Verwendungen

| Bereich | Objekt und Datenquelle | Erwarteter Typ | Null-Verhalten |
| --- | --- | --- | --- |
| `OwnerLegalSettingsPage` | `participation_terms.content` aus `get_restaurant_legal_setup` | veröffentlichter Dokumentinhalt oder `null` | kontrollierter Veröffentlichungszustand, kein Default |
| `CustomerPortal` | `legalTerms.content` aus dem öffentlichen Legal-Center-Payload | veröffentlichter Dokumentinhalt oder `null` | allgemeiner Hinweis auf die Teilnahmebedingungen |
| `ReferralLanding` | `legalTerms.content` aus dem öffentlichen Legal-Center-Payload | veröffentlichter Dokumentinhalt oder `null` | allgemeiner Hinweis auf die Teilnahmebedingungen |
| `legalCompliance` | Feldname in der Vollständigkeitsprüfung | optionales Feld eines partiellen Inhaltsobjekts | fehlender Wert macht Teilnahmebedingungen unvollständig |
| `LegalCenterPage` | reine deutsche Feldbeschriftung | Zeichenkette | kein Datenzugriff |
| SQL-Migrationen | versionierte Template-, Validierungs- und Readiness-Logik | JSON-Feld beziehungsweise Integer 1 bis 240 | serverseitige Validierung; historische Migrationen unverändert |

Tests und dieser Bericht enthalten weitere Vorkommen ausschließlich als
Regressionserwartung beziehungsweise Dokumentation.

## Source of Truth

Die rechtlich angezeigte Punktegültigkeit stammt ausschließlich aus dem Inhalt
der aktiven, veröffentlichten Teilnahmebedingungen-Version. Ein Entwurf ist
keine veröffentlichte rechtliche Aussage. Das Legal Center liest deshalb weder
einen erfundenen Wert noch automatisch den Mastertemplate-Wert `12` als
Fallback aus.

## Umsetzung

- `LegalDocumentView.content` ist nun korrekt nullable.
- `getLegalDocumentContent` akzeptiert nur echte Objektinhalte.
- `getPointsValidityState` unterscheidet:
  - aktive gültige Punktegültigkeit
  - fehlendes Dokument
  - Dokumenthülle ohne veröffentlichte Version
  - veröffentlichter Inhalt ohne gültigen Wert
- Der Loader lehnt ein leeres oder ungültiges RPC-Payload kontrolliert ab.
- Ladefehler zeigen:
  `Die rechtlichen Einstellungen konnten nicht geladen werden. Bitte versuche es erneut.`
- Berechtigungsfehler zeigen keine technischen Details.
- Retry verwirft alten Setup-, Profil- und Fehlerzustand und führt denselben
  restaurantbezogenen RPC erneut aus.
- Ein unvollständiges Bonusprogramm verweist zum Onboarding.
- Eine Dokumenthülle ohne aktive Version verweist zur Dokumentprüfung, ohne
  einen rechtlichen Standardwert anzuzeigen.

## Error Boundary

Die Anwendung besaß für geschützte Owner-Seiten keine allgemeine Render-Error-
Boundary. Die Route `/admin/legal` ist nun lokal geschützt. Der Fallback zeigt
keinen Stacktrace und bietet `Erneut versuchen` sowie `Zum Dashboard`.

## Tests

- veröffentlichte Punktegültigkeit vorhanden
- Teilnahmebedingungen fehlen
- Dokumenthülle mit `content = null`
- `points_validity_months = null`
- API-/Netzwerkfehler
- fehlende Berechtigung
- Loading-Zustand
- Einrichtungs- und Veröffentlichungszustand
- Retry
- kein direkter `terms.content`-Zugriff
- kein erfundener 12-Monats-Default
- lokale Error Boundary und stabile Route

## Qualitätsprüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 371 von 371 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Migration: keine
- RLS/Security: nicht verändert

## Staging-Test

Noch nicht durchgeführt. Für den geforderten Live-Ablauf ist eine aktive Sitzung
des neu registrierten Staging-Owners erforderlich. Es wurde keine
Production-Verbindung, Migration oder Berechtigung verändert.

Der Code- und Regressionstest ist abgeschlossen. Eine visuelle Abnahme des
Owner-Flows mit einem neu registrierten Restaurant auf Staging bleibt das offene
Freigabe-Gate.

## Offene rechtliche Risiken

Die Mastertemplates bleiben entsprechend ihrer bestehenden Kennzeichnung
rechtlich prüfpflichtig. Dieser Fehlerfix ändert weder Inhalte noch
Veröffentlichungsstatus und ersetzt keine rechtliche Prüfung.
