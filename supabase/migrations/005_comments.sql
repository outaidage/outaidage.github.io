-- P2: article comments table. Public can submit; only approved comments are publicly readable.
-- Applied live via the Supabase SQL editor 2026-11-14.
-- Recorded here in 3.0 so a fresh clone reproduces the live schema.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_slug text not null,
  name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  approved boolean not null default false
);

alter table public.comments enable row level security;

create policy "Anyone can comment"
  on public.comments for insert to anon, authenticated
  with check (true);

create policy "Public read approved comments"
  on public.comments for select to anon, authenticated
  using (approved = true);

create policy "Admins manage comments"
  on public.comments for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create index if not exists comments_article_slug_idx
  on public.comments (article_slug, created_at desc);
