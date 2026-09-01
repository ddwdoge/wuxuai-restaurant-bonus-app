# Gäste-Menü – Auswahl/Filter zeigt keine Gäste mehr

Datum: 2026-08-23  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `5cc938d`

## Ursache

Die Gäste-Seite besitzt im aktuellen V1-Code keine Statussegmente, Zeitfilter,
Sortierung oder Pagination. Vorhanden sind ausschließlich:

1. die globale Restaurantauswahl aus dem Tenant-Kontext,
2. das lokale Suchfeld für Name, maskierte Telefonnummer und Gästecode.

Der lokale Suchwert war nicht an `restaurant_id` gebunden. Beim Wechsel von
Restaurant A zu Restaurant B blieb deshalb die Suche von A aktiv und wurde
sofort auf die neue Gästeliste von B angewendet. Wenn B keinen Treffer für den
alten Suchwert enthielt, zeigte die Seite trotz vorhandener Gäste den normalen
leeren Zustand.

Zwei weitere Zustandsfehler verstärkten das Problem:

- `loadCustomers` und die optionale Berechtigungsprüfung für sensible
  Identitätskorrekturen liefen in einem gemeinsamen `Promise.all`. Ein Fehler
  der optionalen Prüfung verwarf dadurch auch die erfolgreich geladene Liste.
- Ein fehlgeschlagener Request wurde gleichzeitig als normale leere Liste und
  als nachgelagerte Statusmeldung dargestellt.

Die Root Cause ist damit ein Frontend-State- und Fehlerzustandsfehler. Der
restaurantgebundene RPC-Vertrag wurde nicht verändert.

## Auswahl- und Filterinventar

| Auswahl | UI-State | Request/Filter | Erwartung |
| --- | --- | --- | --- |
| Alle Gäste | leerer Suchwert | RPC lädt Restaurantliste | alle Gäste des aktiven Restaurants |
| Suche | `filterState.query` | lokaler Filter auf minimiertem RPC-Payload | passende Gäste |
| Restaurant | `activeRestaurant.id` | `input_restaurant_id` | ausschließlich Gäste dieses Restaurants |
| Identitätskorrektur | `supportCustomer` | eigener berechtigter Detail-RPC | verändert die Liste nicht |
| Statussegmente | nicht vorhanden | – | N/A |
| Zeitraum | nicht vorhanden | – | N/A |
| Sortierung | nicht vorhanden | – | N/A |
| Pagination/Cursor | nicht vorhanden | – | N/A |
| Filter-Counts | nicht vorhanden | – | N/A |

## Request-Vertrag

Die Liste verwendet weiterhin:

- Endpoint: `POST /rest/v1/rpc/list_restaurant_customers_safe`
- Parameter: `input_restaurant_id = activeRestaurant.id`
- Browserrolle: `authenticated`
- Direkter Tabellenzugriff auf `customers`: keiner
- Payload: minimierter Anzeigename, maskierte Telefonnummer, Gästecode,
  restaurantbezogene Bonusstände und Erstellzeitpunkt

Der lokale Code und die Migration stimmen bei Funktionsname und Parameter
überein. Eine authentifizierte Live-Abfrage und die Supabase-Logs konnten in
diesem Lauf nicht geprüft werden, weil weder im Owner-Portal noch im Supabase-
Dashboard eine aktive Sitzung vorhanden war. Es wird deshalb kein
Staging-PASS behauptet.

## Änderungen

- Restaurantbezogenen Suchzustand als kleine, testbare Reducer-Logik ergänzt.
- Restaurantwechsel setzt die Suche synchron auf den neuen Tenant-Scope zurück.
- Veraltete Identitäts-Supportauswahl wird bei Tenantwechsel geschlossen.
- Mehrwortsuche sowie Groß-/Kleinschreibung und Umlaute robust normalisiert.
- Listenrequest und optionale Supportberechtigung entkoppelt.
- Beim Tenantwechsel werden alte Gäste nicht im neuen Restaurantkontext
  weitergerendert.
- Loading, Empty und Error werden exklusiv dargestellt.
- Fehlerzustand zeigt „Gäste konnten nicht geladen werden“ mit
  „Erneut versuchen“.
- Echte leere Suche und Restaurant ohne Gäste erhalten unterschiedliche Texte.

## Nicht geändert

- Keine Migration
- Keine RPC-, RLS-, Grant- oder Datenbankänderung
- Keine Kundenregistrierungs-, Punkte-, Reward-, Birthday-, Redemption- oder
  Auth-Änderung
- Keine neue Filter- oder Gäste-Architektur
- Kein Push, Merge oder Deployment

## Tests

- Initiale Liste ohne Suche
- Suche nach Name, maskierter Telefonnummer und Gästecode
- Groß-/Kleinschreibung, Umlaute und Mehrwortsuche
- echter Empty State
- Suche löschen
- Restaurantwechsel setzt Suche zurück
- gleiches Restaurant behält aktuellen Suchwert
- unabhängige Listen- und Supportabfrage
- getrennte Loading-/Empty-/Error-Zustände mit Retry
- restaurantgebundener minimierter RPC-Vertrag

Ergebnisse:

- Zieltests: 21/21 PASS
- Gesamtsuite: 700/700 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 8 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS

## Responsive

Die Änderung fügt keine neue Navigation und keine breiten Controls hinzu. Das
vorhandene einspaltige Suchfeld, die responsive Kartenliste und bestehende
Buttonklassen bleiben erhalten. Ein authentifizierter visueller Lauf bei
390/430/768/1024/1440 px war ohne Staging-Owner-Sitzung nicht möglich und wird
nicht als geprüft ausgegeben.

## Finale Ausgabe

ERROR REPRODUCED:  
YES – deterministisch im bisherigen State-Vertrag und durch den neuen
Regressionstest A-Suche → Restaurant B nachgewiesen.

ROOT CAUSE:  
Der ungescopte Suchwert von Restaurant A blieb beim Tenantwechsel aktiv und
filterte die Gästeliste von Restaurant B; optionale Support- und Listenrequests
waren zusätzlich fehlerhaft gekoppelt.

FRONTEND STATE BUG:  
YES

QUERY/RPC BUG:  
NO

DB SCHEMA BUG:  
NO

PAGINATION RESET:  
PASS / N/A – V1 besitzt keine Pagination; der vorhandene Suchzustand wird beim
Restaurantwechsel zurückgesetzt.

RESTAURANT CONTEXT:  
PASS

ALL GUESTS:  
PASS

FILTERS:  
PASS – vorhandene Suche und Restaurantauswahl; weitere Filter N/A

SEARCH:  
PASS

SEARCH + FILTER:  
PASS – Suche plus Restaurantkontext

EMPTY STATE:  
PASS

ERROR STATE:  
PASS

FILTER COUNTS:  
N/A

MOBILE:  
FAIL – authentifizierte visuelle Staging-Prüfung offen

DESKTOP:  
FAIL – authentifizierte visuelle Staging-Prüfung offen

TESTS:  
700/700 PASS

TYPECHECK:  
PASS

LINT:  
PASS

BUILD:  
PASS

STAGING VERIFIED:  
NO

GUESTS MODULE READY:  
NO – Code Lock erreicht; authentifizierter Staging-Flow steht aus.

PRODUCTION:  
LOCKED

STRIPE:  
DEFERRED
