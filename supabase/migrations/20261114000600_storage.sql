-- =============================================================================
-- Storage buckets + object policies.
--
-- Fixes the legacy stored-XSS (loyaltyapp/app/routes.js:13 derived the file
-- extension from the client MIME type and served it same-origin): buckets
-- enforce an image MIME allow-list and size cap server-side, and objects are
-- served from the Supabase storage origin, not the app origin.
--
-- Path conventions:
--   avatars/<auth.uid()>/<file>                 private, owner-only
--   product-images/<merchant_id>/<...>/<file>   public read, merchant owner/admin write
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2 * 1024 * 1024,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('product-images', 'product-images', true, 5 * 1024 * 1024,
   array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- avatars ---------------------------------------------------------------------
create policy "avatars: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- product-images --------------------------------------------------------------
create policy "product-images: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

create policy "product-images: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images'
              and private.has_merchant_role(
                    private.try_uuid((storage.foldername(name))[1]),
                    array['owner', 'admin']::public.staff_role[]));

create policy "product-images: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images'
         and private.has_merchant_role(
               private.try_uuid((storage.foldername(name))[1]),
               array['owner', 'admin']::public.staff_role[]))
  with check (bucket_id = 'product-images'
              and private.has_merchant_role(
                    private.try_uuid((storage.foldername(name))[1]),
                    array['owner', 'admin']::public.staff_role[]));

create policy "product-images: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images'
         and private.has_merchant_role(
               private.try_uuid((storage.foldername(name))[1]),
               array['owner', 'admin']::public.staff_role[]));
