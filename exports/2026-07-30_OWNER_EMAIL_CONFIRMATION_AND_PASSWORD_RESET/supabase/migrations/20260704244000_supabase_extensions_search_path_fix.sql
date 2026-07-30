alter function public.create_staff_session(uuid, text)
set search_path = public, extensions;

alter function public.rotate_customer_qr_token(uuid, uuid)
set search_path = public, extensions;

alter function public.register_campaign_customer(text, text, text, text, date)
set search_path = public, extensions;

alter function public.register_restaurant_customer(text, text, text, date)
set search_path = public, extensions;

alter function public.create_referral_link(text, text)
set search_path = public, extensions;

alter function public.register_referral_customer(text, text, text, text, date)
set search_path = public, extensions;
