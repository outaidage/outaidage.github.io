-- P1-D: recommended links table (for /links/). Public read, admin-only write.
-- Applied live via the Supabase SQL editor 2026-11-14.
-- Recorded here in 3.0 so a fresh clone reproduces the live schema.
create table if not exists public.recommended_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  description text,
  category text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recommended_links enable row level security;

create policy "Public read recommended links"
  on public.recommended_links for select to anon, authenticated
  using (true);

create policy "Admins manage recommended links"
  on public.recommended_links for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create unique index if not exists recommended_links_url_unique
  on public.recommended_links (url);
