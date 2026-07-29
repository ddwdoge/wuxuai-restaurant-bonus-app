# Telefonnummer mit Landesvorwahl und E.164

Datum: 2026-07-29  
Branch: `codex/v13-legal-maps-hardening`  
Ausgangscommit: `b544b76b45f083ab9dd951446b0c468a0b207cfa`

## Bisheriger Zustand

Registrierung, Empfehlungsregistrierung und Owner-Support verwendeten ein gemeinsames Freitextfeld. Die Client-Normalisierung kannte österreichische Bestandsformate, trennte Landesvorwahl und lokale Nummer jedoch nicht. Die noch ausstehende SQL-Funktion entfernte außerdem unbekannte Zeichen vor der Prüfung. Dadurch waren Frontendvertrag, Eingabehilfe und serverseitige Ablehnung nicht streng genug abgestimmt.

## Neue UI

Die gemeinsame Komponente `CustomerPhoneField` wird verwendet in:

- normaler Restaurant-Kundenregistrierung,
- Empfehlungsregistrierung,
- autorisierter Identitätskorrektur durch Owner/Admin.

Sie zeigt eine beschriftete Landesvorwahl-Auswahl, standardmäßig Österreich `+43`, und ein separates Feld für die lokale Nummer. Der Hinweis lautet: „Bitte ohne führende 0 eingeben.“ Eine einzelne führende Null wird automatisch entfernt. Doppelte Landesvorwahlen, Buchstaben und nicht erlaubte Sonderzeichen erzeugen einen deutschen Feldfehler.

Die Felder verwenden `tel-country-code`, `tel-national`, `inputMode="tel"`, `aria-describedby`, `aria-invalid` und mindestens 48 Pixel hohe Bedienelemente.

## Normalisierungsregel

Die zentrale Utility in `customerIdentity.mjs`:

1. prüft die ausgewählte, unterstützte Landesvorwahl,
2. erlaubt nur Ziffern, Leerzeichen, Bindestriche und Klammern im lokalen Feld,
3. entfernt Formatierungszeichen,
4. entfernt genau eine einzelne führende Null,
5. blockiert `+...` und `00...` als doppelte Landesvorwahl,
6. verbindet Landesvorwahl und lokale Nummer,
7. validiert das Ergebnis gegen E.164 mit insgesamt 8 bis 15 Ziffern.

Gespeichert beziehungsweise an die bestehenden RPCs übergeben wird nur E.164. Rohe Nutzereingaben werden nicht zusätzlich dauerhaft gespeichert.

## Duplicate-Schutz

Die ausstehende Identity-Migration erzwingt weiterhin den eindeutigen Index:

`restaurant_id + normalized_phone`

Unterschiedliche Schreibweisen derselben Nummer normalisieren auf denselben Wert. Ein anderes Restaurant bleibt ein eigener Tenant-Scope. Die bestehenden Advisory Locks und Duplicate-Account-Ablehnungen wurden nicht verändert.

## Serverseitige Härtung

Neue additive Migration:

`supabase/migrations/20260729002000_customer_phone_e164_hardening.sql`

Sie ersetzt ausschließlich `public.normalize_customer_phone(text)` durch eine strengere Implementierung. Unbekannte Zeichen werden nicht mehr still entfernt. Unterstützte Landesvorwahlen und E.164-Länge werden serverseitig geprüft. Die Funktion ist nicht direkt für `public`, `anon` oder `authenticated` ausführbar. Bestehende RPC-Signaturen, RLS und Tenant-Prüfungen bleiben unverändert.

Die Migration enthält keine Datenänderung, keine automatische Reparatur, keine Löschung und keine Kontenzusammenführung.

## Bestehende ungültige Staging-Daten

Der vorherige anonymisierte Staging-Preflight bleibt maßgeblich:

| Klassifikation | Anzahl sicher bestätigt |
| --- | ---: |
| eindeutig formatierbar | 0 |
| Testwert | 0 |
| unvollständig | 0 |
| ausländische Nummer | 0 |
| nicht sicher korrigierbar ohne fachliche Einzelprüfung | 5 |

Die fünf Werte wurden nicht exportiert und nicht geraten. Die anonymisierte Zählung erlaubt keine sichere feinere Zuordnung. Bis zu einer autorisierten manuellen Prüfung gelten alle fünf deshalb als nicht sicher korrigierbar. Es wurden keine Ziffern ergänzt, keine Konten gelöscht und keine Konten zusammengeführt.

## Staging-Preflight

- Projekt: `wuxuai-bonus-staging`
- Project-Ref maskiert: `bwh…qaya`
- Production: Nein
- `db push --dry-run --include-all`: erfolgreich
- neue Migration in korrekter Reihenfolge erkannt: Ja
- Migration angewendet: Nein

Der Dry-Run plant derzeit fünf ausstehende Migrationen, beginnend mit `20260727001000_customer_identity_v1_no_sms.sql` und endend mit `20260729002000_customer_phone_e164_hardening.sql`. Die Identity-Migration bleibt wegen fünf ungültiger Telefonnummern blockiert. Keine Remote-Migrationshistorie wurde verändert.

## Tests und Qualität

- neue Verhaltenstests für `+43`, `+49`, führende Null, Formatierungszeichen, Buchstaben, doppelte Landesvorwahl, leere/kurze/lange Nummern und Support-Wiederverwendung
- gleiche E.164-Normalisierung für Registrierung, Referral und Support
- keine vollständige Telefonnummer in neuem Audit oder Logging
- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 263/263 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Mobile Prüfung

Lokaler Browser-Test bei 390 × 844 Pixel:

- kein horizontaler Overflow (`scrollWidth = innerWidth = 390`),
- Landesvorwahl und lokale Nummer jeweils 50 Pixel hoch,
- `0664 1234567` wird sichtbar zu `6641234567`,
- doppelte Landesvorwahl zeigt den geforderten Fehler,
- Console Errors: 0.

Physischer iPhone-Safari- und installierter PWA-Test sind noch offen.

## Geänderte Bereiche

- zentrale Telefon-Normalisierung und Typdeklarationen,
- gemeinsame Telefonfeld-Komponente und globale responsive Styles,
- Kunden- und Referral-Registrierung,
- Owner-/Admin-Supportkorrektur,
- additive SQL-Härtung,
- automatisierte Tests.

Nicht geändert wurden Geburtstag, Punkte, Rewards, Tages-PIN, QR-Kontext, Customer Token, RLS, Auth, Staff-Portal oder Plattformportal.

## Offene Risiken und nächste Aktion

1. Die fünf ungültigen Staging-Werte müssen durch autorisierten Support fachlich geprüft werden.
2. Danach sind Missing-/Invalid-/Duplicate-Preflight erneut auszuführen.
3. Erst anschließend dürfen Identity-, Folge- und Telefonhärtungsmigrationen auf Staging angewendet und die RPCs live verifiziert werden.
4. Physischer iPhone-Safari- und PWA-Test bleiben Release-Gates.

Status: `BLOCKED_BY_DATA_CLEANUP`
