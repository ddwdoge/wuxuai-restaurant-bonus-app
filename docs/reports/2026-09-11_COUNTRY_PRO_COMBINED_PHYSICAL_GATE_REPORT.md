# WUXUAI Bonus Country Gate und PRO Phase 1 - kombinierter Staging-Abschluss

Datum: 2026-09-11

Branch: `codex/pro-phase-1-entitlement-lifecycle`

Staging: `bwhvfjuwixgwduoeqaya`

Production: `fuqhljgesclipzduhykl` (nicht aufgerufen oder geaendert)

## Ursache

Das regulare AT-Onboarding scheiterte im Legal-Paket-Backfill. Die private
`SECURITY DEFINER`-Funktion `ensure_restaurant_legal_templates()` versuchte vor
dem konfliktfreien Wiederverwenden eines vorhandenen Profils einen landlosen
Placeholder in `restaurant_legal_profiles` einzufuegen. Der Country Guard
blockierte diesen Altpfad korrekt mit `COUNTRY_REQUIRED`.

## Geaenderte Dateien

- `supabase/migrations/20260911006000_legal_template_country_guard_compatibility.sql`
- `tests/legal-template-country-guard-compatibility.test.mjs`
- `docs/reports/2026-09-11_COUNTRY_PRO_COMBINED_PHYSICAL_GATE_REPORT.md`
- `docs/reports/assets/2026-09-11_country_pro_combined_gate/01-onboarding-complete.png`
- `docs/reports/assets/2026-09-11_country_pro_combined_gate/02-owner-basic-plan.png`
- `docs/reports/assets/2026-09-11_country_pro_combined_gate/03-owner-offers.png`

Direkte Statushinweise wurden zusaetzlich im Changelog, im kanonischen
Produktvertrag und im bestehenden PRO-Phase-1-Bericht fortgeschrieben.

## Was wurde geaendert

Die additive Forward-Migration ersetzt nur die gemeinsame private Funktion.
Sie entfernt den landlosen Placeholder-Insert und verlangt ein bereits
vorhandenes, vollstaendiges tenantgebundenes Legal-Profil. Fehlende Profile
brechen mit `LEGAL_PROFILE_REQUIRED`, unvollstaendige Profile mit
`LEGAL_PROFILE_INCOMPLETE` ab. Ein Country-Code wird weder erfunden noch auf
`AT` vorbelegt.

Funktionssignatur, Rueckgabe, `SECURITY DEFINER`, Owner `postgres`, fester
`search_path = public, extensions`, private Grants, RLS, Country Guard,
Legal-Inhalte, Dokumentversionen, Zustimmungen und Retention-Backfill blieben
unveraendert. Der Legal-/Retention-Funktionsteil ist byte-identisch mit der
Baseline; beide SHA-256-Werte lauten
`aee28d3452b27276a7276fd411d51e18bfe197f0eb3c3f587f5a804c96632958`.

## Automatisierte und Datenbankpruefungen

- 88/88 fokussierte Legal-, Country-, PRO- und Berechtigungstests: PASS.
- 1504/1504 Gesamttests: PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 9 vorhandene Warnungen.
- Build mit lokaler, nicht ausgegebener Staging-Konfiguration: PASS.
- Secret Scan: 69 geaenderte/ungetrackte Dateien, 0 Treffer.
- `git diff --check`: PASS.
- Staging-Migration-History: 147/147, keine Abweichung.
- Post-Dry-Run: keine offene Migration.
- DB-Linter: keine neue Meldung fuer die geaenderte Funktion; vorhandene
  projektweite Warnungen bleiben ausserhalb dieses Scopes.
- Rollback-Matrix vor dem physischen Abschluss: vollstaendiges Profil,
  fehlendes Profil, unvollstaendiges Profil, blockiertes Land, Cross-Tenant,
  Idempotenz und Onboarding: PASS.
- Mehrfachaufrufe veraendern die fuenf Legal-Dokumente und Versionen nicht;
  Eindeutigkeitsregeln und die vorhandenen konfliktfreien Inserts verhindern
  Duplikate.

## Physischer Staging-Flow

1. **Onboarding-Abschluss - gesund.** Die bereits gelesene Kassa-Bestaetigung
   wurde im bestehenden Owner-Testkonto wieder aktiviert. Ein einziger Klick
   auf `Restaurant starten` wechselte zum aktiven Owner-Dashboard.
2. **Country-Nachweis - gesund.** Betriebsland und Legal-/Geschaeftsland sind
   `AT`. Das Onboarding- und Country-Audit enthalten jeweils genau einen
   Abschluss. Es existiert kein erlaubendes Audit fuer ein blockiertes Land.
3. **Owner-Plan - gesund.** Die Abo-Seite zeigt die aktive kostenlose
   BASIC-Testphase mit 59 EUR monatlichem Zielpreis und ohne automatische
   Abrechnung. Der serverseitige Resolver liefert `BASIC`.
4. **Angebotsvertrag - gesund.** Die Owner-Angebotsseite zeigt `BASIC` und
   `0 / 5` aktive Angebote. Die serverseitigen effektiven Werte sind Limit 5,
   Offer Notifications aus und Reward Notifications aus.
5. **Override-/Schreibschutz - gesund.** Kein aktiver oder zukuenftiger
   Plan-Override besteht. Aktivierung und Beendigung sind je einmal auditiert.
   `authenticated` besitzt keine Insert-, Update- oder Delete-Rechte auf
   Subscription- oder Override-Tabellen.

Die gespeicherte Branch-Adresse ist vollstaendig und wurde ueber den normalen
Onboarding-Vertrag uebernommen. Koordinaten sind noch nicht gesetzt; deshalb
bleibt die separate oeffentliche Standortfreigabe korrekt aus und das
Dashboard verweist auf `Restaurant veroeffentlichen`. Dieser Zustand umgeht
den Country Guard nicht und ist kein Bestandteil der Planfreigabe.

## Was wurde nicht geaendert

- Keine Legal-Inhalte, Dokumentversionen oder Zustimmungen geaendert.
- Keine Country-Policy und kein blockiertes Land aktiviert.
- Kein neuer Trial, keine PRO-Reaktivierung und keine Stripe-Zahlung.
- Kein Owner-Schreibrecht auf Subscription oder Override.
- Vergleichsbetrieb `Kaffee Konditorei baeckerei`: identische Restaurant- und
  Branch-Hashes, weiterhin 13 Gaeste.
- Keine Production-Migration, kein Production-Deployment und kein Zugriff auf
  Production-Daten.

## UI- und Accessibility-Evidenz

- `01-onboarding-complete.png`: aktives Owner-Dashboard nach einmaligem Abschluss.
- `02-owner-basic-plan.png`: lesende Abo-/Testphasenansicht.
- `03-owner-offers.png`: BASIC und `0 / 5` aktive Angebote.

Die Screens wurden im vom Founder gewaehlten Codex-In-App-Browser physisch
geprueft. Die Screenshots belegen Darstellung und Navigation; sie ersetzen
keine vollstaendige Screenreader- oder Tastaturpruefung.

## Risiken

- Die noch fehlenden Standortkoordinaten blockieren weiterhin die oeffentliche
  Restaurantsuche. Das ist ein separater, sichtbarer Owner-Schritt und kein
  Country- oder PRO-Sicherheitsfehler.
- Die bestehenden DB-Linter-Warnungen wurden nicht in diesen eng begrenzten
  Forward-Fix einbezogen.

## Status

- Country Launch Gate: **FINAL LOCK**.
- PRO Phase 1: **FINAL LOCK**.
- Production: **UNCHANGED**.
