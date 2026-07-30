update storage.buckets
set allowed_mime_types = case
  when allowed_mime_types is null then null
  when not ('image/webp' = any(allowed_mime_types)) then array_append(allowed_mime_types, 'image/webp')
  else allowed_mime_types
end
where id = 'restaurant-media';
