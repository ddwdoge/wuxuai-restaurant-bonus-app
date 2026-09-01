# V1 Bonus-Aktivitätsprotokoll - Bestands- und Legal-Audit

Datum: 28.07.2026
Branch: `codex/v13-legal-maps-hardening`
Ausgangscommit: `3b3878a54ac58f7140ab7120107f25984ed0507c`

## Abgrenzung

WUXUAI ist ein technisches Bonusprogramm- und Einlösungsprotokoll. Es ist keine
Registrierkasse, kein RKSV-, Kassenbeleg-, Buchhaltungs- oder Steuersystem.
Kassentechnisch, buchhalterisch oder steuerlich relevante Vorgänge muss das
Restaurant in seinem eigenen System erfassen.

Alle neuen Rechtstexte sind mit `LEGAL_REVIEW_REQUIRED` beziehungsweise
`DRAFT_LEGAL_REVIEW_REQUIRED` markiert.

## Bestand

| Prüfpunkt | Ergebnis vor Umsetzung |
| --- | --- |
| Jede erfolgreiche Einlösung dauerhaft gespeichert | Teilweise; verteilt auf Codes, Events und Geschenkzuweisungen |
| Löschung möglich | Ja; historische Cascades und Admin-Policies verhindern Journalqualität |
| Historische Überschreibung möglich | Ja; Export las aktuelle Reward-Stammdaten |
| Rewardarten eindeutig | Punkte, Welcome und Birthday; weitere Arten ohne aktiven V1-Flow |
| Rewardname zum Einlösezeitpunkt | Teilweise in Code-Metadaten |
| Punkteverbrauch und Menge | Punkte im Redemption-Event; Menge nicht als Journalfeld |
| Ausführende Rolle | Im Audit, nicht als stabiler Report-Snapshot |
| Stornohistorie | Kein vollständiger, begründeter Journalstorno |
| Monatsreport | Nein |
| Jahresreport | Nein |
| Export | Geschützter CSV-Grundvertrag über `get_reward_accounting_export` |
| Aktuelle statt historische Stammdaten | Rewardname, Kategorie und Produktpreis |
| Tenant-Isolation | Bestehender Export prüfte Restaurantadmin; kein Branchfilter |

## Bestehende Tabellen

- `redemption_codes`: sichere Einmalverwendung und Abschlusszeitpunkt
- `reward_redemption_events`: Punkteverbrauch bei Punkteeinlösung
- `customer_rewards`: Welcome-/Birthday-Zuweisung und Status
- `coupon_redemptions`: Legacy-Einlösungen ohne historische Snapshots
- `points_transactions`: Punktebewegungen
- `audit_log`: sicherheitsrelevante Ereignisse und Testsession-Zuordnung

Referral aktiviert derzeit Bonus Boost und keine eigene Reward-Einlösung.
Promotionsaktionen und manuelle Kompensation besitzen keinen aktiven V1-Flow.
Diese Produktlogik wurde nicht erfunden oder erweitert.

## Bestehender Export-RPC

`get_reward_accounting_export` wird nicht entfernt. Die Signatur bleibt
erhalten und der Datenursprung wird auf das neue Journal umgestellt.
Historische Lücken werden niemals aus heutigen Stammdaten ergänzt.

Snapshotstatus:

- `complete`
- `partial_legacy`
- `missing_source_data`

## Rollen und Datenschutz

- Report-RPCs: nur Owner und Restaurantadmin
- Manager/Staff: kein Gesamtbericht und kein Export
- Branchfilter: serverseitig auf dasselbe Restaurant begrenzt
- Journal: keine direkten Browser-Schreibrechte
- Exporte: keine Tokens, Telefonnummern, Geburtstage oder vollständigen Codes
- Kundenreferenz: stabil pseudonymisiert
- Testkunden: standardmäßig ausgeschlossen

Ein finaler AVV ist nicht als abgeschlossene Fassung nachgewiesen. Die
Struktur wurde unter `docs/legal/V1_BONUS_ACTIVITY_LEGAL_PLACEHOLDERS.md`
vorbereitet und bleibt `LEGAL_REVIEW_REQUIRED`.

## Offene externe Prüfungen

- rechtliche Bewertung der Kassenabgrenzung und Owner-Verantwortung
- datenschutzrechtliche Rollen und AVV
- Aufbewahrungsdauer des unveränderbaren Protokolls
- zulässige interne Planungswerte
- Behandlung eines Protokollstornos gegenüber Kassensystem und Punktebestand

Status: `CHANGES_REQUIRED` bis Staging-Migration, Rollen-E2E und externe Prüfung.
