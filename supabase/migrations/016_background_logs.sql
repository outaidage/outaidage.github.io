-- 016: background_sync_logs + background_usage_logs + 公开计数视图
-- Background Studio 同步日志、使用日志与公开计数。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

create table if not exists public.background_sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.background_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  added integer not null default 0,
  updated integer not null default 0,
  duplicates integer not null default 0,
  broken integer not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb
);

create table if not exists public.background_usage_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id text references public.background_assets(id) on delete cascade,
  event text not null check (event in ('view', 'apply', 'like', 'favorite', 'rotate')),
  device_id text,
  created_at timestamptz not null default now()
);

alter table public.background_sync_logs enable row level security;
alter table public.background_usage_logs enable row level security;

-- 同步日志与使用日志仅管理员可读；使用日志任何人可写入（匿名统计）。
create policy "Admins read background sync logs"
  on public.background_sync_logs for select to authenticated
  using (public.is_site_admin());

create policy "Admins manage background sync logs"
  on public.background_sync_logs for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create policy "Anyone can log background usage"
  on public.background_usage_logs for insert to anon, authenticated
  with check (true);

create policy "Admins read background usage logs"
  on public.background_usage_logs for select to authenticated
  using (public.is_site_admin());

create index if not exists background_sync_logs_source_idx
  on public.background_sync_logs (source_id, started_at desc);
create index if not exists background_usage_logs_asset_idx
  on public.background_usage_logs (asset_id, created_at desc);

-- 公开计数视图：每个资源的喜欢数与收藏数（不暴露谁喜欢/收藏了什么）。
create or replace view public.background_asset_counts as
select
  a.id as asset_id,
  (select count(*) from public.background_likes l where l.asset_id = a.id) as like_count,
  (select count(*) from public.background_favorites f where f.asset_id = a.id) as favorite_count
from public.background_assets a;
