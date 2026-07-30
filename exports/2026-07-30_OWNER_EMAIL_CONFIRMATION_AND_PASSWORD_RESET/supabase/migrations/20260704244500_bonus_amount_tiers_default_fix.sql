alter table public.loyalty_settings
alter column bonus_amount_tiers set default '[
  {"key":"0_10","label":"0–10 €","min":0,"max":10,"amount":10},
  {"key":"10_20","label":"10–20 €","min":10,"max":20,"amount":20},
  {"key":"20_30","label":"20–30 €","min":20,"max":30,"amount":30},
  {"key":"30_40","label":"30–40 €","min":30,"max":40,"amount":40},
  {"key":"40_50","label":"40–50 €","min":40,"max":50,"amount":50},
  {"key":"50_75","label":"50–75 €","min":50,"max":75,"amount":75},
  {"key":"75_100","label":"75–100 €","min":75,"max":100,"amount":100},
  {"key":"100_plus","label":"100+ €","min":100,"max":null,"amount":120}
]'::jsonb;

update public.loyalty_settings
set bonus_amount_tiers = '[
  {"key":"0_10","label":"0–10 €","min":0,"max":10,"amount":10},
  {"key":"10_20","label":"10–20 €","min":10,"max":20,"amount":20},
  {"key":"20_30","label":"20–30 €","min":20,"max":30,"amount":30},
  {"key":"30_40","label":"30–40 €","min":30,"max":40,"amount":40},
  {"key":"40_50","label":"40–50 €","min":40,"max":50,"amount":50},
  {"key":"50_75","label":"50–75 €","min":50,"max":75,"amount":75},
  {"key":"75_100","label":"75–100 €","min":75,"max":100,"amount":100},
  {"key":"100_plus","label":"100+ €","min":100,"max":null,"amount":120}
]'::jsonb
where bonus_amount_tiers is null
   or bonus_amount_tiers = '[]'::jsonb
   or exists (
     select 1
     from jsonb_array_elements(bonus_amount_tiers) tier
     where tier->>'key' in ('20', '30', '40', '50', '75', '100')
        or tier->>'label' like 'bis %'
   );
