# Decision Record: WUXUAI Bonus ab V1 branchenneutral

Decision: WUXUAI Bonus wird ab V1 branchenneutral positioniert.  
Date: 2026-07-30  
Owner: Product Owner  
Supersedes: Restaurant-only V1 wording restriction  
Status: LOCKED

## Entscheidung

WUXUAI Bonus ist eine digitale Kundenbindungsplattform für lokale Unternehmen.
Die Plattform unterstützt Punkte, Belohnungen, Willkommensgeschenke,
Empfehlungen, Kundenregistrierung, QR-Zugang und Bonusprogramme.

Die allgemeine sichtbare Produktsprache ist branchenneutral. Restaurant bleibt
die erste vollständig unterstützte, getestete und pilotierte Referenzbranche,
ist aber nicht die Dachbezeichnung des Produkts.

Verbindlicher Produktname:

> WUXUAI Bonus

Verbindliche Positionierung:

> Die Kundenbindungsplattform für lokale Unternehmen.

Kurze Positionierung:

> Kundenbindung für lokale Unternehmen

## V1-Umfang

V1 erlaubt:

- neutralen Produktnamen und neutrale allgemeine UI-Terminologie,
- Branchenauswahl im Onboarding,
- zentral konfigurierte Dropdown-Optionen,
- passende Willkommensgeschenk-Vorlagen,
- passende Belohnungskategorien und Beispiele je Branche,
- kontrollierte individuelle Auswahl,
- die bestehende generische Reward- und Bonuslogik,
- Restaurant als vollständig getestete Referenzbranche.

Zentrale Startprofile:

- Restaurant
- Café
- Bäckerei
- Bubble Tea
- Eisdiele
- Einzelhandel
- Friseursalon
- Kosmetikstudio
- Fitnessstudio
- Dienstleistung
- Sonstiges

Nicht vollständig spezialisierte Branchen verwenden ein kontrolliertes Profil
oder „Sonstiges“. V1 muss nicht jede Branche mit tiefen Spezialfunktionen
unterstützen.

## V2-Abgrenzung

V2 bleibt:

- tiefgreifende branchenspezifische Geschäftslogik,
- individuelle Termin-, Buchungs- oder Warenwirtschaftssysteme,
- komplexe Kassenintegrationen,
- automatische Branchenkampagnen,
- branchenspezifische Analytics-Engines,
- eigene Abrechnungsmodelle je Branche,
- vollständige Branchenpakete mit Spezialfunktionen.

## Terminologiestandard

Allgemeine sichtbare UI-Begriffe:

| Alt | Neu |
| --- | --- |
| Restaurant | Unternehmen oder Geschäft |
| Restaurantbesitzer | Betreiber |
| Restaurantname | Unternehmensname |
| Restaurantdaten | Unternehmensdaten |
| Restauranttyp | Branche |
| Restaurant starten | Unternehmen aktivieren |
| Restaurant auswählen | Unternehmen auswählen |
| Restaurant wechseln | Unternehmen wechseln |
| Restaurant-QR | Unternehmens-QR |
| Restaurantstatus | Unternehmensstatus |
| Restaurantprofil | Unternehmensprofil |
| Restaurant-Einstellungen | Unternehmenseinstellungen |
| Restaurant-Mitarbeiter | Teammitglied |
| Restaurant Login | Betreiber-Login |

Keine blinde globale Wortersetzung. Restaurant, Dessert, Kaffee, Haarschnitt,
Produkt oder Behandlung bleiben zulässig, wenn sie echte branchenspezifische
Inhalte darstellen.

## Branchenprofile und abhängige Auswahl

- Branche wird im Onboarding zuerst gewählt.
- Willkommensgeschenke, Punkteeinlösung, Belohnungskategorien und Beispiele
  richten sich nach dem zentralen Branchenprofil.
- Optionen werden nicht verstreut in Komponenten hardcodiert.
- Ein Branchenwechsel behält weiterhin gültige Werte.
- Ungültige abhängige Werte werden kontrolliert zurückgesetzt.
- Bestehende gespeicherte individuelle Werte werden nicht automatisch
  gelöscht und bleiben als bestehende Auswahl lesbar.
- Empfehlungen dürfen angezeigt, aber nicht still gespeichert werden.

## Dropdown-Standard

Definierte Optionslisten im Onboarding werden als verständliche Dropdowns oder
Comboboxen dargestellt. Das gilt insbesondere für:

- Branche,
- Willkommensgeschenk,
- Art der Punkteeinlösung,
- Belohnungskategorie,
- Reward-Typ,
- relevante rechtliche Auswahlfelder.

Sie sind zentral konfiguriert, barrierefrei, tastaturbedienbar,
Mobile-Safari-tauglich, mindestens 44 px hoch und zeigen keine ungeeigneten
Optionen anderer Branchen. „Eigene Auswahl“ ermöglicht kontrollierte
Individualisierung ohne neue technische Reward-Art.

## Technische Legacy-Namen

`INTERNAL_LEGACY_NAMING_ACCEPTED`

Folgende interne Begriffe dürfen vorerst unverändert bleiben:

- `restaurants`
- `restaurant_id`
- bestehende RPC-Namen
- bestehende RLS-Policies
- bestehende Datenbanktypen
- Storage-Pfade
- URL-Slugs
- interne TypeScript-Interfaces, wenn eine Umbenennung hohes Risiko verursacht

Diese Namen dürfen nicht als sichtbares allgemeines Produktwording verwendet
werden. Es wird keine Datenbankmigration allein zur sprachlichen Umbenennung
erstellt.

## Legal-Ausnahme

`LEGAL_REVIEW_REQUIRED`

Rechtliche Mastertemplates und veröffentlichte Rechtstexte werden nicht
automatisch inhaltlich neutralisiert. Eine Änderung muss Betreiberrolle,
tatsächliches Geschäftsmodell und rechtliche Geltung korrekt berücksichtigen
und benötigt eine gesonderte rechtliche Prüfung.

Es darf nicht behauptet werden, Texte seien rechtssicher, anwaltlich geprüft
oder für jede Branche vollständig geeignet, solange dies nicht belegt ist.

## Design

Der Premium Design Standard bleibt unverändert: warme Creme-Hintergründe,
weiße Karten, Gold-Akzente, dunkle Typografie, großzügige Abstände,
abgerundete Ecken, subtile Schatten, hochwertige Bilder, minimalistische Icons
und ruhige Navigation.

## Vorrangregel

Diese Entscheidung ersetzt alle älteren aktiven Aussagen, nach denen:

- V1 ausschließlich Restaurants oder Cafés unterstützt,
- weitere Branchen in V1 verboten sind,
- Restaurant überall sichtbarer Oberbegriff sein muss,
- neutrale Produktsprache erst V2 ist.

Historische Changelog-Einträge bleiben als Zeitdokument erhalten. Fachlich
echte Restaurantbeispiele bleiben als Beispiele der Referenzbranche gültig.
