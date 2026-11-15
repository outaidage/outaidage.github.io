-- 018_hero_content.sql — 首页 Hero 内容（后台可编辑）
-- 单行（id='default'）：眉题、标题（普通 + 渐变两段）、副标题、按钮（JSON 数组）、
-- 标签（text[]）、终端命令与输出。前端构建时读取，失败或缺失时回落到
-- src/lib/hero-content.ts 的内置默认值（与当前首页文案一致）。
-- RLS：公开只读；写操作仅管理员（is_site_admin()）。
-- 注意：首页是构建时静态生成，改完 Hero 需下次部署才生效（每日自动重建，
-- 或手动触发部署）。后台会明确提示这一点，不假装保存即生效。

create table if not exists public.hero_content (
  id text primary key, -- 'default'
  eyebrow text not null default 'DIGITAL UNIVERSE · EST. 2026',
  title_plain text not null default 'Explore ',
  title_grad text not null default 'Beyond.',
  subtitle text not null default '这里是 OUTAI 的数字空间。记录技术、探索 AI、收藏灵感，把想法变成现实。',
  buttons jsonb not null default '[
    {"label": "探索文章 ↗", "href": "/blog/", "style": "primary"},
    {"label": "打开资源库 ⌁", "href": "/collection/", "style": "secondary"},
    {"label": "进入宇宙 ☉", "href": "#universe", "style": "secondary"}
  ]'::jsonb,
  tags text[] not null default array['AI & TECHNOLOGY', 'DIGITAL LIFE', 'OPEN SOURCE', 'BUILD IN PUBLIC'],
  terminal_command text not null default 'outai --about',
  terminal_output text not null default '个人数字空间 — 记录技术、AI、互联网与工具，收藏有价值的链接。',
  updated_at timestamptz not null default now()
);

insert into public.hero_content (id) values ('default')
on conflict (id) do nothing;

alter table public.hero_content enable row level security;

drop policy if exists "hero_content public read" on public.hero_content;
create policy "hero_content public read" on public.hero_content
  for select using (true);

drop policy if exists "hero_content admin write" on public.hero_content;
create policy "hero_content admin write" on public.hero_content
  for all using (is_site_admin()) with check (is_site_admin());

drop trigger if exists hero_content_updated_at on public.hero_content;
create trigger hero_content_updated_at
  before update on public.hero_content
  for each row execute function public.set_universe_updated_at();
