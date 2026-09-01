drop policy if exists "restaurant media admin insert" on storage.objects;
drop policy if exists "restaurant media admin update" on storage.objects;
drop policy if exists "restaurant media admin delete" on storage.objects;

create policy "restaurant media admin insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'restaurant-media'
  and auth.uid() is not null
  and (storage.foldername(storage.objects.name))[1] is not null
  and (storage.foldername(storage.objects.name))[2] in ('branding', 'offers', 'rewards')
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id::text = (storage.foldername(storage.objects.name))[1]
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
);

create policy "restaurant media admin update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'restaurant-media'
  and auth.uid() is not null
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id::text = (storage.foldername(storage.objects.name))[1]
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
)
with check (
  bucket_id = 'restaurant-media'
  and auth.uid() is not null
  and (storage.foldername(storage.objects.name))[2] in ('branding', 'offers', 'rewards')
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id::text = (storage.foldername(storage.objects.name))[1]
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
);

create policy "restaurant media admin delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'restaurant-media'
  and auth.uid() is not null
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id::text = (storage.foldername(storage.objects.name))[1]
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
);
