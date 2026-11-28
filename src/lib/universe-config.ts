// universe-config.ts — 3D 宇宙配置加载器。
// 从 Supabase 读 planet_config（行星覆盖）与 universe_settings（场景/开场/模式），
// 与 src/lib/planets.ts 的内置默认值合并；Supabase 不可用或无配置时静默
// 回落到本地默认值（前端始终能渲染，不因配置缺失而空白）。
// 行星：库里有行则覆盖对应字段；enabled=false 的行星不渲染（太阳除外，
// 太阳是唯一主光源，始终渲染）。设置：库里有行则覆盖对应字段。
import { supabase } from "@/lib/supabase";
import { PLANETS, type PlanetDef, type PlanetId } from "@/lib/planets";

export type UniverseMode = "universe" | "earth" | "galaxy" | "navigation" | "solar";

export interface UniverseSettings {
  defaultMode: UniverseMode;
  particleDensity: "high" | "balanced" | "low";
  effectsEnabled: boolean;
  motionDefault: "on" | "reduced";
  bootEnabled: boolean;
  bootBrand: string;
  bootSubline: string;
  bootDurationSeconds: number;
  bootSoundDefault: boolean;
  showUniverseEntry: boolean;
  transitionEnabled: boolean;
  mobileFull3d: boolean;
}

export const DEFAULT_SETTINGS: UniverseSettings = {
  defaultMode: "universe",
  particleDensity: "balanced",
  effectsEnabled: true,
  motionDefault: "on",
  bootEnabled: true,
  bootBrand: "OUTAI",
  bootSubline: "PERSONAL DIGITAL UNIVERSE",
  bootDurationSeconds: 6.5,
  bootSoundDefault: false,
  showUniverseEntry: true,
  transitionEnabled: true,
  mobileFull3d: true,
};

export interface UniverseConfig {
  planets: PlanetDef[];
  settings: UniverseSettings;
  /** true = 读到了库里的配置；false = 用内置默认值（Supabase 未配置/无行/读取失败）。 */
  fromSupabase: boolean;
}

const VALID_MODES = new Set(["universe", "earth", "galaxy", "navigation", "solar"]);

