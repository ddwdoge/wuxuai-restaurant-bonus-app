# V1 Open Migrations and Offers Staging E2E Report

Datum: 2026-08-04  
Umgebung: `wuxuai-bonus-staging` (`bwhv...qaya`)  
Branch: `dev`  
Ausgangscommit: `f24eb7f195d9d196ade6997b638ed614e7741202`

## Ergebnis

Die sechs lokal offenen Migrationen wurden nach Dry-Run und Sicherheitspruefung in der vorgesehenen Reihenfolge ausschliesslich auf Staging angewendet. Die lokale und die Remote-Migrationshistorie sind anschliessend vollstaendig synchron; der finale Dry-Run meldet `Remote database is up to date`.

Die oeffentlichen Angebots- und Finder-RPCs sowie die anonymen Zugriffsgrenzen wurden live gegen Staging geprueft. Ein vollstaendiger authentifizierter Owner-, Customer- und Finder-E2E-Lauf konnte nicht abgeschlossen werden, weil keine Testzugangsdaten im Repository vorhanden sind. Die vorhandenen vier Auth-Benutzer wurden nicht veraendert. Es wurden keine Konten, Tenantdaten oder Zugangsdaten erfunden.

Status: **READY_FOR_STAGING_E2E**

## Vorpruefung

- Working Tree: bereits vor Beginn umfangreich geaendert; keine vorhandene Aenderung wurde verworfen.
- Verbundenes Projekt: `wuxuai-bonus-staging`, Region `eu-west-1`, Status `ACTIVE_HEALTHY`.
- Production: nicht verbunden und nicht veraendert.
- Lokaler Supabase-Status: wegen fehlendem Docker/Podman nicht verfuegbar; fuer die eindeutig bestaetigte Remote-Staging-Verbindung nicht erforderlich.
- Remote-Ausgangsstand: Migrationen bis einschliesslich `20260803003000` registriert.
- Dry-Run vor Anwendung: exakt die folgenden sechs Migrationen, keine weitere Migration.

## Offene Migrationen und Reihenfolge

| Reihenfolge | Migration | Bereich | Ergebnis |
| ---: | --- | --- | --- |
| 1 | `20260803004000_aggregate_partner_local_finder.sql` | Partnerlokal-Finder | Erfolgreich |
| 2 | `20260803005000_wuxuai_legal_packet_v0_9_templates.sql` | Legal-Paket V0.9 | Erfolgreich |
| 3 | `20260803006000_owner_dashboard_notice_views.sql` | Owner-Dashboard-Hinweise | Erfolgreich |
| 4 | `20260803007000_points_redemption_presentation_window.sql` | Punkte-Praesentationsfenster | Erfolgreich nach dokumentiertem Guard-Fix |
| 5 | `20260803008000_points_presentation_legal_template.sql` | Legal-Template Praesentationsfenster | Erfolgreich |
| 6 | `20260804001000_restaurant_offers_v1.sql` | Aktuelles & Angebote V1 | Erfolgreich |

Angewendet mit `npx supabase db push --include-all`. Es traten keine SQL-Fehler auf und keine Migration wurde uebersprungen.

## Sicherheitspruefung vor Anwendung

### Partnerlokal-Finder

- Oeffentliche Ausgabe ist auf freigegebene Partnerlokale und benoetigte Felder begrenzt.
- Restaurantbezogene Kundendaten werden nur nach serverseitiger Token-Hash-Pruefung ergaenzt.
- Keine PII-Ausgabe und keine direkten Tabellenrechte fuer anonyme Nutzer.
- RPC-Ausfuehrung ist auf `anon` und `authenticated` begrenzt.

### Legal-Paket V0.9

- Additive, versionierte Mastertemplates.
- Alle Texte bleiben `DRAFT_LEGAL_REVIEW_REQUIRED`.
- Kein Template wurde als `REVIEWED` oder anwaltlich freigegeben markiert.
- Bestehende Restaurant-Dokumentversionen werden nicht ueberschrieben.

