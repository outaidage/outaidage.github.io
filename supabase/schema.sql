-- Run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text not null,
  description text,
  note text,
  favicon text,
  category text,
  is_public boolean not null default true,
  is_favorite boolean not null default false,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.bookmark_tags (
  bookmark_id uuid not null references public.bookmarks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (bookmark_id, tag_id)
);

create or replace view public.public_bookmarks
with (security_invoker = true) as
select b.id,b.url,b.title,b.description,b.category,b.favicon,b.is_favorite,b.created_at,
  coalesce(array_agg(t.name) filter (where t.name is not null), '{}') as tags
from public.bookmarks b
left join public.bookmark_tags bt on bt.bookmark_id=b.id
left join public.tags t on t.id=bt.tag_id
where b.is_public=true and b.status='active'
group by b.id;

alter table public.bookmarks enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.bookmark_tags enable row level security;

-- Public users can read only public active bookmarks.
drop policy if exists "Public read public bookmarks" on public.bookmarks;
create policy "Public read public bookmarks" on public.bookmarks
for select to anon, authenticated using (is_public=true and status='active');

-- Authenticated users can manage bookmarks only if they are in admin_allowlist.
create table if not exists public.admin_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_allowlist enable row level security;
drop policy if exists "Admins can read allowlist" on public.admin_allowlist;
create policy "Admins can read allowlist" on public.admin_allowlist
for select to authenticated using (auth.uid() = user_id);

create or replace function public.is_site_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_allowlist where user_id = auth.uid());
$$;

drop policy if exists "Admins manage all bookmarks" on public.bookmarks;
create policy "Admins manage all bookmarks" on public.bookmarks
for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories" on public.categories for select to anon, authenticated using (true);
drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories" on public.categories for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

drop policy if exists "Public read tags" on public.tags;
create policy "Public read tags" on public.tags for select to anon, authenticated using (true);
drop policy if exists "Admins manage tags" on public.tags;
create policy "Admins manage tags" on public.tags for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

drop policy if exists "Public read tags mapping" on public.bookmark_tags;
create policy "Public read tags mapping" on public.bookmark_tags for select to anon, authenticated using (
  exists(select 1 from public.bookmarks b where b.id=bookmark_id and b.is_public=true and b.status='active')
  or public.is_site_admin()
);
drop policy if exists "Admins manage tags mapping" on public.bookmark_tags;
create policy "Admins manage tags mapping" on public.bookmark_tags for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

insert into public.categories(name,slug) values
('AI & Tools','ai-tools'),('Development','development'),('Networking','networking'),
('Design','design'),('Productivity','productivity'),('Resources','resources'),('Interesting','interesting')
on conflict (slug) do nothing;

grant select on public.public_bookmarks to anon, authenticated;
grant select, insert, update, delete on public.bookmarks to authenticated;
grant select on public.bookmarks to anon;
grant select on public.categories, public.tags, public.bookmark_tags to anon, authenticated;
grant insert, update, delete on public.categories, public.tags, public.bookmark_tags to authenticated;

-- After creating your admin user in Supabase Auth, run:
-- insert into public.admin_allowlist(user_id) values ('YOUR_AUTH_USER_UUID');
