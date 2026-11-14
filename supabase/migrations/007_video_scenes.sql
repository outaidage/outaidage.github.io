-- 007: video_scenes — 电影级动态视频背景的场景配置表。
-- 前台播放器公开读取已启用的场景；只有管理员（admin_allowlist）能写。
-- 视频文件本身不在数据库里，只存 R2 公共 URL / 自定义媒体域名地址。
-- 视频地址留空（NULL）= 占位场景，前台显示深空渐变回退，不伪造播放成功。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。
-- 执行后，后台「背景与媒体管理」即可读写；执行前该模块会提示需要先建表。

create table if not exists public.video_scenes (
  id text primary key,
  name text not null,
  description text,
  desktop_video_url text,
  mobile_video_url text,
  desktop_video_mp4_url text,
  mobile_video_mp4_url text,
  fallback_image text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  playback_mode text not null default 'loop' check (playback_mode in ('loop', 'once')),
  overlay_opacity numeric not null default 0.55 check (overlay_opacity >= 0 and overlay_opacity <= 1),
  overlay_color text not null default '#03040b',
  focal_point text not null default '50% 50%',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.video_scenes enable row level security;

-- 公开读：仅已启用的场景（前台播放器用 anon key 读取）。
create policy "Public read enabled video scenes"
  on public.video_scenes for select to anon, authenticated
  using (enabled = true);

-- 管理员全权管理（增删改查），通过 admin_allowlist 判定。
create policy "Admins manage video scenes"
  on public.video_scenes for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create index if not exists video_scenes_sort_order_idx
  on public.video_scenes (sort_order asc);

-- 种子：6 个预置占位场景（视频地址全部留空；填入真实 R2 地址后即可播放）。
insert into public.video_scenes
  (id, name, description, desktop_video_url, mobile_video_url,
   desktop_video_mp4_url, mobile_video_mp4_url, fallback_image,
   enabled, sort_order, playback_mode, overlay_opacity, overlay_color,
   focal_point, is_default)
values
  ('deep-space', '深空宇宙', '深邃星空与缓慢漂移的星云，默认首页背景。',
   null, null, null, null, null,
   true, 1, 'loop', 0.55, '#03040b', '50% 50%', true),
  ('floating-islands', '梦幻漂浮岛屿', '云海之上的漂浮岛屿，柔和光线与雾效。',
   null, null, null, null, null,
   true, 2, 'loop', 0.50, '#03040b', '50% 50%', false),
  ('deep-sea', '深海世界', '深蓝海水、光束与缓慢上浮的气泡。',
   null, null, null, null, null,
   true, 3, 'loop', 0.55, '#020617', '50% 50%', false),
  ('future-city', '未来科技城市', '霓虹灯下的未来城市，青色与紫色光影。',
   null, null, null, null, null,
   true, 4, 'loop', 0.50, '#03040b', '50% 50%', false),
  ('nebula-planets', '星云与星球', '绚烂星云环绕行星，适合大屏展示。',
   null, null, null, null, null,
   true, 5, 'loop', 0.55, '#03040b', '50% 50%', false),
  ('minimal-motion', '极简动态背景', '极简的缓慢渐变与微光，低性能设备首选。',
   null, null, null, null, null,
   true, 6, 'loop', 0.45, '#03040b', '50% 50%', false)
on conflict (id) do nothing;
