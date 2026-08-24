# WUXUAI Bonus V1 - Legacy Document Index

Status: **ACTIVE FREEZE**
Authoritative contract: `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`

Historische Abschnitte und Reports bleiben als Nachweis erhalten, duerfen aber
nicht als aktuelle Implementierungsanweisung verwendet werden.

| Legacy-Regel | Aktuelle Regel | Betroffene historische Dokumente |
| --- | --- | --- |
| Sichtbarer Name `WUXUAI Restaurant Bonus`, `Mein WUXUAI` oder `Mein Bonus` | `WUXUAI Bonus`, Kundenbereich `Meine Vorteile` | `00`, `01`, `02`, `04`, `05`, `06`, `09`, `17`, Changelog vor 2026-08-24 |
| Customer ohne E-Mail/Passwort oder token-only als zentrale Identitaet | Supabase Auth, Doppelpasswort, E-Mail-Bestaetigung und Legal-RPC | alte Abschnitte in `05`, `09`, `17`, `19` |
| `register_restaurant_customer` oder `register_referral_customer` im aktiven Client | nur jeweilige `*_legal`-RPC | alte API-/Flow-Abschnitte und Reports |
| Sechsstelliger Code als primaerer normaler Einloeseflow | 15-Minuten-Live-Praesentation; Codes nur Legacy-Kompatibilitaet | `05`, `06`, `10`, `17`, `23`, `24` vor der Entscheidung vom 03./09.08.2026 |
| Referral Default 30 Tage, 14/30/60 oder 7/14/30/60/90, gleiche Dauer fuer beide | Default 14; 7/14/28/Custom; Referrer 100 %, Freund 50 %, max. 2x | alte Abschnitte in `01`, `05`, `09`, `12`, `14`, `17`, `19` |
| Multiplikator 3x oder stapelbare Multiplikatoren | maximal 2x; weitere Referrals verlaengern nur Zeit | alte Referral-Migrationen und historische Reports |
| Manuelle Latitude/Longitude als Pflicht | Address-only Owner-Flow, serverseitiges Nominatim | alte Standortberichte und Screenshots |
| Staff-Codepruefung als normale Hauptaktion | QR primaer, Navigation Start/QR/Tages-PIN/Suchen/Mehr | alte Staff-Abschnitte und Reports |

## Aktive Fachdateien mit historischen Abschnitten

Die Dateien `docs/05_CUSTOMER_PORTAL.md`, `docs/06_STAFF_PORTAL.md`,
`docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`, `docs/17_CTO_ENTSCHEIDUNGEN.md`,
`docs/19_CHANGELOG.md`, `docs/23_API_RPC_REGELN.md` und
`docs/24_SECURITY_PRIVACY.md` enthalten historische Entscheidungen. Bei jedem
Widerspruch gilt zuerst der Canonical Contract und danach der neueste deutlich
als CURRENT LOCK gekennzeichnete Abschnitt.

## Historische Artefakte

- Reports unter `docs/reports/` beweisen nur den damaligen Arbeitsstand.
- ZIPs unter `exports/` sind Pruefarchive, keine Source of Truth.
- Historische Migrationen werden niemals umgeschrieben, um aktuelle Regeln
  darzustellen. Aenderungen erfolgen ausschliesslich als Forward-Migration.
