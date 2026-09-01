-- Additive draft legal template for the locked customer presentation window.
-- Existing templates and published restaurant documents remain unchanged.

insert into public.legal_master_templates (
  document_type, version, language, title, content_template,
  rendered_text_template, review_status, active
) values (
  'participation_terms',
  '2026.08-v1.0-presentation-window',
  'de-AT',
  'Teilnahmebedingungen für das Bonusprogramm',
  jsonb_build_object(
    'legal_packet_status', 'DRAFT_LEGAL_REVIEW_REQUIRED',
    'points_redemption_confirmation_method', 'CUSTOMER_PRESENTATION_WINDOW',
    'points_deducted_on_confirmation', true,
    'presentation_window_minutes', 15,
    'customer_self_reversal_allowed', false,
    'restaurant_confirmation_electronic', false,
    'gift_redemption_code_unchanged', true,
    'cash_register_integration', false
  ),
  $legal$
Das Bonusprogramm wird vom im Legal Center bezeichneten Betreiber angeboten; WUXUAI stellt die technische Plattform bereit.

Bei einer Punkteeinlösung bestätigt der Kunde die Einlösung ausdrücklich im Kundenportal. Die erforderlichen Punkte werden mit dieser Bestätigung serverseitig sofort und endgültig vom restaurantbezogenen Punktekonto abgezogen. Anschließend zeigt das System für 15 Minuten einen aktiven Präsentationsbildschirm. Das Restaurantpersonal kontrolliert diesen Bildschirm ausschließlich visuell; eine elektronische Mitarbeiterbestätigung erfolgt bei Punkteeinlösungen nicht.

Ein Neuladen, Browserwechsel oder paralleles Öffnen verlängert das serverseitig bestimmte Präsentationsfenster nicht. Nach Ablauf wird der Vorgang als abgeschlossen angezeigt. Der Kunde kann die Einlösung nicht selbst rückgängig machen. Eine nachvollziehbare Korrektur ist nur durch den Restaurant-Owner oder den dokumentierten WUXUAI-Support mit Begründung, Audit und atomarer Punkterückbuchung möglich.

Willkommens- und Geburtstagsgeschenke verwenden weiterhin den dafür ausgewiesenen separaten Einlöseablauf. WUXUAI V1 verwendet keine Bonnummer und ist keine Kassen- oder POS-Integration. Der Betreiber bleibt für die tatsächliche Leistungserbringung und die erforderliche Erfassung im eigenen Kassensystem verantwortlich.

Status: DRAFT_LEGAL_REVIEW_REQUIRED. Diese Vorlage muss vor Production anwaltlich geprüft werden.
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

notify pgrst, 'reload schema';
