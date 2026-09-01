-- WUXUAI Bonus Legal Packet V0.9 customer-facing master templates.
-- Drafts only: independent Austrian legal review and real company data are required before Production.

insert into public.legal_master_templates (
  document_type,
  version,
  language,
  title,
  content_template,
  rendered_text_template,
  review_status,
  active
) values
(
  'participation_terms',
  '2026.08-v0.9',
  'de-AT',
  'Teilnahmebedingungen für das Bonusprogramm',
  jsonb_build_object(
    'legal_packet_status', 'DRAFT_LEGAL_REVIEW_REQUIRED',
    'points_earning_rule', 'Punkte werden nach der vom Betreiber veröffentlichten Bonusregel vergeben und können eine Kunden- oder Mitarbeiterbestätigung erfordern.',
    'receipt_reference_required', false,
    'daily_booking_limit', 'Sicherheits-, Tages- und Betragslimits können gelten und werden im System angezeigt.',
    'excluded_transactions', 'Stornierte, missbräuchliche, unberechtigte oder nicht bestätigte Vorgänge sind ausgeschlossen.',
    'points_validity_months', '12',
    'reward_validity_rule', 'Gültigkeit und Einlösebedingungen werden bei der jeweiligen Belohnung angezeigt.',
    'redemption_conditions', 'Einlösungen werden im Bonusprogramm dokumentiert und können einen Einlösecode oder eine Mitarbeiterbestätigung erfordern.',
    'cash_payout_prohibited', 'Punkte sind kein Geld oder Zahlungsmittel und werden nicht bar ausgezahlt.',
    'transfer_prohibited', 'Punkte und Mitgliedschaften sind weder zwischen Kunden noch zwischen Restaurants übertragbar.',
    'cancellation_rule', 'Fehlerhafte oder stornierte Vorgänge werden nachvollziehbar korrigiert; Einlösungen bleiben als Aktivität dokumentiert.',
    'fraud_and_blocking_rule', 'Bei begründetem Missbrauchsverdacht dürfen Vorgänge geprüft, vorübergehend gesperrt und nachweislich fehlerhafte Buchungen korrigiert werden.',
    'program_termination_rule', 'Ein Programmende wird mit letztem Sammeltag und letzter Einlösefrist angekündigt.',
    'final_redemption_period', 'Die konkrete Frist wird bei einem geplanten Programmende gesondert bekanntgegeben.',
    'language', 'de-AT'
  ),
  $legal$
Das Bonusprogramm wird vom im Legal Center bezeichneten Betreiber angeboten; WUXUAI stellt die technische Plattform bereit.

Die Teilnahme ist kostenlos. Für jedes Restaurant besteht ein eigenes Bonuskonto. Punkte gelten ausschließlich beim jeweiligen Betreiber, sind nicht übertragbar, haben keinen auszahlbaren Geldwert und sind weder Zahlungsmittel noch E-Wallet.

Punkte werden nach der veröffentlichten Bonusregel vergeben. WUXUAI V1 verlangt keine Bonnummern oder Belegreferenzen. Gutschriften können durch Kunde und/oder Mitarbeiter-PIN bestätigt werden. Stornierte, missbräuchliche oder nicht bestätigte Vorgänge können abgelehnt oder nachvollziehbar korrigiert werden.

Belohnungen gelten nach den zum Einlösezeitpunkt veröffentlichten Bedingungen. Verfügbarkeit, Menge, Varianten, Gültigkeit und Einlösezeiten können begrenzt sein. Eine Einlösung wird technisch dokumentiert und kann durch einen Einlösecode oder eine Mitarbeiterbestätigung abgesichert werden. Eine Barauszahlung ist ausgeschlossen.

Willkommens-, Geburtstags- und Freundschaftsboni gelten nur unter den jeweils angezeigten Voraussetzungen. Scheinregistrierungen, Selbstempfehlungen, Mehrfachkonten und automatisierter Missbrauch sind ausgeschlossen.

Der Betreiber kann das Bonusprogramm für die Zukunft aus sachlichen Gründen ändern. Wesentliche Änderungen werden transparent bekanntgegeben. Ein Programmende wird mit letztem Sammeltag und letzter Einlösefrist angekündigt.

Status: DRAFT_LEGAL_REVIEW_REQUIRED. Diese Vorlage muss vor Production anwaltlich geprüft werden.
$legal$,
  'DRAFT_LEGAL_REVIEW_REQUIRED',
  true
),
(
  'privacy',
  '2026.08-v0.9',
  'de-AT',
  'Datenschutzerklärung für Bonuskunden',
  jsonb_build_object(
    'legal_packet_status', 'DRAFT_LEGAL_REVIEW_REQUIRED',
    'roles_separated', true,
    'data_minimization', true,
    'marketing_optional', true,
    'location_optional', true,
    'customer_token_hashed', true,
    'phone_and_birthdate_support_change_only', true
  ),
  $legal$
Für die Durchführung des jeweiligen Bonusprogramms ist grundsätzlich der im Legal Center bezeichnete Betreiber verantwortlich. [WUXUAI GmbH – nach Gründung] stellt die technische Plattform bereit und verarbeitet Kundendaten in vielen Vorgängen im Auftrag des Betreibers. Für eigene Sicherheits-, Vertrags- und Plattformzwecke kann WUXUAI selbst verantwortlich sein.

Verarbeitet werden insbesondere Vorname, normalisierte Telefonnummer, freiwilliges Geburtsdatum, restaurantbezogene Mitgliedschaft, Punktestand, Punktetransaktionen, Belohnungen, Einlösungen, Referral-Daten, Einwilligungen, Dokumentannahmen sowie notwendige Geräte-, Sitzungs- und Sicherheitsmetadaten. Kundenzugangstoken werden serverseitig gehasht geprüft und nicht in Exporten oder Auditlogs im Klartext ausgegeben.

Die Daten werden für Registrierung, Kontoführung, Punktevergabe, Belohnungseinlösung, Missbrauchsschutz, rechtliche Nachweise, Support und Datenschutzanfragen verarbeitet. Marketing ist freiwillig, getrennt von Pflichtannahmen und nur bei gültiger Rechtsgrundlage zulässig.

Der Browserstandort wird nur nach freiwilliger Freigabe verwendet, um Entfernung oder Lokale in der Nähe anzuzeigen. Bei Ablehnung bleibt die Listenansicht nutzbar. Der exakte Standort wird nicht dauerhaft gespeichert, sofern dies nicht gesondert ausgewiesen wird.

Telefonnummer und Geburtsdatum können aus Sicherheitsgründen nicht beliebig im Kundenportal geändert werden. Änderungen erfolgen über einen kontrollierten Supportprozess nach ausreichender Identitätsprüfung.

Daten werden für die Dauer des Bonuskontos sowie darüber hinaus gespeichert, soweit Nachweis-, Sicherheits-, Verjährungs- oder gesetzliche Pflichten dies erfordern. Betroffene Personen haben nach Maßgabe der DSGVO Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Widerruf und Beschwerde bei der Datenschutzbehörde.

Status: DRAFT_LEGAL_REVIEW_REQUIRED. Verantwortliche, Rechtsgrundlagen, Empfänger, Regionen und Fristen müssen vor Production anwaltlich vervollständigt werden.
$legal$,
  'DRAFT_LEGAL_REVIEW_REQUIRED',
  true
),
(
  'imprint',
  '2026.08-v0.9',
  'de-AT',
  'Impressum des Bonusprogrammbetreibers',
  jsonb_build_object(
    'legal_packet_status', 'DRAFT_LEGAL_REVIEW_REQUIRED',
    'required_fields', jsonb_build_array(
      'company_name', 'legal_form', 'street', 'postal_code', 'city', 'country', 'email'
    )
  ),
  'Die Unternehmensangaben werden aus den vom Betreiber bestätigten Stammdaten erzeugt. Der Betreiber ist für Vollständigkeit und Richtigkeit verantwortlich. Status: DRAFT_LEGAL_REVIEW_REQUIRED.',
  'DRAFT_LEGAL_REVIEW_REQUIRED',
  true
),
(
  'storage',
  '2026.08-v0.9',
  'de-AT',
  'Cookie- und Browser-Speicherinformation',
  jsonb_build_object(
    'legal_packet_status', 'DRAFT_LEGAL_REVIEW_REQUIRED',
    'necessary_storage', true,
    'marketing_storage_requires_consent', true
  ),
  $legal$
WUXUAI verwendet technisch notwendige Cookies oder Browser-Speicher für Owner-Authentifizierung, die Wiedererkennung des richtigen restaurantbezogenen Bonuskontos, Sicherheits- und Missbrauchsschutz, aktive Formular- und Einlösevorgänge sowie notwendige Sprache- und UI-Einstellungen.

Nicht notwendige Tracking- oder Marketingtechnologien werden nur nach erforderlicher Einwilligung aktiviert. Der Kundenzugang wird restaurantbezogen gespeichert; ein Zugang für Restaurant A darf nicht für Restaurant B verwendet werden.

Status: DRAFT_LEGAL_REVIEW_REQUIRED.
$legal$,
  'DRAFT_LEGAL_REVIEW_REQUIRED',
  true
),
(
  'accessibility',
  '2026.08-v0.9',
  'de-AT',
  'Barrierefreiheitserklärung',
  jsonb_build_object(
    'legal_packet_status', 'DRAFT_LEGAL_REVIEW_REQUIRED',
    'keyboard_support', true,
    'screen_reader_semantics', true,
    'map_list_alternative', true
  ),
  $legal$
WUXUAI Bonus wird schrittweise barrierearm gestaltet. Vorgesehen sind Tastaturbedienung, sichtbare Fokuszustände, Screenreader-Semantik, skalierbare Texte, ausreichend große Touchflächen und eine zugängliche Listenalternative zur Kartenansicht.

Barrieren können über den im Legal Center angegebenen Kontakt gemeldet werden. Die konkrete gesetzliche Anwendbarkeit und der endgültige Umfang dieser Erklärung müssen vor Production geprüft werden.

Status: DRAFT_LEGAL_REVIEW_REQUIRED.
$legal$,
  'DRAFT_LEGAL_REVIEW_REQUIRED',
  true
)
on conflict (document_type, version, language) do update set
  title = excluded.title,
  content_template = excluded.content_template,
  rendered_text_template = excluded.rendered_text_template,
  review_status = excluded.review_status,
  active = excluded.active;
