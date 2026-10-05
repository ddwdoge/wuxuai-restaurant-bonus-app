-- Exact, unpublished counsel-review inputs from the 2026-10-05 platform ZIP.
-- This registry is deliberately disconnected from the AT intake, restaurant
-- publication, customer join, and marketing paths. A future approval requires
-- a separately reviewed migration and an authenticated admin workflow.
begin;

create table public.platform_legal_document_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  document_type text not null check (document_type in (
    'platform_terms', 'participation_terms', 'platform_privacy',
    'owner_privacy', 'staff_privacy', 'cookie_tracking', 'platform_imprint'
  )),
  version text not null check (version ~ '^[A-Za-z0-9_.-]{3,80}$'),
  locale text not null default 'de-AT' check (locale = 'de-AT'),
  source_zip_sha256 text not null check (source_zip_sha256 ~ '^[0-9a-f]{64}$'),
  source_entry text not null,
  source_origin text not null default 'COUNSEL_REVIEW_PACKAGE'
    check (source_origin = 'COUNSEL_REVIEW_PACKAGE'),
  body_markdown text not null check (length(body_markdown) between 1 and 100000),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  review_status text not null default 'DRAFT_LEGAL_REVIEW_REQUIRED'
    check (review_status = 'DRAFT_LEGAL_REVIEW_REQUIRED'),
  published_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (document_type, version, locale),
  check (published_at is null),
  check (content_sha256 = encode(extensions.digest(convert_to(body_markdown, 'UTF8'), 'sha256'), 'hex'))
);

alter table public.platform_legal_document_versions enable row level security;
revoke all on table public.platform_legal_document_versions
  from public, anon, authenticated, service_role;
create trigger platform_legal_document_versions_append_only
  before update or delete or truncate on public.platform_legal_document_versions
  for each statement execute function public.protect_legal_bundle_append_only();

-- There is no browser-facing draft reader and no publication RPC.
-- This is an explicit review artifact, not an acceptance-eligible document.

