-- Applied directly on 2026-11-21:
-- * signed-out visitors can evaluate is_admin() (returns false) so public academy / announcement lists load before sign-in
-- * photo buckets accept large iPhone photos (10 MB) and HEIC/HEIF
grant execute on function public.is_admin() to anon;
update storage.buckets set file_size_limit = 10485760, allowed_mime_types = '{image/jpeg,image/png,image/webp,image/heic,image/heif}'
where id in ('avatars', 'listing-photos');
-- Optional: lets clients overwrite their photo in place (the app now uploads a new file instead, so this is not required).
drop policy if exists "users read their own avatar" on storage.objects;
create policy "users read their own avatar" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
