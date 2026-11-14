-- 009: home_modules — 首页模块管理（数字宇宙门户）。
-- 首页的模块卡片与导航入口全部由此表驱动，不再硬编码在首页组件里。
-- 公开只读 status='published' AND enabled=true 的模块；管理员可读写全部。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

create table if not exists public.home_modules (
  id text primary key,
  name text not null,
  name_en text not null default '',
  description text not null default '',
  icon text not null default '✦',
  cover_image text not null default '',
  theme_color text not null default '#61EDFF',
  path text not null,
  category text not null default '内容',
  sort_order integer not null default 0,
  show_on_home boolean not null default true,
  enabled boolean not null default true,
  show_in_nav boolean not null default false,
  featured boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published', 'offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_modules enable row level security;

-- 公开只读已发布且启用的模块。
create policy "Public read published home modules"
  on public.home_modules for select to anon, authenticated
  using (status = 'published' and enabled = true);

-- 仅管理员可读写模块配置。
create policy "Admins manage home modules"
  on public.home_modules for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create index if not exists home_modules_sort_idx
  on public.home_modules (sort_order asc);

-- 默认 10 个模块（与首页门户设计一致；管理员可在后台恢复此配置）。
insert into public.home_modules
  (id, name, name_en, description, icon, theme_color, path, category, sort_order, show_on_home, enabled, show_in_nav, featured, status)
values
  ('articles', '文章中心', 'Knowledge Galaxy', '技术记录、AI、互联网、经验分享。', '✦', '#61EDFF', '/blog/', '内容', 10, true, true, true, true, 'published'),
  ('bookmarks', '书签收藏', 'Resource Star Map', '网站、工具、资源和分类收藏。', '◈', '#A68AFF', '/collection/', '内容', 20, true, true, true, false, 'published'),
  ('projects', '项目空间', 'Build Log', '个人项目、作品和开发进度。', '⬡', '#7DFFCE', '/projects/', '内容', 30, true, true, true, false, 'published'),
  ('guestbook', '留言板', 'Guestbook', '访客留言、建议和交流。', '✉', '#61EDFF', '/guestbook/', '互动', 40, true, true, true, false, 'published'),
  ('resources', '资源中心', 'Resources', '软件、工具、教程和实用资源。', '⬢', '#A68AFF', '/links/', '内容', 50, true, true, false, false, 'published'),
  ('changelog', '更新日志', 'Changelog', '网站版本更新和功能变化。', '✎', '#7DFFCE', '/changelog/', '关于', 60, true, true, false, false, 'published'),
  ('about', '关于我', 'Identity', '个人介绍和网站说明。', '◎', '#61EDFF', '/about/', '关于', 70, true, true, true, false, 'published'),
  ('now', 'Now', 'Now', '近期活动、正在做的事情。', '◐', '#A68AFF', '/now/', '关于', 80, true, true, true, false, 'published'),
  ('toolbox', '在线工具箱', 'Toolbox', '网站内的实用小工具。', '⚙', '#7DFFCE', '/toolbox/', '工具', 90, true, true, false, false, 'published'),
  ('contact', '联系方式', 'Contact', 'X、GitHub 等公开社交入口。', '↗', '#61EDFF', '/contact/', '关于', 100, true, true, true, false, 'published')
on conflict (id) do nothing;
