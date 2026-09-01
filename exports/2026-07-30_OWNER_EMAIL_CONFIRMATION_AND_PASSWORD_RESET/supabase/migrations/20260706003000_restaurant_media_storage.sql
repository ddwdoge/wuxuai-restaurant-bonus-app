insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'restaurant-media',
  'restaurant-media',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "restaurant media public read" on storage.objects;
drop policy if exists "restaurant media admin insert" on storage.objects;
drop policy if exists "restaurant media admin update" on storage.objects;
drop policy if exists "restaurant media admin delete" on storage.objects;

create policy "restaurant media public read"
on storage.objects for select
using (bucket_id = 'restaurant-media');

create policy "restaurant media admin insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'restaurant-media'
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[2] in ('branding', 'offers', 'rewards')
  and exists (
    select 1
    from public.restaurants r
    where r.id::text = (storage.foldername(name))[1]
      and public.is_restaurant_admin(r.id)
  )
);

create policy "restaurant media admin update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'restaurant-media'
  and exists (
    select 1
    from public.restaurants r
    where r.id::text = (storage.foldername(name))[1]
      and public.is_restaurant_admin(r.id)
  )
)
with check (
  bucket_id = 'restaurant-media'
  and (storage.foldername(name))[2] in ('branding', 'offers', 'rewards')
  and exists (
    select 1
    from public.restaurants r
    where r.id::text = (storage.foldername(name))[1]
      and public.is_restaurant_admin(r.id)
  )
);

create policy "restaurant media admin delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'restaurant-media'
  and exists (
    select 1
    from public.restaurants r
    where r.id::text = (storage.foldername(name))[1]
      and public.is_restaurant_admin(r.id)
  )
);
