// planets.ts — OUTAI 3D 宇宙：太阳 + 八大行星的唯一配置源。
// 行星 ↔ 网站功能的对应关系集中定义在这里（下一阶段迁入 Supabase planet_config，
// 由后台「3D 宇宙管理」编辑；前端只读此配置，不在组件里散落写死映射）。
// 尺寸与轨道距离按视觉体验压缩（非真实比例），但行星顺序保持太阳系真实顺序。
// 贴图来源：
//   - 地球：NASA Visible Earth（three.js 官方示例同款，public/textures/earth/）
//   - 天王星 / 海王星：Solar System Scope 2K 贴图（CC BY 4.0，public/textures/planets/，见 colophon 署名）
//   - 水星 / 金星 / 火星 / 木星 / 土星：程序化 Canvas 纹理（src/lib/planet-textures.ts，
//     依据各行星真实特征生成：水星陨石坑、 金星云层漩涡、火星红色地貌、木星条纹+大红斑、土星淡色条纹）
//   - 太阳：自定义 GLSL Shader（动态能量表面 + 光晕），不用静态贴图

export type PlanetId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

export interface Satellite {
  id: string;
  name: string;
  description: string;
  path: string;
  /** 真实计数（没有对应计数时省略，不伪造）。 */
  count?: number;
}

export interface PlanetDef {
  id: PlanetId;
  name: string;
  nameEn: string;
  /** 行星代表的网站功能。 */
  func: string;
  path: string;
  description: string;
  icon: string;
  color: string;
  /** 3D 半径（场景单位）。地球 1.6 为基准。 */
  radius: number;
  /** 轨道半径（太阳在原点）。0 = 太阳本身。 */
  orbitRadius: number;
  /** 公转角速度 rad/s。 */
  orbitSpeed: number;
  /** 自转角速度 rad/s。 */
  spinSpeed: number;
  /** 初始轨道角（rad），让行星初始分布错开。 */
  initialAngle: number;
  /** 自转轴倾角（rad）。 */
  axialTilt: number;
  /** 轨道面倾角（rad），很小的值，只为一点纵深。 */
  orbitInclination: number;
  /** 纹理来源：'earth' | 'procedural:<key>' | 'url:<path>' | 'sun-shader'。 */
  texture: string;
  /** 是否有行星环（土星）。 */
  ring?: { inner: number; outer: number };
}

export const SUN_ID = "sun" as const;

export const PLANETS: PlanetDef[] = [
  {
    id: "sun", name: "太阳", nameEn: "SUN", func: "OUTAI 首页", path: "/",
    description: "OUTAI 宇宙的核心。所有行星围绕太阳运行，点击返回首页。",
    icon: "☉", color: "#ffb347", radius: 1.5, orbitRadius: 0, orbitSpeed: 0,
    spinSpeed: 0.008, initialAngle: 0, axialTilt: 0, orbitInclination: 0,
    texture: "sun-shader",
  },
  {
    id: "mercury", name: "水星", nameEn: "MERCURY", func: "文章中心", path: "/blog/",
    description: "技术记录、AI、互联网、经验分享。点击进入文章中心。",
    icon: "☿", color: "#b8b0a6", radius: 0.45, orbitRadius: 4.5, orbitSpeed: 0.05,
    spinSpeed: 0.004, initialAngle: 2.2, axialTilt: 0.03, orbitInclination: 0.12,
    texture: "procedural:mercury",
  },
  {
    id: "venus", name: "金星", nameEn: "VENUS", func: "Now 动态", path: "/now/",
    description: "最近动态与个人近况。点击进入 Now。",
    icon: "♀", color: "#e8c97a", radius: 0.75, orbitRadius: 6.5, orbitSpeed: 0.038,
    spinSpeed: 0.002, initialAngle: 4.0, axialTilt: 0.05, orbitInclination: 0.06,
    texture: "procedural:venus",
  },
  {
    id: "earth", name: "地球", nameEn: "EARTH", func: "关于我", path: "/about/",
    description: "个人介绍与 OUTAI 品牌。整个宇宙精度最高的行星，点击进入关于我。",
    icon: "⊕", color: "#61b7ff", radius: 1.6, orbitRadius: 9, orbitSpeed: 0.03,
    spinSpeed: 0.02, initialAngle: 5.5, axialTilt: 0.41, orbitInclination: 0,
    texture: "earth",
  },
  {
    id: "mars", name: "火星", nameEn: "MARS", func: "项目空间", path: "/projects/",
    description: "项目展示与开源实验。点击进入项目空间。",
    icon: "♂", color: "#d96b4f", radius: 0.9, orbitRadius: 12, orbitSpeed: 0.024,
    spinSpeed: 0.019, initialAngle: 5.1, axialTilt: 0.44, orbitInclination: 0.03,
    texture: "procedural:mars",
  },
  {
    id: "jupiter", name: "木星", nameEn: "JUPITER", func: "AI 实验室", path: "/ai-lab/",
    description: "AI 工具与技术实验。点击进入 AI 实验室。",
    icon: "♃", color: "#d8a86b", radius: 2.3, orbitRadius: 15, orbitSpeed: 0.014,
    spinSpeed: 0.05, initialAngle: 1.2, axialTilt: 0.05, orbitInclination: 0.02,
    texture: "procedural:jupiter",
  },
  {
    id: "saturn", name: "土星", nameEn: "SATURN", func: "书签收藏", path: "/collection/",
    description: "个人收藏资源库。点击进入书签收藏。",
    icon: "♄", color: "#e3cf9e", radius: 1.9, orbitRadius: 19, orbitSpeed: 0.01,
    spinSpeed: 0.045, initialAngle: 3.0, axialTilt: 0.47, orbitInclination: 0.04,
    texture: "procedural:saturn",
    ring: { inner: 2.5, outer: 4.4 },
  },
  {
    id: "uranus", name: "天王星", nameEn: "URANUS", func: "在线工具箱", path: "/toolbox/",
    description: "实用在线工具。点击进入工具箱。",
    icon: "♅", color: "#7fd4d1", radius: 1.35, orbitRadius: 23, orbitSpeed: 0.007,
    spinSpeed: 0.03, initialAngle: 5.6, axialTilt: 1.71, orbitInclination: 0.01,
    texture: "url:textures/planets/uranus_2048.jpg",
  },
  {
    id: "neptune", name: "海王星", nameEn: "NEPTUNE", func: "留言板", path: "/guestbook/",
    description: "交流与互动。点击进入留言板。",
    icon: "♆", color: "#4f7de0", radius: 1.3, orbitRadius: 26, orbitSpeed: 0.005,
    spinSpeed: 0.032, initialAngle: 0.2, axialTilt: 0.49, orbitInclination: 0.03,
    texture: "url:textures/planets/neptune_2048.jpg",
  },
];

export const PLANET_MAP: Record<PlanetId, PlanetDef> = Object.fromEntries(
  PLANETS.map((p) => [p.id, p]),
) as Record<PlanetId, PlanetDef>;

/** 太阳系最外层轨道半径（SOLAR SYSTEM 模式取景用）。 */
export const SYSTEM_RADIUS = 26;

/** 卫星绕行星的轨道半径（行星半径 + 间隙）。 */
export function satelliteOrbitRadius(planetRadius: number, index: number): number {
  return planetRadius + 0.55 + index * 0.35;
}