### Owner-Dashboard-Hinweise

- Tabelle mit aktiver RLS.
- Lesen und Erstellen nur fuer den zugeordneten Benutzer und berechtigten Restaurantkontext.
- Keine anonymen Schreibrechte und keine pauschalen Update-/Delete-Rechte.

### Punkte-Praesentationsfenster

- RLS aktiv; direkte Tabellenrechte entzogen.
- Serverzeit, 15-Minuten-Fenster, atomare Punkte-/Journal-/Praesentationsverarbeitung und Idempotenz bleiben serverseitig.
- Vor Anwendung wurde ein NULL-Fail-open im Owner-/Support-Guard gefunden und minimal korrigiert: `current_platform_role()` wird nun mit `coalesce(..., '')` ausgewertet.
- Der Guard-Fix wurde durch den bestehenden Migrationstest abgesichert.

### Punkte-Praesentations-Legal-Template

- Additives Draft-Template.
- Keine bestehenden publizierten Restaurantdokumente veraendert.
- Kein Legal-Review-Status hochgestuft.

### Aktuelles & Angebote

- Eigene Tabellen mit aktiver RLS; direkte Browser-Schreibrechte entzogen.
- Kleine, zweckgebundene `SECURITY DEFINER`-RPCs mit festem `search_path`.
- Owner-Zugriff wird serverseitig restaurantbezogen autorisiert.
- Maximal fuenf aktive Angebote werden serverseitig und mit Advisory Lock durchgesetzt.
- Oeffentliche Abfrage liefert nur aktive, zeitlich gueltige Inhalte.
- Angebotsmetriken sind aggregiert; keine Kunden-PII und kein individueller Kundenverlauf.
- Angebote sind von Punkten, Rewards und Einloesungen fachlich getrennt.

## Migrationssynchronitaet

- Lokale Migrationen: synchron bis `20260804001000`.
- Remote-Migrationen: synchron bis `20260804001000`.
- Remote-only Migrationen: keine.
- Lokal fehlende Remote-Migrationen: keine.
- Versionskonflikte: keine festgestellt.
- Finaler Dry-Run: `Remote database is up to date`.
- Schema-Drift: keine in der Migrationshistorie festgestellt.

## Live-Staging-Pruefungen

### Oeffentliche RPCs und Zugriffsgrenzen

| Pruefung | Ergebnis |
| --- | --- |
| `get_public_restaurant_offers` als anon | HTTP 200, leere Ergebnisliste |
| `get_partner_local_finder` als anon | HTTP 200, leere Ergebnisliste |
| Public-Event mit unbekannter Restaurant-ID | Sicher `false`, keine Tabellenfreigabe |
| `list_restaurant_offers` als anon | HTTP 401 / Zugriff verweigert |
| Direkter anon-Read `restaurant_offers` | HTTP 401 / Zugriff verweigert |
| Direkter anon-Read `restaurant_offer_metrics` | HTTP 401 / Zugriff verweigert |
| Direkter anon-Read `points_redemption_presentations` | HTTP 401 / Zugriff verweigert |
| Direkter anon-Read `owner_dashboard_notice_views` | HTTP 401 / Zugriff verweigert |

Die lokale Customer-Seite `/customer/offers` wechselte nach der Migration vom RPC-Fehler in den gueltigen Empty State `Noch nichts Neues`.

### Owner-E2E

Nicht vollstaendig ausgefuehrt. Die Owner-Route leitet ohne gueltige Sitzung korrekt zum Restaurant-Login. Es sind vier Staging-Auth-Benutzer vorhanden, aber keine Testzugangsdaten im Repository. Deshalb wurden Entwurf, Bild-Upload, Vorschau, Veroeffentlichung, Planung, Deaktivierung, Duplizierung, Archivierung, Reload und die serverseitige Grenze fuer das sechste aktive Angebot nicht live durch einen Owner ausgefuehrt.

