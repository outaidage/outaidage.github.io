-- 015: background_likes + background_favorites + background_rotation_settings
-- Background Studio 喜欢/收藏/轮换设置。
-- likes 与 favorites 分开。访客用 device_id（localStorage 生成的 UUID）标识；
-- 登录用户用 user_id（Supabase Auth），跨设备同步。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

create table if not exists public.background_likes (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.background_assets(id) on delete cascade,
  user_id uuid,
  device_id text,
  created_at timestamptz not null default now(),
  constraint background_likes_actor check (user_id is not null or device_id is not null),
  constraint background_likes_user_unique unique (asset_id, user_id),
  constraint background_likes_device_unique unique (asset_id, device_id)
);

create table if not exists public.background_favorites (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.background_assets(id) on delete cascade,
  user_id uuid,
  device_id text,
  collection text not null default '默认收藏',
  created_at timestamptz not null default now(),
  constraint background_favorites_actor check (user_id is not null or device_id is not null),
  constraint background_favorites_user_unique unique (asset_id, user_id, collection),
  constraint background_favorites_device_unique unique (asset_id, device_id, collection)
);

create table if not exists public.background_rotation_settings (
  id text primary key,
  mode text not null default 'manual'
    check (mode in ('manual', 'random_each_visit', 'timed', 'daily', 'favorites', 'category', 'source', 'collection')),
  interval_minutes integer not null default 30,
  category text,
  source_id uuid,
  collection text,
  pinned_asset_id text references public.background_assets(id) on delete set null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.background_likes enable row level security;
alter table public.background_favorites enable row level security;
alter table public.background_rotation_settings enable row level security;

-- 喜欢/收藏：任何人可写入自己的 device_id 行；公开只读计数用（聚合在前端或视图里做）。
-- 注意：RLS 不能区分“自己的 device_id”与“别人的 device_id”，所以 select 限制为
-- 仅管理员可读全部；访客的喜欢/收藏状态由前端 localStorage + 写入时的返回确认，
-- 计数用公开的聚合视图（见 016）。
create policy "Anyone can like a background asset"
  on public.background_likes for insert to anon, authenticated
  with check (true);

create policy "Admins read background likes"
  on public.background_likes for select to authenticated
  using (public.is_site_admin());

create policy "Admins manage background likes"
  on public.background_likes for delete to authenticated
  using (public.is_site_admin());

create policy "Anyone can favorite a background asset"
  on public.background_favorites for insert to anon, authenticated
  with check (true);

create policy "Admins read background favorites"
  on public.background_favorites for select to authenticated
  using (public.is_site_admin());

create policy "Admins manage background favorites"
  on public.background_favorites for delete to authenticated
  using (public.is_site_admin());

-- 轮换设置：公开只读（播放器需要读当前模式），仅管理员可写。
create policy "Public read rotation settings"
  on public.background_rotation_settings for select to anon, authenticated
  using (true);

create policy "Admins manage rotation settings"
  on public.background_rotation_settings for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create index if not exists background_likes_asset_idx
  on public.background_likes (asset_id);
create index if not exists background_favorites_asset_idx
  on public.background_favorites (asset_id);

-- 默认轮换设置：手动固定（管理员在后台改为定时轮换）。
insert into public.background_rotation_settings (id, mode, interval_minutes, enabled)
values ('default', 'manual', 30, true)
on conflict (id) do nothing;
