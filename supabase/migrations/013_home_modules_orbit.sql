-- 013: home_modules 轨道字段 — 3D 星球节点（数字宇宙导航中心）。
-- 节点复用 home_modules 表（不另建节点表，避免两个管理系统打架）。
-- orbit：节点所在的轨道号（1 内圈 / 2 中圈 / 3 外圈）。
-- angle：节点在轨道上的角度（度，0–360；null = 按 sort_order 自动均匀分布）。
-- node_size：节点大小（sm / md / lg）。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

alter table public.home_modules
  add column if not exists orbit integer not null default 1 check (orbit between 1 and 3);

alter table public.home_modules
  add column if not exists angle numeric;

alter table public.home_modules
  add column if not exists node_size text not null default 'md' check (node_size in ('sm', 'md', 'lg'));

-- 默认轨道分配（按现有 10 个模块的排序均匀分布到 3 条轨道）：
-- 轨道 1（内圈）：文章中心、书签收藏、项目空间
-- 轨道 2（中圈）：留言板、资源中心、更新日志、关于我
-- 轨道 3（外圈）：Now、在线工具箱、联系方式
update public.home_modules set orbit = 1 where id in ('articles', 'bookmarks', 'projects');
update public.home_modules set orbit = 2 where id in ('guestbook', 'resources', 'changelog', 'about');
update public.home_modules set orbit = 3 where id in ('now', 'toolbox', 'contact');

-- 新增「AI 实验室」模块（3D 星球节点第一批；页面 /ai-lab/ 目前为建设中占位，
-- 有真实内容后再填充，不伪造实验内容）。
insert into public.home_modules
  (id, name, name_en, description, icon, theme_color, path, category, sort_order, show_on_home, enabled, show_in_nav, featured, status, orbit)
values
  ('ai-lab', 'AI 实验室', 'AI Lab', 'AI 实验、工具与记录。', '◉', '#A68AFF', '/ai-lab/', '内容', 35, true, true, false, false, 'published', 1)
on conflict (id) do nothing;