insert into public.platform_legal_document_versions (
  document_type, version, source_zip_sha256, source_entry, body_markdown, content_sha256
) values
  ('platform_terms', '2026-10-05-review-1', 'da5380979a7d3954936ab48fb7a904ef8f8d638304ffc2951aaeaac58ee320ac', '01_Plattform/01_WUXUAI_Plattform_Nutzungsbedingungen_Prueffassung.md', '# WUXUAI® LEGAL-PRÜFFASSUNG

**Arbeitsfassung zur rechtlichen Prüfung durch eine österreichische Kanzlei**  
**Nicht zur Veröffentlichung / nicht als finale Rechtsberatung verwenden**

Grundlage: aktuelles WUXUAI® Legal-System (Fassung 20, 30.09.2026) und reale App-Architektur:
zentrales WUXUAI® Plattformkonto → Discovery → aktiver Beitritt zu einem Merchant → tenantgebundene Membership → Loyalty/Bonus → getrennte Marketing-Einwilligungen.

Offene Rechtsfragen sind als **PRÜFPUNKT KANZLEI** markiert.

# WUXUAI® Plattform-Nutzungsbedingungen für Verbraucher – Prüffassung

## 1. Anbieterin und Geltungsbereich
Vorgesehen ist die **WUXUAI Digital & Trading GmbH** als Plattformbetreiberin nach Firmenbucheintragung. Vollständige Anbieterangaben sind vor Veröffentlichung einzusetzen. Die WU & XU Group GmbH bleibt im Zielmodell IP-Inhaberin und ist nicht Endkunden-Vertragspartnerin.

**PRÜFPUNKT KANZLEI:** finale Anbieterin und Außenauftritt bestätigen.

## 2. Gegenstand
Die Plattform ermöglicht insbesondere:
- zentrales Kundenkonto,
- persönlichen Kunden-QR,
- öffentliche Discovery/Karte,
- öffentliche Merchant-Profile und Angebote,
- aktiven Beitritt zu einzelnen Merchants,
- Verwaltung von Memberships,
- Loyalty-Funktionen nach wirksamem Beitritt.

## 3. Zentrales Konto
Das Plattformkonto ist von einzelnen Merchant-Memberships getrennt. Nutzer müssen richtige Daten angeben, Zugangsdaten schützen und Sicherheitsvorfälle melden.

## 4. Vertragsschluss / Terms-Nachweis
Vertrag erst nach Registrierung + aktiver Bestätigung der Plattformbedingungen.
Zu speichern:
`customer_id`, `document_id`, `terms_version`, `terms_hash`, `accepted_at`, Sprache, Quelle, Audit-Event.

Keine vorangekreuzte Pflichtcheckbox. Datenschutzerklärung separat verlinken.

## 5. Kosten
Zentrales Kundenkonto derzeit kostenlos.

**PRÜFPUNKT KANZLEI:** FAGG/VGG bei kostenloser digitaler Leistung prüfen.

## 6. Discovery
Public Discovery zeigt nur vom Merchant freigegebene Daten. Browsing, Karte oder Angebotsansicht erzeugen keine Membership. Discovery ist keine Kundenlistenweitergabe.

## 7. Merchant-Verhältnis
Ein Nutzer kann mehreren Merchants beitreten. Erst der aktive Join erzeugt eine tenantgebundene Membership.

**PRÜFPUNKT KANZLEI:** zivilrechtliche Rolle von WUXUAI und Merchant beim Join festlegen.

## 8. Kein automatischer Besuch / keine Punkte
Der digitale Join gilt nicht als Besuch, Kauf, qualifizierende Aktivität, Punktegutschrift, Einlösung oder Zahlung.

## 9. Marketing
Plattformnutzung ist nicht von Marketing abhängig. Getrennte Consents für WUXUAI und jeden Merchant sowie je Kanal.

## 10. Notwendige Kommunikation
Konto-, Sicherheits- und Vertragsinformationen sind von Werbung zu trennen.

## 11. Kunden-QR
Nur technisch erforderliche Daten; keine unnötige Offenlegung personenbezogener Daten.

## 12. Verbotene Nutzung
Insbesondere Manipulation von Punkten/Rewards/Gifts, Cross-Tenant-Zugriffe, fremde Accounts, Umgehung von Sicherheitsmechanismen, rechtswidrige oder automatisierte missbräuchliche Zugriffe.

## 13. IP
Software, Marke, Domains und zentrale Plattformbestandteile stehen im Zielmodell bei der Holding bzw. werden der Digital GmbH lizenziert. Nutzer erhalten kein Recht an Quellcode/Marke/Design.

## 14. Haftung / Gewährleistung
WUXUAI bleibt für eigene technische Pflichten verantwortlich; Merchant für eigene fachliche Zusagen.

**PRÜFPUNKT KANZLEI:** wirksame Verbraucherklauseln formulieren.

## 15. Änderungen
Sicherheitsupdates/Fehlerbehebungen nach zulässiger Änderungsregel. Wesentliche Änderungen nicht rückwirkend durch Schweigen fingieren.

## 16. Kontolöschung
Gesamtes WUXUAI-Konto getrennt vom Austritt aus einzelnen Merchant-Memberships behandeln.

## 17. Minderjährige
Derzeit 14 Jahre vorgesehen.

**PRÜFPUNKT KANZLEI:** Vertragsrecht, DSGVO, Jugendschutz und Marketing bestätigen.

## 18. Recht / Streitbeilegung
Österreichisches Recht soweit zulässig; zwingender Verbraucherschutz bleibt unberührt. Kein veralteter EU-ODR-Link.
', 'feb6bc7f984d3c5de6968792b74ccf5dc959c6747d285628e709157f315e88d6'),
  ('participation_terms', '2026-10-05-review-1', 'da5380979a7d3954936ab48fb7a904ef8f8d638304ffc2951aaeaac58ee320ac', '02_Merchant_Kundenprogramm/02_Merchant_Teilnahmebedingungen_Prueffassung.md', '# WUXUAI® LEGAL-PRÜFFASSUNG

**Arbeitsfassung zur rechtlichen Prüfung durch eine österreichische Kanzlei**  
**Nicht zur Veröffentlichung / nicht als finale Rechtsberatung verwenden**

Grundlage: aktuelles WUXUAI® Legal-System (Fassung 20, 30.09.2026) und reale App-Architektur:
zentrales WUXUAI® Plattformkonto → Discovery → aktiver Beitritt zu einem Merchant → tenantgebundene Membership → Loyalty/Bonus → getrennte Marketing-Einwilligungen.

Offene Rechtsfragen sind als **PRÜFPUNKT KANZLEI** markiert.

# Teilnahmebedingungen des Merchant-Kundenprogramms – Prüffassung

## 1. Programmanbieter
[MERCHANT NAME / Rechtsform / Adresse / E-Mail / Registerdaten]
WUXUAI stellt die technische Plattform.

## 2. Beziehung zum WUXUAI-Konto
Merchant-Membership ist ein eigener tenantgebundener Teilnahmevertrag.

## 3. Beitritt
Nur durch aktiven Join + Anzeige des konkreten Merchants + aktive Zustimmung zu dessen Teilnahmebedingungen. Browsing/Discovery erzeugt keine Membership.

## 4. Acceptance-Nachweis
Mindestens:
`customer_id`, `merchant_id`, `membership_id`, `joined_at`, `terms_version`, `terms_accepted_at`, `terms_hash`, Sprache, Anbieter-Snapshot, Programmversion, Audit-Event.

## 5. Punkte
Merchantgebunden, kein Geldguthaben, nicht bar auszahlbar, grundsätzlich nicht merchantübergreifend übertragbar. Join allein erzeugt keine Punkte.

## 6. Tages-PIN / Validierung
Tages-PIN ist zusätzliche Bestätigung, kein gemeinsamer Staff-Zugang. Individuelle Staff-Konten bleiben erforderlich.

## 7. Welcome Gift
Merchant definiert Berechtigung, Freischaltung, Einlösung, Gültigkeit und Missbrauchsschutz.

## 8. Rewards
Merchant definiert Punktebedarf, Inhalt, Verfügbarkeit, Gültigkeit und Einlösung. Bereits freigeschaltete Rewards nicht rückwirkend stillschweigend entwerten.

## 9. Geburtstag
Freiwillige Angabe; im bisherigen Modell nur Tag/Monat. Normale Teilnahme bleibt ohne Angabe möglich.

## 10. Einlösung
Technische und Staff-Validierung zulässig. Relevante Audit-Daten protokollieren. Mehrfacheinlösung einmaliger Ansprüche blockieren.

## 11. Angebote
Merchant verantwortlich für Inhalt, Richtigkeit, Zulässigkeit und Erfüllung.

## 12. Marketing
Separat, freiwillig, nicht vorangekreuzt. Widerruf ohne automatische Beendigung der Membership.

## 13. Fehlbuchungen
Meldbar und bei Berechtigung korrigierbar; Audit/Korrekturhistorie erhalten.

## 14. Missbrauch
Unberechtigt entstandene Punkte nach Prüfung korrigierbar. Rechtmäßig entstandene Ansprüche gesondert behandeln.

## 15. Kein allgemeiner Punkteverfall
Für BASIC V1 kein automatischer Verfall allein wegen Inaktivität.

## 16. Programmende / 60 Tage
Technischer 60-Tage-Abwicklungszustand. Keine neuen Beitritte/Gutschriften/Angebote; bestehende Ansprüche nur im freigegebenen Umfang. Keine automatische physische Löschung und kein automatisch implementierter Punkteverfall.

**PRÜFPUNKT KANZLEI:** Rechtswirkung nach Tag 60, Insolvenz, Sofortsperre, längere Rewards.

## 17. Haftung / Kontakt
Merchant für Merchant-Leistungen, WUXUAI für technische App-Leistung.

## 18. Änderungen
Neue Bedingungen nicht rückwirkend als akzeptiert behandeln.
', '1dd4670eeb74a99ac1fafc36e5064e7e87dcb2045e62c1a5f6223634252e05c7'),
  ('platform_privacy', '2026-10-05-review-1', 'da5380979a7d3954936ab48fb7a904ef8f8d638304ffc2951aaeaac58ee320ac', '03_Datenschutz/03_Datenschutzerklaerung_Plattformnutzer_Prueffassung.md', '# WUXUAI® LEGAL-PRÜFFASSUNG

**Arbeitsfassung zur rechtlichen Prüfung durch eine österreichische Kanzlei**  
**Nicht zur Veröffentlichung / nicht als finale Rechtsberatung verwenden**

Grundlage: aktuelles WUXUAI® Legal-System (Fassung 20, 30.09.2026) und reale App-Architektur:
zentrales WUXUAI® Plattformkonto → Discovery → aktiver Beitritt zu einem Merchant → tenantgebundene Membership → Loyalty/Bonus → getrennte Marketing-Einwilligungen.

Offene Rechtsfragen sind als **PRÜFPUNKT KANZLEI** markiert.

# WUXUAI® Datenschutzerklärung für Plattformnutzer – detaillierte Prüffassung

## 1. Verantwortliche / Kontakt
Vorgesehen: WUXUAI Digital & Trading GmbH. Vollständige Firmen- und Datenschutzkontaktdaten ergänzen.

## 2. Geltungsbereich
Konto, Login, Discovery/Karte, Merchant-Profile/Angebote, Join, Membership, Punkte, Rewards, Gifts, Einlösung, Marketing, Support.

## 3. Datenkategorien
- Kontodaten
- Auth-/Security-/Gerätedaten
- Kunden-QR
- Membership-Daten
- Loyalty-/Transaktionsdaten
- freiwillige Geburtstagsdaten
- Consent-/Marketingdaten
- Supportdaten

## 4. Kontoerstellung
Zweck: Konto, Login, QR, Membership-Verwaltung. Vorläufig Art. 6 Abs. 1 lit. b DSGVO.

## 5. Discovery
Nur öffentlich freigegebene Merchant-Daten. Browsing erzeugt keine Membership.

## 6. Öffentliche Angebote
Vor Membership sichtbar. Personalisierung/Tracking nur beschreiben, wenn tatsächlich vorhanden.

## 7. Merchant Join
Membership + Terms-Nachweis + Audit. Kein Join ohne gültige Terms-Version/Hash.

## 8. Merchant-Zugriff
Vor Join keine individuelle Kundensichtbarkeit. Nach Join nur freigegebene, erforderliche Daten.

## 9. Punkte
Customer, Merchant, Punktewert, Zeitpunkt, Vorgang, Audit/Korrektur.

## 10. Tages-PIN / Validierung
Merchant-, Staff-, Customer- und Validierungsereignisse nur soweit erforderlich.

## 11. Welcome Gifts
Berechtigung, Vergabe, Einlösung, Status.

## 12. Rewards
Schwelle, Freischaltung, Status, Gültigkeit, Einlösung.

## 13. Geburtstag
Freiwillig; bisher Tag/Monat.

## 14. Einlösung
Membership, Merchant, Reward/Gift, Zeitpunkt, Staff, Validierung, Audit.

## 15. Korrekturen
Ursprungsereignis, Korrekturgrund, Bearbeiter, Zeitpunkt, Audit.

## 16. Fraud/Missbrauch
Technische Events, auffällige Vorgänge, QR-/Reward-Missbrauch, Cross-Tenant-Versuche.

## 17. Private/Public Mode
Merchant-Sichtbarkeit ändert keine Kunden-Marketingpräferenzen.

## 18. Merchant-Marketing
Separate freiwillige Einwilligung je Merchant/Kanal.

## 19. WUXUAI-Marketing
Separate freiwillige Plattform-Einwilligung.

## 20. Vertrags-/Sicherheitsnachrichten
Von Werbung trennen.

## 21. Kanäle
E-Mail, In-App, Push/SMS später jeweils nach Zweck und Rechtsgrundlage trennen.

## 22. Support
Kontodaten, Membership, Loyalty-Vorgänge, technische Infos, Anfrageinhalt, Anhänge.

## 23. Sicherheitslogs
Kontosicherheit, Art. 32, Missbrauchsschutz. Frist risikobasiert festlegen.

## 24. Analytics
Nur tatsächlich eingesetzte Analytics beschreiben. Anonymität nur behaupten, wenn technisch belegt.

## 25. Cookies/SDKs
Notwendige Technologien getrennt von Analytics/Marketing.

## 26. Empfänger
Digital GmbH, Merchant nach Join, Hosting/Auth, Mail/Communication, Support/Monitoring, Berater, Behörden; Stripe nur für B2B-Billing. Holding nicht automatisch Empfängerin.

## 27. Auftragsverarbeiter
Nur für weisungsgebundene Verarbeitung; Providerliste/TOM/Subprozessoren/Transfers dokumentieren.

## 28. Drittlandtransfers
Nur tatsächliche Transfers nennen; ggf. Angemessenheitsbeschluss, DPF, SCC, Zusatzmaßnahmen.

## 29. Speicherfristen
Je Zweck/Datenart. 60-Tage-Businesszustand ≠ DSGVO-Löschfrist.

## 30. Programmende
Neue Aktivitäten können gesperrt werden; bestehende Ansprüche nach freigegebenen Regeln. Keine automatische Löschung.

## 31. Merchant verlassen
Membership separat beendbar. Auswirkungen auf Punkte, Rewards, Marketing und Historie rechtlich festlegen.

## 32. Konto löschen
Gesamtes Plattformkonto getrennt von Merchant-Austritt.

## 33. Minderjährige
14 Jahre vorgesehen, noch zu bestätigen.

## 34. Automatisierte Entscheidungen
Nur tatsächlich verwendete Verfahren beschreiben.

## 35. KI
Nur reale KI-Funktionen aufnehmen.

## 36. Betroffenenrechte
Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Widerruf, Beschwerde.

## 37. Datenschutzbehörde
Österreichische Datenschutzbehörde; Kontaktdaten vor Veröffentlichung aktualisieren.

## 38. Koordination WUXUAI / Merchant
Klare Zuständigkeit je Verarbeitung; keine ungeklärte Weiterleitung.

## 39. Änderungen
Versioniert und transparent.

## 40. Versionsverwaltung
Dokument-ID, Version, Sprache, Land, Veröffentlichungsdatum, effective_from, Archiv.

## 41. Offene Kanzleientscheidungen
Rollen, Art.26/28, Marketing, Alter, Fristen, Programmende, Tracking, Transfers, DSA/P2B, VGG/FAGG, KI/Recommendations.
', 'cb3a27e11d47c76f2dc6dab599960961e80ced825ff8f9a20e0658e019308cce'),
  ('owner_privacy', '2026-10-05-review-1', 'da5380979a7d3954936ab48fb7a904ef8f8d638304ffc2951aaeaac58ee320ac', '03_Datenschutz/04_Datenschutzhinweise_Merchant_Owner_Prueffassung.md', '# WUXUAI® LEGAL-PRÜFFASSUNG

**Arbeitsfassung zur rechtlichen Prüfung durch eine österreichische Kanzlei**  
**Nicht zur Veröffentlichung / nicht als finale Rechtsberatung verwenden**

Grundlage: aktuelles WUXUAI® Legal-System (Fassung 20, 30.09.2026) und reale App-Architektur:
zentrales WUXUAI® Plattformkonto → Discovery → aktiver Beitritt zu einem Merchant → tenantgebundene Membership → Loyalty/Bonus → getrennte Marketing-Einwilligungen.

Offene Rechtsfragen sind als **PRÜFPUNKT KANZLEI** markiert.

# Datenschutzhinweise Merchant / Owner – Prüffassung

## Daten
Firma, Rechtsform, Registerdaten, Betriebsanschrift, Kontakt, vertretungsbefugte Person, Owner-Login, Support, Paket/Vertrag, Trial/Entitlements, Billing, KYB, Audit/Security.

## Zwecke
B2B-Vertrag, Onboarding, KYB, Account, Support, Abrechnung, Entitlements, Security, gesetzliche Dokumentation.

## KYB
V1 manueller Registerabgleich. Keine automatische Firmenbuch-/GISA-/UID-Abfrage behaupten. Ausweiskopie nicht pauschal.

## Public Profile
Nur freigegebene Profilrevision veröffentlichen. Keine KYB-Dateien/Ausweise/interne Notizen veröffentlichen.

## Discovery Opt-in
Public Visibility nur nach aktiver Merchant-Freigabe. Private Nutzung bleibt möglich.

## Billing
Stripe/Provider nur beschreiben, soweit tatsächlich freigegeben.

## Trial/Pakete/Add-ons
Versionierte Annahmen; keine automatische kostenpflichtige Umwandlung; keine automatische Überschreitungsgebühr.

## Empfänger / Fristen / Rechte
Je tatsächlicher Provider- und Rechtslage.

## Offene Kanzleipunkte
KYB-Dokumente, Fristen, Stripe-Rollen, P2B/DSA, Data Act/Export, Staff-Schnittstelle.
', 'e3ce27ef88379af637ddbb5f444bbc0eeab2d8bc81d0a9436c4564b8f89deef0'),
  ('staff_privacy', '2026-10-05-review-1', 'da5380979a7d3954936ab48fb7a904ef8f8d638304ffc2951aaeaac58ee320ac', '03_Datenschutz/05_Datenschutzhinweise_Staff_Prueffassung.md', '# WUXUAI® LEGAL-PRÜFFASSUNG

**Arbeitsfassung zur rechtlichen Prüfung durch eine österreichische Kanzlei**  
**Nicht zur Veröffentlichung / nicht als finale Rechtsberatung verwenden**

Grundlage: aktuelles WUXUAI® Legal-System (Fassung 20, 30.09.2026) und reale App-Architektur:
zentrales WUXUAI® Plattformkonto → Discovery → aktiver Beitritt zu einem Merchant → tenantgebundene Membership → Loyalty/Bonus → getrennte Marketing-Einwilligungen.

Offene Rechtsfragen sind als **PRÜFPUNKT KANZLEI** markiert.

# Datenschutzhinweise Staff – Prüffassung

## Rolle
Staff handelt im Auftrag des Merchants; kein eigener Paketvertrag.

## Daten
Staff-ID, Login, Rolle, Merchant/Tenant, Security-Events, Punktebuchungen, Einlösungen, Tages-PIN-Validierung, Audit, Geräte-/Sessiondaten.

## Zwecke
Zugang, Rollensteuerung, Punkte, Einlösung, Missbrauchsschutz, Audit.

## Individuelle Accounts
Jede Person eigener Staff-Zugang. Tages-PIN ist kein gemeinsamer Account.

## Arbeitsrecht
**PRÜFPUNKT KANZLEI:** ArbVG/AVRAG, Betriebsrat, Mitarbeiterinformation, Verhältnismäßigkeit.

## Zugriff
Nur tenant-/rollenbezogen, kein Cross-Tenant-Zugriff.

## Ausscheiden
Zugang deaktivieren; Historie nur zweckgebunden.

## Rollen
Merchant für Beschäftigtendaten; Digital GmbH für eigene Security-Logs; sonst je Vorgang prüfen.
', 'a97726b177104b0fec1cefe2137054948300ea9044e2dc9e17e42c85595b82ac'),
  ('cookie_tracking', '2026-10-05-review-1', 'da5380979a7d3954936ab48fb7a904ef8f8d638304ffc2951aaeaac58ee320ac', '03_Datenschutz/06_Cookie_Tracking_Richtlinie_Prueffassung.md', '# WUXUAI® LEGAL-PRÜFFASSUNG

**Arbeitsfassung zur rechtlichen Prüfung durch eine österreichische Kanzlei**  
**Nicht zur Veröffentlichung / nicht als finale Rechtsberatung verwenden**

Grundlage: aktuelles WUXUAI® Legal-System (Fassung 20, 30.09.2026) und reale App-Architektur:
zentrales WUXUAI® Plattformkonto → Discovery → aktiver Beitritt zu einem Merchant → tenantgebundene Membership → Loyalty/Bonus → getrennte Marketing-Einwilligungen.

Offene Rechtsfragen sind als **PRÜFPUNKT KANZLEI** markiert.

# Cookie-, SDK- und Tracking-Richtlinie – Prüffassung

## Kategorien
A. technisch notwendig  
B. funktional  
C. Analytics  
D. Marketing/Advertising

Nur tatsächlich eingesetzte Technologien aufführen.

## Consent
- keine Vorbelegung optionaler Kategorien,
- Ablehnen ebenso einfach wie Akzeptieren,
- jederzeit änderbar,
- Nachweis versioniert.

## Je Provider dokumentieren
Anbieter, Zweck, Daten, Laufzeit, Drittland, Rechtsgrundlage, Link zur Anbieterinformation.

## Web/PWA/Mobile
Cookies, Local Storage, SDKs, Push-Tokens getrennt prüfen.

## Offene Kanzleipunkte
§165 TKG 2021, Analytics/Crash, Push/SDK, Drittlandtransfer, Aufbewahrung.
', '6c814a41a76e1ece870d4642b8c49c1f62c7ab1a7b56858fea41abfb319e1d72'),
  ('platform_imprint', '2026-10-05-review-1', 'da5380979a7d3954936ab48fb7a904ef8f8d638304ffc2951aaeaac58ee320ac', '05_Impressum/08_WUXUAI_Plattform_Impressum_Prueffassung.md', '# WUXUAI® LEGAL-PRÜFFASSUNG

**Arbeitsfassung zur rechtlichen Prüfung durch eine österreichische Kanzlei**  
**Nicht zur Veröffentlichung / nicht als finale Rechtsberatung verwenden**

Grundlage: aktuelles WUXUAI® Legal-System (Fassung 20, 30.09.2026) und reale App-Architektur:
zentrales WUXUAI® Plattformkonto → Discovery → aktiver Beitritt zu einem Merchant → tenantgebundene Membership → Loyalty/Bonus → getrennte Marketing-Einwilligungen.

Offene Rechtsfragen sind als **PRÜFPUNKT KANZLEI** markiert.

# WUXUAI® Plattform-Impressum – Prüffassung

## Plattformbetreiberin / Medieninhaberin
**WUXUAI Digital & Trading GmbH**  
[Geschäftsanschrift]  
[PLZ Ort], Österreich  
E-Mail: [SUPPORT]  
Schnelle Kontaktmöglichkeit: [Telefon/Supportformular]

Firmenbuchnummer: [FN]  
Firmenbuchgericht: [Gericht]  
UID: [ATU…]  
Geschäftsführung: [laut Firmenbuch]

## Unternehmensgegenstand – Vorschlag
Entwicklung, Betrieb und Vermarktung digitaler Software- und SaaS-Plattformen für Kundenbindung, Kundenkommunikation, Unternehmenspräsentation, Bonus- und Reward-Systeme, öffentliche Unternehmens-Discovery sowie damit verbundene digitale Dienstleistungen.

Mit tatsächlichem Gewerbe-/Firmenbuchgegenstand abgleichen.

## Gewerbe
WKO/Fachgruppe/Behörde nach tatsächlicher Gewerbeanmeldung ergänzen.

## MedienG / Blattlinie – Vorschlag
Information über die WUXUAI® Plattform, digitale Dienstleistungen und Funktionen sowie Kundenbindung, Unternehmens-Discovery, Loyalty, digitale Kundenkommunikation und SaaS-Lösungen.

## IP-Hinweis
WUXUAI® und zentrale Software-/Marken-/Domainrechte werden der Plattformbetreiberin auf Basis konzerninterner Nutzungs-/Lizenzrechte bereitgestellt. Holding-Nennung im Impressum anwaltlich entscheiden.

## Rechtliche Links
Plattform-Nutzungsbedingungen, Datenschutz, Cookie-Einstellungen, B2B-SaaS, ggf. Barrierefreiheit/DSA-Meldestelle.

## Merchant-Angaben
Je Merchant-Profil: Firma/Name, Rechtsform, Betriebsanschrift, E-Mail, ggf. Registerdaten. Keine KYB-Dateien/Ausweise veröffentlichen.

## Streitbeilegung
Keinen veralteten EU-ODR-Link übernehmen. Aktuelle österreichische Informationspflichten prüfen.
', 'ef96db5b568a36cce9aaca686c905b21e40a06152eb29cfcceacb16f894bdf3a');

commit;
