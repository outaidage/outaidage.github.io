-- 011: projects — 项目空间（数字宇宙门户）。
-- /projects/ 页面与首页"最近更新的项目"区由此表读取，取代原来的硬编码卡片。
-- 公开只读；管理员可读写。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  url text not null default '',
  status text not null default 'in_progress' check (status in ('in_progress', 'planned', 'completed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Public read projects"
  on public.projects for select to anon, authenticated
  using (true);

create policy "Admins manage projects"
  on public.projects for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create index if not exists projects_sort_idx
  on public.projects (sort_order asc);

-- 种子数据：把 /projects/ 原来硬编码的两张卡片转为真实数据。
insert into public.projects (name, description, url, status, sort_order)
values
  ('Personal Digital Space', '这个网站本身：博客、书签与个人知识空间。', 'https://outaidage.xyz/', 'in_progress', 10),
  ('Coming Soon', '下一个想法将在这里出现。', '', 'planned', 20);
