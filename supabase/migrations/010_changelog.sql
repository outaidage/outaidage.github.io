-- 010: changelog_entries — 更新日志（数字宇宙门户）。
-- /changelog/ 页面与首页"网站更新动态"区由此表读取。
-- 公开只读；管理员可读写。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

create table if not exists public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  title text not null,
  body text not null default '',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.changelog_entries enable row level security;

create policy "Public read changelog entries"
  on public.changelog_entries for select to anon, authenticated
  using (true);

create policy "Admins manage changelog entries"
  on public.changelog_entries for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create index if not exists changelog_entries_published_idx
  on public.changelog_entries (published_at desc);

-- 种子条目：记录本次门户升级本身（真实更新，不虚构历史版本）。
insert into public.changelog_entries (version, title, body, published_at)
values (
  'v2.1.0',
  '首页升级为数字宇宙门户',
  '首页从单一星球展示页升级为可交互数字宇宙门户：新增首页模块管理系统（后台可增删改排），新增更新日志与在线工具箱页面，项目空间接入真实数据，留言板增加置顶与垃圾过滤。',
  now()
);
