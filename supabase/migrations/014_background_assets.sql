-- 014: background_assets + background_sources + background_categories
-- Background Studio 资源库。
-- background_assets：背景资源元数据（文件本身在 R2 或外部 URL，Supabase 只存元数据）。
-- background_sources：资源来源（GitHub manifest / 手动上传 / URL 导入）。
-- background_categories：背景分类。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

create table if not exists public.background_assets (
  id text primary key,
  title text not null,
  description text not null default '',
  media_kind text not null check (media_kind in ('image', 'video')),
  mime text not null default '',
  url text not null,
  thumbnail_url text not null default '',
  category text not null default '未分类',
  tags text[] not null default '{}',
  source text not null default '',
  source_url text not null default '',
  author text not null default '',
  license text not null default '',
  attribution text not null default '',
  file_size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  file_hash text,
  device text not null default 'all' check (device in ('all', 'desktop', 'mobile')),
  status text not null default 'pending_review' check (status in ('pending_review', 'active', 'disabled', 'broken')),
  enabled boolean not null default true,
  is_featured boolean not null default false,
  source_id uuid,
  source_item_id text,
  last_checked_at timestamptz,
  check_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.background_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('github_manifest', 'manual', 'url_import')),
  repo_url text not null default '',
  branch text not null default 'main',
  directory text not null default '',
  manifest_url text not null default '',
  custom_json_url text not null default '',
  sync_interval_hours integer not null default 6,
  last_sync_at timestamptz,
  last_sync_status text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.background_categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.background_assets enable row level security;
alter table public.background_sources enable row level security;
alter table public.background_categories enable row level security;

-- 公开只读已启用且状态为 active 的资源（播放器与资源库公开部分用）。
create policy "Public read active background assets"
  on public.background_assets for select to anon, authenticated
  using (status = 'active' and enabled = true);

-- 仅管理员可读写资源。
create policy "Admins manage background assets"
  on public.background_assets for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- 资源来源与分类仅管理员可读/写（不公开来源配置）。
create policy "Admins manage background sources"
  on public.background_sources for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create policy "Public read background categories"
  on public.background_categories for select to anon, authenticated
  using (true);

create policy "Admins manage background categories"
  on public.background_categories for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create index if not exists background_assets_status_idx
  on public.background_assets (status, enabled);
create index if not exists background_assets_category_idx
  on public.background_assets (category);
create index if not exists background_assets_source_idx
  on public.background_assets (source_id, source_item_id);
create index if not exists background_assets_hash_idx
  on public.background_assets (file_hash);

-- 默认分类（与视频场景与模块分类风格一致）。
insert into public.background_categories (id, name, sort_order)
values
  ('space', '太空', 10),
  ('nature', '自然', 20),
  ('city', '城市', 30),
  ('abstract', '抽象', 40),
  ('minimal', '极简', 50),
  ('other', '其他', 100)
on conflict (id) do nothing;
