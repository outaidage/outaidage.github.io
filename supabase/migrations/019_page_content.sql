-- 019_page_content.sql — 页面内容（后台可编辑）+ 工具箱元数据
-- page_content：关于我 / Now / 联系方式 三个静态页的内容，改由 Supabase 驱动。
--   id: 'about' | 'now' | 'contact'
--   title / subtitle：页头标题与副标题
--   sections：关于页的段落 [{heading, text}]
--   items：Now 的卡片 [{kicker, title, description}]；联系页的条目 [{heading, label, href, note}]
--   前端构建时读取，失败或缺失时回落到各页内置默认值（与当前页面文案一致）。
-- toolbox_tools：在线工具箱 3 个内置工具的元数据（名称/说明/排序/启用）。
--   id: 'json' | 'base64' | 'chars'（工具逻辑仍在代码里按 id 实现，后台只改元数据，
--   不新增工具类型）。前端构建时读取，失败时回落内置默认值。
-- RLS：公开只读；写操作仅管理员（is_site_admin()）。
-- 注意：这些页是构建时静态生成，改完需下次部署才生效（每日自动重建，
-- 或手动触发部署）。后台会明确提示。

create table if not exists public.page_content (
  id text primary key, -- 'about' | 'now' | 'contact'
  title text not null default '',
  subtitle text not null default '',
  sections jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.page_content (id, title, subtitle, sections, items) values
  ('about', '关于这里.', '一个持续生长的个人数字空间。',
    '[
      {"heading": "你好，我是 OUTAI。", "text": "我关注 AI、互联网、开发工具、网络技术与数字生活，也喜欢把遇到的问题整理成可复用的经验。"},
      {"heading": "这个网站", "text": "这里会持续积累文章、书签、项目与个人记录。内容以真实体验和长期沉淀为主。"}
    ]'::jsonb,
    '[]'::jsonb),
  ('now', '最近在做什么.', '这是一份持续更新的当前状态记录。',
    '[]'::jsonb,
    '[
      {"kicker": "LEARNING", "title": "English", "description": "持续学习英语，提升阅读技术资料与日常交流能力。"},
      {"kicker": "EXPLORING", "title": "AI & Automation", "description": "探索 AI 工具、Agent 与个人自动化工作流。"},
      {"kicker": "BUILDING", "title": "OUTAI Website", "description": "构建自己的文章与书签管理系统。"}
    ]'::jsonb),
  ('contact', '联系我.', '有问题、建议，或者只是想打个招呼，都可以写邮件。',
    '[]'::jsonb,
    '[
      {"heading": "邮箱", "label": "outaidage@gmail.com", "href": "mailto:outaidage@gmail.com", "note": ""},
      {"heading": "GitHub", "label": "github.com/outaidage", "href": "https://github.com/outaidage", "note": "本站源代码：https://github.com/outaidage/outaidage.github.io"}
    ]'::jsonb)
on conflict (id) do nothing;

create table if not exists public.toolbox_tools (
  id text primary key, -- 'json' | 'base64' | 'chars'
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.toolbox_tools (id, name, description, sort_order, enabled) values
  ('json', 'JSON 格式化', '验证并格式化 JSON，或压缩为单行。数据只在你的浏览器里处理。', 10, true),
  ('base64', 'Base64 编解码', '文本与 Base64 互转。点击结果可全选复制。', 20, true),
  ('chars', '字数统计', '实时统计字符、单词、行数与段落。', 30, true)
on conflict (id) do nothing;

alter table public.page_content enable row level security;
alter table public.toolbox_tools enable row level security;

drop policy if exists "page_content public read" on public.page_content;
create policy "page_content public read" on public.page_content
  for select using (true);

drop policy if exists "page_content admin write" on public.page_content;
create policy "page_content admin write" on public.page_content
  for all using (is_site_admin()) with check (is_site_admin());

drop policy if exists "toolbox_tools public read" on public.toolbox_tools;
create policy "toolbox_tools public read" on public.toolbox_tools
  for select using (true);

drop policy if exists "toolbox_tools admin write" on public.toolbox_tools;
create policy "toolbox_tools admin write" on public.toolbox_tools
  for all using (is_site_admin()) with check (is_site_admin());

drop trigger if exists page_content_updated_at on public.page_content;
create trigger page_content_updated_at
  before update on public.page_content
  for each row execute function public.set_universe_updated_at();

drop trigger if exists toolbox_tools_updated_at on public.toolbox_tools;
create trigger toolbox_tools_updated_at
  before update on public.toolbox_tools
  for each row execute function public.set_universe_updated_at();
