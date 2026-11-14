-- P1-C: article cover image storage bucket (public read, admin-only write).
-- Applied live via the Supabase SQL editor 2026-11-14.
-- Recorded here in 3.0 so a fresh clone reproduces the live schema.
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;

create policy "Public read article images"
  on storage.objects for select
  using (bucket_id = 'article-images');

create policy "Admin upload article images"
  on storage.objects for insert
  with check (bucket_id = 'article-images' and is_site_admin());

create policy "Admin update article images"
  on storage.objects for update
  using (bucket_id = 'article-images' and is_site_admin());

create policy "Admin delete article images"
  on storage.objects for delete
  using (bucket_id = 'article-images' and is_site_admin());