Die zugehoerigen automatisierten Vertrags-, RLS-, Status- und Limit-Tests sind erfolgreich.

### Customer-E2E

Der anonyme Empty State und der oeffentliche RPC wurden live geprueft. Mangels veroeffentlichtem Testangebot konnten Sichtbarkeit von aktiven, geplanten, abgelaufenen und deaktivierten Angeboten sowie die Drei-Angebote-Priorisierung nicht mit echten Staging-Daten durchgespielt werden. Es wurde keine Punkte-, Reward- oder Einloeseaktion ausgeloest.

### Zentrale Aktuelles-Seite und Finder

Die Seiten und RPCs sind erreichbar. Der Finder lieferte aktuell keine oeffentlich freigegebenen Standorte. Priorisierung nach Besuch, Punktestand und Entfernung, Finder-Badges, Standortfreigabe sowie die Detailkarte mit realem Angebot bleiben deshalb offene Live-Gates. Anonyme Nutzer erhalten ueber die getesteten RPCs keine persoenlichen Punktedaten.

### Analytics

Die Events `OFFER_VIEWED`, `OFFER_CTA_CLICKED`, `OFFER_ROUTE_CLICKED` und `OFFER_BONUS_OPENED` sind im Vertrag vorgesehen und werden aggregiert gespeichert. Es werden keine PII oder individuellen Kundenverlaeufe gespeichert. Ein dediziertes oeffentliches Rate Limit fuer Event-Aufrufe ist nicht nachgewiesen und bleibt als Risiko offen.

## Responsive und Accessibility

Der oeffentliche Empty State wurde bei 390, 430, 768, 1024, 1280 und 1440 Pixeln im Browser geprueft:

- `document.documentElement.scrollWidth === window.innerWidth` bei allen Breiten.
- Kein horizontaler Overflow.
- Keine sichtbare Bedieneinheit unter 44 x 44 Pixeln im geprueften Empty State.
- Deutsche Ueberschrift und Empty-State-Texte sichtbar.

Nicht abschliessend live geprueft:

- authentifizierte Owner-Formulare und alle Angebotskarten,
- 200-Prozent-Zoom,
- physisches Mobile Safari,
- installierte PWA,
- Screenreader-Grundtest,
- vollstaendige Tastaturbedienung der Owner-CRUD-Flows.

## Qualitaet

- Typecheck: erfolgreich.
- Lint: 0 Fehler, 6 bestehende Warnungen.
- Tests: 603/603 erfolgreich.
- Build: erfolgreich.
- `git diff --check`: erfolgreich.
- Browserkonsole/Network: kein vollstaendiger authentifizierter Live-Nachweis; keine unerwarteten Fehler im geprueften oeffentlichen Empty State beobachtet.

## Was nicht veraendert wurde

- Keine Production-Migration.
- Kein Production-Deployment.
- Kein Push und kein Merge.
- Keine RLS-Lockerung.
- Keine Legal-Texte als geprueft markiert.
- Keine Testkonten oder Tenantdaten erzeugt, veraendert oder geloescht.
- Keine bestehende Punkte-, Reward- oder Einloeselogik ersetzt.

## Offene Risiken und naechste Aktion

1. Authentifizierten Staging-Owner bereitstellen und den vollstaendigen Angebots-CRUD-Flow inklusive sechstem aktivem Angebot testen.
2. Mindestens ein aktives, ein geplantes, ein abgelaufenes und ein deaktiviertes Testangebot anlegen und Customer-/Finder-Sichtbarkeit live pruefen.
3. Owner-A/Owner-B- und Staff-Negativtests mit getrennten Staging-Rollen durchfuehren.
4. Oeffentliches Event-Rate-Limit fachlich entscheiden und gegebenenfalls additiv absichern.
5. Physical Mobile Safari, installierte PWA, 200-Prozent-Zoom, Tastatur und Screenreader pruefen.

Bis diese Gates abgeschlossen sind, ist der Stand migrationsseitig bereit, aber nicht fuer Merge Review freigegeben.
