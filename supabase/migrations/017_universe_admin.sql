-- 017_universe_admin.sql — 3D 宇宙管理中心（后台 Phase 5）
-- 行星配置 + 宇宙/开场/模式设置，由后台「3D 宇宙管理」编辑。
-- 前端只读：有配置时用配置，没有时回落到 src/lib/planets.ts 与 BootIntro 默认值，
-- 绝不把未保存的本地预览当成已保存。
-- RLS：planet_config 与 universe_settings 公开只读已启用的行星/设置；
-- 写操作仅管理员（is_site_admin()）。satellite_config 暂不建表——当前卫星
-- 由构建时真实数据生成（最新文章/项目/书签），见下文说明。

-- 行星配置：每行覆盖一个行星的展示属性；未建行的行星用 planets.ts 默认值。
create table if not exists public.planet_config (
  id text primary key, -- sun | mercury | venus | earth | mars | jupiter | saturn | uranus | neptune
  name text not null,
  name_en text not null default '',
  func text not null default '',
  path text not null default '/',
  description text not null default '',
  icon text not null default '',
  color text not null default '#61edff',
  radius numeric not null default 1,
  orbit_radius numeric not null default 0,
  orbit_speed numeric not null default 0,
  spin_speed numeric not null default 0,
  initial_angle numeric not null default 0,
  axial_tilt numeric not null default 0,
  orbit_inclination numeric not null default 0,
  texture text not null default '',
  ring_inner numeric,
  ring_outer numeric,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 宇宙 / 开场 / 模式设置：单行（id='default'），键值列。
create table if not exists public.universe_settings (
  id text primary key, -- 'default'
  -- 场景
  default_mode text not null default 'universe', -- universe | earth | galaxy | navigation | solar
  particle_density text not null default 'balanced', -- high | balanced | low
  effects_enabled boolean not null default true,
  motion_default text not null default 'on', -- on | reduced
  -- 开场动画
  boot_enabled boolean not null default true,
  boot_brand text not null default 'OUTAI',
  boot_subline text not null default 'PERSONAL DIGITAL UNIVERSE',
  boot_duration_seconds numeric not null default 6.5,
  boot_sound_default boolean not null default false,
  -- 模式
  show_universe_entry boolean not null default true,
  transition_enabled boolean not null default true,
  mobile_full_3d boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.universe_settings (id) values ('default')
on conflict (id) do nothing;

-- 种子行星配置：与 src/lib/planets.ts 当前值一致（后台可改；删除即回落默认值）。
insert into public.planet_config
  (id, name, name_en, func, path, description, icon, color, radius, orbit_radius, orbit_speed, spin_speed, initial_angle, axial_tilt, orbit_inclination, texture, ring_inner, ring_outer, enabled)
values
  ('sun', '太阳', 'SUN', 'OUTAI 首页', '/', 'OUTAI 宇宙的核心。所有行星围绕太阳运行，点击返回首页。', '☉', '#ffb347', 1.5, 0, 0, 0.008, 0, 0, 0, 'sun-shader', null, null, true),
  ('mercury', '水星', 'MERCURY', '文章中心', '/blog/', '技术记录、AI、互联网、经验分享。点击进入文章中心。', '☿', '#b8b0a6', 0.45, 4.5, 0.05, 0.004, 2.2, 0.03, 0.12, 'procedural:mercury', null, null, true),
  ('venus', '金星', 'VENUS', 'Now 动态', '/now/', '最近动态与个人近况。点击进入 Now。', '♀', '#e8c97a', 0.75, 6.5, 0.038, 0.002, 4.0, 0.05, 0.06, 'procedural:venus', null, null, true),
  ('earth', '地球', 'EARTH', '关于我', '/about/', '个人介绍与 OUTAI 品牌。整个宇宙精度最高的行星，点击进入关于我。', '⊕', '#61b7ff', 1.6, 9, 0.03, 0.02, 5.5, 0.41, 0, 'earth', null, null, true),
  ('mars', '火星', 'MARS', '项目空间', '/projects/', '项目展示与开源实验。点击进入项目空间。', '♂', '#d96b4f', 0.9, 12, 0.024, 0.019, 5.1, 0.44, 0.03, 'procedural:mars', null, null, true),
  ('jupiter', '木星', 'JUPITER', 'AI 实验室', '/ai-lab/', 'AI 工具与技术实验。点击进入 AI 实验室。', '♃', '#d8a86b', 2.3, 15, 0.014, 0.05, 1.2, 0.05, 0.02, 'procedural:jupiter', null, null, true),
  ('saturn', '土星', 'SATURN', '书签收藏', '/collection/', '个人收藏资源库。点击进入书签收藏。', '♄', '#e3cf9e', 1.9, 19, 0.01, 0.045, 3.0, 0.47, 0.04, 'procedural:saturn', 2.5, 4.4, true),
  ('uranus', '天王星', 'URANUS', '在线工具箱', '/toolbox/', '实用在线工具。点击进入工具箱。', '♅', '#7fd4d1', 1.35, 23, 0.007, 0.03, 5.6, 1.71, 0.01, 'url:textures/planets/uranus_2048.jpg', null, null, true),
  ('neptune', '海王星', 'NEPTUNE', '留言板', '/guestbook/', '交流与互动。点击进入留言板。', '♆', '#4f7de0', 1.3, 26, 0.005, 0.032, 0.2, 0.49, 0.03, 'url:textures/planets/neptune_2048.jpg', null, null, true)
on conflict (id) do nothing;

-- RLS
alter table public.planet_config enable row level security;
alter table public.universe_settings enable row level security;

drop policy if exists "planet_config public read" on public.planet_config;
create policy "planet_config public read" on public.planet_config
  for select using (true);

drop policy if exists "planet_config admin write" on public.planet_config;
create policy "planet_config admin write" on public.planet_config
  for all using (is_site_admin()) with check (is_site_admin());

drop policy if exists "universe_settings public read" on public.universe_settings;
create policy "universe_settings public read" on public.universe_settings
  for select using (true);

drop policy if exists "universe_settings admin write" on public.universe_settings;
create policy "universe_settings admin write" on public.universe_settings
  for all using (is_site_admin()) with check (is_site_admin());

-- updated_at 自动更新
create or replace function public.set_universe_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists planet_config_updated_at on public.planet_config;
create trigger planet_config_updated_at
  before update on public.planet_config
  for each row execute function public.set_universe_updated_at();

drop trigger if exists universe_settings_updated_at on public.universe_settings;
create trigger universe_settings_updated_at
  before update on public.universe_settings
  for each row execute function public.set_universe_updated_at();
