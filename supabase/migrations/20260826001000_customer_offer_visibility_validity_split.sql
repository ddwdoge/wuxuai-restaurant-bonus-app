-- Customer offer visibility is a publication decision. Schedule fields describe
-- current validity and must not remove active marketing content from the feed.
create or replace function public.get_public_restaurant_offers(
  input_restaurant_slug text default null,
  input_limit integer default 20
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(jsonb_agg(payload order by priority, published_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', o.id,
      'restaurant_id', o.restaurant_id,
      'restaurant_name', r.name,
      'restaurant_slug', r.slug,
      'branch_id', o.branch_id,
      'branch_name', b.name,
      'offer_type', o.offer_type,
      'title', o.title,
      'short_description', o.short_description,
      'description', o.description,
      'image_url', o.image_url,
      'current_price', o.current_price,
      'previous_price', o.previous_price,
      'currency', o.currency,
      'valid_from', o.valid_from,
      'valid_to', o.valid_to,
      'weekdays', o.weekdays,
      'time_from', o.time_from,
      'time_to', o.time_to,
      'button_label', o.button_label,
      'published_at', o.published_at
    ) as payload,
    case o.offer_type
      when 'LUNCH_MENU' then 1 when 'WEEKLY_OFFER' then 2
      when 'MONTHLY_OFFER' then 3 when 'SEASONAL_OFFER' then 4
      when 'NEW_DISH' then 5 when 'EVENT' then 6 else 7
    end as priority,
    o.published_at
    from public.restaurant_offers o
    join public.restaurants r on r.id = o.restaurant_id and r.status = 'active'
    join public.branches b on b.id = o.branch_id and b.restaurant_id = r.id and b.status = 'active'
    where o.status = 'PUBLISHED'
      and o.is_active = true
      and o.valid_to > now()
      and (
        (input_restaurant_slug is not null and r.slug = trim(input_restaurant_slug))
        or (input_restaurant_slug is null and b.is_discoverable = true)
      )
    order by priority, o.published_at desc
    limit least(greatest(coalesce(input_limit, 20), 1), 100)
  ) visible_offers;
$$;

revoke all on function public.get_public_restaurant_offers(text, integer) from public, anon, authenticated;
grant execute on function public.get_public_restaurant_offers(text, integer) to anon, authenticated;

comment on function public.get_public_restaurant_offers(text, integer) is
  'Returns public-safe PUBLISHED and active offers until final expiry; schedule fields describe validity but do not hide marketing content.';