export async function loadUniverseConfig(): Promise<UniverseConfig> {
  const fallback: UniverseConfig = { planets: PLANETS, settings: DEFAULT_SETTINGS, fromSupabase: false };
  if (!supabase) return fallback;
  try {
    const [planetsRes, settingsRes] = await Promise.all([
      supabase.from("planet_config").select("*"),
      supabase.from("universe_settings").select("*").eq("id", "default").maybeSingle(),
    ]);
    if (planetsRes.error || settingsRes.error) return fallback;
    let fromSupabase = false;

    let planets = PLANETS;
    const rows = planetsRes.data ?? [];
    if (rows.length > 0) {
      fromSupabase = true;
      const byId = new Map(rows.map((r: Record<string, unknown>) => [String(r.id), r]));
      planets = PLANETS
        .map((p) => {
          const r = byId.get(p.id);
          if (!r) return p;
          const merged: PlanetDef = {
            ...p,
            name: typeof r.name === "string" && r.name ? r.name : p.name,
            nameEn: typeof r.name_en === "string" ? r.name_en : p.nameEn,
            func: typeof r.func === "string" ? r.func : p.func,
            path: typeof r.path === "string" && r.path ? r.path : p.path,
            description: typeof r.description === "string" ? r.description : p.description,
            icon: typeof r.icon === "string" && r.icon ? r.icon : p.icon,
            color: typeof r.color === "string" && r.color ? r.color : p.color,
            radius: typeof r.radius === "number" && r.radius > 0 ? r.radius : p.radius,
            orbitRadius: typeof r.orbit_radius === "number" && r.orbit_radius >= 0 ? r.orbit_radius : p.orbitRadius,
            orbitSpeed: typeof r.orbit_speed === "number" ? r.orbit_speed : p.orbitSpeed,
            spinSpeed: typeof r.spin_speed === "number" ? r.spin_speed : p.spinSpeed,
            initialAngle: typeof r.initial_angle === "number" ? r.initial_angle : p.initialAngle,
            axialTilt: typeof r.axial_tilt === "number" ? r.axial_tilt : p.axialTilt,
            orbitInclination: typeof r.orbit_inclination === "number" ? r.orbit_inclination : p.orbitInclination,
            texture: typeof r.texture === "string" && r.texture ? r.texture : p.texture,
            ring: r.ring_inner != null && r.ring_outer != null
              ? { inner: Number(r.ring_inner), outer: Number(r.ring_outer) }
              : p.ring,
          };
          // enabled=false 的行星不渲染（太阳除外）。
          if (r.enabled === false && p.id !== "sun") return null;
          return merged;
        })
        .filter((p): p is PlanetDef => p !== null);
    }

    let settings = DEFAULT_SETTINGS;
    const s = settingsRes.data as Record<string, unknown> | null;
    if (s) {
      fromSupabase = true;
      settings = {
        defaultMode: (typeof s.default_mode === "string" && VALID_MODES.has(s.default_mode)
          ? s.default_mode : DEFAULT_SETTINGS.defaultMode) as UniverseMode,
        particleDensity: (s.particle_density === "high" || s.particle_density === "low"
          ? s.particle_density : "balanced") as UniverseSettings["particleDensity"],
        effectsEnabled: s.effects_enabled !== false,
        motionDefault: s.motion_default === "reduced" ? "reduced" : "on",
        bootEnabled: s.boot_enabled !== false,
        bootBrand: typeof s.boot_brand === "string" && s.boot_brand ? s.boot_brand : DEFAULT_SETTINGS.bootBrand,
        bootSubline: typeof s.boot_subline === "string" ? s.boot_subline : DEFAULT_SETTINGS.bootSubline,
        bootDurationSeconds: typeof s.boot_duration_seconds === "number"
          && s.boot_duration_seconds >= 2 && s.boot_duration_seconds <= 15
          ? s.boot_duration_seconds : DEFAULT_SETTINGS.bootDurationSeconds,
        bootSoundDefault: s.boot_sound_default === true,
        showUniverseEntry: s.show_universe_entry !== false,
        transitionEnabled: s.transition_enabled !== false,
        mobileFull3d: s.mobile_full_3d !== false,
      };
    }
    return { planets, settings, fromSupabase };
  } catch {
    return fallback;
  }
}

/** 供 SpaceCore/SolarSystem 复用：按 id 取行星定义。 */
export function planetById(planets: PlanetDef[], id: PlanetId): PlanetDef | undefined {
  return planets.find((p) => p.id === id);
}

let bootBrandCache: Promise<{ brand: string; subline: string }> | null = null;
/**
 * 构建时取开场品牌文字（后台「3D 宇宙管理」的 boot_brand / boot_subline）。
 * 这两个字段以前只存不用——BootIntro 把文案写死了，后台改了不生效。
 * 现在由 MainLayout 在构建时取一次（模块级缓存，整个构建只查一次），
 * 作为 props 传给 BootIntro；读不到时回落默认值。
 */
export function getBootBrand(): Promise<{ brand: string; subline: string }> {
  if (!bootBrandCache) {
    bootBrandCache = (async () => {
      const fallback = { brand: DEFAULT_SETTINGS.bootBrand, subline: DEFAULT_SETTINGS.bootSubline };
      try {
        if (!supabase) return fallback;
        const { data, error } = await supabase
          .from("universe_settings")
          .select("boot_brand,boot_subline")
          .eq("id", "default")
          .maybeSingle();
        if (error || !data) return fallback;
        const row = data as { boot_brand?: string | null; boot_subline?: string | null };
        return {
          brand: row.boot_brand?.trim() || fallback.brand,
          subline: row.boot_subline?.trim() || fallback.subline,
        };
      } catch {
        return fallback;
      }
    })();
  }
  return bootBrandCache;
}
