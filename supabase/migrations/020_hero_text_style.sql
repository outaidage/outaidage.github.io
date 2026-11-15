-- 020_hero_text_style.sql — 首页 Hero 文字样式（后台可编辑）。
-- 给 hero_content 加 4 列：标题颜色、副标题颜色、标题缩放、文字透明度。
-- 用途：换背景后字看不清时，后台直接调颜色/大小/透明度，不用改代码。
--   title_color: 标题纯色（#rrggbb）。NULL = 保持默认（白字 + 青紫渐变）。
--   subtitle_color: 副标题颜色。NULL = 保持默认（--text-dim 暗灰）。
--   title_scale: 标题缩放倍数（0.7–1.5），默认 1。
--   text_opacity: 文字透明度（0.3–1），默认 1（全实）。
-- 前端构建时读取（hero-content.ts），失败或缺失时回落到内置默认值。
-- RLS 已在 migration 018 建好（公开只读、仅管理员写），本迁移只加列。

alter table public.hero_content
  add column if not exists title_color text,
  add column if not exists subtitle_color text,
  add column if not exists title_scale numeric not null default 1,
  add column if not exists text_opacity numeric not null default 1;

-- 把已有的非法值收敛到合法范围（防御性，正常情况下不会触发）。
update public.hero_content
set title_scale = greatest(0.7, least(1.5, title_scale))
where title_scale < 0.7 or title_scale > 1.5;

update public.hero_content
set text_opacity = greatest(0.3, least(1, text_opacity))
where text_opacity < 0.3 or text_opacity > 1;
