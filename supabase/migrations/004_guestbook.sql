-- P2: guestbook entries table. Public can submit; only approved entries are publicly readable.
-- Applied live via the Supabase SQL editor 2026-11-14.
-- Recorded here in 3.0 so a fresh clone reproduces the live schema.
create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  approved boolean not null default false
);

alter table public.guestbook_entries enable row level security;

create policy "Anyone can sign the guestbook"
  on public.guestbook_entries for insert to anon, authenticated
  with check (true);

create policy "Public read approved guestbook entries"
  on public.guestbook_entries for select to anon, authenticated
  using (approved = true);

create policy "Admins manage guestbook entries"
  on public.guestbook_entries for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());
