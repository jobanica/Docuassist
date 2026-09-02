-- =============================================================================
-- 0046_branding_bucket.sql — somewhere permanent to keep the logo
--
-- Business settings only ever had a logo_url text box, so the logo in use was
-- a pasted Facebook CDN link. Those URLs carry an expiring signature, and it
-- duly expired: the customer-facing tracking pages were rendering a broken
-- image where the brand should be.
--
-- This gives the logo a home we control. Unlike the `requirements` bucket,
-- which is private and served through short-lived signed URLs, branding is
-- PUBLIC on purpose — the tracking pages are opened by customers who are not
-- logged in, so a signed URL would expire and put us right back where we
-- started. Nothing sensitive belongs in here: it is the logo and things like
-- it, which are already shown to anyone holding a tracking link.
--
-- Writing is still staff-only, enforced by the same is_staff() choke point as
-- everywhere else.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding', 'branding', true, 2 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read: that is the point of a public logo.
drop policy if exists "branding public read" on storage.objects;
create policy "branding public read" on storage.objects
  for select using (bucket_id = 'branding');

-- Only staff may put anything there, or replace what is there.
drop policy if exists "branding staff write" on storage.objects;
create policy "branding staff write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and is_staff());

drop policy if exists "branding staff update" on storage.objects;
create policy "branding staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and is_staff());

drop policy if exists "branding staff delete" on storage.objects;
create policy "branding staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and is_staff());
