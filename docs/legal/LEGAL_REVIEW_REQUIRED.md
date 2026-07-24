# Legal Review Required

Diese technische Umsetzung ist keine Rechts- oder Steuerberatung und keine Production-Freigabe.

## Österreichische Rechtsprüfung

- Endfassung von Teilnahmebedingungen, Datenschutz und Impressum je Restaurant
- Rollenverteilung Restaurant/WUXUAI und Auftragsverarbeitungsvertrag
- Rechtsgrundlage für `PROGRAM_SERVICE`-Nachrichten und Ablaufhinweise
- Voraussetzungen einer möglichen Bestandskundenausnahme; technisch standardmäßig nicht aktiv
- Nachweisform der Einwilligung ohne vollständige IP-Adresse
- Pflicht zur erneuten Annahme bei Dokumentänderungen
- Punktelaufzeit, Übergangsregeln und Verbot rückwirkender Verkürzung
- Mindestankündigung, Sammelstopp und letzte Einlösefrist bei Programmende
- Löschung, Sperrung, Anonymisierung und Rechte Dritter
- Barrierefreiheitserklärung und bekannte Einschränkungen
- Firmenbuch-, ECG-, Medien- und Gewerbeangaben im Impressum
- Umgang mit Beschwerden und manuellen Korrekturen
- Geburtstagsdaten und freiwillige Einwilligung

## Steuer- und Kassenprüfung

- Einordnung jeder Reward-Kategorie
- Verkaufspreis, Gutscheine, Gratisabgaben und Umsatzsteuer
- Anforderungen an Kassenbeleg- oder Bonreferenzen
- Storno- und Korrekturbuchungen
- Aufbewahrungsdauer von Einlösungs- und Auditdaten
- Anforderungen an CSV-Felder und Mitarbeiterbezug

## Technische offene Punkte vor Production

- Final geprüfte Texte statt Standardvorlage veröffentlichen
- Staging-Migration und alle RPC-Grants live prüfen
- Marketingversand nur über den zentralen Autorisierungsgate anbinden
- Datenschutzanfragen im Owner-Backoffice vollständig bearbeiten und abschließen
- Retention erst nach rechtlicher Freigabe von Dry-Run auf Ausführung erweitern
- Historische Punkte ohne Verfallsmetadaten nicht rückwirkend verkürzen
- Verlässliche Verbrauchsreihenfolge für konkrete älteste Punkte-Ablaufdaten fachlich definieren
- Manuelle Punkte- und Rewardkorrekturen mit Grund, Bearbeiter, Vorher-/Nachher-Wert und Audit in einem gesondert freigegebenen V1-Flow klären; die aktuelle Bible verbietet allgemeine manuelle Punkteingabe
- Physische Mobile-Safari-/Screenreader-Prüfung durchführen

## Consent-Nachweis ohne vollständige IP-Adresse

Die technische Nachweisführung bleibt datenminimiert. Eine vollständige
IP-Adresse wird weder für die Dokumentannahme noch für freiwillige
Einwilligungen gespeichert.

Der vorgesehene Nachweis besteht aus:

- `customer_id` und `restaurant_id`
- Einwilligungsart beziehungsweise Dokumenttyp
- Dokumentversion und Dokument-Hash
- serverseitigem Zeitstempel
- Quelle des Vorgangs
- optional einer minimierten Browserklasse ohne eindeutigen Fingerprint
- einer pseudonymisierten Sitzungs- oder Anfragekennung
- `test_session_id` bei kontrollierten Tests

Ob diese Nachweisform für die vorgesehenen Kommunikationskanäle rechtlich
ausreicht, muss vor Production durch österreichische Rechtsberatung bestätigt
werden. Für SMS- oder E-Mail-Marketing kann zusätzlich ein Double-Opt-in
sinnvoll oder erforderlich sein. Die Push-Berechtigung des Browsers ersetzt
nicht automatisch die wettbewerbsrechtliche Marketingeinwilligung.
